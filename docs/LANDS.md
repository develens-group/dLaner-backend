# Multi-land canvas storage

Each authenticated user can own multiple independent lands. Canvas content is not
stored in PostgreSQL: every save creates a new immutable JSON object and stores
its key, SHA-256 hash, size and revision number in `LandRevision`.

By default the latest three revisions of each land are retained. The database is
updated only after the new object has been written successfully. Saves for one
land are serialized with a PostgreSQL advisory transaction lock. If the database
transaction fails, the newly uploaded object is removed. Old objects are removed
only after the new revision is committed.

## Endpoints

- `POST /api/v1/lands` — create a land; accepts `title` and optional `canvas`
- `GET /api/v1/lands` — paginated list of the current user's lands
- `GET /api/v1/lands/:id` — land metadata and current revision
- `PATCH /api/v1/lands/:id` — rename a land
- `DELETE /api/v1/lands/:id` — soft-delete a land
- `POST /api/v1/lands/:id/revisions` — save `{ "canvas": { ... } }`
- `GET /api/v1/lands/:id/revisions` — list retained revisions
- `GET /api/v1/lands/:id/canvas` — stream the current JSON
- `GET /api/v1/lands/:id/revisions/:revision/canvas` — stream an older JSON
- `POST /api/v1/lands/:id/revisions/:revision/restore` — restore by creating a new revision

Configure `LAND_REVISION_RETENTION` (default `3`) and `LAND_MAX_JSON_BYTES`
(default `10000000`). Files use the existing template object-storage driver, so
production should set `TEMPLATE_STORAGE_DRIVER=s3`; local disk is suitable for a
single persistent server but not for ephemeral or horizontally scaled hosting.
