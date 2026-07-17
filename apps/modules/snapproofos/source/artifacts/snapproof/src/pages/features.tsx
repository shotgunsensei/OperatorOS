import { Link } from "wouter";
import { Camera, FileText, Share2, Users, Shield, Zap, ClipboardList, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Camera,
    title: "Photo Documentation",
    description: "Capture and organize site photos with captions, timestamps, and automatic tagging. Every photo is linked to its job for complete traceability.",
  },
  {
    icon: ClipboardList,
    title: "Structured Findings",
    description: "Log issues, root causes, resolutions, and recommendations in a structured format. Severity ratings help prioritize work and communicate urgency.",
  },
  {
    icon: FileText,
    title: "One-Click Reports",
    description: "Generate polished, client-ready reports from your documented work. Choose from summaries, estimates, change orders, and technical breakdowns.",
  },
  {
    icon: Share2,
    title: "Shareable Links",
    description: "Share reports with clients via secure links — no account required. Clients see your branded report with findings, photos, and cost breakdowns.",
  },
  {
    icon: Shield,
    title: "Custom Branding",
    description: "White-label your reports with your company logo, accent colors, contact info, and custom headers/footers. Reports look like they came from your team.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite technicians and admins to your workspace. Assign jobs, track activity, and maintain a shared customer database across your entire team.",
  },
  {
    icon: Zap,
    title: "Industry Templates",
    description: "Start jobs with pre-built templates for IT/MSP, automotive, construction, security, and more. Customize sections for your workflow.",
  },
  {
    icon: BarChart3,
    title: "Dashboard Analytics",
    description: "Track active jobs, report generation, team activity, and customer engagement from a single operations console.",
  },
];

export default function Features() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-20">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold tracking-tight mb-4">Built for the Field</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Everything you need to document work, generate proof, and deliver polished reports — from your phone or desktop.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {features.map((feature, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-6 hover:border-primary/30 transition-colors">
            <feature.icon className="h-8 w-8 text-primary mb-4" />
            <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <Link href="/register" className="inline-flex items-center px-8 py-3 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 transition-colors">
          Start for Free
        </Link>
      </div>
    </div>
  );
}
