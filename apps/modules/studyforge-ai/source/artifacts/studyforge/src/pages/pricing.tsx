import { useCreateCheckoutSession, useGetBillingStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Check, Minus } from "lucide-react";
import { Link } from "wouter";

const FEATURES: Array<{ label: string; free: string | boolean; pro: string | boolean; tutor: string | boolean }> = [
  { label: "Study sets", free: "3", pro: "Unlimited", tutor: "Unlimited" },
  { label: "Flashcards per set", free: "25", pro: "Unlimited", tutor: "Unlimited" },
  { label: "Quiz attempts / month", free: "3", pro: "Unlimited", tutor: "Unlimited" },
  { label: "AI-generated review sheets", free: true, pro: true, tutor: true },
  { label: "Spaced repetition scheduler", free: false, pro: true, tutor: true },
  { label: "Exam countdowns & pacing", free: false, pro: true, tutor: true },
  { label: "Advanced exports (Markdown, print)", free: false, pro: true, tutor: true },
  { label: "Tutor groups & student roster", free: false, pro: false, tutor: true },
  { label: "Priority support", free: false, pro: false, tutor: true },
];

const FAQS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the Account page in one click. You'll keep Pro access until the end of your billing period.",
  },
  {
    q: "What happens to my data if I downgrade?",
    a: "Nothing is deleted. Your existing study sets stay accessible. You just won't be able to create new ones beyond the Free plan limits until you remove some or upgrade again.",
  },
  {
    q: "Do you offer student discounts?",
    a: "Pro is already priced for students. Tutor accounts can request volume pricing for classroom rollouts — contact us from the footer.",
  },
  {
    q: "Is there a free trial of Pro?",
    a: "The Free plan lets you build 3 full study sets — enough to feel the difference. Upgrade only when you've outgrown it.",
  },
];

function Cell({ value, label, plan }: { value: string | boolean; label: string; plan: string }) {
  if (value === true) {
    return (
      <>
        <Check aria-hidden="true" className="h-4 w-4 text-primary mx-auto" />
        <span className="sr-only">{label} included in {plan}</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus aria-hidden="true" className="h-4 w-4 text-muted-foreground/50 mx-auto" />
        <span className="sr-only">{label} not included in {plan}</span>
      </>
    );
  }
  return <span className="text-sm font-medium">{value}</span>;
}

export default function Pricing() {
  useDocumentMeta("Pricing");
  const { user } = useAuth();
  const { data: billing } = useGetBillingStatus();
  const checkout = useCreateCheckoutSession();
  const currentPlan = billing?.plan ?? "free";

  const handleUpgrade = async (plan: "pro" | "tutor") => {
    if (!user) {
      window.location.href = "/signup";
      return;
    }
    try {
      const res = await checkout.mutateAsync({ data: { plan } });
      if (res.demoMode) {
        toast.success(res.message);
      } else if (res.url) {
        window.location.href = res.url;
      }
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    }
  };

  const isCurrent = (plan: string) => user && currentPlan === plan;

  return (
    <div className="container mx-auto px-4 py-16 space-y-20">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-lg text-muted-foreground">
          Start free. Upgrade when you're ready to study smarter, not harder. Cancel anytime.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <Card className={isCurrent("free") ? "border-primary/40" : ""}>
          <CardHeader>
            <CardTitle className="text-2xl">Free</CardTitle>
            <CardDescription>Try the forge, no card needed</CardDescription>
            <div className="mt-4 text-4xl font-bold">$0<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 3 study sets</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 25 flashcards per set</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> 3 quiz attempts / month</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> AI review sheets</li>
            </ul>
          </CardContent>
          <CardFooter>
            {isCurrent("free") ? (
              <Button variant="outline" className="w-full" disabled>Current Plan</Button>
            ) : user ? (
              <Button variant="outline" className="w-full" disabled>Included</Button>
            ) : (
              <Link href="/signup" className="w-full">
                <Button variant="outline" className="w-full">Get started free</Button>
              </Link>
            )}
          </CardFooter>
        </Card>

        <Card className="border-primary shadow-lg shadow-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-xs font-bold rounded-bl-lg">MOST POPULAR</div>
          <CardHeader>
            <CardTitle className="text-2xl text-primary">Pro</CardTitle>
            <CardDescription>For serious students</CardDescription>
            <div className="mt-4 text-4xl font-bold">$9.99<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Unlimited study sets & cards</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Unlimited quiz attempts</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Spaced repetition scheduler</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Exam countdowns & pacing</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Advanced exports</li>
            </ul>
          </CardContent>
          <CardFooter>
            {isCurrent("pro") ? (
              <Button className="w-full" disabled>Current Plan</Button>
            ) : (
              <Button className="w-full" onClick={() => handleUpgrade("pro")} disabled={checkout.isPending}>
                {checkout.isPending ? "Loading..." : currentPlan === "tutor" ? "Switch to Pro" : "Upgrade to Pro"}
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card className={isCurrent("tutor") ? "border-primary/40" : ""}>
          <CardHeader>
            <CardTitle className="text-2xl">Tutor</CardTitle>
            <CardDescription>For educators & study groups</CardDescription>
            <div className="mt-4 text-4xl font-bold">$29<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Everything in Pro</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Tutor groups & roster</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Share sets with students</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Priority support</li>
            </ul>
          </CardContent>
          <CardFooter>
            {isCurrent("tutor") ? (
              <Button className="w-full" disabled>Current Plan</Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => handleUpgrade("tutor")} disabled={checkout.isPending}>
                {checkout.isPending ? "Loading..." : "Upgrade to Tutor"}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* Comparison table */}
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-center">Compare plans</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left">
            <caption className="sr-only">Feature comparison across Free, Pro, and Tutor plans</caption>
            <thead className="bg-muted/40 text-sm">
              <tr>
                <th scope="col" className="p-4 font-semibold">Feature</th>
                <th scope="col" className="p-4 font-semibold text-center">Free</th>
                <th scope="col" className="p-4 font-semibold text-center text-primary">Pro</th>
                <th scope="col" className="p-4 font-semibold text-center">Tutor</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {FEATURES.map((f) => (
                <tr key={f.label} className="border-t border-border">
                  <th scope="row" className="p-4 font-normal">{f.label}</th>
                  <td className="p-4 text-center"><Cell value={f.free} label={f.label} plan="Free" /></td>
                  <td className="p-4 text-center bg-primary/5"><Cell value={f.pro} label={f.label} plan="Pro" /></td>
                  <td className="p-4 text-center"><Cell value={f.tutor} label={f.label} plan="Tutor" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-center">Frequently asked questions</h2>
        <div className="space-y-4">
          {FAQS.map((f) => (
            <Card key={f.q}>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">{f.q}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
