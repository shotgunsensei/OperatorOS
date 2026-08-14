import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Sparkles, Check } from "lucide-react";

interface LimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  currentPlan: string;
  upgradeTo: string;
}

const PRO_BENEFITS = [
  "Unlimited study sets and flashcards",
  "Unlimited quiz attempts",
  "Spaced repetition & exam countdowns",
  "Advanced exports (Markdown, print)",
];

export function LimitModal({ isOpen, onClose, feature, currentPlan, upgradeTo }: LimitModalProps) {
  const planLabel = upgradeTo.charAt(0).toUpperCase() + upgradeTo.slice(1);
  const planLower = (currentPlan || "free").toLowerCase();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-xl">You've hit your {planLower} plan limit</DialogTitle>
          <DialogDescription className="text-center">
            You've reached the limit for <strong>{feature}</strong>. Upgrade to {planLabel} to keep going without interruptions.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <ul className="space-y-2 text-sm">
            {PRO_BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="outline" onClick={onClose}>Maybe later</Button>
          <Link href="~/pricing">
            <Button onClick={onClose}>See {planLabel} plan</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
