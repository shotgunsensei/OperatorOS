import { useParams, Link } from "wouter";
import { useGetJob, getGetJobQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export default function JobDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { data: job, isLoading } = useGetJob(id, { query: { enabled: !!id, queryKey: getGetJobQueryKey(id) } });

  if (isLoading) {
    return <div className="p-8"><div className="animate-pulse h-8 w-64 bg-muted rounded mb-8"></div></div>;
  }

  if (!job) {
    return <div className="p-8">Job not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/jobs" className="text-muted-foreground hover:text-foreground">
          &larr; Back to Jobs
        </Link>
      </div>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{job.title}</h1>
          <p className="text-muted-foreground mt-1">
            {job.jobType} &bull; {job.status} {job.customerName && `• ${job.customerName}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Edit Info</Button>
          <Button>Generate Report</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Findings ({job.findings?.length || 0})</h2>
            <div className="text-muted-foreground text-sm">
              {job.findings?.length ? (
                <ul className="space-y-4">
                  {job.findings.map(f => (
                    <li key={f.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                      <div className="font-medium text-foreground">{f.issue}</div>
                      {f.recommendation && <div>Rec: {f.recommendation}</div>}
                    </li>
                  ))}
                </ul>
              ) : "No findings logged."}
            </div>
            <Button variant="outline" size="sm" className="mt-4">Add Finding</Button>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Notes ({job.notes?.length || 0})</h2>
            <div className="text-muted-foreground text-sm">
              {job.notes?.length ? (
                <ul className="space-y-4">
                  {job.notes.map(n => (
                    <li key={n.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                      <div>{n.content}</div>
                    </li>
                  ))}
                </ul>
              ) : "No notes logged."}
            </div>
            <Button variant="outline" size="sm" className="mt-4">Add Note</Button>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Site Details</h2>
            <div className="text-sm space-y-2">
              {job.siteAddress ? (
                <div>{job.siteAddress}</div>
              ) : (
                <span className="text-muted-foreground">No address provided.</span>
              )}
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Reports ({job.reports?.length || 0})</h2>
            <div className="text-sm text-muted-foreground">
               {job.reports?.length ? (
                <ul className="space-y-2">
                  {job.reports.map(r => (
                    <li key={r.id}>
                      <Link href={`/reports/${r.id}`} className="text-primary hover:underline">
                        {r.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : "No reports generated."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}