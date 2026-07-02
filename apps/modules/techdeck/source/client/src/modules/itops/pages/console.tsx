import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  RotateCcw,
  Send,
  Loader2,
  Terminal,
  Trash2,
  BookmarkPlus,
  Archive,
  Download,
  FileText,
  CopyPlus,
} from "lucide-react";
import {
  type OpsMode,
  type HistoryMessage,
  type QueryEntry,
  type VaultEntry,
  MODES,
} from "../types";
import { loadHistory, saveHistory, loadVault, saveVault, formatResponseAsMarkdown } from "../utils";
import { ResponseBlock } from "../components/response-block";
import { VaultDialog } from "../components/vault-dialog";
import { SaveDialog } from "../components/save-dialog";

export function ItOpsConsolePage() {
  const [mode, setMode] = useState<OpsMode>("quick-fix");
  const [query, setQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentQuery, setCurrentQuery] = useState("");
  const [history, setHistory] = useState<QueryEntry[]>(() => loadHistory());
  const [conversationHistory, setConversationHistory] = useState<HistoryMessage[]>([]);
  const [vault, setVault] = useState<VaultEntry[]>(() => loadVault());
  const [showVault, setShowVault] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [currentResponse]);

  const handleSubmit = useCallback(async (queryText?: string, overrideMode?: OpsMode) => {
    const q = queryText || query;
    if (!q.trim() || isStreaming) return;

    const activeMode = overrideMode || mode;

    setIsStreaming(true);
    setCurrentResponse("");
    setCurrentQuery(q.trim());
    setQuery("");
    if (overrideMode) setMode(overrideMode);

    let accumulated = "";

    try {
      const res = await fetch("/api/itops/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: q.trim(),
          mode: activeMode,
          history: conversationHistory.slice(-10),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Request failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.content) {
              accumulated += event.content;
              setCurrentResponse(accumulated);
            }
            if (event.error) {
              throw new Error(event.error);
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }

      const entry: QueryEntry = {
        id: Date.now().toString(),
        query: q.trim(),
        response: accumulated,
        mode: activeMode,
        timestamp: Date.now(),
      };

      const updatedHistory = [entry, ...history].slice(0, 5);
      setHistory(updatedHistory);
      saveHistory(updatedHistory);

      setConversationHistory((prev) => [
        ...prev,
        { role: "user" as const, content: q.trim() },
        { role: "assistant" as const, content: accumulated },
      ].slice(-20));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process query",
        variant: "destructive",
      });
      setCurrentResponse("");
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }, [query, mode, conversationHistory, isStreaming, toast, history]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReuseLast = () => {
    if (history.length > 0) {
      const last = history[0];
      handleSubmit(last.query, last.mode);
    }
  };

  const clearSession = () => {
    setCurrentResponse("");
    setCurrentQuery("");
    setConversationHistory([]);
    setHistory([]);
    saveHistory([]);
  };

  const handleSaveToVault = (tags: string[]) => {
    if (!currentResponse || !currentQuery) return;
    const entry: VaultEntry = {
      id: Date.now().toString(),
      query: currentQuery,
      response: currentResponse,
      mode,
      tags,
      savedAt: Date.now(),
    };
    const updated = [entry, ...vault];
    setVault(updated);
    saveVault(updated);
    toast({ title: "Saved to Vault" });
  };

  const handleExport = (format: "md" | "txt") => {
    if (!currentResponse) return;
    const content = format === "md"
      ? formatResponseAsMarkdown(currentQuery, currentResponse, mode)
      : `IT Ops Console — ${mode.toUpperCase()}\nQuery: ${currentQuery}\n\n${currentResponse}`;
    const blob = new Blob([content], { type: format === "md" ? "text/markdown" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `itops-${mode}-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = async () => {
    if (!currentResponse) return;
    await navigator.clipboard.writeText(currentResponse);
    toast({ title: "Copied to clipboard" });
  };

  const loadVaultEntry = (entry: VaultEntry) => {
    setCurrentResponse(entry.response);
    setCurrentQuery(entry.query);
    setMode(entry.mode);
  };

  const modeConfig = MODES.find((m) => m.id === mode)!;

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      <div className="w-48 shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-950">
        <div className="px-3 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">IT Ops</span>
          </div>
        </div>

        <div className="flex-1 py-2 px-2 space-y-0.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                data-testid={`button-mode-${m.id}`}
                className={`
                  w-full flex items-center gap-2 px-2.5 py-2 rounded text-left transition-all
                  ${active
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-transparent"
                  }
                `}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{m.label}</div>
                  {active && (
                    <div className="text-[10px] text-zinc-500 truncate mt-0.5">{m.desc}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-zinc-800 px-2 py-2 space-y-2">
          <button
            onClick={() => setShowVault(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-left text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
            data-testid="button-open-vault"
          >
            <Archive className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Vault</span>
            {vault.length > 0 && (
              <span className="ml-auto text-[10px] text-zinc-600">{vault.length}</span>
            )}
          </button>

          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Recent</span>
                <button
                  onClick={clearSession}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                  title="Clear"
                  data-testid="button-clear-session"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {history.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => { setCurrentResponse(entry.response); setCurrentQuery(entry.query); setMode(entry.mode); }}
                    data-testid={`button-history-${entry.id}`}
                    className="w-full text-left px-2 py-1.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 truncate transition-all"
                    title={entry.query}
                  >
                    {entry.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <modeConfig.icon className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-zinc-200">{modeConfig.label}</span>
            <span className="text-[10px] text-zinc-600 hidden sm:inline">·</span>
            <span className="text-[10px] text-zinc-500 hidden sm:inline">{modeConfig.desc}</span>
          </div>

          {currentResponse && !isStreaming && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopyAll}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="button-copy-all"
              >
                <CopyPlus className="w-3 h-3" />
                <span className="hidden sm:inline">Copy All</span>
              </button>
              <button
                onClick={() => setShowSaveDialog(true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="button-save-vault"
              >
                <BookmarkPlus className="w-3 h-3" />
                <span className="hidden sm:inline">Save</span>
              </button>
              <button
                onClick={() => handleExport("md")}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="button-export-md"
              >
                <FileText className="w-3 h-3" />
                <span className="hidden sm:inline">.md</span>
              </button>
              <button
                onClick={() => handleExport("txt")}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                data-testid="button-export-txt"
              >
                <Download className="w-3 h-3" />
                <span className="hidden sm:inline">.txt</span>
              </button>
            </div>
          )}
        </div>

        <div ref={responseRef} className="flex-1 overflow-auto px-6 py-4">
          {!currentResponse && history.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <modeConfig.icon className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-200 mb-1">
                {modeConfig.label}
              </h2>
              <p className="text-sm text-zinc-500 max-w-md mb-6">
                {modeConfig.desc}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs max-w-lg w-full">
                {getExamples(mode).map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(ex); inputRef.current?.focus(); }}
                    data-testid={`button-example-${i}`}
                    className="text-left px-3 py-2.5 rounded border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900/50 transition-all"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentResponse && (
            <div className="max-w-3xl">
              <ResponseBlock content={currentResponse} />
              {isStreaming && (
                <div className="flex items-center gap-2 mt-3 text-xs text-zinc-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
          )}

          {!currentResponse && history.length > 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-xl bg-zinc-800/50 border border-zinc-800 flex items-center justify-center mb-4">
                <modeConfig.icon className="w-7 h-7 text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-500">Ready</p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="max-w-3xl">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <Textarea
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={getPlaceholder(mode)}
                  disabled={isStreaming}
                  rows={1}
                  data-testid="input-query"
                  className="resize-none bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 text-sm font-mono min-h-[40px] max-h-[120px] focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50"
                  style={{ fieldSizing: "content" } as any}
                />
              </div>
              <Button
                onClick={() => handleSubmit()}
                disabled={!query.trim() || isStreaming}
                size="sm"
                data-testid="button-submit-query"
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-10 px-3"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
              {history.length > 0 && (
                <Button
                  onClick={handleReuseLast}
                  disabled={isStreaming}
                  variant="outline"
                  size="sm"
                  data-testid="button-reuse-last"
                  className="border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 h-10"
                  title="Run again"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-zinc-600 font-mono">
                Enter to send · Shift+Enter for new line
              </span>
              <span className="text-[10px] text-zinc-600 font-mono">
                {modeConfig.label.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <VaultDialog
        open={showVault}
        onClose={() => setShowVault(false)}
        vault={vault}
        setVault={setVault}
        onLoad={loadVaultEntry}
      />
      <SaveDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSaveToVault}
      />
    </div>
  );
}

function getPlaceholder(mode: OpsMode): string {
  switch (mode) {
    case "quick-fix":
      return "Describe the issue...";
    case "script-builder":
      return "What script do you need?";
    case "deep-dive":
      return "Describe the symptoms...";
    case "network":
      return "Describe the network issue...";
    case "system-design":
      return "What are you designing?";
  }
}

function getExamples(mode: OpsMode): string[] {
  switch (mode) {
    case "quick-fix":
      return [
        "BSOD IRQL_NOT_LESS_OR_EQUAL after Windows update",
        "RDP disconnects after exactly 1 minute",
        "Exchange 365 mail flow stuck in queue",
        "GPO not applying to new OU",
      ];
    case "script-builder":
      return [
        "PowerShell: bulk disable inactive AD users (90 days)",
        "Bash: monitor disk space and alert via Slack",
        "Python: parse Windows Event Log for failed logins",
        "PowerShell: automated workstation inventory report",
      ];
    case "deep-dive":
      return [
        "Server intermittently unreachable, no pattern in logs",
        "SQL Server deadlocks occurring every 2 hours",
        "Hyper-V VM performance degraded after host migration",
        "WSUS clients not reporting for 30+ days",
      ];
    case "network":
      return [
        "High latency on VPN tunnel between sites",
        "DHCP exhaustion in /24 subnet",
        "Asymmetric routing after adding second WAN link",
        "802.1X authentication failing for specific VLANs",
      ];
    case "system-design":
      return [
        "DR plan for 200-user office with RTO < 4 hours",
        "Zero-trust network architecture for MSP client",
        "Migrate on-prem Exchange to M365 with hybrid coexistence",
        "Multi-tenant RMM monitoring stack design",
      ];
  }
}
