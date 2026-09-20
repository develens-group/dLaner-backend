# Templates Bulk Create Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Add `POST /api/v1/templates/bulk` so one request creates N independent templates each with its own library and optional preview.

**Architecture:** New DTO + `TemplatesService.createBulk` that loops create + createVersion with shared metadata; validate all items first; soft-delete on mid-batch failure. Controller route `POST bulk` before `:id` routes.

**Tech Stack:** NestJS, class-validator, Prisma, existing template storage.

## Global Constraints

- Max 10 items per bulk request
- Reuse existing library/preview validation
- Keep single create/version endpoints unchanged

---

### Task 1: DTOs + failing service tests

- [ ] Add `BulkCreateTemplatesDto` / `BulkCreateTemplateItemDto` in `templates.dto.ts`
- [ ] Add failing unit tests for `createBulk` in `templates.service.spec.ts`
- [ ] Run tests — expect fail

### Task 2: Service + controller

- [ ] Implement `createBulk` in `templates.service.ts`
- [ ] Add `POST bulk` on `TemplatesController`
- [ ] Update `docs/TEMPLATES.md`
- [ ] Run tests — expect pass
