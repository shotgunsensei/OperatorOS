# Redirect and domain matrix

| Surface/client | Class/state | Base | Exact callback | Final local path | Cookie owner/scope |
|---|---|---|---|---|---|
| OperatorOS root | platform | `https://operatoros.net` | `https://operatoros.net/sso` | `/app` | root host; platform session |
| OperatorOS app | platform | `https://app.operatoros.net` | `https://app.operatoros.net/sso` | `/app` | app host; platform session |
| Auth authority | platform authority | `https://auth.operatoros.net` | none | login/recovery only | auth host; platform session |
| API | platform API | `https://api.operatoros.net` | none | `/v1/*` | no browser callback |
| TradeFlowKit | core, enabled | `https://tradeflowkit.operatoros.net` | `https://tradeflowkit.operatoros.net/sso` | `/dashboard` | exact host; module + tenant |
| TechDeck | core, enabled | `https://techdeck.operatoros.net` | `https://techdeck.operatoros.net/sso` | `/` | exact host; module + tenant |
| PulseDesk | core, enabled | `https://pulsedesk.operatoros.net` | `https://pulsedesk.operatoros.net/sso` | `/dashboard` | exact host; module + tenant |
| TorqueShed | free, enabled | `https://torqueshed.operatoros.net` | `https://torqueshed.operatoros.net/sso` | `/` | exact host; module + tenant |
| FaultlineLab | free, enabled | `https://faultlinelab.operatoros.net` | `https://faultlinelab.operatoros.net/sso` | `/` | exact host; module + tenant |
| Ninja Pool Hall | free, enabled | `https://ninja-pool-hall.operatoros.net` | `https://ninja-pool-hall.operatoros.net/sso` | `/` | exact host; module + tenant |
| BrandForgeOS | add-on, enabled | `https://brandforgeos.operatoros.net` | `https://brandforgeos.operatoros.net/sso` | `/` | exact host; module + tenant |
| SnapProofOS | add-on, enabled | `https://snapproofos.operatoros.net` | `https://snapproofos.operatoros.net/sso` | `/` | exact host; module + tenant |
| StudyForge AI | add-on, enabled | `https://studyforge-ai.operatoros.net` | `https://studyforge-ai.operatoros.net/sso` | `/` | exact host; module + tenant |
| Ninja Launch Kit | add-on, enabled | `https://ninjalaunchkit.operatoros.net` | `https://ninjalaunchkit.operatoros.net/sso` | `/` | exact host; module + tenant |
| CallCommand AI | add-on, enabled | `https://callcommand-ai.operatoros.net` | `https://callcommand-ai.operatoros.net/sso` | `/` | exact host; module + tenant |
| Ninjamation | add-on, enabled | `https://ninjamation.operatoros.net` | `https://ninjamation.operatoros.net/sso` | `/` | exact host; module + tenant |
| OutCall | add-on, enabled; live provider gated | `https://outcall.operatoros.net` | `https://outcall.operatoros.net/sso` | `/` | exact host; module + tenant |

No wildcard callback, parent-domain session cookie, production localhost
callback, unregistered Replit preview callback, or default
`operator-os.replit.app` callback is permitted. Deep links are stored as
validated relative paths and restored only after local session creation.
