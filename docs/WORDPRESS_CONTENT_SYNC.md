# WordPress content → MCP → land

The WordPress host opens the dLander frontend and sends a site-content package. The frontend asks the signed-in owner to confirm, uploads bounded batches to the backend, and activates the complete snapshot. MCP reads that snapshot for explicitly selected sites and saves proposed designs as normal lands. It never publishes the proposal back to WordPress.

Existing editor-file exchange remains available. An existing `.dlander` canvas or a single-page edit session is **not** an export of the whole WordPress site: dLander cannot infer other pages, products, theme settings or menus from that file. The WordPress host must send those records explicitly using the contract below. No PHP plugin is modified in this repository.

## Frontend locations

- **Account → WordPress sites** (`/account/wordpress-sites`): synced status, JSON upload, paginated item list and read-only preview.
- `/connect/wordpress/content?siteId=<connected-site-uuid>`: standalone receiving/upload page for an iframe or popup.
- `/connect/wordpress?requestId=...`: after approving an installation, the receiver becomes ready for its site export.
- `/land`: the existing embed can receive the same site-content message separately from normal editor messages.

Receiving a package requires a logged-in dLander user, an enabled site owned by that account, the actual opener/parent window as message source, and a message origin whose hostname exactly matches the connected site's domain. No access token or installation key is sent back to the host. A generic readiness notification contains only the protocol version; all acknowledgments use the verified exact origin.

## Host message contract

Open the receiving page in a popup with an opener (or an iframe), keep its window reference, and register the listener before loading it. Replace the sample site ID with the UUID returned by the existing connection approval flow. Do not put credentials into query parameters.

```js
const dlanderOrigin = "https://dlander.com";
const siteId = "<connected-site-uuid>";
let sent = false;
let target;

window.addEventListener("message", (event) => {
  if (event.origin !== dlanderOrigin || event.source !== target) return;
  if (event.data?.type === "DLAND_WP_CONTENT_BRIDGE_READY" && !sent) {
    sent = true;
    target.postMessage({
      type: "DLAND_WP_SITE_CONTENT",
      version: 1,
      requestId: crypto.randomUUID(),
      siteId,
      payload: siteExport,
    }, dlanderOrigin);
  }
  if (event.data?.type === "DLAND_WP_CONTENT_SYNCED") {
    // The user confirmed and the backend activated a complete snapshot.
    console.info("Synced snapshot", event.data.snapshotId);
  }
});

target = window.open(
  `${dlanderOrigin}/connect/wordpress/content?siteId=${encodeURIComponent(siteId)}`,
  "dlander-content",
);
// For an iframe, target is iframe.contentWindow instead.
```

Instead of `payload`, send `file: exportBlob` where `exportBlob` contains the UTF-8 JSON package. The host should keep the export and allow resending if the user cancels, closes the window, or the network fails; only `DLAND_WP_CONTENT_SYNCED` confirms completion. The frontend never sends the resulting design back automatically. A user can separately choose the existing manual export/return workflow.

## JSON export format

```json
{
  "format": "dlander-wordpress-site",
  "version": 1,
  "includeUnpublished": false,
  "siteInfo": {
    "title": "My shop",
    "homeUrl": "https://shop.example.com",
    "description": "A public storefront",
    "locale": "fa_IR",
    "themeName": "Store theme"
  },
  "items": [
    {
      "kind": "page",
      "externalId": "42",
      "status": "publish",
      "data": {
        "title": "Home",
        "slug": "home",
        "url": "https://shop.example.com/",
        "contentHtml": "<h1>Welcome</h1><p>Our products</p>",
        "contentText": "Welcome. Our products.",
        "modifiedAt": "2026-11-21T10:00:00Z"
      }
    },
    {
      "kind": "appearance",
      "externalId": "active-theme",
      "data": {
        "title": "Brand styles",
        "themeName": "Store theme",
        "colors": ["#6965db", "#ffffff"],
        "fonts": ["Assistant"]
      }
    }
  ]
}
```

Allowed kinds: `page`, `post`, `product`, `media`, `menu`, `taxonomy`, `appearance`. Each `(kind, externalId)` must be unique in the package. Only exported public design/content fields are accepted:

| Field in `data` | Use |
| --- | --- |
| `title` | Required display title |
| `slug`, `url`, `parentId`, `modifiedAt` | Identity, hierarchy and source time |
| `contentHtml`, `contentText`, `excerpt`, `description` | Page/post/product content; HTML is treated as data |
| `mediaUrl`, `mimeType` | Media references; no server-side URL fetching |
| `price`, `currency`, `categories` | Public product/catalog information |
| `menuItems` | Array of `{label, url?, parentId?, objectId?}` |
| `themeName`, `colors`, `fonts` | Selected design settings, not a raw options dump |

Unknown fields are rejected. Never export passwords, cookies, installation keys, API tokens, user/customer identities, orders or all WordPress options. Records default to `publish`. Non-public statuses (`draft`, `pending`, `private`, `future`) require `includeUnpublished: true`; the frontend explicitly warns the owner before sharing them.

Limits: 5,000 records, 25 MB total package/snapshot content, 50 records per batch and 1 MB per batch request. The frontend uses a smaller batch byte budget automatically. Oversized individual records must be split or reduced at the exporter. The site `homeUrl` must match the connected domain. This is a complete replacement snapshot, not an incremental update: include all intended records in each export; records omitted from the next complete export disappear from the active copy.

## Backend APIs

The frontend authenticates these routes using the existing **web account bearer token**:

| Method | Route | Body/result |
| --- | --- | --- |
| POST | `/api/v1/users/me/wordpress-sites/:siteId/content-sync` | `{payload:{siteInfo, expectedItems, includeUnpublished}}` → `data.id` |
| POST | `/api/v1/users/me/wordpress-sites/:siteId/content-sync/:id/items` | `{payload:{items:[...]}}` → received count; same record keys are idempotent upserts |
| POST | `/api/v1/users/me/wordpress-sites/:siteId/content-sync/:id/complete` | Activates only if the declared record count is present |
| DELETE | `/api/v1/users/me/wordpress-sites/:siteId/content-sync/:id` | Aborts only that site's unfinished upload |
| GET | `/api/v1/users/me/wordpress-sites/:siteId/content` | Active snapshot metadata or `active:null` |
| GET | `/api/v1/users/me/wordpress-sites/:siteId/content/items?page=1&kind=page&search=Home` | Paginated metadata (20 records/page) |
| GET | `/api/v1/users/me/wordpress-sites/:siteId/content/items/:itemId` | One record from the current snapshot |

Server-to-server installation routes are also available at `/api/v1/wordpress/content-sync`, `/:id/items`, `/:id/complete`, and DELETE `/:id`. They require `X-Dlander-Installation-Key` and `X-Dlander-Site-Url` and do not accept an arbitrary caller-supplied site ID. They are optional; the browser workflow does not need installation credentials.

Failed or partial uploads never replace the active copy. The frontend aborts failed uploads. Two unfinished uploads are allowed per site; they expire after 24 hours. Run the existing backend `retention:cleanup` task regularly to remove expired uploads. Two completed snapshots are retained. The synchronized copy remains stale until the host sends another export; opening a site or an MCP connection alone does not fetch data from WordPress.

## MCP workflow

Authorize the selected site with `wordpress:read` and allow `lands:write` to save proposals:

1. `list_wordpress_sites` identifies an allowed site.
2. `get_wordpress_site_content` checks available snapshot and synchronization time.
3. `list_wordpress_content` searches/paginates its records.
4. `get_wordpress_content` reads selected records.
5. The assistant builds a full editable editor canvas and calls `save_wordpress_land` with `siteId`, `title`, `sourceItemIds` (1–20 record UUIDs from the list), and `canvas`.
6. The tool returns an owned land and `openUrl`, with `publishedToWordPress:false`. Later revisions use `get_land` / `save_land` and their normal revision checks.

The old MCP write tools `create_wordpress_edit` and `complete_wordpress_edit` are no longer exposed. Existing manual WordPress editor APIs remain available to the user; they are not called by this MCP proposal workflow. Refresh tool discovery/reconnect the assistant after deploying to discover the new tool set. No conversion from arbitrary HTML/CSS to a pixel-identical editor scene is promised; the assistant reconstructs a design using the available content and editor schema.

## Deployment

Deploy the backend with `20261121010000_wordpress_content_sync` and run its `npm.cmd run db:migrate:deploy` using the intended database configuration. Deploy the frontend afterward. No new environment variables or WordPress application passwords are needed. The normal backend domain, CORS, account auth and MCP OAuth settings remain in place. The migration and any live site synchronization have not been run by the local source changes.
