export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: March 6, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Information We Collect</h2>
            <p>When you create an account, we collect your username and password (stored securely as a hash). When you use TradeFlow, we store the business data you enter, including customer information, job details, quotes, and invoices. We also collect basic usage data such as login times and feature usage to improve our service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Provide and maintain the TradeFlow service</li>
              <li>Authenticate your identity and manage your account</li>
              <li>Process subscription payments through Stripe</li>
              <li>Send important service notifications</li>
              <li>Improve and optimize our platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Data Storage and Security</h2>
            <p>Your data is stored in secure PostgreSQL databases. We use industry-standard security measures including encrypted connections (HTTPS/TLS), hashed passwords, and session-based authentication. We do not sell, trade, or share your personal data with third parties except as required to provide our service (e.g., payment processing through Stripe).</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Payment Processing</h2>
            <p>Subscription payments are processed by Stripe. We do not store your credit card information. Stripe's privacy policy governs how your payment information is handled. You can manage your billing details through the Stripe billing portal accessible from your subscription settings.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Cookies and Sessions</h2>
            <p>We use session cookies to keep you logged in and maintain your active organization context. These are essential for the service to function and cannot be disabled while using TradeFlow. We do not use tracking cookies or third-party advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
            <p>We retain your data for as long as your account is active. If you delete your account or request data deletion, we will remove your personal data within 30 days, except where we are required by law to retain it.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for optional data processing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Children's Privacy</h2>
            <p>TradeFlow is not intended for use by children under the age of 13. We do not knowingly collect personal information from children.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Changes to This Policy</h2>
            <p>We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
            <p>If you have any questions about this privacy policy or our data practices, please contact us through the application's settings page.</p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t">
          <a href="/" className="text-primary hover:underline" data-testid="link-back-home">&larr; Back to TradeFlow</a>
        </div>
      </div>
    </div>
  );
}
