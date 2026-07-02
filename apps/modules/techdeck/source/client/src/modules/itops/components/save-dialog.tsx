import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookmarkPlus, Tag, X } from "lucide-react";

interface SaveDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}

export function SaveDialog({ open, onClose, onSave }: SaveDialogProps) {
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-200">
            <BookmarkPlus className="w-4 h-4 text-emerald-400" />
            Save to Vault
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1 block">Tags (optional)</label>
            <div className="flex gap-1">
              <Input
                placeholder="Add tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                className="bg-zinc-900 border-zinc-800 text-zinc-100 text-sm"
                data-testid="input-vault-tag"
              />
              <Button size="sm" variant="outline" onClick={addTag} className="border-zinc-800 text-zinc-400 shrink-0">
                <Tag className="w-3 h-3" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="text-[10px] bg-zinc-800 text-zinc-300 cursor-pointer hover:bg-red-900/30 hover:text-red-400"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  >
                    {t} <X className="w-2.5 h-2.5 ml-0.5" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <Button
            onClick={() => { onSave(tags); onClose(); setTags([]); }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
            data-testid="button-vault-save-confirm"
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
