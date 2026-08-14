import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { useState } from "react";
import {
  FileText,
  Search,
  Upload,
  Clock,
  Filter,
  X,
  Image,
  File,
  PackageOpen,
  CheckSquare,
  Square,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EvidencePreviewButton } from "@/components/evidence-preview";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import type { EvidenceWithRelations } from "@/lib/types";
import type { Client, Tag } from "@shared/schema";
import { EmptyState } from "@/components/empty-state";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return Image;
  if (fileType === "application/pdf") return File;
  return FileText;
}

export default function EvidencePage() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const initialQ = params.get("q") || "";
  const { toast } = useToast();

  const [search, setSearch] = useState(initialQ);
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (evidence) {
      setSelectedIds(new Set(evidence.map((e) => e.id)));
    }
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exportPacketMutation = useMutation({
    mutationFn: async (evidenceIds: string[]) => {
      const response = await fetch("/api/evidence/export-packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceIds }),
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "evidence-packet.zip";
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Export complete", description: `Exported ${selectedIds.size} evidence items as a ZIP packet.` });
      setSelectedIds(new Set());
      setSelectMode(false);
    },
    onError: (err: Error) => {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    },
  });

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("q", search);
  if (clientFilter && clientFilter !== "all") queryParams.set("clientId", clientFilter);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  const queryString = queryParams.toString();

  const evidenceUrl = `/api/evidence${queryString ? `?${queryString}` : ""}`;
  const { data: evidence, isLoading } = useQuery<EvidenceWithRelations[]>({
    queryKey: [evidenceUrl],
  });

  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: tags } = useQuery<Tag[]>({ queryKey: ["/api/tags"] });

  const hasActiveFilters = clientFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setClientFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-evidence-title">
            Evidence Locker
          </h1>
          <p className="text-sm text-muted-foreground">
            {evidence?.length || 0} evidence items
            {selectMode && selectedIds.size > 0 && (
              <span className="ml-1 font-medium">
                ({selectedIds.size} selected)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={selectedIds.size === (evidence?.length || 0) ? deselectAll : selectAll}
                data-testid="button-select-all"
              >
                {selectedIds.size === (evidence?.length || 0) ? (
                  <><CheckSquare className="w-4 h-4 mr-1" />Deselect All</>
                ) : (
                  <><Square className="w-4 h-4 mr-1" />Select All</>
                )}
              </Button>
              <Button
                disabled={selectedIds.size === 0 || exportPacketMutation.isPending}
                onClick={() => exportPacketMutation.mutate(Array.from(selectedIds))}
                data-testid="button-export-packet"
              >
                {exportPacketMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <PackageOpen className="w-4 h-4 mr-1" />
                )}
                Export Packet
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                data-testid="button-cancel-select"
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setSelectMode(true)}
                data-testid="button-start-select"
              >
                <PackageOpen className="w-4 h-4 mr-1" />
                Export
              </Button>
              <Button asChild data-testid="button-upload-evidence-page">
                <Link href="/evidence/upload">
                  <Upload className="w-4 h-4 mr-1" />
                  Upload Evidence
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search evidence by title, notes, client, asset..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-evidence-page"
          />
        </div>
        <Button
          variant={hasActiveFilters ? "default" : "outline"}
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4 mr-1" />
          Filters
          {hasActiveFilters && <Badge variant="secondary" className="ml-1 text-xs">Active</Badge>}
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Client</p>
                <Select
                  value={clientFilter}
                  onValueChange={setClientFilter}
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-client">
                    <SelectValue placeholder="All clients" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">From</p>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[160px]"
                  data-testid="input-filter-date-from"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">To</p>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[160px]"
                  data-testid="input-filter-date-to"
                />
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!evidence?.length ? (
        <EmptyState
          icon={FileText}
          title={search || hasActiveFilters ? "No evidence matches your filters" : "No evidence uploaded yet"}
          description={search || hasActiveFilters ? "Try clearing your filters." : "Upload your first evidence file to get started."}
          action={!search && !hasActiveFilters ? { label: "Upload Evidence", href: "/evidence/upload", testId: "button-upload-evidence-empty" } : undefined}
        />
      ) : (
        <div className="grid gap-2">
          {evidence.map((item) => {
            const IconComp = getFileIcon(item.fileType);
            return (
              <Card key={item.id} className="hover-elevate" data-testid={`card-evidence-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    {selectMode && (
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                        className="flex-shrink-0"
                        data-testid={`checkbox-evidence-${item.id}`}
                      />
                    )}
                    <Link href={selectMode ? "#" : `/evidence/${item.id}`} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={selectMode ? (e: any) => { e.preventDefault(); toggleSelect(item.id); } : undefined}>
                      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <IconComp className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{item.fileName}</span>
                          <span>{formatFileSize(item.fileSize)}</span>
                          {item.clientName && (
                            <Badge variant="secondary" className="text-xs">
                              {item.clientName}
                            </Badge>
                          )}
                          {item.assetName && (
                            <Badge variant="secondary" className="text-xs">
                              {item.assetName}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <EvidencePreviewButton
                        id={item.id}
                        title={item.title}
                        fileType={item.fileType}
                        fileName={item.fileName}
                      />
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {item.createdAt
                          ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
                          : "Just now"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
