import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PortalClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface PortalEvidenceItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  clientName?: string;
  createdAt: string;
  tags?: Array<{ id: string; name: string }>;
}

export default function PortalHomePage() {
  const { data: clients, isLoading: clientsLoading } = useQuery<PortalClient[]>({
    queryKey: ["/api/portal/clients"],
  });

  const { data: evidence, isLoading: evidenceLoading } = useQuery<PortalEvidenceItem[]>({
    queryKey: ["/api/portal/evidence"],
  });

  const recentEvidence = evidence?.slice(0, 10) || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-portal-title">Client Portal</h1>
        <p className="text-muted-foreground mt-1">
          View your assigned clients and evidence files
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            My Clients
          </h2>
          <Badge variant="secondary" data-testid="badge-client-count">
            {clients?.length ?? 0} assigned
          </Badge>
        </div>

        {clientsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-md" />
            ))}
          </div>
        ) : clients && clients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <Link key={client.id} href={`/portal/clients/${client.id}`}>
                <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-client-${client.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      {client.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {client.email && (
                      <p className="text-sm text-muted-foreground">{client.email}</p>
                    )}
                    {client.phone && (
                      <p className="text-sm text-muted-foreground">{client.phone}</p>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                      <span>View details</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No clients assigned to you yet.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Recent Evidence
          </h2>
          {evidence && evidence.length > 0 && (
            <Link href="/portal/evidence">
              <Button variant="outline" size="sm" data-testid="button-view-all-evidence">
                View All
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        {evidenceLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        ) : recentEvidence.length > 0 ? (
          <div className="space-y-2">
            {recentEvidence.map((item) => (
              <Card key={item.id} data-testid={`row-evidence-${item.id}`}>
                <CardContent className="py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mt-1">
                      <span>{item.fileName}</span>
                      <span>{formatFileSize(item.fileSize)}</span>
                      {item.clientName && <Badge variant="secondary">{item.clientName}</Badge>}
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
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-evidence">
              No evidence files available.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
