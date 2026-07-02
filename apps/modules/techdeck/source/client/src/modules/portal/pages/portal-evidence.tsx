import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search } from "lucide-react";

interface PortalClient {
  id: string;
  name: string;
}

interface PortalEvidenceItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  clientId?: string;
  clientName?: string;
  assetName?: string;
  siteName?: string;
  notes?: string;
  createdAt: string;
  tags?: Array<{ id: string; name: string }>;
}

export default function PortalEvidencePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");

  const { data: clients } = useQuery<PortalClient[]>({
    queryKey: ["/api/portal/clients"],
  });

  const evidenceParams = new URLSearchParams();
  if (searchQuery) evidenceParams.set("q", searchQuery);
  if (clientFilter && clientFilter !== "all") evidenceParams.set("clientId", clientFilter);
  const queryStr = evidenceParams.toString();

  const { data: evidence, isLoading } = useQuery<PortalEvidenceItem[]>({
    queryKey: ["/api/portal/evidence", queryStr],
    queryFn: async () => {
      const res = await fetch(`/api/portal/evidence${queryStr ? `?${queryStr}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch evidence");
      return res.json();
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-portal-evidence-title">
          <FileText className="w-6 h-6" />
          My Evidence
        </h1>
        <p className="text-muted-foreground mt-1">
          Evidence files associated with your assigned clients
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, filename, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-portal-search"
          />
        </div>
        {clients && clients.length > 1 && (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-portal-client-filter">
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : evidence && evidence.length > 0 ? (
        <div className="space-y-2">
          {evidence.map((item) => (
            <Card key={item.id} data-testid={`row-evidence-${item.id}`}>
              <CardContent className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate" data-testid={`text-evidence-title-${item.id}`}>{item.title}</p>
                  <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mt-1">
                    <span>{item.fileName}</span>
                    <span>{formatFileSize(item.fileSize)}</span>
                    {item.clientName && <Badge variant="secondary">{item.clientName}</Badge>}
                    {item.siteName && <Badge variant="outline">{item.siteName}</Badge>}
                    {item.assetName && <Badge variant="outline">{item.assetName}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {item.tags?.map((tag) => (
                    <Badge key={tag.id} variant="outline">{tag.name}</Badge>
                  ))}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="text-sm text-muted-foreground text-center pt-2" data-testid="text-evidence-count">
            {evidence.length} evidence item{evidence.length !== 1 ? "s" : ""}
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-evidence">
            {searchQuery || clientFilter !== "all"
              ? "No evidence found matching your filters."
              : "No evidence files available."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
