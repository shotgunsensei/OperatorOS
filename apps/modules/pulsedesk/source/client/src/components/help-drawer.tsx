import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

const FAQ = [
  {
    q: "How is access managed?",
    a: "PulseDesk access is managed by OperatorOS. Launch PulseDesk from OperatorOS, and contact your OperatorOS admin for seat or module entitlement changes.",
  },
  {
    q: "How do I invite teammates?",
    a: "Settings → Team → Invite member. Enter their email and pick a role. They receive an invite link valid for 7 days. Roles can be changed or revoked from the same page at any time.",
  },
  {
    q: "How does email-to-ticket forwarding work?",
    a: "In Connected Inboxes, connect either Google Workspace or Microsoft 365 with OAuth, or set up SendGrid Inbound Parse. Once connected, any email sent to your forwarding address becomes a ticket. Replies to the auto-generated thread post comments back on the same ticket.",
  },
  {
    q: "What can each role do?",
    a: "Admin: tenant settings and team management. Manager: tickets, assignments, analytics. Technician: tickets and assets. Submitter: create tickets only. Read-only: view but no changes. Detailed permission matrix is in Settings → Team.",
  },
  {
    q: "Is my data isolated from other organizations?",
    a: "Yes. Every database row carries an org_id and every API request is filtered by your authenticated org membership. Cross-org reads are impossible at the storage layer. Audit logs track every authentication event.",
  },
  {
    q: "How do I export my data?",
    a: "Analytics → Export CSV gives you tickets and metrics. For a full export including assets, vendors, and audit logs, contact support@pulsedesk.support — we can deliver a JSON dump within 24 hours.",
  },
  {
    q: "What happens if I cancel?",
    a: "OperatorOS controls entitlement state. If your PulseDesk module access is removed, protected app access is revoked while operational data remains governed by the current retention policy.",
  },
];

export function HelpDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open help and FAQ"
          data-testid="button-open-help"
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground/90 hover:bg-sidebar-accent/50 rounded transition-colors w-full"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>Help &amp; FAQ</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-help">
        <SheetHeader>
          <SheetTitle>Help &amp; FAQ</SheetTitle>
          <SheetDescription>
            Quick answers to the most common PulseDesk questions. Need more? Email{" "}
            <a href="mailto:support@pulsedesk.support" className="underline" data-testid="link-help-support">
              support@pulsedesk.support
            </a>
            .
          </SheetDescription>
        </SheetHeader>
        <Accordion type="single" collapsible className="mt-4">
          {FAQ.map((item, idx) => (
            <AccordionItem key={idx} value={`item-${idx}`} data-testid={`faq-item-${idx}`}>
              <AccordionTrigger className="text-sm text-left">{item.q}</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SheetContent>
    </Sheet>
  );
}
