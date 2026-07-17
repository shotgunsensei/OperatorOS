import { Link } from "wouter";
import { Monitor, Car, HardHat, Shield, Wrench, Cpu } from "lucide-react";

const useCases = [
  {
    icon: Monitor,
    title: "IT & Managed Service Providers",
    description: "Document onsite visits, network remediations, workstation deployments, and server maintenance. Generate client-facing summaries that prove the value of your managed services.",
    examples: ["Onsite visit reports", "Network remediation summaries", "Workstation deployment checklists", "Server upgrade documentation"],
  },
  {
    icon: Car,
    title: "Automotive & Fleet",
    description: "Capture diagnostic findings, document repairs, and create detailed estimates for vehicle work. Photo documentation provides proof of pre-existing conditions and completed work.",
    examples: ["Vehicle diagnostic inspections", "Repair estimates", "Pre/post condition documentation", "Fleet maintenance records"],
  },
  {
    icon: HardHat,
    title: "Contractors & Construction",
    description: "Document site conditions, track materials used, and log work performed. Generate professional reports for clients, inspectors, and project managers.",
    examples: ["Site visit reports", "Change orders", "Material usage logs", "Progress documentation"],
  },
  {
    icon: Shield,
    title: "Security & Low-Voltage",
    description: "Document camera installations, access control setups, and alarm system configurations. Create handoff reports with testing results and warranty information.",
    examples: ["Camera install documentation", "Network configuration reports", "Client training records", "Warranty documentation"],
  },
  {
    icon: Wrench,
    title: "HVAC & Plumbing",
    description: "Log findings from service calls, document equipment conditions, and create repair estimates. Photo proof protects your business and builds client trust.",
    examples: ["Service call reports", "Equipment inspection logs", "Repair estimates", "Maintenance records"],
  },
  {
    icon: Cpu,
    title: "Field Engineers & Technicians",
    description: "Any field professional who needs to document their work and deliver proof to clients. SnapProof adapts to your industry with customizable templates.",
    examples: ["Equipment inspections", "Installation reports", "Troubleshooting logs", "Client-facing summaries"],
  },
];

export default function UseCases() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-20">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold tracking-tight mb-4">Built for Professionals</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          From IT engineers to contractors — if you do field work, SnapProof documents it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        {useCases.map((uc, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-8 hover:border-primary/20 transition-colors">
            <uc.icon className="h-10 w-10 text-primary mb-4" />
            <h3 className="font-bold text-xl mb-3">{uc.title}</h3>
            <p className="text-muted-foreground mb-4 leading-relaxed">{uc.description}</p>
            <ul className="space-y-1.5">
              {uc.examples.map((ex, j) => (
                <li key={j} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                  {ex}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="text-center">
        <Link href="/register" className="inline-flex items-center px-8 py-3 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 transition-colors">
          Get Started Free
        </Link>
      </div>
    </div>
  );
}
