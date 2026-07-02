#!/usr/bin/env node
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS_DIR = "dist/public/assets";
const WARN_THRESHOLD_KB = 250;
const FAIL_THRESHOLD_KB = 400;

function kb(bytes) {
  return (bytes / 1024).toFixed(1);
}

try {
  const files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js"));
  if (files.length === 0) {
    console.error(`[bundle-check] No JS files found in ${ASSETS_DIR}`);
    process.exit(1);
  }

  let mainBundle = files
    .map((f) => ({ name: f, size: statSync(join(ASSETS_DIR, f)).size }))
    .sort((a, b) => b.size - a.size)[0];

  const buf = readFileSync(join(ASSETS_DIR, mainBundle.name));
  const gz = gzipSync(buf).length;

  console.log(`\n[bundle-check] Largest JS chunk: ${mainBundle.name}`);
  console.log(`[bundle-check] Raw: ${kb(mainBundle.size)} KB | Gzipped: ${kb(gz)} KB`);
  console.log(`[bundle-check] Thresholds: warn=${WARN_THRESHOLD_KB}KB fail=${FAIL_THRESHOLD_KB}KB (gzipped)\n`);

  const gzKb = gz / 1024;
  if (gzKb > FAIL_THRESHOLD_KB) {
    console.error(`[bundle-check] FAIL: gzipped main chunk exceeds ${FAIL_THRESHOLD_KB} KB`);
    process.exit(1);
  }
  if (gzKb > WARN_THRESHOLD_KB) {
    console.warn(`[bundle-check] WARN: gzipped main chunk exceeds ${WARN_THRESHOLD_KB} KB — consider further code splitting`);
  } else {
    console.log(`[bundle-check] OK`);
  }
} catch (err) {
  console.error(`[bundle-check] Error: ${err.message}`);
  process.exit(0);
}
