import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8" data-testid="text-privacy-updated">Last updated: March 10, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
            <p>
              Tech Deck ("we," "our," or "us") operates the Tech Deck MSP Management Platform,
              including our website and mobile application (collectively, the "Service"). This Privacy
              Policy explains how we collect, use, disclose, and safeguard your information when you
              use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">2. Information We Collect</h2>
            <h3 className="text-base font-medium mb-1">Account Information</h3>
            <p>
              When you create an account, we collect information provided through our authentication
              provider, including your name, email address, and profile image. We do not collect or
              store passwords directly.
            </p>
            <h3 className="text-base font-medium mb-1 mt-3">Usage Data</h3>
            <p>
              We collect information about how you interact with the Service, including tickets
              created, time entries logged, calendar appointments, and other operational data you
              input. This data is stored within your tenant workspace and is not shared across
              tenants.
            </p>
            <h3 className="text-base font-medium mb-1 mt-3">Device Information</h3>
            <p>
              We may collect device-level information such as your device type, operating system,
              browser type, and screen resolution to optimize the Service experience.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Authenticate your identity and manage your account</li>
              <li>Display OperatorOS-managed billing and entitlement status</li>
              <li>Generate reports and analytics within your tenant workspace</li>
              <li>Send important service-related notifications</li>
              <li>Maintain audit logs for compliance and security purposes</li>
              <li>Respond to support requests and communicate with you</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">4. Data Isolation and Multi-Tenancy</h2>
            <p>
              Tech Deck operates as a multi-tenant platform. All your operational data (tickets,
              clients, invoices, evidence, time entries, etc.) is strictly isolated to your tenant.
              Other tenants cannot access your data, and your data is not shared across tenant
              boundaries.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">5. Data Sharing and Disclosure</h2>
            <p>We do not sell your personal information. We may share information only in the following circumstances:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Service providers:</strong> We use third-party services for authentication, infrastructure, and billing relationships that may be managed through OperatorOS. These providers have their own privacy policies.</li>
              <li><strong>Legal requirements:</strong> We may disclose information if required by law, regulation, or legal process.</li>
              <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets, your information may be transferred.</li>
              <li><strong>With your consent:</strong> We may share information when you explicitly authorize us to do so.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">6. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your
              information, including encrypted connections (TLS), role-based access control,
              and comprehensive audit logging. However, no method of electronic storage or
              transmission is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">7. Data Retention</h2>
            <p>
              We retain your information for as long as your account is active or as needed to
              provide the Service. If your account is deleted or OperatorOS access is revoked,
              data handling follows the applicable workspace, OperatorOS relationship, and data
              retention schedule.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">8. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for data processing</li>
              <li>Lodge a complaint with a supervisory authority</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">9. Children's Privacy</h2>
            <p>
              The Service is not intended for use by children under the age of 13. We do not
              knowingly collect personal information from children under 13. If we discover that
              we have collected such information, we will take steps to delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any
              material changes by posting the new policy on this page and updating the "Last
              updated" date. Your continued use of the Service after changes constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">11. Account Deletion</h2>
            <p>
              You can delete your account and all associated data at any time by visiting
              the <a href="/delete-account" className="text-primary underline underline-offset-2 hover:text-primary/80">account deletion page</a>.
              Upon deletion, your user profile, login credentials, and any organizations
              where you are the sole member will be permanently and irreversibly removed,
              along with all associated data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">12. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or our data practices,
              please contact us through the Service's support channels.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t py-6 px-6">
        <div className="max-w-3xl mx-auto text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Tech Deck. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
