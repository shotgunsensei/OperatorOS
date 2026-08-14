import { useGetDashboardSummary, useGetRecentJobs } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: recentJobs, isLoading: isJobsLoading } = useGetRecentJobs();

  if (isSummaryLoading || isJobsLoading) {
    return <div className="p-8"><div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-6 py-1"><div className="h-2 bg-muted rounded"></div></div></div></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Console</h1>
        <Link href="/jobs" className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:bg-primary/90">
          View Jobs
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Active Jobs</p>
          <p className="text-4xl font-bold">{summary?.activeJobs || 0}</p>
        </div>
        <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Reports Generated</p>
          <p className="text-4xl font-bold">{summary?.totalReports || 0}</p>
        </div>
        <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Pending Drafts</p>
          <p className="text-4xl font-bold">{summary?.pendingDrafts || 0}</p>
        </div>
        <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Customers</p>
          <p className="text-4xl font-bold">{summary?.totalCustomers || 0}</p>
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">Recent Jobs</h2>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-6 py-3 font-medium text-muted-foreground">Title</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recentJobs?.map((job) => (
              <tr key={job.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-4">
                  <Link href={`/jobs/${job.id}`} className="font-medium hover:text-primary transition-colors">
                    {job.title}
                  </Link>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{job.customerName || "—"}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                    {job.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{new Date(job.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {(!recentJobs || recentJobs.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                  No recent jobs. <Link href="/jobs" className="text-primary hover:underline">Create one</Link> to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}