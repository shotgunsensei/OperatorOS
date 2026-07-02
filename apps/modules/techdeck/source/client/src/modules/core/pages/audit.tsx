import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Clock, User, Filter, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import type { AuditLog } from "@shared/schema";

interface AuditLogWithUser extends AuditLog {
  userName?: string;
}

function getActionColor(action: string): "default" | "secondary" | "destructive" {
  if (action.includes("delete") || action.includes("remove") || action.includes("revoke")) return "destructive";
  if (action.includes("create") || action.includes("upload") || action.includes("grant")) return "default";
  return "secondary";
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    if (entityFilter) params.set("entityType", entityFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [actionFilter, entityFilter, dateFrom, dateTo]);

  const { data: logs, isLoading } = useQuery<AuditLogWithUser[]>({
    queryKey: [`/api/audit-logs${queryParams}`],
  });

  const { data: actionTypes } = useQuery<string[]>({
    queryKey: ["/api/audit-actions"],
  });

  const entityTypes = useMemo(() => {
    if (!logs) return [];
    const types = new Set(logs.map((l) => l.entityType).filter(Boolean) as string[]);
    return Array.from(types).sort();
  }, [logs]);

  const hasFilters = actionFilter || entityFilter || dateFrom || dateTo;

  const clearFilters = () => {
    setActionFilter("");
    setEntityFilter("");
    setDateFrom("");
    setDateTo("");
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-audit-title">
          Audit Log
        </h1>
        <p className="text-sm text-muted-foreground">
          Track all actions taken within your organization.
        </p>
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Select value={actionFilter || "__all__"} onValueChange={(v) => setActionFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-44" data-testid="select-action-filter">
                <SelectValue placeholder="All event types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All event types</SelectItem>
                {actionTypes?.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityFilter || "__all__"} onValueChange={(v) => setEntityFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-40" data-testid="select-entity-filter">
                <SelectValue placeholder="All entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All entities</SelectItem>
                {entityTypes.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36"
              data-testid="input-date-from"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36"
              data-testid="input-date-to"
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!logs?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {hasFilters ? "No logs match your filters" : "No audit logs yet"}
          </p>
          <p className="text-xs mt-1">
            {hasFilters ? "Try adjusting or clearing your filters." : "Actions will appear here as they happen."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground" data-testid="text-log-count">
            {logs.length} event{logs.length !== 1 ? "s" : ""}
          </p>
          <div className="grid gap-2">
            {logs.map((log) => (
              <Card key={log.id} data-testid={`card-audit-${log.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <Shield className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={getActionColor(log.action)} className="text-xs">
                            {log.action}
                          </Badge>
                          {log.entityType && (
                            <span className="text-xs text-muted-foreground">
                              on {log.entityType}
                              {log.entityId && (
                                <span className="font-mono ml-1 opacity-60">
                                  {log.entityId.substring(0, 8)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          {log.userName && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {log.userName}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {log.createdAt
                              ? formatDistanceToNow(new Date(log.createdAt), {
                                  addSuffix: true,
                                })
                              : "Just now"}
                          </span>
                        </div>
                        {(() => {
                          const d = log.details;
                          if (!d || typeof d !== "object" || Object.keys(d as Record<string, unknown>).length === 0) return null;
                          return (
                            <div className="mt-1 text-xs text-muted-foreground font-mono bg-muted/50 p-1.5 rounded-md max-w-lg truncate">
                              {String(JSON.stringify(d))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
