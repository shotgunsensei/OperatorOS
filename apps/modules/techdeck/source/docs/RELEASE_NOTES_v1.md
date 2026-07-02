# Tech Deck v1.0.0 — Release Notes

**Release date:** February 2026

---

## Modules

Tech Deck v1.0.0 ships with **8 modules**, all enabled by default.

### Core Platform

Tenant management, user authentication (Replit Auth / OIDC), team roles
(OWNER, ADMIN, TECH, CLIENT), client/site/asset tracking, and a
comprehensive audit log. Every data record is scoped by tenant.

### Evidence Locker

Secure file upload with SHA-256 deduplication, tagging, full-text search
(Postgres), filtering, download, and inline preview for images, PDFs, and
text files. Upload size is configurable via `MAX_UPLOAD_MB`.

### License Server

Create license products, issue and revoke keys (stored as SHA-256 hashes),
track activations, and expose a rate-limited public validation API.
Includes an admin UI and developer documentation page.

### Webhooks

Outbound webhook delivery with HMAC-SHA256 signed payloads, exponential
backoff retry (up to 5 attempts), delivery logs, SSRF protection (blocks
private/internal IPs with async DNS lookup), and a 256 KB payload limit.

### Status Pages

Create public status pages with component monitoring, incident tracking,
and real-time status updates. Public pages are accessible without
authentication.

### Compliance Reports

Generate downloadable Evidence Packet ZIP exports containing a manifest,
SHA-256 checksums, evidence files, and an audit trail. Supports filtering
by client, date range, and tags.

### API Access

Token-based API access for programmatic integration. Manage API tokens and
scopes from the admin UI. Provides `/api/v1` endpoints including OpenAPI
spec, status page reads, evidence queries, and license validation.
Supports `API_ONLY` mode for headless deployments.

### Client Portal

A restricted interface for users with the CLIENT role, providing read-only
access to their assigned clients and associated evidence files.

---

## Security Highlights

- Multi-tenant data isolation enforced server-side on every query
- Role-based access control (OWNER > ADMIN > TECH > CLIENT)
- Uploaded files hashed with SHA-256 for integrity and deduplication
- API tokens and license keys stored as SHA-256 hashes (never in plaintext)
- Webhook payloads signed with HMAC-SHA256
- Webhook SSRF protection: blocks localhost, RFC1918, link-local, and IPv6
  private addresses; async DNS lookup prevents rebinding
- Session cookies: httpOnly, secure, sameSite=lax
- Security headers: X-Content-Type-Options, Referrer-Policy, X-Frame-Options
- CSP enforced in production
- In-memory rate limiting with scoped buckets
- Trust-proxy enabled for correct HTTPS handling behind reverse proxies

---

## Required Secrets

| Secret           | Description                              |
|------------------|------------------------------------------|
| `DATABASE_URL`   | PostgreSQL connection string             |
| `SESSION_SECRET` | Random string for signing session cookies|

Replit Auth secrets (`REPL_ID`, `ISSUER_URL`) are automatically provided
by the Replit environment when Auth is configured.

## Optional Environment Variables

| Variable                  | Default     | Description                                    |
|---------------------------|-------------|------------------------------------------------|
| `MAX_UPLOAD_MB`           | `25`        | Maximum evidence upload size in megabytes      |
| `API_ONLY`                | `false`     | Run in headless API-only mode (no SPA)         |
| `ALLOW_INTERNAL_WEBHOOKS` | `false`     | Allow webhook URLs targeting private IPs       |
| `DEV_AUTH_BYPASS`          | `false`     | Bypass OIDC auth in development (non-prod only)|
| `DEV_USER_ID`             | `dev-user`  | User ID when auth bypass is active             |
| `DEV_USER_EMAIL`          | `dev@localhost` | Email when auth bypass is active           |
| `DEV_TENANT_SLUG`         | `dev`       | Tenant slug when auth bypass is active         |
| `NODE_ENV`                | —           | Set to `production` for production hardening   |
| `PORT`                    | `5000`      | HTTP listen port                               |

---

## Health Endpoint

`GET /health` returns JSON with `status`, `mode` (full or api-only),
`version`, and `database` connectivity. Returns HTTP 503 with
`status: "degraded"` if the database is unreachable.

---

## Known Limitations

- File storage is local disk only; S3 integration is planned via the
  existing `StorageProvider` abstraction.
- Rate limiting is in-memory and resets on server restart; a Redis-backed
  store is recommended for multi-instance deployments.
- Webhook retry queue is polled in-process; a dedicated worker or external
  queue is recommended for high-volume deployments.
