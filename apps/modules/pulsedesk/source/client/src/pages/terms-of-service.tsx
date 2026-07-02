import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import pulsedeskTitleLogo from "@assets/pulsedecktitleandlogo_1775753913991.png";

export default function TermsOfService() {
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
        <h1 className="text-3xl font-bold text-foreground mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: April 13, 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms of Service ("Terms") govern your and your organization's access to and use
              of PulseDesk (the "Service"), operated by PulseDesk ("we," "our," or "us"). By
              registering for an account, clicking "I agree," or otherwise accessing or using the
              Service, you agree to be bound by these Terms. If you are accepting these Terms on
              behalf of an organization, you represent that you have authority to bind that
              organization. If you do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              PulseDesk is a multi-tenant healthcare operations management platform that provides
              ticketing, facility and supply request management, asset tracking, connected inboxes,
              and analytics tools for healthcare organizations and their staff. Access is governed
              by the PulseDesk module entitlement assigned through OperatorOS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Accounts & Organizations</h2>

            <h3 className="text-base font-semibold mb-2 mt-4">3.1 Account Registration</h3>
            <p className="text-muted-foreground leading-relaxed">
              To use the Service, an organization administrator must register an account and create
              an organization. You agree to provide accurate, current, and complete information
              during registration and to keep that information updated. You are responsible for
              maintaining the confidentiality of your credentials and for all activity that occurs
              under your account.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">3.2 Organization Responsibility</h3>
            <p className="text-muted-foreground leading-relaxed">
              The organization administrator is responsible for all users added to the organization,
              including configuring appropriate roles and access levels. You must promptly remove
              access for users who are no longer authorized. We are not liable for damages resulting
              from unauthorized access caused by your failure to maintain account security.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">3.3 Account Termination by You</h3>
            <p className="text-muted-foreground leading-relaxed">
              You may request organization deletion by contacting us. PulseDesk module access,
              seats, and subscription cancellation are managed through OperatorOS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. OperatorOS Access</h2>

            <h3 className="text-base font-semibold mb-2 mt-4">4.1 Module Entitlements</h3>
            <p className="text-muted-foreground leading-relaxed">
              PulseDesk is accessed as an OperatorOS-managed module. OperatorOS is the source of
              truth for subscription terms, seats, module assignment, and entitlement
              state. PulseDesk validates access from OperatorOS SSO and entitlement snapshots.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">4.2 Subscription Management</h3>
            <p className="text-muted-foreground leading-relaxed">
              Subscription and payment changes must be made in OperatorOS or by contacting your
              OperatorOS administrator. PulseDesk does not start payment flows, host subscription
              management screens, or process payment credentials directly.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">4.3 Access Changes</h3>
            <p className="text-muted-foreground leading-relaxed">
              OperatorOS entitlement changes may enable, restrict, or revoke PulseDesk access.
              Feature flags provided by OperatorOS may also enable or disable specific PulseDesk
              capabilities for your organization.
            </p>

            <h3 className="text-base font-semibold mb-2 mt-4">4.4 Revoked Access</h3>
            <p className="text-muted-foreground leading-relaxed">
              If OperatorOS reports that your PulseDesk module is disabled or revoked, PulseDesk may
              reject protected requests until module access is restored through OperatorOS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-2">You agree not to use the Service to:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Violate any applicable local, state, national, or international law or regulation</li>
              <li>Transmit any content that is unlawful, defamatory, abusive, fraudulent, or harmful</li>
              <li>Impersonate any person or entity, or misrepresent your affiliation</li>
              <li>Attempt to gain unauthorized access to any part of the Service or its infrastructure</li>
              <li>Introduce malware, viruses, or any other malicious code</li>
              <li>Scrape, crawl, or use automated means to access the Service beyond normal use</li>
              <li>Resell or sublicense access to the Service without our written permission</li>
              <li>Use the Service in a manner that could damage, disable, or impair its performance</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              We reserve the right to suspend or terminate accounts that violate these policies,
              without notice, at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Connected Inboxes & OAuth</h2>
            <p className="text-muted-foreground leading-relaxed">
              By connecting an email inbox to the Service (via Google OAuth, Microsoft OAuth, IMAP,
              or email forwarding), you authorize PulseDesk to access that mailbox for the purpose
              of creating and managing support tickets. You are responsible for ensuring you have
              the authority to connect any inbox you link to the Service. You may disconnect any
              inbox at any time through the Connected Inboxes settings. Disconnecting an inbox
              revokes our access tokens and stops further email processing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service, including all software, design, trademarks, and content provided by
              PulseDesk, is the exclusive property of PulseDesk and is protected by intellectual
              property laws. These Terms do not grant you any right, title, or interest in the
              Service other than a limited, non-exclusive, non-transferable license to use the
              Service for your internal business operations while your OperatorOS entitlement remains active.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              You retain ownership of all data and content your organization inputs into the Service
              ("Your Data"). You grant us a limited license to store, process, and display Your Data
              solely to the extent necessary to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Disclaimers</h2>
            <p className="text-muted-foreground leading-relaxed">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
              WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              PulseDesk is an operational management tool and is not a certified electronic health
              record (EHR) system. It is not designed or intended to store Protected Health
              Information (PHI) under HIPAA. You are solely responsible for ensuring that your
              use of the Service complies with all applicable healthcare regulations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL PULSEDESK, ITS
              OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
              WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR
              OTHER INTANGIBLE LOSSES, RESULTING FROM (A) YOUR USE OF OR INABILITY TO USE THE
              SERVICE; (B) UNAUTHORIZED ACCESS TO OR ALTERATION OF YOUR DATA; OR (C) ANY OTHER
              MATTER RELATING TO THE SERVICE.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              IN ANY CASE, OUR AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF ONE HUNDRED US
              DOLLARS ($100) OR THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Indemnification</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree to indemnify, defend, and hold harmless PulseDesk and its officers,
              directors, employees, and agents from and against any claims, liabilities, damages,
              losses, and expenses, including reasonable attorneys' fees, arising out of or in any
              way connected with your access to or use of the Service, your violation of these
              Terms, or your violation of any rights of another party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may suspend or terminate your access to the Service, with or without notice, for
              conduct that we determine in our sole discretion violates these Terms, is harmful to
              other users or to us, or for any other reason. Upon termination, your right to access
              the Service immediately ceases. Provisions of these Terms that by their nature should
              survive termination will survive, including Sections 7, 8, 9, 10, 11, and 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Changes to These Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms at any time. When we make material changes,
              we will update the "Last updated" date at the top of this page and notify organization
              administrators via email. Your continued use of the Service after changes take effect
              constitutes your acceptance of the revised Terms. If you do not agree to the new Terms,
              you must stop using the Service and contact your OperatorOS administrator about access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Governing Law & Disputes</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the
              United States, without regard to conflict of law principles. Any disputes arising
              under these Terms shall be resolved through binding arbitration in accordance with
              the American Arbitration Association's Commercial Arbitration Rules, except that
              either party may seek injunctive or other equitable relief in any court of competent
              jurisdiction. The arbitration shall take place in the United States.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">14. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about these Terms of Service, please contact us:
            </p>
            <div className="mt-3 p-4 rounded-lg bg-muted/50 border text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">PulseDesk</p>
              <p>Email: <a href="mailto:legal@pulsedesk.app" className="text-primary underline">legal@pulsedesk.app</a></p>
              <p>Website: <a href="https://pulsedesk.replit.app" className="text-primary underline">pulsedesk.replit.app</a></p>
            </div>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} PulseDesk. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy"><a className="hover:text-foreground transition-colors">Privacy Policy</a></Link>
            <Link href="/"><a className="hover:text-foreground transition-colors">Back to Sign In</a></Link>
          </div>
        </div>
      </main>
    </div>
  );
}
