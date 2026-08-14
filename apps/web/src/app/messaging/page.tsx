import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'OperatorOS Messaging Program',
  description: 'Reviewer-friendly details for the optional OperatorOS service SMS program.',
};

const sections = [
  ['1. Program Purpose', <>OperatorOS sends consent-based, service-related SMS communications connected to account activity, requested support, scheduled calls, service updates, workflow or status updates, and other operational communications a user specifically requests. The service program does not authorize marketing messages.</>],
  ['2. Who Receives Messages', <>Only the mobile number belonging to a person who affirmatively provides the appropriate consent receives OperatorOS program messages. Providing a phone number alone is not consent.</>],
  ['3. How Users Opt In', <>Users visit <a href="https://operatoros.net/sms-consent">https://operatoros.net/sms-consent</a>, enter a US mobile number, and actively select a separate checkbox that is unchecked by default. SMS consent is optional and is not required for an account, purchase, Terms acceptance, or core OperatorOS use. Initial keyword-based opt-in is not used.</>],
  ['4. How Consent Is Recorded', <>OperatorOS stores a unique consent record and append-only event evidence including the normalized phone number, status, UTC time, program, public source URL, exact disclosure text and version, policy versions, mechanism, and privacy-preserving request evidence. This evidence is not exposed through a public lookup.</>],
  ['5. Message Types', <>Messages may include account and security notifications, service-related notifications, scheduled-call notifications, support communications, workflow or status notifications, and another service communication specifically requested or consented to by the user.</>],
  ['6. Message Frequency', <>Message frequency varies based on user activity, scheduled communications, and requested OperatorOS services. OperatorOS does not promise a fixed schedule or send volume.</>],
  ['7. Message and Data Rates', <>Message and data rates may apply according to the recipient’s mobile plan.</>],
  ['8. How to Opt Out', <>Reply <strong>STOP</strong> to unsubscribe. Standard supported opt-out keywords include STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT, and CANCEL. OperatorOS records the revocation when the signed provider workflow supplies it, applies local outbound suppression, and does not bypass Twilio or carrier suppression.</>],
  ['9. How to Get Help', <>Reply <strong>HELP</strong> for help. You may also email <a href="mailto:john@shotgunninjas.com">john@shotgunninjas.com</a> or use <a href="https://operatoros.net/john">operatoros.net/john</a>.</>],
  ['10. Re-Enrollment', <>After opting out, a recipient receives no further messages from this program unless they subsequently provide new consent through the public form or use START where the configured Twilio workflow supports opt-back-in. START is not presented as the initial enrollment method.</>],
  ['11. Privacy', <>Mobile information and messaging consent are handled under the <Link href="/privacy">OperatorOS Privacy Policy</Link>. Mobile opt-in data is not sold, rented, or shared with third parties or affiliates for their own marketing or promotional purposes.</>],
  ['12. Terms', <>The <Link href="/terms">OperatorOS Terms and Conditions</Link> govern the program. Consent is not a condition of purchase. Carriers are not liable for delayed or undelivered messages, and delivery is not guaranteed.</>],
] as const;

export default function MessagingPage() {
  return (
    <MarketingLayout testId="page-messaging">
      <div className="messaging-wrap">
        <header>
          <p>OperatorOS / Communications</p>
          <h1>OperatorOS Messaging Program</h1>
          <span>A public explanation of the optional OperatorOS service SMS workflow.</span>
        </header>
        <div className="messaging-callout">
          <strong>Public opt-in URL</strong>
          <a href="https://operatoros.net/sms-consent">https://operatoros.net/sms-consent</a>
          <span>The SMS checkbox is separate, affirmative, optional, and unchecked by default.</span>
        </div>
        <article>
          {sections.map(([title, body]) => <section key={title}><h2>{title}</h2><p>{body}</p></section>)}
        </article>
        <nav aria-label="Messaging documents">
          <a href="https://operatoros.net/privacy">https://operatoros.net/privacy</a>
          <a href="https://operatoros.net/terms">https://operatoros.net/terms</a>
          <Link href="/sms-consent">Opt in to SMS</Link>
        </nav>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .messaging-wrap{width:min(100% - 48px,920px);margin:0 auto;padding:68px 0 88px}.messaging-wrap>header{max-width:760px}.messaging-wrap>header>p{color:${brand.accentCyan};font-size:12px;font-weight:750;letter-spacing:.14em;text-transform:uppercase;margin:0 0 18px}.messaging-wrap h1{font-family:${brand.fontDisplay};font-size:clamp(38px,6vw,64px);line-height:1.03;letter-spacing:-.045em;color:${brand.textPrimary};margin:0 0 20px}.messaging-wrap>header>span{color:${brand.textSecondary};font-size:18px;line-height:1.6}.messaging-callout{display:grid;gap:8px;margin:36px 0 14px;padding:22px;border:1px solid rgba(0,229,255,.28);border-radius:14px;background:rgba(0,229,255,.055)}.messaging-callout strong{color:${brand.textPrimary}}.messaging-callout a,.messaging-wrap article a,.messaging-wrap article a:visited,.messaging-wrap nav a{color:${brand.accentCyan};text-underline-offset:3px;overflow-wrap:anywhere}.messaging-callout span{color:${brand.textSecondary};font-size:13px;line-height:1.6}.messaging-wrap article section{padding:25px 0;border-bottom:1px solid ${brand.borderSoft}}.messaging-wrap article h2{font-family:${brand.fontDisplay};color:${brand.textPrimary};font-size:20px;margin:0 0 10px}.messaging-wrap article p{color:${brand.textSecondary};font-size:15px;line-height:1.8;margin:0}.messaging-wrap article strong{color:${brand.textPrimary}}.messaging-wrap>nav{display:flex;flex-wrap:wrap;gap:16px;margin-top:28px;font-size:13px}@media(max-width:640px){.messaging-wrap{width:min(100% - 32px,920px);padding:48px 0 68px}.messaging-wrap>header>span{font-size:16px}.messaging-wrap article p{font-size:14px}}
      ` }} />
    </MarketingLayout>
  );
}
