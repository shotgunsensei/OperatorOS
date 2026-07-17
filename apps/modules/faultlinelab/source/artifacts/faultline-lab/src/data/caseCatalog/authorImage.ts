/**
 * Resolve a case `authorImagePath` (a path relative to the App Storage
 * public search paths) into a URL that the browser can fetch.
 *
 * Author images live in App Storage, not in the artifact bundle, and
 * are served by the API server at `/api/storage/public-objects/<path>`.
 * Returns `null` when no path is set so callers can render a fallback.
 *
 * See `docs/case-author-images.md` for the upload + reference workflow.
 */
export function getCaseAuthorImageUrl(
  authorImagePath: string | undefined,
): string | null {
  if (!authorImagePath) return null;
  const trimmed = authorImagePath.replace(/^\/+/, '');
  return `/api/storage/public-objects/${trimmed}`;
}
