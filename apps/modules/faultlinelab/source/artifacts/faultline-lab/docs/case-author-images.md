# Case Author Images

Case author / cover images live in **App Storage** (Replit's GCS-backed
object storage), not in the `faultline-lab` source tree. This keeps the
client bundle small and lets operators swap out artwork without a code
deploy.

The API server exposes them publicly at:

```
GET /api/storage/public-objects/<path>
```

Case catalog entries reference an image with the optional
`authorImagePath` field on `CaseCatalogEntry`. Resolve the path to a
URL with the `getCaseAuthorImageUrl()` helper:

```ts
import { getCaseAuthorImageUrl } from '@/data/caseCatalog/authorImage';

const src = getCaseAuthorImageUrl(entry.authorImagePath);
if (src) {
  // <img src={src} alt={`${entry.title} author`} />
}
```

## Operator workflow: add a new author image

1. Open the **Object Storage** tool pane in the Replit workspace and
   select the bucket that backs `PUBLIC_OBJECT_SEARCH_PATHS`.
2. Inside the public search path, create (or open) a folder named
   `case-authors/`. By convention images are organized as
   `case-authors/<case-slug>.<ext>`. Use JPEG or WebP, ~512 px on the
   long edge, sRGB.
3. Upload the image. The relative path inside the public search path
   is what you'll reference — for example
   `case-authors/domain-auth-failure.jpg`.
4. In `artifacts/faultline-lab/src/data/caseCatalog/entries.ts`, set
   `authorImagePath` on the matching catalog entry to that relative
   path:

   ```ts
   {
     id: 'case-windows-ad-001',
     // ...
     authorImagePath: 'case-authors/domain-auth-failure.jpg',
   },
   ```

5. Start (or restart) the `API Server` and `web` workflows. Verify the
   image renders by visiting
   `/api/storage/public-objects/case-authors/domain-auth-failure.jpg`.

## Replacing or removing an image

- **Replace**: upload a new file at the same path. The `Cache-Control`
  header from `ObjectStorageService.downloadObject` defaults to one
  hour; users may need to wait or hard-refresh to pick up the change.
- **Remove**: delete the object from the bucket and clear the
  `authorImagePath` field on the catalog entry (or set it to
  `undefined`). `getCaseAuthorImageUrl()` returns `null` for unset
  paths so callers fall back to their default rendering.

## Why public-objects (not presigned uploads)?

Author images are app-owned editorial assets, uploaded by an operator
through the Object Storage tool pane. They are not user-generated
content, so the artifact does not ship the presigned-URL upload
endpoint or any client uploader UI — only the read-only
`/storage/public-objects/*` serving route on the API server.
