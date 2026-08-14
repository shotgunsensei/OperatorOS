#!/usr/bin/env node
/**
 * Pre-build step: interpolate PUBLIC_BASE_URL into robots.txt and sitemap.xml.
 * Reads templates from public/_templates/, writes resolved files to public/.
 *
 * If PUBLIC_BASE_URL is not set, falls back to the first REPLIT_DOMAINS entry,
 * otherwise the literal "https://ninjalaunchkit.com" placeholder.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const templatesDir = join(root, "public", "_templates");
const publicDir = join(root, "public");

function resolveBaseUrl() {
  const explicit = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const replitDomains = (process.env.REPLIT_DOMAINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (replitDomains[0]) return `https://${replitDomains[0]}`;
  return "https://ninjalaunchkit.com";
}

const baseUrl = resolveBaseUrl();
const targets = ["robots.txt", "sitemap.xml"];

if (!existsSync(templatesDir)) {
  console.warn(`[render-public-assets] No templates dir at ${templatesDir} — skipping.`);
  process.exit(0);
}

if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

for (const file of targets) {
  const src = join(templatesDir, file);
  if (!existsSync(src)) {
    console.warn(`[render-public-assets] Missing template: ${src}`);
    continue;
  }
  const content = readFileSync(src, "utf8").replace(/\{\{BASE_URL\}\}/g, baseUrl);
  writeFileSync(join(publicDir, file), content, "utf8");
  console.log(`[render-public-assets] ${file} rendered with BASE_URL=${baseUrl}`);
}
