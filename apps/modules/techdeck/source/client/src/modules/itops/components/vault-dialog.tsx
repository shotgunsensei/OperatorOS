import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Archive, X } from "lucide-react";
import type { VaultEntry } from "../types";
import { saveVault } from "../utils";

interface VaultDialogProps {
  open: boolean;
  onClose: () => void;
  vault: VaultEntry[];
  setVault: (v: VaultEntry[]) => void;
  onLoad: (entry: VaultEntry) => void;
}

export function VaultDialog({ open, onClose, vault, setVault, onLoad }: VaultDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTag, setFilterTag] = useState("");

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    vault.forEach((e) => e.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [vault]);

  const filtered = useMemo(() => {
    return vault.filter((e) => {
      const matchSearch = !searchTerm ||
        e.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.response.toLowerCase().includes(searchTerm.toLowerCase());
      const matchTag = !filterTag || e.tags.includes(filterTag);
      return matchSearch && matchTag;
    });
  }, [vault, searchTerm, filterTag]);

  const deleteEntry = (id: string) => {
    const updated = vault.filter((e) => e.id !== id);
    setVault(updated);
    saveVault(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-200">
            <Archive className="w-4 h-4 text-emerald-400" />
            Knowledge Vault
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mt-2">
          <Input
            placeholder="Search saved outputs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-zinc-900 border-zinc-800 text-zinc-100 text-sm"
            data-testid="input-vault-search"
          />
          {allTags.length > 0 && (
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded px-2 py-2 min-w-[120px]"
              data-testid="select-vault-filter"
            >
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto mt-3 space-y-2 min-h-0">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-zinc-600 text-sm">
              {vault.length === 0 ? "No saved outputs yet. Save responses to build your vault." : "No matches found."}
            </div>
          )}
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="border border-zinc-800 rounded p-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400/70 font-medium">
                    {entry.mode.replace("-", " ")}
                  </span>
                  <p className="text-xs text-zinc-300 truncate mt-0.5">{entry.query}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { onLoad(entry); onClose(); }}
                    className="px-2 py-1 text-[10px] rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                    data-testid={`button-vault-load-${entry.id}`}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                    data-testid={`button-vault-delete-${entry.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {entry.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {entry.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-zinc-600 mt-1">
                {new Date(entry.savedAt).toLocaleDateString()} {new Date(entry.savedAt).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
