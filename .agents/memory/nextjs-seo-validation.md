---
name: Next.js SEO validation
description: Avoid false negatives when checking metadata and generated social images in Next.js 15.
---

Validate server-rendered SEO metadata with a recognized crawler user agent, not only a normal browser or generic fetch user agent. Next.js 15 can stream metadata for ordinary clients during development, while HTML-limited crawlers receive blocking metadata suitable for indexing.

**Why:** Generic fetch checks incorrectly reported missing or duplicate document titles because metadata was streamed and an SVG accessibility title appeared earlier in the response. The pages were correct for crawlers.

**How to apply:** For SEO acceptance, request each public route with a Googlebot-compatible user agent, inspect all returned metadata tags, and still verify the production build. Keep `ImageResponse` styles conservative; use separate background color and image properties rather than complex shorthand.