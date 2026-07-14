import { useState } from "react";
import { useCreateStudySet, useListTemplates } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LimitModal } from "@/components/limit-modal";
import { BookTemplate, Loader2 } from "lucide-react";
import type { LimitErrorResponse } from "@workspace/api-client-react";
type CreateStudySetBodyDifficulty = "easy" | "medium" | "hard";

export default function StudySetNew() {
  useDocumentMeta("Create Study Set");
  const [, setLocation] = useLocation();
  const createStudySet = useCreateStudySet();
  const { data: templates, isLoading: isLoadingTemplates } = useListTemplates();

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [course, setCourse] = useState("");
  const [difficulty, setDifficulty] = useState<CreateStudySetBodyDifficulty>("medium");
  const [learningGoal, setLearningGoal] = useState("");
  const [notes, setNotes] = useState("");

  const [limitModal, setLimitModal] = useState<{ isOpen: boolean; feature: string; currentPlan: string; upgradeTo: string }>({
    isOpen: false,
    feature: "",
    currentPlan: "",
    upgradeTo: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createStudySet.mutateAsync({
        data: {
          title,
          subject,
          course: course || undefined,
          difficulty,
          learningGoal: learningGoal || undefined,
          notes,
        },
      });
      toast.success("Study set created");
      setLocation(`/sets/${res.id}`);
    } catch (err: any) {
      if (err.status === 402 && err.data?.limitReached) {
        const data = err.data as LimitErrorResponse;
        setLimitModal({
          isOpen: true,
          feature: data.feature,
          currentPlan: data.currentPlan,
          upgradeTo: data.upgradeTo,
        });
      } else {
        toast.error("Failed to create study set");
      }
    }
  };

  const handleTemplateSelect = (template: any) => {
    setTitle(template.name);
    setSubject(template.subject);
    setDifficulty(template.difficulty as CreateStudySetBodyDifficulty);
    setNotes(template.sampleNotes);
    toast.info("Template applied");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Create Study Set</h1>
          <p className="text-muted-foreground">Paste your notes and let AI generate your study materials.</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input id="title" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Chapter 4: Cell Biology" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input id="subject" required value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Biology" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="course">Course (Optional)</Label>
                  <Input id="course" value={course} onChange={e => setCourse(e.target.value)} placeholder="e.g. BIO 101" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select value={difficulty} onValueChange={(val: any) => setDifficulty(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="learningGoal">Learning Goal (Optional)</Label>
                <Input id="learningGoal" value={learningGoal} onChange={e => setLearningGoal(e.target.value)} placeholder="What do you want to focus on?" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes Content *</Label>
                <Textarea 
                  id="notes" 
                  required 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  className="min-h-[300px] font-mono text-sm" 
                  placeholder="Paste your lecture notes, book summaries, or raw text here..." 
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={createStudySet.isPending} size="lg">
                  {createStudySet.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generate Study Materials
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <BookTemplate className="mr-2 h-5 w-5 text-primary" />
              Start from Template
            </CardTitle>
            <CardDescription>Don't have notes yet? Try a sample.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingTemplates ? (
              <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : templates?.map(template => (
              <Button 
                key={template.id} 
                variant="outline" 
                className="w-full justify-start h-auto py-3 px-4 flex flex-col items-start gap-1"
                onClick={() => handleTemplateSelect(template)}
              >
                <div className="font-semibold text-left">{template.name}</div>
                <div className="text-xs text-muted-foreground text-left line-clamp-2">{template.description}</div>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

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