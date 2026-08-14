import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="h-8 w-8" data-testid="button-back-home">
              <a href="/">
                <ArrowLeft className="w-4 h-4" />
              </a>
            </Button>
            <span className="font-semibold text-sm tracking-tight">Tech Deck</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-terms-title">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8" data-testid="text-terms-updated">Last updated: May 3, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Agreement to Terms</h2>
            <p>
              By accessing or using Tech Deck ("the Service"), operated by Shotgun Ninjas Productions
              ("we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms"). If you
              do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Eligibility</h2>
            <p>
              You must be at least 18 years old and capable of entering into a binding contract to use
              the Service. By using the Service on behalf of an organization, you represent that you
              have authority to bind that organization to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. Account Registration</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and
              for all activity that occurs under your account. Notify us immediately of any unauthorized
              access. We are not liable for losses caused by unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Subscription Plans and Billing</h2>
            <p>
              Subscription and billing management may be handled through OperatorOS. Billing terms,
              available plans, and payment methods are governed by the OperatorOS account or
              subscription under which Tech Deck is accessed.
            </p>
            <p>
              Tech Deck stores a read-only entitlement snapshot from OperatorOS and does not provide
              local upgrade, downgrade, pause, unpause, or cancellation controls.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Refunds and Cancellation</h2>
            <p>
              Refund eligibility is described in our{" "}
              <a href="/refund" className="text-primary underline underline-offset-2 hover:text-primary/80">
                Refund Policy
              </a>
              . Cancellation and refund handling depends on the OperatorOS billing relationship.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Use the Service to violate any law or regulation</li>
              <li>Upload malware, illegal content, or content infringing third-party rights</li>
              <li>Attempt to access other tenants' data or breach security controls</li>
              <li>Reverse engineer, decompile, or attempt to extract source code from the Service</li>
              <li>Resell or sublicense the Service without our written permission</li>
              <li>Use the Service to send unsolicited bulk communications (spam)</li>
              <li>Abuse rate limits or interfere with Service availability</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Customer Data</h2>
            <p>
              You retain ownership of all data you upload to the Service ("Customer Data"). You grant
              us a limited license to host, process, and display Customer Data solely for the purpose
              of providing the Service. We will not access Customer Data except as required to provide
              the Service, comply with law, or with your explicit consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Data Retention and Deletion</h2>
            <p>
              Customer Data is retained according to the account, workspace, and OperatorOS access
              relationship under which Tech Deck is used. Tech Deck does not delete tenants based on
              local billing state.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Intellectual Property</h2>
            <p>
              The Service, including all software, design, branding, and content (excluding Customer
              Data), is the exclusive property of Shotgun Ninjas Productions and is protected by
              intellectual property laws. These Terms grant you no rights to our trademarks or logos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">10. Service Availability</h2>
            <p>
              We strive for high availability but do not guarantee uninterrupted Service. We may
              perform scheduled maintenance, deploy updates, or experience unexpected outages. We are
              not liable for any losses resulting from Service downtime.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">11. Disclaimers</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, AND NON-INFRINGEMENT. We do not warrant that the Service will be error-free,
              secure, or uninterrupted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">12. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM
              THESE TERMS OR YOUR USE OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE
              TWELVE MONTHS PRECEDING THE CLAIM. WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, OR
              CONSEQUENTIAL DAMAGES.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">13. Indemnification</h2>
            <p>
              You agree to indemnify and hold us harmless from any claims, damages, or expenses
              arising from your use of the Service, your Customer Data, or your violation of these
              Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">14. Termination</h2>
            <p>
              We may suspend or terminate your account immediately for breach of these Terms, fraud,
              or loss of required OperatorOS entitlement. You may terminate at any time by deleting
              your account where self-service deletion is available. Upon termination, your right to
              use the Service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">15. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be communicated via
              the Service or email. Continued use of the Service after changes constitutes acceptance
              of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">16. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the jurisdiction in which Shotgun Ninjas
              Productions is incorporated, without regard to conflict-of-law principles. Any disputes
              shall be resolved in the courts of that jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">17. Contact</h2>
            <p>
              For questions about these Terms, contact us through the Service's support channels.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t py-6 px-6">
        <div className="max-w-3xl mx-auto text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Tech Deck. Built by Shotgun Ninjas Productions.</span>
        </div>
      </footer>
    </div>
  );
}
