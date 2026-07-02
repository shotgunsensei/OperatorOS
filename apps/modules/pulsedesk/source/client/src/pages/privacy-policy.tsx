import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import pulsedeskTitleLogo from "@assets/pulsedecktitleandlogo_1775753913991.png";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={pulsedeskTitleLogo} alt="PulseDesk" className="h-8" />
          <Link href="/">
            <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </a>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: April 13, 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              PulseDesk ("we," "our," or "us") operates a multi-tenant healthcare operations ticketing
              platform. This Privacy Policy explains how we collect, use, disclose, and safeguard
              information when you and your organization use our services at{" "}
              <a href="https://pulsedesk.replit.app" className="text-primary underline">
                pulsedesk.replit.app
              </a>{" "}
              (the "Service"). Please read this policy carefully. By accessing or using the Service,
              you agree to the terms of this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>

            <h3 className="text-base font-semibold mb-2 mt-4">2.1 Account & Organization Information</h3>
            <p className="text-muted-foreground leading-relaxed mb-2">
              When your organization creates an account, we collect:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Organization name, slug identifier, and OperatorOS entitlement identifiers</li>
              <li>Administrator name, username, and hashed password</li>
              <li>Staff member names, usernames, roles, and department assignments</li>
            </ul>

            <h3 className="text-base font-semibold mb-2 mt-4">2.2 Ticket & Operational Data</h3>
            <p className="text-muted-foreground leading-relaxed mb-2">
              The core function of the Service involves storing and processing:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Support tickets, facility requests, supply requests, and asset records created by your staff</li>
              <li>Comments, attachments, and status histories associated with those records</li>
              <li>Department, vendor, and asset inventory data you enter</li>
            </ul>

            <h3 className="text-base font-semibold mb-2 mt-4">2.3 Email Data</h3>
            <p className="text-muted-foreground leading-relaxed mb-2">
              If you use our Connected Inboxes feature to connect a Gmail, Microsoft 365, IMAP, or
              forwarding inbox, we process:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Inbound email messages (sender, subject, body) to create or thread tickets</li>
              <li>OAuth access and refresh tokens, stored encrypted in our database</li>
              <li>Your Google or Microsoft OAuth App Client ID and Client Secret (if you provide them), stored encrypted per organization</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              We do not store complete email archives. Emails are processed to create tickets and are
              not retained beyond what is necessary to populate ticket content.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">2.4 Usage & Technical Data</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Browser type, device type, and IP address</li>
              <li>Session data necessary to keep you signed in</li>
              <li>Pages visited, actions taken, and feature usage within the application</li>
              <li>Error logs and performance diagnostics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">We use the information we collect to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Provide, operate, and maintain the Service and its features</li>
              <li>Process and route support tickets and operational requests within your organization</li>
              <li>Authenticate users and enforce role-based access controls</li>
              <li>Send email notifications related to ticket activity (status changes, assignments, comments)</li>
              <li>Validate module access using OperatorOS SSO and entitlement snapshots</li>
              <li>Monitor service health, diagnose errors, and improve reliability</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We do not sell your data to third parties, use it to train AI models, or share it with
              advertisers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data Storage & Security</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              All data is stored in a PostgreSQL database hosted on Neon (neon.tech). We implement
              the following security measures:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Passwords are hashed using scrypt with unique salts before storage</li>
              <li>OAuth tokens and client secrets are encrypted at rest using AES-256 symmetric encryption</li>
              <li>All data transmission between your browser and our servers uses HTTPS (TLS)</li>
              <li>Access to production data is restricted to authorized personnel</li>
              <li>Session tokens are rotated on authentication and expire after 30 days of inactivity</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              While we take reasonable precautions, no security system is impenetrable. In the event
              of a breach affecting your data, we will notify affected organizations as required by
              applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Third-Party Services</h2>

            <h3 className="text-base font-semibold mb-2 mt-4">5.1 OperatorOS (Access and Entitlements)</h3>
            <p className="text-muted-foreground leading-relaxed">
              PulseDesk receives SSO identity claims and module entitlement snapshots from OperatorOS.
              Subscription terms, seats, access status, and account history are managed in OperatorOS,
              not inside the PulseDesk child application.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">5.2 Google (Gmail / Google Workspace)</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you connect a Google inbox, we use Google's OAuth 2.0 API to obtain your authorization.
              We access your mailbox only via IMAP to read and mark messages for ticket creation.
              Our use of Google user data complies with the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Google API Services User Data Policy
              </a>, including the Limited Use requirements.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">5.3 Microsoft (Outlook / Microsoft 365)</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you connect a Microsoft inbox, we use Microsoft's OAuth 2.0 (Azure AD) API to obtain
              your authorization. We access your mailbox only via IMAP using the
              IMAP.AccessAsUser.All permission scope for ticket creation. Microsoft's privacy statement
              is available at{" "}
              <a href="https://privacy.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                privacy.microsoft.com
              </a>.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">5.4 SendGrid / Mailgun (Email Forwarding)</h3>
            <p className="text-muted-foreground leading-relaxed">
              If you use email forwarding via SendGrid or Mailgun, inbound emails are delivered to our
              webhook endpoint. These providers have their own privacy policies which govern the transit
              of email through their systems.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">5.5 Replit (Infrastructure)</h3>
            <p className="text-muted-foreground leading-relaxed">
              The Service is hosted on Replit. Replit's privacy policy is available at{" "}
              <a href="https://replit.com/site/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                replit.com/site/privacy
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your organization's data while OperatorOS reports active PulseDesk module access plus a
              90-day grace period following entitlement revocation, during which you may export
              or request your data. After the grace period, data may be permanently deleted. OAuth
              tokens are deleted immediately when you disconnect a mail connector. Hashed passwords
              and session records are retained only as long as the associated account exists.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">
              Depending on your jurisdiction, you may have the right to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your personal data</li>
              <li>Object to or restrict certain processing activities</li>
              <li>Receive a copy of your data in a portable format</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Organization administrators can manage most data directly within the Service. For requests
              that require our direct assistance, please contact us using the information in Section 9.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is intended for use by healthcare organizations and their staff. It is not
              directed to individuals under the age of 18. We do not knowingly collect personal
              information from minors.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. When we do, we will update the
              "Last updated" date at the top of this page. For material changes, we will notify
              organization administrators via the email address associated with their account.
              Continued use of the Service after changes take effect constitutes acceptance of the
              updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions, concerns, or requests relating to this Privacy Policy or our data
              practices, please contact us:
            </p>
            <div className="mt-3 p-4 rounded-lg bg-muted/50 border text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">PulseDesk</p>
              <p>Email: <a href="mailto:privacy@pulsedesk.app" className="text-primary underline">privacy@pulsedesk.app</a></p>
              <p>Website: <a href="https://pulsedesk.replit.app" className="text-primary underline">pulsedesk.replit.app</a></p>
            </div>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} PulseDesk. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/terms"><a className="hover:text-foreground transition-colors">Terms of Service</a></Link>
            <Link href="/"><a className="hover:text-foreground transition-colors">Back to Sign In</a></Link>
          </div>
        </div>
      </main>
    </div>
  );
}
