# Private storage checkpoint

Local implementation only. No store has been provisioned or uploaded to, and this intermediate migration branch is not deployable.

Configure these server-only variables in the eventual authorized environment:

| Variable | Source |
| --- | --- |
| `BLOB_STORE_ID` | Vercel private Blob store identifier (`store_…`) |
| `BLOB_READ_WRITE_TOKEN` | Read/write token issued for that same private store |

This checkpoint deliberately uses explicit read/write-token authentication. Ambient OIDC fallback is not supported. The SDK owns native signed-token issuance and URL signing; no custom signing key or application proxy is used. Never prefix these variables with `NEXT_PUBLIC_`. Fixture tests disable all actual SDK transport even if host credentials exist.

The installed and pinned `@vercel/blob` 2.8.0 calls `POST https://vercel.com/api/blob/signed-token`. Delegations allow only GET of the exact pathname for 60 seconds (assets) or 300 seconds (evidence). Only the resulting private URL is returned. The adapter verifies token/store agreement before upload and scope/store/path/expiry after issuance.

Database paths remain relative to their historical logical bucket. Physical Blob paths are `workspace-assets/<workspace>/<asset>/<filename>` or `report-evidence/<job>/<provider>/<type>/<digest>.<extension>`. Namespace separation prevents collisions; do not store the physical prefix twice in metadata. All uploads use private access and no random suffix, with JPEG/PNG/WebP limited to 5 MiB; assets also allow PDF. Rights remain `needs_review` until an authorized explicit decision.

Retention lists a flat job prefix using opaque cursors, validates every returned path, and fails before database deletion on an incomplete sweep. Limits: 100 entries per page, 200 pages, 10,000 observed objects, removal batches of 100. The scan evidence downloader remains sequential with a 45-second total download budget and conditional digest-reference cleanup.

Full branch build/secret-boundary and final Task 9 acceptance remain controller gates. `BLOB_READ_WRITE_TOKEN` and `VERCEL_OIDC_TOKEN` sentinels are included in the existing boundary script for that gate. Snapshots, measurements, rescans, Instagram, callback and claim consumers are separate sequential work.
