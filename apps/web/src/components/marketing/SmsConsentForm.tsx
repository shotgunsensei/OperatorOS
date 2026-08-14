'use client';

import Link from 'next/link';
import React, { FormEvent, useState } from 'react';
import { brand } from '@/lib/brand';

const DISCLOSURE = 'I agree to receive recurring SMS messages from OperatorOS regarding account notifications, scheduled calls, service updates, support, and other communications I request. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.';

type Result = { kind: 'success' | 'error'; message: string } | null;

export default function SmsConsentForm() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    if (!smsConsent) {
      setResult({ kind: 'error', message: 'Select the SMS consent checkbox to opt in.' });
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/public/operatoros/sms-consent', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, smsConsent, website: String(form.get('website') || '') }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; reference?: string; duplicate?: boolean };
      if (!response.ok) throw new Error(body.error || 'Your SMS opt-in could not be saved.');
      setResult({
        kind: 'success',
        message: body.duplicate
          ? `This number is already opted in. Consent reference: ${body.reference}.`
          : `Your optional SMS consent was recorded. Consent reference: ${body.reference}.`,
      });
      setPhoneNumber('');
      setSmsConsent(false);
    } catch (error) {
      setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Your SMS opt-in could not be saved.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="sms-consent-form" onSubmit={submit} noValidate data-testid="sms-consent-form">
      <div className="sms-field">
        <label htmlFor="sms-phone">Mobile phone number</label>
        <input
          id="sms-phone"
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-0123"
          value={phoneNumber}
          onChange={event => setPhoneNumber(event.target.value)}
          aria-describedby="sms-phone-help"
          maxLength={40}
          required
        />
        <p id="sms-phone-help">US mobile numbers are normalized to E.164 format when consent is recorded.</p>
      </div>

      <div className="sms-honeypot" aria-hidden="true">
        <label htmlFor="sms-website">Website</label>
        <input id="sms-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="sms-consent-control">
        <input
          id="sms-explicit-consent"
          name="smsConsent"
          type="checkbox"
          checked={smsConsent}
          onChange={event => setSmsConsent(event.target.checked)}
          aria-describedby="sms-disclosure sms-policy-links"
          required
          data-testid="sms-consent-checkbox"
        />
        <div>
          <label htmlFor="sms-explicit-consent">Optional consent to OperatorOS service SMS</label>
          <p id="sms-disclosure">{DISCLOSURE}</p>
          <p id="sms-policy-links" className="sms-policy-links">
            Review the <Link href="/privacy">Privacy Policy</Link> and{' '}
            <Link href="/terms">Terms and Conditions</Link>.
          </p>
        </div>
      </div>

      <button type="submit" disabled={submitting} data-testid="sms-consent-submit">
        {submitting ? 'Recording Consent…' : 'Opt In to SMS'}
      </button>
      <p className="sms-optional">SMS consent is separate, optional, and not required to browse, create an account, purchase a service, or use OperatorOS.</p>
      {result && (
        <div className={`sms-result ${result.kind}`} role={result.kind === 'error' ? 'alert' : 'status'} tabIndex={-1}>
          {result.message}
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `
        .sms-consent-form{display:grid;gap:22px}.sms-field{display:grid;gap:8px}.sms-field label,.sms-consent-control label{color:${brand.textPrimary};font-weight:700;font-size:14px}.sms-field input{width:100%;min-height:50px;border:1px solid ${brand.borderSoft};border-radius:10px;background:${brand.bgPrimary};color:${brand.textPrimary};padding:0 14px;font-size:16px}.sms-field input::placeholder{color:${brand.textMuted}}.sms-field p,.sms-optional{margin:0;color:${brand.textMuted};font-size:12px;line-height:1.6}.sms-consent-control{display:grid;grid-template-columns:24px 1fr;gap:13px;align-items:start;padding:18px;border:1px solid ${brand.borderSoft};border-radius:12px;background:rgba(255,255,255,.025)}.sms-consent-control input{width:20px;height:20px;margin:2px 0 0;accent-color:${brand.accentCyan}}.sms-consent-control p{color:${brand.textSecondary};font-size:14px;line-height:1.7;margin:9px 0 0}.sms-policy-links a{color:${brand.accentCyan};font-weight:650;text-underline-offset:3px}.sms-consent-form button{min-height:50px;border:0;border-radius:10px;background:${brand.accentCyan};color:#061116;font-weight:800;font-size:15px;cursor:pointer}.sms-consent-form button:hover:not(:disabled){filter:brightness(1.08)}.sms-consent-form button:disabled{opacity:.65;cursor:wait}.sms-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}.sms-result{padding:14px 16px;border-radius:10px;font-size:14px;line-height:1.5}.sms-result.success{border:1px solid rgba(74,222,128,.4);background:rgba(74,222,128,.08);color:#bbf7d0}.sms-result.error{border:1px solid rgba(248,113,113,.45);background:rgba(248,113,113,.08);color:#fecaca}@media(max-width:520px){.sms-consent-control{padding:15px}.sms-consent-control p{font-size:13px}}
      ` }} />
    </form>
  );
}
