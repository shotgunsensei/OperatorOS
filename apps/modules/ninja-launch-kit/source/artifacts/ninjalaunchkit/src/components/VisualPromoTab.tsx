import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetVisualPromoKit,
  useRegenerateVisualPromoKit,
  exportVisualPromoKit,
  getGetVisualPromoKitQueryKey,
  ExportVisualPromoKitFormat,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Check, Download, RefreshCcw, Lock, Loader2, Image as ImageIcon, Palette } from "lucide-react";
import { handlePlanLimitError } from "@/lib/plan-error";

interface Props {
  kitId: number;
}

export function VisualPromoTab({ kitId }: Props) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportVisualPromoKitFormat | null>(null);

  const { data, isLoading, error } = useGetVisualPromoKit(kitId, {
    query: { enabled: !!kitId, queryKey: getGetVisualPromoKitQueryKey(kitId) },
  });
  const regenerate = useRegenerateVisualPromoKit();

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Brief copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = () => {
    regenerate.mutate(
      { id: kitId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetVisualPromoKitQueryKey(kitId) });
          toast.success("Visual briefs refreshed");
        },
        onError: (err) => toast.error("Failed to regenerate", { description: err.message }),
      },
    );
  };

  const handleExport = async (format: ExportVisualPromoKitFormat) => {
    setExportingFormat(format);
    try {
      const result = await exportVisualPromoKit(kitId, { format });
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported visual briefs as ${format.toUpperCase()}`);
    } catch (err) {
      if (!handlePlanLimitError(err, () => setLocation("/pricing"))) {
        toast.error("Export failed", { description: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      setExportingFormat(null);
    }
  };

  if (isLoading) {
    return (
      <div className="font-mono text-xs text-muted-foreground animate-pulse py-12 text-center" data-testid="visual-promo-loading">
        RENDERING_CREATIVE_BRIEFS...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="font-mono text-xs text-destructive py-12 text-center">
        Failed to load visual promo kit.
      </div>
    );
  }

  const imageBriefs = data.briefs.filter((b) => b.category === "image");
  const brandBriefs = data.briefs.filter((b) => b.category === "brand");
  const lockedCount = data.briefs.filter((b) => b.locked).length;

  return (
    <div className="space-y-6" data-testid="visual-promo-tab">
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-sm font-mono text-primary">VISUAL_PROMO_KIT</CardTitle>
              <p className="text-xs text-muted-foreground">
                Paste these briefs into Canva, Adobe Express, Figma, or any AI image tool.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="font-mono text-[10px] uppercase border-primary/30 text-primary"
                data-testid="visual-promo-plan-badge"
              >
                {data.currentPlan} plan
              </Badge>
              {data.whiteLabel && (
                <Badge
                  className="font-mono text-[10px] uppercase bg-amber-500/10 text-amber-500 border-amber-500/30"
                  data-testid="visual-promo-whitelabel-badge"
                >
                  WHITE-LABEL READY
                </Badge>
              )}
              {lockedCount > 0 && (
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] uppercase border-amber-500/40 text-amber-500"
                  data-testid="visual-promo-locked-count"
                >
                  {lockedCount} LOCKED
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-mono text-muted-foreground mr-2">PALETTE</span>
            {data.brandColors.map((c) => (
              <div key={c} className="flex items-center gap-2 border border-border/50 rounded px-2 py-1 bg-card">
                <span className="h-4 w-4 rounded border border-border/40" style={{ backgroundColor: c }} />
                <span className="font-mono text-[11px] uppercase">{c}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs gap-2"
              onClick={handleRegenerate}
              disabled={regenerate.isPending}
              data-testid="button-regenerate-visual-promo"
            >
              {regenerate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              REGENERATE
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs gap-2"
              onClick={() => handleExport("txt")}
              disabled={exportingFormat !== null}
              data-testid="button-export-visual-promo-txt"
            >
              {exportingFormat === "txt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              EXPORT_ALL TXT
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs gap-2"
              onClick={() => handleExport("markdown")}
              disabled={exportingFormat !== null}
              data-testid="button-export-visual-promo-md"
            >
              {exportingFormat === "markdown" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              EXPORT_ALL MD
            </Button>
          </div>
        </CardContent>
      </Card>

      <Section icon={<ImageIcon className="h-4 w-4 text-primary" />} title="IMAGE_BRIEFS">
        <div className="grid md:grid-cols-2 gap-4">
          {imageBriefs.map((b) => (
            <BriefCard
              key={b.id}
              id={b.id}
              title={b.title}
              dimensions={b.dimensions}
              tools={b.tools}
              brief={b.brief}
              locked={b.locked}
              copiedId={copiedId}
              onCopy={handleCopy}
              onUpgrade={() => setLocation("/pricing")}
            />
          ))}
        </div>
      </Section>

      <Section icon={<Palette className="h-4 w-4 text-primary" />} title="BRAND_BRIEFS">
        <div className="grid md:grid-cols-2 gap-4">
          {brandBriefs.map((b) => (
            <BriefCard
              key={b.id}
              id={b.id}
              title={b.title}
              dimensions={b.dimensions}
              tools={b.tools}
              brief={b.brief}
              locked={b.locked}
              copiedId={copiedId}
              onCopy={handleCopy}
              onUpgrade={() => setLocation("/pricing")}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-mono text-xs text-muted-foreground tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BriefCard({
  id,
  title,
  dimensions,
  tools,
  brief,
  locked,
  copiedId,
  onCopy,
  onUpgrade,
}: {
  id: string;
  title: string;
  dimensions: string | null;
  tools: string[];
  brief: string;
  locked: boolean;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onUpgrade: () => void;
}) {
  if (locked) {
    return (
      <Card className="border-amber-500/30 bg-card/50 relative" data-testid={`brief-card-${id}`}>
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-mono text-muted-foreground">{title.toUpperCase()}</CardTitle>
            <Lock className="h-4 w-4 text-amber-500" />
          </div>
        </CardHeader>
        <CardContent className="pt-6 pb-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            This brief is part of the <span className="text-amber-500 font-bold">PRO</span> plan.
          </p>
          <Button
            size="sm"
            className="font-mono text-xs gap-2 bg-amber-500 text-amber-950 hover:bg-amber-400"
            onClick={onUpgrade}
            data-testid={`button-upgrade-${id}`}
          >
            <Lock className="h-3 w-3" /> UPGRADE_TO_UNLOCK
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-border/50 bg-card/50 relative group" data-testid={`brief-card-${id}`}>
      <CardHeader className="pb-3 border-b border-border/30">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm font-mono text-primary">{title.toUpperCase()}</CardTitle>
            <div className="flex flex-wrap gap-1">
              {dimensions && (
                <Badge variant="outline" className="font-mono text-[9px] border-border/50 text-muted-foreground">
                  {dimensions}
                </Badge>
              )}
              {tools.slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="font-mono text-[9px] border-border/50 text-muted-foreground">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={() => onCopy(brief, id)}
            data-testid={`button-copy-${id}`}
          >
            {copiedId === id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/90 max-h-[420px] overflow-y-auto pr-2">
          {brief}
        </pre>
      </CardContent>
    </Card>
  );
}
