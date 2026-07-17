import { useState } from "react";
import { useListJobs, useCreateJob } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function Jobs() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useListJobs({ search });
  const { mutate: createJob, isPending: isCreating } = useCreateJob();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newJob, setNewJob] = useState({ title: "", jobType: "General" });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createJob({ data: newJob }, {
      onSuccess: (job) => {
        setIsDialogOpen(false);
        setLocation(`/jobs/${job.id}`);
      },
      onError: (err: any) => {
        toast({
          title: "Error",
          description: err.error || "Failed to create job",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
        <div className="flex items-center gap-4">
          <Input 
            placeholder="Search jobs..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>New Job</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Job</DialogTitle>
                <DialogDescription>
                  Start documenting a new field job.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Job Title</Label>
                  <Input id="title" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobType">Job Type</Label>
                  <Input id="jobType" value={newJob.jobType} onChange={e => setNewJob({...newJob, jobType: e.target.value})} required />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isCreating}>{isCreating ? "Creating..." : "Create"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-lg"></div>)}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Title</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Type</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.jobs.map((job) => (
                <tr key={job.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/jobs/${job.id}`} className="font-medium hover:text-primary transition-colors">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{job.jobType}</td>
                  <td className="px-6 py-4 text-muted-foreground">{job.customerName || "—"}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(job.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {(!data?.jobs || data.jobs.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No jobs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}