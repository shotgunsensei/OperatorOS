import Link from 'next/link';
import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { brand } from '@/lib/brand';

export type OperatorOsPolicyKind = 'privacy' | 'terms';

const linkStyle = { color: brand.accentCyan, textDecoration: 'underline', textUnderlineOffset: 3 } as const;

function PolicyNavigation({ active }: { active: OperatorOsPolicyKind }) {
  return (
    <nav className="policy-nav" aria-label="Legal and messaging documents">
      <Link href="/privacy" aria-current={active === 'privacy' ? 'page' : undefined}>Privacy Policy</Link>
      <Link href="/terms" aria-current={active === 'terms' ? 'page' : undefined}>Terms and Conditions</Link>
      <Link href="/sms-consent">SMS Opt-In</Link>
      <Link href="/messaging">Messaging Program</Link>
    </nav>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <section>
        <h2>1. Scope and identity</h2>
        <p>
          This Privacy Policy describes how OperatorOS, a service operated by Shotgun Ninjas Productions,
          collects, uses, protects, and retains information when you visit operatoros.net, create or use an
          OperatorOS account, interact with an enabled module, request support, or opt in to communications.
          OperatorOS is a command and access platform for business and operational software tools.
        </p>
      </section>
      <section>
        <h2>2. Information we collect</h2>
        <p>Depending on the services you choose to use, we may collect:</p>
        <ul>
          <li><strong>Account and organization data</strong>, such as name, email address, sign-in and organization membership information, roles, and subscription or application-access records.</li>
          <li><strong>Operational data</strong> that you submit to OperatorOS or an enabled module, including workflow, support, customer, asset, task, and service records.</li>
          <li><strong>Transaction data</strong>, including plan, checkout, invoice, and payment-status metadata. Payment-card processing is performed by the applicable payment provider.</li>
          <li><strong>Security and technical data</strong>, such as session and audit events, device/browser information, request metadata, error codes, and appropriately handled network-address evidence.</li>
          <li><strong>Communications data</strong>, such as contact details, message content and delivery status, support correspondence, communication preferences, and consent or revocation evidence.</li>
        </ul>
      </section>
      <section>
        <h2>3. How information is used</h2>
        <p>
          We use information to operate, secure, support, and improve OperatorOS; authenticate users;
          keep each organization's data, roles, subscriptions, and application access separate; complete requested workflows;
          provide support and requested communications; detect misuse; maintain audit and compliance
          evidence; and meet legal, carrier, payment, and service-provider requirements.
        </p>
      </section>
      <section>
        <h2>4. Service providers and disclosures</h2>
        <p>
          We may use contracted processors for hosting, database, authentication, payment, email,
          telecommunications, security, analytics, and support functions. They may process only the
          information reasonably necessary to provide their services to us, subject to their contracts,
          applicable law, and appropriate safeguards. We may also disclose information when legally
          required, to protect the service or people, or as part of a business transaction subject to
          applicable privacy protections.
        </p>
      </section>
      <section>
        <h2>SMS and Mobile Messaging Privacy</h2>
        <p>
          Mobile numbers are used only for the OperatorOS communication purposes for which the user
          consented. SMS consent is not sold or rented. Mobile information and messaging consent are not
          shared with third parties or affiliates for their own marketing or promotional purposes. Service
          providers such as telecommunications carriers may process information strictly as necessary to
          operate the communications service where legally appropriate; they do not receive permission to
          use OperatorOS mobile opt-in data for their own marketing.
        </p>
        <p className="carrier-disclosure">
          All the above categories exclude text messaging originator opt-in data and consent; this information won’t be shared with any third parties.
        </p>
        <p>
          OperatorOS retains the phone number, consent status, UTC timestamp, source, disclosure and policy
          versions, consent mechanism, and revocation evidence needed to operate the program and demonstrate
          consent. Message frequency varies. Message and data rates may apply. See the{' '}
          <Link href="/messaging" style={linkStyle}>OperatorOS Messaging Program</Link> and{' '}
          <Link href="/sms-consent" style={linkStyle}>optional SMS opt-in form</Link>.
        </p>
      </section>
      <section>
        <h2>5. Retention and security</h2>
        <p>
          We retain information only as long as reasonably necessary for the purpose collected, account and
          service operation, dispute resolution, security, audit, suppression, and legal obligations.
          Retention periods vary by data type and module. We use reasonable administrative, technical, and
          organizational safeguards, including access controls, encrypted transmission, bounded logs, and
          organization-specific authorization. No storage or transmission method is completely secure.
        </p>
      </section>
      <section>
        <h2>6. Choices and requests</h2>
        <p>
          You may update appropriate account information and communication choices through available product
          controls or by contacting us. For SMS, reply <strong>STOP</strong> to unsubscribe and{' '}
          <strong>HELP</strong> for help. Privacy requests may be subject to identity verification and records
          we must retain for security, billing, suppression, or legal reasons.
        </p>
      </section>
      <section>
        <h2>7. Contact and updates</h2>
        <p>
          Questions or privacy requests may be sent to{' '}
          <a href="mailto:john@shotgunninjas.com" style={linkStyle}>john@shotgunninjas.com</a> or through{' '}
          <a href="https://operatoros.net/john" style={linkStyle}>operatoros.net/john</a>. We may update this
          policy as our services or legal requirements change. The current version and date will remain on
          this page. Review the <Link href="/terms" style={linkStyle}>Terms and Conditions</Link>.
        </p>
      </section>
    </>
  );
}

function TermsAndConditions() {
  return (
    <>
      <section>
        <h2>1. OperatorOS service</h2>
        <p>
          These Terms and Conditions govern access to OperatorOS, a command, authentication, access-management,
          and operations platform operated by Shotgun Ninjas Productions. Enabled modules may provide
          business workflows, support operations, automation, communications, and related tools. Your use
          of a module may also be subject to a disclosed plan, order, or module-specific rule.
        </p>
      </section>
      <section>
        <h2>2. Accounts, organizations, and access</h2>
        <p>
          You must provide accurate information, protect your credentials, and use only accounts and
          organizations you are authorized to access. Organization, role, application, subscription, and access
          controls determine available functionality. You are responsible for authorized users and data
          submitted through your organization, subject to applicable law and your agreement with us.
        </p>
      </section>
      <section>
        <h2>3. Acceptable use</h2>
        <p>
          Do not use OperatorOS to violate law or another person’s rights; access systems or data without
          authorization; distribute malicious, deceptive, abusive, or infringing material; evade security,
          billing, carrier, consent, or opt-out controls; disrupt the service; or submit secrets or sensitive
          information where the applicable workflow does not support it.
        </p>
      </section>
      <section>
        <h2>4. Plans, billing, and availability</h2>
        <p>
          Paid plans and add-ons are governed by the price, interval, limits, and renewal terms presented at
          checkout. Taxes may apply. Features may depend on your plan and application access. The service is provided on
          an “as available” basis; maintenance, provider failures, security events, and circumstances beyond
          our control may interrupt access. We may modify features while preserving purchased commitments as
          required by applicable law or agreement.
        </p>
      </section>
      <section>
        <h2>5. Customer data and privacy</h2>
        <p>
          You retain rights in data you submit. You grant us the limited rights needed to host, process,
          secure, transmit, and display it to provide the service. The{' '}
          <Link href="/privacy" style={linkStyle}>Privacy Policy</Link> explains our data practices. You are
          responsible for ensuring that your collection and use of downstream customer or requester data is
          lawful and appropriately authorized.
        </p>
      </section>
      <section>
        <h2>SMS and Messaging Terms</h2>
        <p>
          <strong>Program identity:</strong> OperatorOS is the sender and program identity. Users receive SMS
          messages only after providing the appropriate consent. Supported messages may include account and
          security notifications, service-related notifications, scheduled-call notifications, support
          communications, workflow or status notifications, and other communications specifically requested
          or consented to by the user. This service consent does not authorize marketing or promotional SMS.
        </p>
        <p>
          Message frequency varies based on user activity, scheduled communications, and requested services.
          Message and data rates may apply. Consent to receive SMS messages is optional and is not a condition
          of purchasing goods or services. Reply <strong>STOP</strong> to unsubscribe or <strong>HELP</strong>{' '}
          for help. Opt-out requests are honored. An opted-out recipient will not receive further messages
          from that messaging program unless the recipient later opts back in through an allowed mechanism.
        </p>
        <p>
          Carriers are not liable for delayed or undelivered messages. Delivery is not guaranteed. The{' '}
          <Link href="/privacy" style={linkStyle}>Privacy Policy</Link> governs mobile information. Review the{' '}
          <Link href="/messaging" style={linkStyle}>Messaging Program</Link> or use the separate{' '}
          <Link href="/sms-consent" style={linkStyle}>SMS opt-in form</Link>. OperatorOS is not an emergency
          service; do not use messaging or calling workflows for emergencies.
        </p>
      </section>
      <section>
        <h2>6. Disclaimers and limitation</h2>
        <p>
          To the extent permitted by law, OperatorOS is provided without warranties not expressly stated in
          an applicable written agreement. We are not responsible for carrier filtering, third-party service
          interruption, customer-configured workflows, or indirect or consequential losses. Nothing in these
          terms excludes rights or liabilities that cannot legally be excluded.
        </p>
      </section>
      <section>
        <h2>7. Suspension, termination, and changes</h2>
        <p>
          We may restrict or terminate access for nonpayment, material breach, security risk, unlawful use,
          or harm to the service or others. You may stop using the service and may opt out of SMS separately
          at any time. We may update these terms; the current effective date will appear here.
        </p>
      </section>
      <section>
        <h2>8. Contact</h2>
        <p>
          Questions may be sent to <a href="mailto:john@shotgunninjas.com" style={linkStyle}>john@shotgunninjas.com</a>{' '}
          or through <a href="https://operatoros.net/john" style={linkStyle}>operatoros.net/john</a>.
        </p>
      </section>
    </>
  );
}

export default function OperatorOsPolicyPage({ kind }: { kind: OperatorOsPolicyKind }) {
  const privacy = kind === 'privacy';
  return (
    <MarketingLayout testId={`page-${kind}`}>
      <div className="policy-wrap">
        <header className="policy-header">
          <p className="policy-kicker">OperatorOS / Legal</p>
          <h1>{privacy ? 'Privacy Policy' : 'Terms and Conditions'}</h1>
          <p className="policy-deck">
            {privacy
              ? 'How OperatorOS handles account, operational, security, and communications information.'
              : 'The rules for using OperatorOS and its optional communications services.'}
          </p>
          <p className="policy-date"><span>Effective / last updated</span><strong>August 10, 2026</strong></p>
        </header>
        <PolicyNavigation active={kind} />
        <article className="policy-article">{privacy ? <PrivacyPolicy /> : <TermsAndConditions />}</article>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .policy-wrap{width:min(100% - 48px,920px);margin:0 auto;padding:64px 0 88px}.policy-header{max-width:760px}.policy-kicker{color:${brand.accentCyan};font-size:12px;font-weight:750;letter-spacing:.14em;text-transform:uppercase;margin:0 0 18px}.policy-header h1{font-family:${brand.fontDisplay};color:${brand.textPrimary};font-size:clamp(38px,6vw,64px);line-height:1.03;letter-spacing:-.045em;margin:0}.policy-deck{color:${brand.textSecondary};font-size:18px;line-height:1.65;max-width:680px;margin:22px 0}.policy-date{display:flex;gap:14px;flex-wrap:wrap;color:${brand.textMuted};font-size:13px}.policy-date strong{color:${brand.textSecondary}}.policy-nav{display:flex;flex-wrap:wrap;gap:9px;margin:36px 0 12px;padding:24px 0;border-top:1px solid ${brand.borderSoft};border-bottom:1px solid ${brand.borderSoft}}.policy-nav a{color:${brand.textSecondary};text-decoration:none;border:1px solid ${brand.borderSoft};border-radius:999px;padding:10px 14px;font-size:13px}.policy-nav a:hover,.policy-nav a[aria-current="page"]{color:${brand.textPrimary};border-color:${brand.accentCyan};background:rgba(0,229,255,.07)}.policy-article section{padding:28px 0;border-bottom:1px solid ${brand.borderSoft}}.policy-article h2{font-family:${brand.fontDisplay};color:${brand.textPrimary};font-size:21px;margin:0 0 12px}.policy-article p,.policy-article li{color:${brand.textSecondary};font-size:15px;line-height:1.8}.policy-article p{margin:0 0 13px}.policy-article p:last-child{margin-bottom:0}.policy-article ul{padding-left:22px}.policy-article strong{color:${brand.textPrimary}}.carrier-disclosure{padding:16px 18px;border-left:3px solid ${brand.accentCyan};background:rgba(0,229,255,.06);color:${brand.textPrimary}!important;font-weight:650}@media(max-width:640px){.policy-wrap{width:min(100% - 32px,920px);padding:46px 0 68px}.policy-deck{font-size:16px}.policy-article p,.policy-article li{font-size:14px}.policy-nav a{flex:1 1 45%;text-align:center}}
      ` }} />
    </MarketingLayout>
  );
}
