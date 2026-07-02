# Dependency Security Audit

Generated via `npm audit` on 2026-05-03.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 6 |
| Moderate | 3 |
| Low      | 1 |
| **Total** | **10** |

All findings have a fix available via `npm audit fix` (with one transitive `--force` if needed).

## High-severity findings

| Package | Issue | Path |
|---------|-------|------|
| `drizzle-orm` | SQL injection via improperly escaped SQL identifiers | direct |
| `lodash` | Prototype pollution in `_.unset`/`_.omit`; code injection via `_.template` | transitive |
| `minimatch` | ReDoS via repeated wildcards | transitive |
| `multer` | DoS via incomplete cleanup / resource exhaustion | direct (file uploads) |
| `path-to-regexp` | DoS via sequential optional groups / multiple wildcards | transitive (express) |
| `picomatch` | Method injection in POSIX classes; ReDoS via extglob | transitive |

## Moderate-severity findings

| Package | Issue |
|---------|-------|
| `brace-expansion` | Zero-step sequence causes hang / memory exhaustion |
| `postcss` | XSS via unescaped `</style>` in stringify output |
| `yaml` | Stack overflow via deeply nested collections |

## Low-severity findings

| Package | Issue |
|---------|-------|
| `qs` | `arrayLimit` bypass in comma parsing allows DoS |

## Recommended action

1. Run `npm audit fix` to patch the non-breaking issues.
2. For `drizzle-orm` and `multer`, schedule a manual upgrade (review breaking changes before bumping major versions). Mitigations already in place:
   - **drizzle-orm**: All SQL identifiers in this codebase come from typed schema constants, never from user input. The injection vector requires user-controlled identifiers; we do not expose this surface.
   - **multer**: File uploads are limited to authenticated tenant users (and rate-limited by the global write limiter); the public intake path uses size + extension allowlists.
3. Re-run `npm audit` after upgrades and update this document.

## Replit-managed surface

- Stripe webhook signing, Replit AI integration tokens, and PostgreSQL credentials are managed by Replit and out of scope for `npm audit`.
- TLS, host hardening, and the deployment HTTP front-end are provided by Replit's deployment platform.
