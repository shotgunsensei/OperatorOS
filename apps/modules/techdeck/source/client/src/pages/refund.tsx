import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function RefundPage() {
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
        <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-refund-title">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8" data-testid="text-refund-updated">Last updated: May 3, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold mb-2">Overview</h2>
            <p>
              Tech Deck access may be provided through an OperatorOS account or subscription. This
              policy explains how refund requests are routed when billing is managed outside Tech Deck.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">OperatorOS Billing Relationship</h2>
            <p>
              Subscription and billing management may be handled through OperatorOS. Refund handling
              depends on the OperatorOS billing relationship and the terms that applied to the
              account or workspace at the time of purchase.
            </p>
            <p>
              Tech Deck does not provide local upgrade, downgrade, cancellation, or refund controls.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Monthly Subscriptions</h2>
            <p>
              Monthly billing terms, cancellation timing, and refund eligibility are governed by
              the OperatorOS account or subscription under which Tech Deck is accessed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Annual Subscriptions</h2>
            <p>
              Annual subscription handling, including any prorated refund or credit, depends on the
              OperatorOS billing relationship and applicable purchase terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Plan Downgrades and Upgrades</h2>
            <p>
              Plan upgrades, downgrades, cancellations, and billing state changes are managed in
              OperatorOS. Tech Deck receives a read-only entitlement snapshot and cannot change the
              billing relationship locally.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Service Outages</h2>
            <p>
              In the event of a sustained Service outage that materially prevents you from using
              Tech Deck for more than 24 consecutive hours, we may issue a service credit at our
              discretion. Service credits are applied to future billing and are not refundable as
              cash.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Non-Refundable Charges</h2>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Charges not eligible under the applicable OperatorOS billing terms</li>
              <li>Add-ons or one-time fees, unless the billing relationship says otherwise</li>
              <li>Charges incurred while account is in violation of the Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">How to Request a Refund</h2>
            <p>
              To request a refund, contact the OperatorOS account owner or support channel tied to
              your billing relationship. Include the following information when available:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Account email address</li>
              <li>Date of charge</li>
              <li>Receipt, invoice, or charge ID if available</li>
              <li>Reason for the refund request</li>
            </ul>
            <p>
              Approved refunds, if any, are issued according to the OperatorOS billing relationship
              and payment processor timelines.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Chargebacks</h2>
            <p>
              We ask that you contact us before initiating a chargeback. Chargebacks initiated
              without first attempting resolution may result in immediate account suspension.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Changes to This Policy</h2>
            <p>
              We may update this Refund Policy from time to time. The version in effect at the
              time of your most recent charge applies to that charge.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Contact</h2>
            <p>
              For refund-related questions, contact our support team through the Service.
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
