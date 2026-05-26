import fs from 'node:fs';
import path from 'node:path';
import { RESUME_VARIANTS } from '@/components/portfolio/portfolio-content';

/**
 * Server-side helper: check which resume PDFs are physically present
 * in `apps/web/public/resumes/`. Used by the /portfolio and /john
 * routes so the resume hub never serves a 404 — when a file is
 * missing the UI falls back to a "Request by email" CTA instead.
 *
 * Pure server module (uses node:fs). Never import from a client
 * component — pass the result down as a serializable prop.
 */
export function getResumesAvailability(): Record<string, boolean> {
  const dir = path.join(process.cwd(), 'public', 'resumes');
  const out: Record<string, boolean> = {};
  for (const variant of RESUME_VARIANTS) {
    const filePath = path.join(dir, variant.filename);
    try {
      const stat = fs.statSync(filePath);
      // A 0-byte file would technically be served but would download
      // as an empty PDF and look broken to a recruiter — treat it as
      // unavailable so the email fallback kicks in.
      out[variant.filename] = stat.isFile() && stat.size > 0;
    } catch {
      out[variant.filename] = false;
    }
  }
  return out;
}
