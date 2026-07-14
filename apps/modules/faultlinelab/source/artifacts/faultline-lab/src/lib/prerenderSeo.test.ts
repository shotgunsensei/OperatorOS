import { describe, expect, it } from "vitest";
import {
  PRERENDER_TARGETS,
  renderRoute,
} from "../../scripts/prerender-seo";
import { ROUTE_SEO, CANONICAL_ORIGIN } from "./seo";

const SOURCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>placeholder</title>
<meta name="description" content="placeholder" />
<meta property="og:title" content="placeholder" />
<meta property="og:description" content="placeholder" />
<meta property="og:url" content="placeholder" />
<meta property="og:image" content="placeholder" />
<meta property="og:type" content="placeholder" />
<meta name="twitter:title" content="placeholder" />
<meta name="twitter:description" content="placeholder" />
<meta name="twitter:image" content="placeholder" />
<link rel="canonical" href="placeholder" />
</head>
<body></body>
</html>`;

describe("scripts/prerender-seo", () => {
  it("targets only views that exist in ROUTE_SEO", () => {
    for (const target of PRERENDER_TARGETS) {
      expect(ROUTE_SEO[target.view], `unknown view ${target.view}`).toBeDefined();
    }
  });

  it("renderRoute is deterministic for the same input", () => {
    for (const target of PRERENDER_TARGETS) {
      const a = renderRoute(SOURCE_HTML, target.view);
      const b = renderRoute(SOURCE_HTML, target.view);
      expect(a).toBe(b);
    }
  });

  it.each(PRERENDER_TARGETS.map((t) => [t.view, t] as const))(
    "%s — render injects the route's canonical URL, title, and description",
    (_view, target) => {
      const seo = ROUTE_SEO[target.view];
      const html = renderRoute(SOURCE_HTML, target.view);
      const url = `${CANONICAL_ORIGIN}${seo.path}`;
      const escapedTitle = seo.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const escapedDescription = seo.description
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      expect(html).toContain(`<title>${escapedTitle}</title>`);
      expect(html).toContain(`href="${url}"`);
      expect(html).toContain(`content="${url}"`);
      expect(html).toContain(escapedDescription);
    },
  );
});
