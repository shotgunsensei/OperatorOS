import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Server, ArrowLeft, Mail, Phone, MapPinned } from "lucide-react";

interface ClientDetail {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  sites: Array<{ id: string; name: string; address?: string }>;
  assets: Array<{ id: string; name: string; type?: string; serialNumber?: string; hostname?: string }>;
}

export default function PortalClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const { data: client, isLoading, error } = useQuery<ClientDetail>({
    queryKey: ["/api/portal/clients", clientId],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link href="/portal">
          <Button variant="ghost" size="sm" data-testid="button-back-portal">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Portal
          </Button>
        </Link>
        <Card className="mt-4">
          <CardContent className="py-8 text-center text-muted-foreground">
            {error ? "Access denied or client not found." : "Client not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/portal">
          <Button variant="ghost" size="sm" data-testid="button-back-portal">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-client-name">
          <Building2 className="w-6 h-6" />
          {client.name}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {client.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span>{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{client.phone}</span>
            </div>
          )}
          {client.address && (
            <div className="flex items-center gap-2 text-sm">
              <MapPinned className="w-4 h-4 text-muted-foreground" />
              <span>{client.address}</span>
            </div>
          )}
          {client.notes && (
            <p className="text-sm text-muted-foreground mt-2">{client.notes}</p>
          )}
          {!client.email && !client.phone && !client.address && !client.notes && (
            <p className="text-sm text-muted-foreground">No contact information available.</p>
          )}
        </CardContent>
      </Card>

      {client.sites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Sites
              <Badge variant="secondary">{client.sites.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {client.sites.map((site) => (
                <div key={site.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0" data-testid={`row-site-${site.id}`}>
                  <span className="font-medium text-sm">{site.name}</span>
                  {site.address && (
                    <span className="text-sm text-muted-foreground">{site.address}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {client.assets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-4 h-4" />
              Assets
              <Badge variant="secondary">{client.assets.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {client.assets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0" data-testid={`row-asset-${asset.id}`}>
                  <div>
                    <span className="font-medium text-sm">{asset.name}</span>
                    {asset.type && <Badge variant="outline" className="ml-2">{asset.type}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {asset.hostname && <span>{asset.hostname}</span>}
                    {asset.serialNumber && <span className="ml-2">S/N: {asset.serialNumber}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
