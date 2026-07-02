import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Terminal, BarChart3, Search } from "lucide-react";

const PRODUCTS = [
  {
    name: "TechDeck",
    url: "https://techdeck.app",
    icon: Terminal,
    tagline: "IT operations & automation toolkit",
    blurb: "Scripts, runbooks, and MSP-grade tooling for the technical teams keeping your facility online.",
    accent: "text-sky-600 dark:text-sky-400",
  },
  {
    name: "TradeFlowKit",
    url: "https://tradeflowkit.com",
    icon: BarChart3,
    tagline: "Operations & revenue command center",
    blurb: "Track contracts, vendor spend, and operational throughput across your organization.",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    name: "FaultlineLab",
    url: "https://faultlinelab.com",
    icon: Search,
    tagline: "Diagnostic & investigation training",
    blurb: "Sharpen the troubleshooting reflexes your facility teams use every day.",
    accent: "text-violet-600 dark:text-violet-400",
  },
];

export function RelatedProducts() {
  return (
    <Card data-testid="card-related-products">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Related tools from Shotgun Ninjas Productions</CardTitle>
        <CardDescription className="text-xs">
          PulseDesk works alongside the rest of the Shotgun Ninjas ecosystem.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PRODUCTS.map((p) => {
          const Icon = p.icon;
          return (
            <a
              key={p.name}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border bg-card p-3 hover-elevate active-elevate-2 transition-all"
              data-testid={`link-product-${p.name.toLowerCase()}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`h-4 w-4 ${p.accent}`} />
                <span className="text-sm font-medium">{p.name}</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1">{p.tagline}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{p.blurb}</p>
            </a>
          );
        })}
      </CardContent>
    </Card>
  );
}
