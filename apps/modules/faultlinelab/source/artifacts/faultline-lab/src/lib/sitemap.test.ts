import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SITEMAP_GENERATED_COMMENT,
  SITEMAP_OUT_PATH,
  buildSitemapXml,
} from "../../scripts/generate-sitemap";

describe("public/sitemap.xml", () => {
  it("matches the output of scripts/generate-sitemap.ts (sitemap is out of date, run `pnpm --filter @workspace/faultline-lab run prebuild` to regenerate)", () => {
    const expected = buildSitemapXml();
    const actual = readFileSync(SITEMAP_OUT_PATH, "utf8");
    expect(actual).toBe(expected);
  });

  it("includes the generated-file comment", () => {
    const actual = readFileSync(SITEMAP_OUT_PATH, "utf8");
    expect(actual).toContain(SITEMAP_GENERATED_COMMENT);
  });
});
