import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import SmsConsentForm from '@/components/marketing/SmsConsentForm';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'OperatorOS SMS Communications',
  description: 'Optional public opt-in for OperatorOS service-related SMS communications.',
};

export default function SmsConsentPage() {
  return (
    <MarketingLayout testId="page-sms-consent">
      <div className="sms-page">
        <header>
          <p>OperatorOS / Communications</p>
          <h1>OperatorOS SMS Communications</h1>
          <span>Users can optionally subscribe to service-related SMS communications from OperatorOS.</span>
        </header>
        <section className="sms-card" aria-labelledby="sms-card-title">
          <div className="sms-card-head">
            <p>Optional service messages</p>
            <h2 id="sms-card-title">Choose whether to receive OperatorOS SMS</h2>
            <span>
              Messages may relate to account or security notices, scheduled calls, service updates,
              support, workflow status, or another communication you specifically request. This form does
              not enroll you in marketing messages and does not provide voice-call consent.
            </span>
          </div>
          <SmsConsentForm />
        </section>
        <aside className="sms-links" aria-label="Messaging program resources">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms and Conditions</Link>
          <Link href="/messaging">Messaging Program</Link>
        </aside>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .sms-page{width:min(100% - 48px,820px);margin:0 auto;padding:68px 0 88px}.sms-page>header{max-width:720px;margin-bottom:34px}.sms-page>header>p,.sms-card-head>p{color:${brand.accentCyan};font-size:12px;font-weight:750;letter-spacing:.13em;text-transform:uppercase;margin:0 0 14px}.sms-page h1{font-family:${brand.fontDisplay};font-size:clamp(38px,6vw,62px);line-height:1.03;letter-spacing:-.045em;color:${brand.textPrimary};margin:0 0 20px}.sms-page>header>span,.sms-card-head>span{display:block;color:${brand.textSecondary};font-size:17px;line-height:1.65}.sms-card{padding:clamp(22px,4vw,38px);border:1px solid ${brand.borderSoft};border-radius:18px;background:${brand.bgPrimary};box-shadow:0 24px 72px rgba(0,0,0,.22)}.sms-card-head{padding-bottom:26px;margin-bottom:26px;border-bottom:1px solid ${brand.borderSoft}}.sms-card-head h2{font-family:${brand.fontDisplay};font-size:24px;color:${brand.textPrimary};margin:0 0 12px}.sms-card-head>span{font-size:14px}.sms-links{display:flex;justify-content:center;flex-wrap:wrap;gap:18px;margin-top:26px}.sms-links a{color:${brand.textSecondary};font-size:13px;text-underline-offset:3px}.sms-links a:hover{color:${brand.accentCyan}}@media(max-width:640px){.sms-page{width:min(100% - 32px,820px);padding:48px 0 68px}.sms-page>header>span{font-size:15px}}
      ` }} />
    </MarketingLayout>
  );
}
