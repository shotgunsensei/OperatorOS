import Link from 'next/link';
import React from 'react';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import OperatorLogo from '@/components/brand/OperatorLogo';
import { brand } from '@/lib/brand';

export type LegalPageKind = 'privacy' | 'terms';

const linkStyle = { color: brand.accentCyan, textDecoration: 'underline', textUnderlineOffset: 3 };

const privacySections = [
  {
    title: '1. Scope and who we are',
    body: (
      <p>
        This SMS/MMS Messaging Privacy Policy explains how Shotgun Ninjas Productions (“Shotgun Ninjas,”
        “we,” “us,” or “our”) handles information used by <strong>OperatorOS Messaging</strong>, part of the
        OperatorOS business-operations ecosystem. It applies to messages sent when you request a lead or
        service follow-up, receive an operational or account update, receive a reminder, or initiate a
        private SMS trigger through an OperatorOS workflow.
      </p>
    ),
  },
  {
    title: '2. Information we collect',
    body: (
      <>
        <p>Depending on the workflow you use, we may collect and retain:</p>
        <ul>
          <li><strong>Phone number and identity details</strong> you provide or that are associated with your account or request.</li>
          <li><strong>Consent evidence</strong>, such as the source, date, time, method, request context, and version of the disclosure shown when you opted in.</li>
          <li><strong>Message content and metadata</strong>, including message text, MMS media where enabled, timestamps, sender and recipient numbers, message type, and workflow identifiers.</li>
          <li><strong>Delivery and preference data</strong>, including delivery status, failures, replies, STOP requests, HELP requests, and other opt-out signals.</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. How we use messaging information',
    body: (
      <p>
        We use this information to honor your request and deliver requested lead or service follow-up,
        operational and account updates, reminders, and private user-initiated SMS triggers; authenticate
        and protect workflows; process STOP and HELP requests; troubleshoot delivery; measure reliability;
        maintain consent records; and meet legal, carrier, and platform requirements. We do not use consent
        obtained for OperatorOS Messaging to send unrelated advertising.
      </p>
    ),
  },
  {
    title: '4. Vendors and permitted sharing',
    body: (
      <>
        <p>
          We may share the information described above with Twilio, mobile carriers, and service providers
          that are needed to route, host, secure, support, or monitor messaging. Those providers may process
          phone numbers, content, and delivery data only to perform services for us or as otherwise required
          by law.
        </p>
        <p>
          <strong>Mobile opt-in data and consent are not sold, rented, or shared with third parties or
          affiliates for their own marketing or promotional purposes.</strong> We may also disclose
          information when legally required, to protect people or the service, investigate abuse, or in
          connection with a merger, acquisition, financing, or sale of business assets, subject to this
          policy or applicable privacy protections.
        </p>
      </>
    ),
  },
  {
    title: '5. Retention and security',
    body: (
      <p>
        We retain phone numbers, consent evidence, message records, and opt-out history for as long as
        reasonably necessary to provide the messaging service, maintain suppression and compliance records,
        resolve disputes, and satisfy legal or carrier obligations. We use reasonable administrative,
        technical, and organizational safeguards, including access controls and encrypted transmission.
        No method of storage or transmission is completely secure.
      </p>
    ),
  },
  {
    title: '6. Your choices and rights',
    body: (
      <p>
        Reply <strong>STOP</strong> to opt out of OperatorOS Messaging and <strong>HELP</strong> for help.
        You may also contact us to request access, correction, deletion, or an explanation of the consent
        record associated with your number, subject to records we must retain for compliance. Contact
        <a href="mailto:john@shotgunninjas.com" style={{ ...linkStyle, marginLeft: 4 }}>john@shotgunninjas.com</a>
        {' '}or <a href="https://operatoros.net/john" style={linkStyle}>operatoros.net/john</a>.
      </p>
    ),
  },
  {
    title: '7. Service providers and delivery',
    body: (
      <p>
        Messaging may be provided through Twilio and participating carriers. Carrier delivery is not
        guaranteed. Supported carriers and devices may vary, and a carrier or device may delay, filter, or
        fail to deliver a message.
      </p>
    ),
  },
  {
    title: '8. Changes and contact',
    body: (
      <p>
        We may update this policy as the program, vendors, or legal requirements change. The current version
        is posted on this page with its effective date. This policy is part of the <Link href="/msg_terms" style={linkStyle}>OperatorOS Messaging Terms &amp; Conditions</Link>.
        Questions about privacy or messaging can be sent to <a href="mailto:john@shotgunninjas.com" style={linkStyle}>john@shotgunninjas.com</a>.
      </p>
    ),
  },
];

const termsSections = [
  {
    title: '1. The program',
    body: (
      <p>
        OperatorOS Messaging is an SMS/MMS messaging program operated by Shotgun Ninjas Productions.
        It supports consent-based requested lead or service follow-up, operational and account updates,
        reminders, and private user-initiated SMS triggers in the OperatorOS ecosystem. MMS is used only
        where enabled for the applicable workflow.
      </p>
    ),
  },
  {
    title: '2. How you opt in',
    body: (
      <p>
        You may opt in through a request, account or service workflow, a form, a conversation with our
        team, or another clear user-initiated method that presents the applicable messaging disclosure.
        We do not require a particular interface or assume consent merely because you provide a phone
        number. By opting in, you confirm that you are authorized to use the number and agree to receive
        recurring messages related to the request or workflow you initiated.
      </p>
    ),
  },
  {
    title: '3. Disclosures, costs, and frequency',
    body: (
      <p>
        Consent is not a condition of purchase. Recurring messages may be sent, with frequency varying
        according to your activity, requests, and the operational workflow. Message and data rates may
        apply. Carriers and devices supported may vary, and carrier delivery is not guaranteed.
      </p>
    ),
  },
  {
    title: '4. Opt out and get help',
    body: (
      <p>
        Reply <strong>STOP</strong> to opt out of future OperatorOS Messaging messages. You may receive
        one final confirmation. Reply <strong>HELP</strong> for help, or contact
        <a href="mailto:john@shotgunninjas.com" style={{ ...linkStyle, marginLeft: 4 }}>john@shotgunninjas.com</a>
        {' '}or <a href="https://operatoros.net/john" style={linkStyle}>operatoros.net/john</a>. Opting out
        may prevent delivery of requested workflow updates by SMS, but does not cancel an underlying
        service or account relationship.
      </p>
    ),
  },
  {
    title: '5. Eligibility and acceptable use',
    body: (
      <p>
        You must have authority to use the phone number you submit and must comply with applicable law,
        carrier rules, and these terms. Do not use the program to impersonate another person, send unlawful,
        abusive, fraudulent, or harmful content, interfere with delivery, evade opt-out controls, or
        trigger messages to a number without the recipient’s permission.
      </p>
    ),
  },
  {
    title: '6. Privacy',
    body: (
      <p>
        Our handling of phone numbers, consent evidence, message content, and delivery information is
        described in the <Link href="/msg_privacy" style={linkStyle}>OperatorOS Messaging Privacy Policy</Link>.
        Please review it before opting in.
      </p>
    ),
  },
  {
    title: '7. Availability and important disclaimer',
    body: (
      <p>
        Messaging is provided on an “as available” basis. We are not responsible for delays, filtering,
        outages, unsupported devices, or carrier failures. OperatorOS and OutCall do not replace 911 or
        emergency services. Do not use SMS messaging for emergencies. No recording is enabled by SMS
        messaging.
      </p>
    ),
  },
  {
    title: '8. Changes or termination',
    body: (
      <p>
        We may modify, pause, or terminate the program, a workflow, or these terms when needed for
        operations, security, carrier requirements, or law. Updated terms will be posted here with a new
        effective date. Your continued use after an update means you accept the updated terms; you may
        opt out at any time by replying STOP.
      </p>
    ),
  },
  {
    title: '9. Contact',
    body: (
      <p>
        Questions about OperatorOS Messaging can be directed to
        <a href="mailto:john@shotgunninjas.com" style={{ ...linkStyle, marginLeft: 4 }}>john@shotgunninjas.com</a>
        {' '}or <a href="https://operatoros.net/john" style={linkStyle}>operatoros.net/john</a>.
        These terms should be read together with the <Link href="/msg_privacy" style={linkStyle}>Messaging Privacy Policy</Link>.
      </p>
    ),
  },
];

export default function LegalMessagingPage({ kind }: { kind: LegalPageKind }) {
  const isPrivacy = kind === 'privacy';
  const sections = isPrivacy ? privacySections : termsSections;
  const title = isPrivacy ? 'SMS/MMS Messaging Privacy Policy' : 'SMS/MMS Messaging Terms & Conditions';
  const deck = isPrivacy
    ? 'A clear account of the information OperatorOS Messaging uses, why it is used, and how your choices are honored.'
    : 'The plain-language rules for participating in consent-based OperatorOS Messaging.';

  return (
    <MarketingLayout testId={`page-msg-${kind}`}>
      <div className="legal-wrap">
        <div className="legal-topline">
          <Link href="/" aria-label="Return to OperatorOS home"><OperatorLogo size={30} wordmarkSize={15} /></Link>
          <span className="legal-status">Messaging program documents</span>
        </div>
        <header className="legal-header">
          <p className="legal-kicker">OperatorOS Messaging / {isPrivacy ? 'Privacy' : 'Terms'}</p>
          <h1>{title}</h1>
          <p className="legal-deck">{deck}</p>
          <div className="legal-meta"><span>Effective / last updated</span><strong>August 8, 2026</strong></div>
        </header>
        <aside className="legal-notice" role="note">
          <strong>Review note.</strong> This is a general policy template for informational purposes, not legal advice.
          Please have qualified counsel review it for your business, jurisdictions, and messaging practices.
        </aside>
        <nav className="legal-switcher" aria-label="Messaging documents">
          <Link href="/msg_privacy" className={isPrivacy ? 'active' : ''}>Privacy Policy</Link>
          <Link href="/msg_terms" className={!isPrivacy ? 'active' : ''}>Terms &amp; Conditions</Link>
        </nav>
        <article className="legal-article">
          {sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.body}</section>)}
        </article>
        <p className="legal-close">Questions about this program? <a href="mailto:john@shotgunninjas.com" style={linkStyle}>john@shotgunninjas.com</a>.</p>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .legal-wrap { width: min(100% - 48px, 920px); margin: 0 auto; padding: 34px 0 80px; }
        .legal-topline { display:flex; justify-content:space-between; align-items:center; gap:18px; padding-bottom:28px; border-bottom:1px solid ${brand.borderSoft}; }
        .legal-status { color:${brand.textMuted}; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
        .legal-header { padding:72px 0 28px; max-width:760px; }
        .legal-kicker { color:${brand.accentCyan}; font-size:12px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; margin:0 0 18px; }
        .legal-header h1 { font-family:${brand.fontDisplay}; color:${brand.textPrimary}; font-size:clamp(36px, 6vw, 64px); line-height:1.03; letter-spacing:-.045em; margin:0; }
        .legal-deck { color:${brand.textSecondary}; font-size:18px; line-height:1.6; max-width:640px; margin:22px 0 28px; }
        .legal-meta { display:flex; gap:14px; flex-wrap:wrap; color:${brand.textMuted}; font-size:13px; }
        .legal-meta strong { color:${brand.textSecondary}; font-weight:600; }
        .legal-notice { border:1px solid rgba(245,158,11,.32); border-left:3px solid ${brand.accentAmber}; background:rgba(245,158,11,.07); color:${brand.textSecondary}; border-radius:8px; padding:15px 18px; line-height:1.55; font-size:13px; }
        .legal-notice strong { color:${brand.accentAmber}; }
        .legal-switcher { display:flex; gap:8px; flex-wrap:wrap; padding:30px 0 0; }
        .legal-switcher a { color:${brand.textSecondary}; text-decoration:none; border:1px solid ${brand.borderSoft}; border-radius:999px; padding:9px 14px; font-size:13px; }
        .legal-switcher a.active, .legal-switcher a:hover { color:${brand.textPrimary}; border-color:${brand.accentCyan}; background:rgba(0,229,255,.07); }
        .legal-article { margin-top:30px; border-top:1px solid ${brand.borderSoft}; }
        .legal-article section { padding:28px 0; border-bottom:1px solid ${brand.borderSoft}; }
        .legal-article h2 { font-family:${brand.fontDisplay}; color:${brand.textPrimary}; font-size:20px; letter-spacing:-.015em; margin:0 0 12px; }
        .legal-article p, .legal-article li { color:${brand.textSecondary}; font-size:15px; line-height:1.78; }
        .legal-article p { margin:0 0 12px; }
        .legal-article p:last-child { margin-bottom:0; }
        .legal-article ul { margin:8px 0 0; padding-left:22px; }
        .legal-article strong { color:${brand.textPrimary}; font-weight:650; }
        .legal-close { color:${brand.textMuted}; font-size:13px; margin-top:28px; }
        @media (max-width:640px) { .legal-wrap { width:min(100% - 32px, 920px); padding-top:22px; } .legal-topline { align-items:flex-start; } .legal-status { text-align:right; max-width:150px; } .legal-header { padding-top:52px; } .legal-deck { font-size:16px; } .legal-article p, .legal-article li { font-size:14px; } }
      ` }} />
    </MarketingLayout>
  );
}