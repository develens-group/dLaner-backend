# Templates bulk create — Design

## Goal

Allow creating multiple independent templates in one request. Each item becomes its own `Template` + `TemplateVersion` with its own library JSON and optional preview image.

## Non-goals

- Changing update-existing-template flow (`PATCH /templates/:id` + `POST /templates/:id/versions`)
- Splitting items inside an existing version endpoint
- Multipart multi-file upload in v1 (JSON + base64 preview is enough)

## API

`POST /api/v1/templates/bulk` (JWT, same auth as create)

```json
{
  "visibility": "PRIVATE",
  "categoryId": null,
  "tags": ["landing"],
  "changelog": "Initial version from land editor",
  "items": [
    {
      "title": "Hero section",
      "description": "optional",
      "library": {
        "type": "dlanderlib",
        "version": 2,
        "source": "dlander",
        "libraryItems": [{ "id": "...", "name": "...", "status": "unpublished", "elements": [] }]
      },
      "previewImageBase64": "<raw-base64>",
      "previewImageType": "image/jpeg"
    }
  ]
}
```

Response: `{ data: Template[] }` — one enriched template per item, same shape as create/manage.

## Rules

- `items` required, length 1–10
- Shared fields: `visibility`, `categoryId`, `tags`, `changelog`
- Per item: `title` (required), `description`, `library` (required), optional preview base64 + type
- Reuse existing library/preview validation and storage keys
- On mid-batch failure: soft-delete any templates already created in this request, then rethrow
- Existing `POST /templates` and `POST /templates/:id/versions` unchanged (update / single create)

## Frontend contract note

For **New template** with N selected library items: one bulk call; each item has a single-element `libraryItems` and its own preview. For **Update existing**: keep the current two-step version upload.
