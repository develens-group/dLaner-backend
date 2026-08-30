# Fake AI Image Endpoints — Design

Date: 2026-08-30  
Status: approved (pending implementation)

## Goal

Add a fixed fake AI image endpoint for frontend development and Swagger testing. Clients upload multipart form data by operation `type`, the API validates inputs, charges platform credits, and returns a random image URL from loremflickr (no real model inference).

## Context (existing)

- Real AI flow: `POST /api/v1/ai/requests` with JWT, provider/model/operation/input, credits via `reserveCredits` → execute → `captureReservation` / `releaseReservation`.
- `MockAiProvider` returns text only; catalog models are chat/text.
- Multipart upload pattern already exists in `edit-session.controller` (`FileInterceptor` + `memoryStorage` + `@ApiConsumes`).
- Shared response wrapper: `response()` from `common/api-response`.

## Non-goals

- Real image model inference or third-party vision APIs
- Persisting fake runs as `AiRequest` history rows
- User-key billing for fake endpoints
- Binary image response bodies
- Extending Prisma `AiOperation` enum for these types

## Decisions

| Topic | Decision |
|-------|----------|
| API shape | One fixed endpoint + `type` field (option B) |
| Upload | `multipart/form-data` only (Swagger-testable) |
| Response | JSON with `imageUrl` (loremflickr), not binary |
| Auth | JWT Bearer required (same as other AI routes) |
| Credits | Fixed per-type cost; reserve then capture; announce cost on GET types |
| Catalog | `GET /api/v1/ai/fake/types` returns fields + `dataTemplate` / examples for frontend |
| Image source | `https://loremflickr.com/{width}/{height}?lock={random}` |
| Processing | File content ignored after MIME/size checks |

## Architecture

New pieces under `src/ai/`:

| File | Responsibility |
|------|----------------|
| `fake-ai.catalog.ts` | Static type definitions: id, label, creditCost, fields, examples |
| `fake-ai.dto.ts` | Multipart body fields + type enum for Swagger/validation |
| `fake-ai.service.ts` | Validate by type, credit reserve/capture/release, build loremflickr URL |
| `fake-ai.controller.ts` | `GET types`, `POST /` with multipart + Bearer |

Wire into `AiModule` (imports `CreditsModule` already).

### Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/ai/fake/types` | Bearer | List types, creditCost, form fields, data templates |
| POST | `/api/v1/ai/fake` | Bearer | Run fake operation |

### POST flow

1. Parse `type` + form fields + optional `image` file.
2. Validate against catalog for that type (required fields, MIME, enums/ranges).
3. On validation failure → `400`, no credit touch.
4. `reserveCredits(userId, creditCost, idempotencyKey, 'FAKE_AI_REQUEST', ...)`.
5. Build random loremflickr URL (default 512×512 unless type supplies width/height).
6. `captureReservation` with actual = reserved cost.
7. Return wrapped JSON success payload.
8. On post-reserve failure → `releaseReservation`.

### Credit behavior (for success/error testing)

- Insufficient balance → same credit error path as real AI (`422` / project convention).
- Costs are fixed per type (see catalog below); GET types exposes `creditCost`.
- Charging mirrors `AiService`: when `AI_CREDIT_CHARGING_ENABLED` is not `'false'`, reserve/capture; when disabled, run without charging (cost still announced on GET types).

## Type catalog

| type | Required inputs | Optional inputs | creditCost |
|------|-----------------|-----------------|------------|
| `remove-background` | `image` (file) | — | 2 |
| `remove-object` | `image`, `prompt` | — | 3 |
| `sketch-image` | `image` | `style` | 2 |
| `generate-image` | `prompt` | `width`, `height` | 4 |
| `image-to-image` | `image`, `prompt` | `strength` (0–1) | 4 |
| `upscale-image` | `image` | `scale` (`2` \| `4`) | 3 |
| `enhance-image` | `image` | — | 2 |
| `replace-background` | `image`, `prompt` | — | 3 |

### File constraints

- Field name: `image`
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`
- Max size: 10MB
- Storage: memory only (not persisted)

### Success response `data`

```json
{
  "type": "remove-background",
  "imageUrl": "https://loremflickr.com/512/512?lock=847291",
  "width": 512,
  "height": 512,
  "creditCost": 2
}
```

### GET types item shape

```json
{
  "id": "remove-object",
  "label": "Remove Object",
  "description": "Remove an object described by prompt",
  "creditCost": 3,
  "fields": [
    {
      "name": "image",
      "in": "formData",
      "type": "file",
      "required": true
    },
    {
      "name": "prompt",
      "in": "formData",
      "type": "string",
      "required": true,
      "example": "remove the person on the left"
    }
  ],
  "example": {
    "type": "remove-object",
    "prompt": "remove the person on the left"
  }
}
```

## Swagger

- Tag: `ai-fake` (or under `ai` with clear operation summaries).
- `@ApiBearerAuth`, `@ApiConsumes('multipart/form-data')`.
- `@ApiBody` schema with `type` enum, `image` binary, and optional string/number fields so Try-it-out works.
- Per-type examples documented via GET types `dataTemplate` / `example` (frontend source of truth).

## Error handling

| Case | Status | Credit |
|------|--------|--------|
| Invalid/missing type or fields | 400 | none |
| Invalid MIME / oversized file | 400 | none |
| Missing/invalid JWT | 401 | none |
| Insufficient credits | 422 (project credit convention) | none reserved / reserve fails |
| Unexpected after reserve | 500 | released |

## Testing

- Unit: catalog lookup, validation matrix per type, URL builder.
- Optional e2e/http: multipart POST with JWT; assert 400 without image; assert credit error when balance too low (if test harness allows).

## Out of scope follow-ups

- Persisting fake AI history
- Returning proxied binary images
- Additional types beyond the table above (add via catalog only when needed)
