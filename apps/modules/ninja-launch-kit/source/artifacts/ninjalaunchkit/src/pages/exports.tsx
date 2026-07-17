import { useListExports } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Link } from "wouter";
import { Download, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Exports() {
  const { data: exports, isLoading } = useListExports();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Export Center</h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">History of extracted payloads</p>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="font-mono text-primary flex items-center gap-2">
            <Download className="h-5 w-5" />
            EXPORT_LOGS
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center font-mono text-muted-foreground animate-pulse">LOADING_DATA...</div>
          ) : exports?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border/50 rounded-lg">
              <FileText className="h-12 w-12 mx-auto opacity-20 mb-4" />
              <p className="font-mono text-sm">NO_EXPORTS_FOUND</p>
              <p className="text-xs mt-2">Generate and export kits to see history here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="font-mono text-xs">TIMESTAMP</TableHead>
                  <TableHead className="font-mono text-xs">KIT_TITLE</TableHead>
                  <TableHead className="font-mono text-xs">FORMAT</TableHead>
                  <TableHead className="font-mono text-xs text-right">ACTION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports?.map((record) => (
                  <TableRow key={record.id} className="border-border/20">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(new Date(record.createdAt), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium">{record.kitTitle}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase border-primary/30 text-primary">
                        {record.format}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/kits/${record.kitId}`}>
                        <Button variant="ghost" size="sm" className="h-8 font-mono text-xs">
                          VIEW_KIT <ArrowRight className="ml-2 h-3 w-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}