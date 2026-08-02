# Template library module

Templates are owned metadata records. Each upload creates a new `TemplateVersion`; approved versions are immutable and become `currentVersion` only after the canonical UTF-8 `.dlanderlib` bundle is stored successfully. Published items are rendered with library-item status `published`, independently of database review state.

## Workflow and API

Authenticated owners use `/api/v1/templates` to create, list `mine`, manage, soft-delete, archive/restore, create/list versions, submit, and manage share links. Reviewers/admins use `/api/v1/admin/templates/review-queue` and `approve`, `reject`, `request-changes`, or `unpublish`. Owners cannot review their own work. Public clients use `/api/v1/public/templates`, `/:slug`, `/download`, versioned downloads, and `/api/v1/template-categories`. Unlisted/private access uses the one-time-visible URL returned by `POST /api/v1/templates/:id/share-links`; only its SHA-256 digest is stored.

Create a version with `{ "library": { "type":"dlanderlib", "version":2, "source":"dlander", "libraryItems":[...] }, "changelog":"..." }`. The server enforces byte/item/element/depth/string limits, unique external IDs, safe object keys, and UTF-8 encoding. Unknown DTO fields are rejected globally.

## Storage and deployment

For development use `TEMPLATE_STORAGE_DRIVER=local` and `TEMPLATE_STORAGE_LOCAL_PATH=.data/templates`; this directory must be persistent and is never served as a static public directory. For production use `s3` plus bucket, region, endpoint, access key and secret key settings documented in `.env.example`. Credentials are blank in examples. Deploy with `npm install`, `npx prisma generate`, `npx prisma migrate deploy`, then `npm run build`. The migration also seeds `general`, `forms`, and `diagrams` categories.

The frontend index response is `{data: items, meta: pagination}`. Each item contains its category (use `category.slug` as `tabId`), current version/items and stable download URL. Frontends may adapt it to `{tabs,items,pagination}` without accessing storage keys.

## Legacy import

Run `npm run templates:import -- --path=C:\safe\legacy --owner=<user-uuid> --dry-run`; remove `--dry-run` to import `.dlanderlib` files as drafts, or add `--pending`. The command confines reads to the supplied root, parses UTF-8 JSON, validates every library, reports failures and creates server-generated storage keys. Re-running does not mutate published versions; operators should use dry-run first and archive duplicates reported by content hash.
