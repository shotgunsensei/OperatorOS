import { consolePage, guidePage } from './page';
import type { HelpGuide } from './types';

const root = 'https://operatoros.net';
const app = 'https://app.operatoros.net';

export const OPERATOROS_GUIDE: HelpGuide = {
  id: 'operatoros',
  name: 'OperatorOS',
  kind: 'platform',
  description: 'Account, organization, billing, entitlement, launcher, shared-service, and public-site guidance.',
  availability: 'Active platform',
  accent: '#ef4444',
  startHref: `${app}/`,
  pages: [
    guidePage(root, 'public-home', 'Public home', '/', 'Understand what OperatorOS controls and choose the correct next step before signing in.', [
      'Review the platform promise and the relationship between OperatorOS and its modules.',
      'Open the module catalog, ecosystem map, pricing, or sign-in flow.',
      'Return to the console when an existing session is present.',
    ], { workflow: ['Open the public home page.', 'Choose Modules, Ecosystem, How it works, or Pricing for product information.', 'Choose Sign in or Open console when you are ready to work.'] }),
    guidePage(root, 'modules-catalog', 'Public module catalog', '/modules', 'Compare the published Main Modules and Companion Applications without bypassing OperatorOS access rules.', [
      'Browse current module identity, purpose, status, and commercial placement.',
      'Jump to a named module section from a shared link.',
      'Continue to sign-in, the authenticated tool catalog, or the help guide for that module.',
    ]),
    guidePage(root, 'ecosystem', 'Ecosystem map', '/ecosystem', 'See how OperatorOS, platform components, Main Modules, and Companion Applications fit together.', [
      'Review the platform hierarchy and canonical product names.',
      'Understand which product owns identity, billing, and access.',
      'Follow the correct launch path instead of using a legacy module URL.',
    ]),
    guidePage(root, 'how-it-works', 'How it works', '/how-it-works', 'Learn the normal account-to-module workflow and the security boundaries around it.', [
      'Follow sign-in, organization selection, entitlement, and module launch steps.',
      'Understand exact-host SSO, organization context, and return navigation in plain language.',
      'See what to do when a module is unavailable or an action is provider-gated.',
    ]),
    guidePage(root, 'pricing', 'Pricing', '/pricing', 'Review plan positioning and continue to OperatorOS-owned checkout only when configuration is available.', [
      'Compare published plan features and module access.',
      'Recognize add-ons and features that require a higher plan.',
      'Start checkout or keep the current plan when purchase configuration is unavailable.',
    ], { notes: ['OperatorOS owns platform subscriptions and add-ons. Business payments inside a module are separate.'] }),
    consolePage('sign-in', 'Sign in and account recovery', '/login', 'Start or restore an OperatorOS session without creating a separate module account.', [
      'Sign in with the OperatorOS account email and password.',
      'Create an account when registration is available.',
      'Request a password reset and complete the bounded reset flow.',
      'Handle suspended, expired, or unauthorized session states without exposing credentials.',
    ], { workflow: ['Open Sign in and enter your OperatorOS credentials.', 'Use Forgot password if the password is unavailable; follow the email link once.', 'After success, confirm that My Apps loads and select the correct organization.'] }),
    consolePage('invites', 'Organization invitations', '/invites/example', 'Accept or decline an explicit organization invitation before gaining tenant access.', [
      'Review the inviting organization and proposed role.',
      'Accept the invitation to create the membership and select the workspace.',
      'Decline without silently joining the organization.',
      'Handle expired, revoked, already-used, or wrong-account invitation states.',
    ], { notes: ['The example path represents the tokenized invitation page. Use the exact link from the invitation email.'] }),
    consolePage('home', 'Home / My Apps', '/', 'Choose what to work on and launch only modules enabled for the selected organization.', [
      'See enabled tools, setup readiness, and clear unavailable states.',
      'Finish personal or organization setup when required.',
      'Switch organizations and reload the entitled module list.',
      'Launch a module through the OperatorOS authorization flow.',
    ], { workflow: ['Confirm the organization shown in the console header.', 'Finish setup if the page offers that action.', 'Choose Open on an enabled tool; if access is missing, ask an organization owner or administrator to review Tool access.'] }),
    consolePage('browse-tools', 'Browse tools', '/?page=apps', 'Search and filter the module catalog, understand access, and open an enabled tool.', [
      'Search modules by name or capability.',
      'Filter by platform component, category, status, or access state.',
      'Open an entitled module or review how to get access.',
      'Recover safely when checkout or module configuration is unavailable.',
    ]),
    consolePage('ai-tools', 'AI tools', '/?page=ai-tools', 'Find AI-assisted capabilities while preserving provider, usage, and review boundaries.', [
      'See AI-enabled tools available to the current organization.',
      'Distinguish enabled, plan-gated, provider-disabled, and review-required capabilities.',
      'Launch the owning module instead of treating AI output as a separate authority.',
    ]),
    consolePage('workspace-plan', 'Workspace plan', '/?page=billing', 'Review the current OperatorOS plan, billing history, and available plan changes.', [
      'See plan status, renewal information, and billing activity.',
      'Start an upgrade, customer portal, or cancellation-at-renewal flow.',
      'Keep the current plan when provider configuration is unavailable.',
      'Confirm that failed billing actions leave the current plan unchanged.',
    ], { access: 'The signed-in user can review account-level plan state. Organization billing controls may require owner or administrator access.' }),
    consolePage('profile-security', 'Profile and security', '/?page=settings', 'Manage the signed-in OperatorOS identity and security-sensitive account actions.', [
      'Update the display name.',
      'Change the password after confirming the current password.',
      'Change the account email with reauthentication.',
      'Review multi-factor authentication and active security state when enabled.',
      'Permanently delete the account only after the required confirmations.',
    ], { workflow: ['Open the section for the setting you need.', 'Enter the required current password or confirmation phrase.', 'Submit once and verify the explicit success message; if an error appears, the existing setting remains unchanged.'] }),
    consolePage('organization-overview', 'Organization overview', '/?page=command-center', 'Review organization posture and jump to the administrative area that needs attention.', [
      'See membership, enabled tools, plan, invitations, and shared-service readiness.',
      'Navigate to team, tool access, billing, settings, or shared services.',
      'Keep organization work separated from account-level profile and platform administration.',
    ], { access: 'Organization owner, organization administrator, or platform administrator.' }),
    consolePage('team-members', 'Team members', '/?page=tenant-users', 'Invite, review, and manage organization membership with explicit role boundaries.', [
      'List current members and pending invitations.',
      'Invite a person with a bounded organization role.',
      'Change an allowed role or remove a member without deleting the person’s OperatorOS identity.',
      'Protect the last owner/administrator and record auditable membership changes.',
    ], { access: 'Organization owner or administrator. Some high-risk changes may be owner-only.' }),
    consolePage('tool-access', 'Tool access', '/?page=tenant-modules', 'Control which modules the organization can use without moving authorization into the browser.', [
      'Review module status, plan requirements, and current tenant entitlement.',
      'Enable or disable eligible module access.',
      'See why a module is unavailable, disabled, or provider-gated.',
      'Confirm that changes affect the selected organization only.',
    ], { access: 'Organization owner or administrator; platform policy and plan limits still apply.' }),
    consolePage('organization-billing', 'Billing and add-ons', '/?page=tenant-billing', 'Manage organization subscription and add-on access through the OperatorOS billing authority.', [
      'Review the organization plan and enabled add-ons.',
      'Start approved checkout or customer-portal actions.',
      'See missing-price or provider-unavailable states before any charge.',
      'Keep module business payments separate from OperatorOS subscription billing.',
    ], { access: 'Organization owner, organization administrator, or platform administrator.' }),
    consolePage('organization-settings', 'Organization settings', '/?page=tenant-settings', 'Maintain organization identity and workspace defaults without changing account credentials.', [
      'Update allowed organization profile fields and operating defaults.',
      'Review organization status and tenant-specific settings.',
      'Confirm destructive or high-impact changes explicitly.',
      'Preserve tenant scope and audit history.',
    ], { access: 'Organization owner or administrator.' }),
    consolePage('shared-services', 'Shared services', '/?page=tenant-shared-services', 'Administer reusable organization services shared by modules.', [
      'Review Business Directory, attachment, notification, job/outbox, webhook, usage, and activity service state.',
      'Configure approved provider references without exposing secret values.',
      'Inspect delivery or processing failures and retry only supported idempotent work.',
      'Use the shared records that modules reference instead of creating duplicate identities.',
    ], { access: 'Organization owner or administrator.' }),
    consolePage('module-launch', 'Module launch, return, and logout', '/', 'Use the safe cross-host navigation flow and recover from common access failures.', [
      'Launch from My Apps so OperatorOS can revalidate the user, organization, role, module, and entitlement.',
      'Return with the module My Apps action instead of editing host URLs.',
      'Use local logout to leave one host or global logout to invalidate all OperatorOS host sessions.',
      'Retry from My Apps when a one-time code expires; never copy authorization-code URLs.',
    ], { notes: ['Authorization codes are short-lived and single use. Module sessions remain bound to one module and one organization.'] }),
    guidePage(root, 'help-center', 'Help Center', '/help', 'Search every OperatorOS and module guide, filter by product, and open the exact page you need.', [
      'Search page names, functions, workflows, access notes, and paths.',
      'Select OperatorOS, Platform Command, or any catalog module.',
      'Open page-aware links from module Help buttons.',
      'Use the support email when the guide does not resolve the issue.',
    ], { workflow: ['Enter the name of the page, action, or error state in Search all help.', 'Choose a matching result or select a product from the guide index.', 'Expand the page guide, follow the workflow, and use Open this page when you are ready.'] }),
  ],
};

export const PLATFORM_COMMAND_GUIDE: HelpGuide = {
  id: 'platform-command',
  name: 'Platform Command',
  kind: 'platform',
  description: 'Super-admin guidance for tenants, users, modules, pricing, health, audit, billing, credit catalog, and SSO.',
  availability: 'Active, super-admin only',
  accent: '#60a5fa',
  startHref: `${app}/platform`,
  pages: [
    consolePage('platform-overview', 'Platform overview', '/app/platform', 'Review platform-wide counts, operating posture, and command shortcuts.', ['Inspect tenant, user, module, billing, health, and audit summaries.', 'Open the focused command section that owns the needed change.', 'Review release identity before treating the surface as production evidence.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-tenants', 'Tenants', '/app/platform/tenants', 'Search tenant records and open a tenant-specific administration view.', ['List and filter tenant workspaces.', 'Inspect status, plan, membership, and module posture.', 'Open tenant detail for supported administrative actions and audit context.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-users', 'Users', '/app/platform/users', 'Search platform identities and review account-level state safely.', ['Find users by bounded identifiers.', 'Inspect account status, platform role, memberships, and security state.', 'Perform supported account administration without using browser-supplied privilege.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-modules', 'Modules', '/app/platform/modules', 'Manage canonical registry metadata and global module availability.', ['Review stable slugs, names, hosts, plan placement, and status.', 'Open module detail and update supported metadata.', 'Use the global kill switch and entitlement controls without changing persistent identity keys.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-billing', 'Billing events', '/app/platform/billing', 'Inspect platform subscription events and provider processing state.', ['Review normalized Stripe webhook and subscription event history.', 'Correlate tenant, customer, price, and processing outcomes without exposing secrets.', 'Identify replay, failure, or configuration states before retrying.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-pricing', 'Pricing administration', '/app/platform/pricing', 'Manage published OperatorOS plan and module pricing metadata.', ['Review plans, features, ordering, and module placement.', 'Update supported public pricing metadata.', 'Keep live provider price IDs server-side and fail closed when missing.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-credit-catalog', 'Credit catalog', '/app/platform/credit-catalog', 'Administer durable credit products used by approved metered module workflows.', ['Review credit packs, amounts, provider references, and active state.', 'Create or update catalog entries with audited server validation.', 'Keep test and live provider identities distinct.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-health', 'Health', '/app/platform/health', 'Inspect release identity, database readiness, SSO configuration, and optional provider posture.', ['Review liveness and readiness independently.', 'Check commit, build, database release, registry, auth, and SSO-encryption state.', 'Treat optional provider status as configured, disabled, or unhealthy without exposing values.'], { access: 'Platform super-administrator only.', notes: ['A healthy local build is not proof that a deployed production release is correct.'] }),
    consolePage('platform-audit', 'Audit', '/app/platform/audit', 'Search bounded platform audit events and correlate administrative actions.', ['Filter by actor, tenant, module, action, target, outcome, or time.', 'Inspect safe event detail and request/correlation references.', 'Verify sensitive actions without exposing credentials or raw authorization codes.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-sso', 'SSO', '/app/platform/sso', 'Review registered clients and one-time authorization activity without exposing secrets.', ['Inspect client, callback, environment, module, and contract-version registration.', 'Review bounded issue, exchange, replay, denial, and expiry evidence.', 'Diagnose exact-host, state, nonce, PKCE, tenant, or entitlement failures.'], { access: 'Platform super-administrator only.', notes: ['Never copy, log, or reuse a raw SSO authorization code.'] }),
  ],
};
