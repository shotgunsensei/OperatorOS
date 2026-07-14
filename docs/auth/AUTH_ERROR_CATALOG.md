# Authentication error catalog

| Reason | HTTP | Meaning |
|---|---:|---|
| `SESSION_MISSING` | 401 | No authority/local session. |
| `SESSION_INVALID` / `SESSION_EXPIRED` | 401 | Invalid, revoked, or expired session. |
| `STATE_INVALID` / `NONCE_INVALID` / `PKCE_INVALID` | 400 | Authorization transaction validation failed. |
| `CODE_EXPIRED` | 410 | One-time code expired. |
| `CODE_REPLAYED` | 409 | Code was already consumed. |
| `CLIENT_INVALID` | 401 | Client authentication or binding failed. |
| `REDIRECT_URI_INVALID` | 400 | Callback is not an exact registry match. |
| `AUTH_HOST_NOT_ALLOWED` | 403 | Credential/account flow was submitted on a module, preview, or other untrusted host. |
| `USER_DISABLED` | 403 | OperatorOS account inactive. |
| `TENANT_DISABLED` / `TENANT_SUSPENDED` / `TENANT_MISMATCH` | 403/404 | Tenant is inactive, suspended, unavailable to the user, or does not match the transaction. |
| `ENTITLEMENT_MISSING` / `TENANT_MODULE_DISABLED` / `MODULE_ACCESS_DENIED` / `ROLE_DENIED` | 403 | Authenticated but not entitled or authorized. |
| `MODULE_DISABLED` / `MODULE_ARCHIVED` / `MODULE_UNAVAILABLE` | 403 | The global module kill switch denies launch before any role override. |
| `CALLBACK_FAILED` | 400 | Bounded module callback failure. |
| `AUTH_SERVICE_UNAVAILABLE` | 503 | A required auth dependency is unavailable; do not retry recursively. |
| `REDIRECT_LOOP_BLOCKED` | 409 | Transaction exceeded its redirect/attempt bound. |

Every SSO JSON error includes a server-generated correlation ID in both the
`X-Correlation-ID` response header and bounded response body. Error bodies and
structured decision logs never echo credentials, cookies, authorization codes,
or raw upstream bodies containing them.
