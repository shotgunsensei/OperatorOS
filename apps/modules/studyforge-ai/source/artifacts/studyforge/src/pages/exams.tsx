import { useState } from "react";
import { useListExamCountdowns, useCreateExamCountdown, useDeleteExamCountdown, getListExamCountdownsQueryKey } from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar, Trash2, Plus, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LimitModal } from "@/components/limit-modal";

export default function Exams() {
  useDocumentMeta("Exam Countdowns");
  
  const { data: exams, isLoading } = useListExamCountdowns();
  const createExam = useCreateExamCountdown();
  const deleteExam = useDeleteExamCountdown();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");

  const [limitModal, setLimitModal] = useState({ isOpen: false, feature: "", currentPlan: "", upgradeTo: "" });

  const todayIso = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName.trim()) {
      toast.error("Please enter an exam name");
      return;
    }
    if (examDate < todayIso) {
      toast.error("Exam date must be today or later");
      return;
    }
    try {
      await createExam.mutateAsync({ data: { examName, examDate } });
      queryClient.invalidateQueries({ queryKey: getListExamCountdownsQueryKey() });
      setIsCreateOpen(false);
      setExamName("");
      setExamDate("");
      toast.success("Exam countdown created");
    } catch (err: any) {
      if (err.status === 402) {
        setIsCreateOpen(false);
        setLimitModal({
          isOpen: true,
          feature: err.data?.feature || "Exam Countdowns",
          currentPlan: err.data?.currentPlan || "Free",
          upgradeTo: err.data?.upgradeTo || "Pro",
        });
      } else {
        toast.error("Failed to create exam");
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteExam.mutateAsync({ id: deleteId });
      queryClient.invalidateQueries({ queryKey: getListExamCountdownsQueryKey() });
      toast.success("Exam deleted");
    } catch (err) {
      toast.error("Failed to delete exam");
    } finally {
      setDeleteId(null);
    }
  };

  const getRiskBadge = (status: string) => {
    switch(status) {
      case 'on-track': return <span className="bg-green-500/20 text-green-500 px-2 py-1 rounded-full text-xs font-semibold">On Track</span>;
      case 'needs-attention': return <span className="bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded-full text-xs font-semibold">Needs Attention</span>;
      case 'cram-mode': return <span className="bg-destructive/20 text-destructive px-2 py-1 rounded-full text-xs font-semibold">Cram Mode</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Exam Countdowns</h1>
          <p className="text-muted-foreground">Pace your studying to hit your exam dates perfectly.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Exam</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Exam Date</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="examName">Exam Name</Label>
                <Input id="examName" required value={examName} onChange={e => setExamName(e.target.value)} placeholder="e.g. Bio Final" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="examDate">Date</Label>
                <Input id="examDate" type="date" required min={todayIso} value={examDate} onChange={e => setExamDate(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={createExam.isPending}>
                Save Exam
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : exams?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border/50">
          <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No upcoming exams</h3>
          <p className="text-muted-foreground mb-6">Add your exam dates to get personalized pacing recommendations.</p>
          <Button onClick={() => setIsCreateOpen(true)}>Add Exam</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams?.map((exam) => (
            <Card key={exam.id} className="relative overflow-hidden">
              <div className={`absolute top-0 left-0 w-1.5 h-full ${
                exam.riskStatus === 'on-track' ? 'bg-green-500' : 
                exam.riskStatus === 'needs-attention' ? 'bg-yellow-500' : 'bg-destructive'
              }`} />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl">{exam.examName}</CardTitle>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive -mt-2 -mr-2" onClick={() => setDeleteId(exam.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">{new Date(exam.examDate).toLocaleDateString()}</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-primary">{exam.daysRemaining}</div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mt-1">Days Left</div>
                  </div>
                  <div className="flex-1 border-l border-border pl-4">
                    <div className="text-sm font-medium flex items-center gap-1">
                      <Clock className="h-4 w-4" /> {exam.recommendedDailyMinutes} min / day
                    </div>
                    <div className="mt-2">{getRiskBadge(exam.riskStatus)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exam?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the countdown. You can recreate it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LimitModal
        isOpen={limitModal.isOpen}
        onClose={() => setLimitModal({ ...limitModal, isOpen: false })}
        feature={limitModal.feature}
        currentPlan={limitModal.currentPlan}
        upgradeTo={limitModal.upgradeTo}
      />
    </div>
  );
}