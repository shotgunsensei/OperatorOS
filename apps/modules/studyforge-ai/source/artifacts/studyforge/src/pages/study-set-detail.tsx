import { useState } from "react";
import {
  useGetStudySet,
  getGetStudySetQueryKey,
  useUpdateStudySet,
} from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Link, useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Brain, FileText, CheckSquare, Calendar, Download, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function StudySetDetail() {
  const [, params] = useRoute("/sets/:id");
  const id = parseInt(params?.id || "0", 10);

  const { data: set, isLoading, error } = useGetStudySet(id, {
    query: { enabled: !!id, queryKey: getGetStudySetQueryKey(id) },
  });
  const updateSet = useUpdateStudySet();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [subjectDraft, setSubjectDraft] = useState("");
  const [courseDraft, setCourseDraft] = useState("");
  const [examDateDraft, setExamDateDraft] = useState("");

  useDocumentMeta(set?.title || "Study Set");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-2/3" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (error || !set) {
    return <div className="text-destructive">Failed to load study set.</div>;
  }

  const exportAsJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(set, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${set.title.replace(/\s+/g, "_")}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const openEdit = () => {
    setTitleDraft(set.title);
    setSubjectDraft(set.subject);
    setCourseDraft(set.course ?? "");
    setExamDateDraft(set.examDate ?? "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const t = titleDraft.trim();
    const s = subjectDraft.trim();
    if (!t || !s) {
      toast.error("Title and subject are required");
      return;
    }
    try {
      await updateSet.mutateAsync({
        id,
        data: {
          title: t,
          subject: s,
          course: courseDraft.trim() ? courseDraft.trim() : null,
          examDate: examDateDraft ? examDateDraft : null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetStudySetQueryKey(id) });
      toast.success("Study set updated");
      setEditOpen(false);
    } catch {
      toast.error("Failed to update study set");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
              {set.subject}
            </span>
            {set.difficulty && (
              <span className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                {set.difficulty}
              </span>
            )}
            <span className="bg-accent/20 text-accent px-3 py-1 rounded-full text-xs font-semibold">
              Score: {set.qualityScore}/100
            </span>
          </div>
          <h1 className="text-3xl font-bold">{set.title}</h1>
          {set.course && <p className="text-muted-foreground mt-1">{set.course}</p>}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={openEdit} aria-label="Edit study set metadata">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button variant="outline" onClick={exportAsJSON}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href={`/sets/${id}/flashcards`}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Brain className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Flashcards</h3>
                <p className="text-sm text-muted-foreground">{set.flashcards.length} cards</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/sets/${id}/quiz`}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <CheckSquare className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Practice Quiz</h3>
                <p className="text-sm text-muted-foreground">{set.quizQuestions.length} questions</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/sets/${id}/review`}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Review Sheet</h3>
                <p className="text-sm text-muted-foreground">Cheat sheet & terms</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/sets/${id}/plan`}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Study Plan</h3>
                <p className="text-sm text-muted-foreground">{set.studyPlan.length} sessions</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-muted-foreground">{set.summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Key Terms ({set.keyTerms.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {set.keyTerms.map((term, i) => (
                <div key={i} className="pb-4 border-b border-border last:border-0 last:pb-0">
                  <span className="font-bold text-primary mr-2">{term.term}:</span>
                  <span className="text-muted-foreground">{term.definition}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {set.weakAreas.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive">Areas for Review</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                  {set.weakAreas.map((area, i) => (
                    <li key={i}>{area}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Original Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted p-4 rounded-md text-sm font-mono whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {set.notes}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit study set</DialogTitle>
            <DialogDescription>
              Update the metadata for this study set. The notes and generated materials are unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="edit-subject">Subject</Label>
              <Input
                id="edit-subject"
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="edit-course">Course (optional)</Label>
              <Input
                id="edit-course"
                value={courseDraft}
                onChange={(e) => setCourseDraft(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="edit-exam">Exam date (optional)</Label>
              <Input
                id="edit-exam"
                type="date"
                value={examDateDraft}
                onChange={(e) => setExamDateDraft(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateSet.isPending}>
              {updateSet.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
