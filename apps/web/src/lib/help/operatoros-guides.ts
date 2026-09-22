import { consolePage, guidePage } from './page';
import type { HelpGuide } from './types';

const root = 'https://operatoros.net';
const app = 'https://app.operatoros.net';

export const OPERATOROS_GUIDE: HelpGuide = {
  id: 'operatoros',
  name: 'OperatorOS',
  kind: 'platform',
  description: 'Account, organization, billing, application access, shared-service, and public-site guidance.',
  availability: 'Active platform',
  accent: '#ef4444',
  startHref: `${app}/`,
  pages: [
    guidePage(root, 'public-home', 'Public home', '/', 'Understand what OperatorOS controls and choose the correct next step before signing in.', [
      'Review the platform promise and the relationship between OperatorOS and its modules.',
      'Open the module catalog, ecosystem map, pricing, or sign-in flow.',
      'Return to the console when an existing session is present.',
    ], { workflow: ['Open the public home page.', 'Choose Modules, Ecosystem, How it works, or Pricing for product information.', 'Choose Sign in or Open console when you are ready to work.'] }),
    guidePage(root, 'modules-catalog', 'Application catalog', '/modules', 'Compare flagship and specialized applications by the business result each one delivers.', [
      'Browse each application’s purpose, availability, and plan placement.',
      'Jump directly to the application you want to review.',
      'Continue to sign in, open My Apps, or read the application guide.',
    ]),
    guidePage(root, 'ecosystem', 'Product suite', '/ecosystem', 'See how OperatorOS, the flagship applications, and specialized applications work together.', [
      'Review how the product suite is organized and confirm each application name.',
      'Understand where sign-in, billing, and team access are managed.',
      'Open applications from OperatorOS so the correct organization and access follow you.',
    ]),
    guidePage(root, 'how-it-works', 'How it works', '/how-it-works', 'Learn how to sign in once, choose an organization, and open the applications included in your plan.', [
      'Follow the sign-in, organization selection, and application-opening steps.',
      'See how your organization and access follow you safely into each application.',
      'See what to do when an application or connected service is not available.',
    ]),
    guidePage(root, 'pricing', 'Pricing', '/pricing', 'Compare plans and start checkout only when the selected application is ready to purchase.', [
      'Compare published plan features and module access.',
      'Recognize add-ons and features that require a higher plan.',
      'Start checkout or keep your current plan when purchasing is unavailable.',
    ], { notes: ['OperatorOS owns platform subscriptions and add-ons. Business payments inside a module are separate.'] }),
    consolePage('sign-in', 'Sign in and account recovery', '/login', 'Start or restore an OperatorOS session without creating a separate module account.', [
      'Sign in with the OperatorOS account email and password.',
      'Create an account when registration is available.',
      'Request a password reset and use the emailed link once.',
      'Follow the on-screen recovery step if the session has expired or the account is unavailable.',
    ], { workflow: ['Open Sign in and enter your OperatorOS credentials.', 'Use Forgot password if the password is unavailable; follow the email link once.', 'After success, confirm that My Apps loads and select the correct organization.'] }),
    consolePage('invites', 'Organization invitations', '/invites/example', 'Accept or decline an organization invitation before joining its workspace.', [
      'Review the inviting organization and proposed role.',
      'Accept the invitation to create the membership and select the workspace.',
      'Decline without silently joining the organization.',
      'Handle expired, revoked, already-used, or wrong-account invitation states.',
    ], { notes: ['Use the invitation link from your email to review the organization and join.'] }),
    consolePage('home', 'Home / My Apps', '/', 'Choose what to work on and open only applications available to the selected organization.', [
      'See enabled tools, setup readiness, and clear unavailable states.',
      'Finish personal or organization setup when required.',
      'Switch organizations and reload the available application list.',
      'Open an application with the correct organization and access.',
    ], { workflow: ['Confirm the organization shown in the console header.', 'Finish setup if the page offers that action.', 'Choose Open on an enabled tool; if access is missing, ask an organization owner or administrator to review Tool access.'] }),
    consolePage('browse-tools', 'Browse applications', '/?page=apps', 'Search the application catalog, understand what is available, and open a tool included in your plan.', [
      'Search applications by name or capability.',
      'Filter by platform component, category, status, or access state.',
      'Open an available application or review how to get access.',
      'Recover safely when checkout or application setup is unavailable.',
    ]),
    consolePage('ai-tools', 'AI tools', '/?page=ai-tools', 'Find AI-assisted work, see what your plan includes, and keep human review in the workflow.', [
      'See AI-enabled tools available to the current organization.',
      'Distinguish available, plan-limited, connection-required, and review-required capabilities.',
      'Open the application that owns the work so you can review the result in context before acting on it.',
    ]),
    consolePage('workspace-plan', 'Workspace plan', '/?page=billing', 'Review the current OperatorOS plan, billing history, and available plan changes.', [
      'See plan status, renewal information, and billing activity.',
      'Start an upgrade, customer portal, or cancellation-at-renewal flow.',
      'Keep the current plan when the billing service is unavailable.',
      'Confirm that failed billing actions leave the current plan unchanged.',
    ], { access: 'The signed-in user can review account-level plan state. Organization billing controls may require owner or administrator access.' }),
    consolePage('profile-security', 'Profile and security', '/?page=settings', 'Manage the signed-in OperatorOS identity and security-sensitive account actions.', [
      'Update the display name.',
      'Change the password after confirming the current password.',
      'Confirm your password before changing your account email.',
      'Review multi-factor authentication and active security state when enabled.',
      'Permanently delete the account only after the required confirmations.',
    ], { workflow: ['Open the section for the setting you need.', 'Enter the required current password or confirmation phrase.', 'Submit once and verify the explicit success message; if an error appears, the existing setting remains unchanged.'] }),
    consolePage('organization-overview', 'Organization overview', '/?page=command-center', 'See what needs attention in your organization and open the right settings.', [
      'See membership, enabled tools, plan, invitations, and shared-service readiness.',
      'Navigate to team, tool access, billing, settings, or shared services.',
      'Keep organization work separated from account-level profile and platform administration.',
    ], { access: 'Organization owner, organization administrator, or platform administrator.' }),
    consolePage('team-members', 'Team members', '/?page=tenant-users', 'Invite, review, and manage organization membership with explicit role boundaries.', [
      'List current members and pending invitations.',
      'Invite a person with the organization role they need.',
      'Change an allowed role or remove a member without deleting the person’s OperatorOS identity.',
      'Protect the last owner or administrator and keep a history of membership changes.',
    ], { access: 'Organization owner or administrator. Some high-risk changes may be owner-only.' }),
    consolePage('tool-access', 'Application access', '/?page=tenant-modules', 'Choose which applications each organization can use within its active plan.', [
      'Review application availability, plan requirements, and current access.',
      'Enable or disable eligible application access.',
      'See why an application is unavailable, disabled, or waiting for a connection.',
      'Confirm that changes affect the selected organization only.',
    ], { access: 'Organization owner or administrator; platform policy and plan limits still apply.' }),
    consolePage('organization-billing', 'Billing and add-ons', '/?page=tenant-billing', 'Manage your organization subscription and application add-ons in one place.', [
      'Review the organization plan and enabled add-ons.',
      'Start approved checkout or customer-portal actions.',
      'See missing-price or billing-service problems before any charge.',
      'Keep module business payments separate from OperatorOS subscription billing.',
    ], { access: 'Organization owner, organization administrator, or platform administrator.' }),
    consolePage('organization-settings', 'Organization settings', '/?page=tenant-settings', 'Maintain organization identity and workspace defaults without changing account credentials.', [
      'Update allowed organization profile fields and operating defaults.',
      'Review organization status and workspace-specific settings.',
      'Confirm destructive or high-impact changes explicitly.',
      'Keep changes inside the selected organization and preserve activity history.',
    ], { access: 'Organization owner or administrator.' }),
    consolePage('shared-services', 'Shared services', '/?page=tenant-shared-services', 'Manage organization services that several applications use together.', [
      'Review the Business Directory, files, notifications, queued work, connections, usage, and activity.',
      'Configure approved service connections without exposing secret values.',
      'Inspect delivery or processing failures and retry work only when OperatorOS marks it safe to run again.',
      'Reuse shared business records across applications instead of entering the same information again.',
    ], { access: 'Organization owner or administrator.' }),
    consolePage('module-launch', 'Open, return to, and sign out of an application', '/', 'Move between OperatorOS applications and recover from common access problems.', [
      'Open an application from My Apps so OperatorOS can confirm the account, organization, role, and access.',
      'Use the My Apps action inside the application when you want to return.',
      'Sign out of the current application or choose sign out everywhere when you are finished on a shared device.',
      'If an application does not open, return to My Apps and try again. Ask an administrator to review your access if the problem continues.',
    ], { notes: ['Never share a sign-in or application-opening link copied from your browser address bar.'] }),
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
  description: 'Manage organizations, people, apps, pricing, service health, billing, and sign-in.',
  availability: 'Active, super-admin only',
  accent: '#60a5fa',
  startHref: `${app}/platform`,
  pages: [
    consolePage('platform-overview', 'Platform overview', '/app/platform', 'See platform activity and open the area that needs attention.', ['Review organizations, people, apps, payments, service health, and recent changes.', 'Open the section for the task you need.', 'Check the published version before confirming that an update is available to customers.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-tenants', 'Organizations', '/app/platform/tenants', 'Find an organization and review its settings.', ['Search organizations by name or status.', 'Review the plan, team members, and available apps.', 'Open the organization to make changes and review its activity history.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-users', 'Users', '/app/platform/users', 'Find a person and review their account.', ['Search by name or email.', 'Review account status, permissions, organizations, and security settings.', 'Make only the changes your administrator role allows.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-modules', 'Modules', '/app/platform/modules', 'Manage application listings and global availability.', ['Review app names, web addresses, included plans, and availability.', 'Open an application to update supported details.', 'Turn app availability on or off and review which plans include it.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-billing', 'Billing events', '/app/platform/billing', 'Review subscription changes and payment results.', ['Review payment updates received from Stripe.', 'Match each payment to the correct organization and subscription.', 'Check failed or repeated updates before trying again.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-pricing', 'Pricing administration', '/app/platform/pricing', 'Manage the plan descriptions and prices customers see.', ['Review plans, features, ordering, and module placement.', 'Update public plan names, descriptions, and display order.', 'Confirm that a plan has a valid Stripe price before making it available to buy.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-credit-catalog', 'Credit catalog', '/app/platform/credit-catalog', 'Manage credit packs for apps that charge by usage.', ['Review each pack, its credits, price, and availability.', 'Save the pack and confirm it appears correctly in the catalog.', 'Use test prices for testing and live prices for customer purchases.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-health', 'Health', '/app/platform/health', 'Check whether the platform, sign-in, and connected services need attention.', ['Check whether the app is running and ready for customer use.', 'Review the published version, saved-data service, app access, and sign-in checks.', 'Check which connected services are configured, turned off, or need attention.'], { access: 'Platform super-administrator only.', notes: ['Confirm the published app separately from a local test.'] }),
    consolePage('platform-audit', 'Audit', '/app/platform/audit', 'Find who made a change, when it happened, and whether it succeeded.', ['Filter by person, organization, app, action, result, or date.', 'Open the activity details and use the support reference when reporting a problem.', 'Review account and billing changes without sharing passwords or access keys.'], { access: 'Platform super-administrator only.' }),
    consolePage('platform-sso', 'App sign-in', '/app/platform/sso', 'Review app sign-in settings and recent access attempts.', ['Check the app name and its approved sign-in and return addresses.', 'Review failed, expired, or repeated sign-in attempts.', 'Confirm the person is using the right app address, organization, and plan.'], { access: 'Platform super-administrator only.', notes: ['Never share or reuse a one-time sign-in link.'] }),
  ],
};
