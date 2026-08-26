---
name: Module route metadata scope
description: Keep authenticated dynamic routes and their deep-link siblings out of search indexes.
---

Apply `noindex, nofollow` metadata in a shared dynamic-segment layout when both the segment’s page and a sibling catch-all page render private or authenticated content.

**Why:** Page metadata applies only to that exact page route in the Next.js App Router. A sibling catch-all route inherits the nearest layout metadata instead, so adding robots metadata only to the segment root can leave deep links indexable.

**How to apply:** Keep the public parent/listing route metadata indexable, then put the robots directive in the dynamic segment layout so the root and every nested route share it. Validate both route shapes with a crawler user agent.