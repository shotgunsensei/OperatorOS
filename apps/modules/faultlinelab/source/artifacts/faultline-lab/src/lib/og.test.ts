import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OG_HTML_GENERATED_COMMENT,
  getPlannedOgOutputs,
  renderPng,
} from "../../scripts/generate-og";

const REGEN_HINT =
  "OG assets out of date, run `pnpm --filter @workspace/faultline-lab run prebuild` to regenerate.";

describe("public/og + public/case generated assets", () => {
  const planned = getPlannedOgOutputs("/");

  it("has at least one planned output (sanity)", () => {
    expect(planned.length).toBeGreaterThan(0);
  });

  it.each(planned.map((p) => [p.entry.slug, p] as const))(
    "%s — share-stub HTML matches scripts/generate-og.ts output",
    (_slug, out) => {
      expect(existsSync(out.htmlPath), REGEN_HINT).toBe(true);
      const actual = readFileSync(out.htmlPath, "utf8");
      expect(actual, REGEN_HINT).toBe(out.html);
    },
  );

  it.each(planned.map((p) => [p.entry.slug, p] as const))(
    "%s — share-stub HTML carries the generated-file comment",
    (_slug, out) => {
      expect(out.html).toContain(OG_HTML_GENERATED_COMMENT);
      const actual = readFileSync(out.htmlPath, "utf8");
      expect(actual).toContain(OG_HTML_GENERATED_COMMENT);
    },
  );

  it.each(planned.map((p) => [p.entry.slug, p] as const))(
    "%s — OG PNG matches scripts/generate-og.ts output",
    (_slug, out) => {
      expect(existsSync(out.pngPath), REGEN_HINT).toBe(true);
      const actual = readFileSync(out.pngPath);
      const expected = renderPng(out.svg);
      expect(
        actual.equals(expected),
        `${REGEN_HINT} (PNG byte mismatch for ${out.entry.slug})`,
      ).toBe(true);
    },
  );
});
