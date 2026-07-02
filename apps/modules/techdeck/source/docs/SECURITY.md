# Security Policy — Tech Deck

---

## Data Handling

### File Uploads

- All uploaded evidence files are hashed with **SHA-256** on ingestion.
- The hash is stored alongside the file record for integrity verification
  and deduplication (identical files are stored once).
- Upload size is capped by the `MAX_UPLOAD_MB` environment variable
  (default 25 MB).
- Files are validated server-side before storage. The storage layer uses a
  `StorageProvider` abstraction that writes to local disk today and is
  designed for future S3-compatible backends.

### Tokens and Keys

- **API tokens** are hashed with SHA-256 before storage. The plaintext
  token is shown exactly once at creation time and is never persisted or
  retrievable afterward.
- **License keys** are hashed with SHA-256 before storage. Validation
  requests compare incoming keys against stored hashes.
- **Session cookies** are signed with the `SESSION_SECRET`, and configured
  with `httpOnly`, `secure`, and `sameSite=lax` attributes.

### Webhook Signatures

- Every outbound webhook delivery includes an **HMAC-SHA256** signature in
  the `X-Signature-256` header, computed over a timestamp and the JSON
  payload body.
- Receiving endpoints can verify authenticity by recomputing the signature
  using the shared secret displayed in the admin UI.

### Webhook SSRF Protection

- Webhook target URLs are validated at creation, update, and delivery time.
- URLs resolving to **localhost**, **RFC1918** (10.x, 172.16-31.x,
  192.168.x), **link-local** (169.254.x), or **IPv6 private** addresses
  (::1, fe80:, fc/fd, ::ffff:-mapped) are rejected.
- An **async DNS lookup** is performed to prevent DNS rebinding attacks
  where a hostname initially resolves to a public IP but later resolves to
  a private one.
- The `ALLOW_INTERNAL_WEBHOOKS=true` environment variable bypasses these
  checks for development and testing only.
- Outbound payloads are capped at **256 KB** and requests time out after
  **10 seconds**.

---

## Multi-Tenant Isolation

- Every database record is scoped by `tenantId`.
- All server-side queries include a tenant filter; cross-tenant access is
  not possible through the API.
- Role-based authorization is enforced at the route level with four tiers:
  OWNER, ADMIN, TECH, CLIENT.

---

## Transport and Headers

- The server sets `trust proxy` for correct behavior behind reverse proxies
  and load balancers.
- Security headers applied to all responses:
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY`
- A strict **Content Security Policy** is applied in production mode.

---

## Audit Trail

- All significant actions emit typed domain events via an internal event
  bus.
- An audit subscriber automatically logs every event with the acting user,
  tenant, entity type, entity ID, and event details.
- Audit logs are queryable and filterable in the admin UI.

---

## Responsible Disclosure

If you discover a security vulnerability in Tech Deck, please
report it responsibly.

**Contact:** security@your-domain.com *(replace with your actual contact)*

We ask that you:

1. Do not publicly disclose the vulnerability until we have had a
   reasonable opportunity to address it.
2. Provide sufficient detail for us to reproduce and fix the issue.
3. Avoid accessing or modifying other users' data during your research.

We will acknowledge receipt within 48 hours and aim to provide an initial
assessment within 5 business days.
