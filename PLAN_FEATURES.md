# OperatorOS — Plan & Feature Matrix

## Plan Tiers

| Feature / Limit | Starter (Free) | Pro ($29/mo) | Elite ($99/mo) |
|---|---|---|---|
| **Resource Limits** | | | |
| Workspaces | 1 | 5 | Unlimited |
| Projects | 3 | 25 | Unlimited |
| Tasks | 50 | 500 | Unlimited |
| Team Members | 0 | 10 | Unlimited |
| AI Actions / Month | 10 | 200 | Unlimited |
| **Features** | | | |
| Data Exports | - | Yes | Yes |
| Workflow Automation | - | Yes | Yes |
| Project Templates | - | Yes | Yes |
| Advanced Analytics | - | - | Yes |
| White Label | - | - | Yes |
| Priority Support | - | Yes | Yes |
| Custom Integrations | - | - | Yes |
| API Access | - | Yes | Yes |

## Enforcement Rules

### Resource Limits
- Limits are enforced server-side on all creation endpoints.
- Frontend shows usage bars and disables creation buttons when limits are reached.
- When a limit is reached, the API returns HTTP 403 with `code: 'RESOURCE_LIMIT_REACHED'` and an `upgrade` flag.

### Feature Gating
- Feature-gated endpoints return HTTP 403 with `code: 'PLAN_FEATURE_REQUIRED'`.
- Frontend shows lock icons and "Upgrade" CTAs for gated features.

### Upgrade Behavior
- Upgrades take effect immediately.
- New limits and features are unlocked as soon as the plan changes.

### Downgrade Behavior
- Existing data is preserved (never deleted).
- If current usage exceeds the new plan's limits, creation of new resources is blocked until usage is within the new limit.
- The API returns clear messages explaining which limits are exceeded.
- Users are warned about exceeded limits before confirming a downgrade.

### Admin Override
- Admin users (role: 'admin') bypass all plan limits and feature gates.
- Admin actions are still audit-logged.

## Usage Tracking

| Resource | Tracking Method | Period |
|---|---|---|
| Workspaces | Count of owned saas_workspaces | Lifetime |
| Projects | Count of owned saas_projects | Lifetime |
| Tasks | Count of owned saas_tasks | Lifetime |
| Team Members | Count of workspace_memberships across owned workspaces (excluding self) | Lifetime |
| AI Actions | usage_tracking table with monthly period buckets | Monthly (resets on 1st) |

## API Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `RESOURCE_LIMIT_REACHED` | 403 | User has hit a resource limit for their plan |
| `PLAN_FEATURE_REQUIRED` | 403 | Feature requires a higher plan |
| `USAGE_LIMIT_REACHED` | 429 | Monthly usage limit exceeded (AI actions) |

## Centralized Configuration

The canonical plan definitions live in `apps/api/src/lib/plans.ts` as `PLAN_CONFIGS`. This is the single source of truth for all plan limits and features. The database `subscription_plans` table is seeded from these values on startup.
