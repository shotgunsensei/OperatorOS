import { Zap, Code2, Search, Network, Server } from "lucide-react";

export type OpsMode = "quick-fix" | "script-builder" | "deep-dive" | "network" | "system-design";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface QueryEntry {
  id: string;
  query: string;
  response: string;
  mode: OpsMode;
  timestamp: number;
}

export interface VaultEntry {
  id: string;
  query: string;
  response: string;
  mode: OpsMode;
  tags: string[];
  savedAt: number;
}

export interface ParsedSection {
  type: "heading" | "code" | "text" | "table";
  content: string;
  lang?: string;
}

export const MODES: { id: OpsMode; label: string; icon: typeof Zap; desc: string }[] = [
  { id: "quick-fix", label: "Quick Fix", icon: Zap, desc: "Fastest resolution path" },
  { id: "script-builder", label: "Script Builder", icon: Code2, desc: "Production-ready scripts" },
  { id: "deep-dive", label: "Deep Dive", icon: Search, desc: "Root cause analysis" },
  { id: "network", label: "Network", icon: Network, desc: "Layer-by-layer diagnostics" },
  { id: "system-design", label: "System Design", icon: Server, desc: "Architecture decisions" },
];

export const LS_HISTORY_KEY = "itops_history";
export const LS_VAULT_KEY = "itops_vault";
