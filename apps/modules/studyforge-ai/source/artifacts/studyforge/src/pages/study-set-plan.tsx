import { useGetStudySet, getGetStudySetQueryKey, useToggleStudySession } from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function StudySetPlan() {
  const [, params] = useRoute("/sets/:id/plan");
  const id = parseInt(params?.id || "0", 10);
  
  const { data: set, isLoading } = useGetStudySet(id, { 
    query: { enabled: !!id, queryKey: getGetStudySetQueryKey(id) } 
  });

  const toggleSession = useToggleStudySession();
  const queryClient = useQueryClient();

  useDocumentMeta(set ? `${set.title} Study Plan` : "Study Plan");

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-64" /></div>;
  }

  if (!set || !set.studyPlan) {
    return <div className="text-center py-20">Study plan not available.</div>;
  }

  const handleToggle = async (sessionId: number, completed: boolean) => {
    try {
      await toggleSession.mutateAsync({ id, sessionId, data: { completed: !completed } });
      
      queryClient.setQueryData(getGetStudySetQueryKey(id), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          studyPlan: old.studyPlan.map((s: any) => 
            s.id === sessionId ? { ...s, completed: !completed } : s
          )
        };
      });
      
    } catch (e) {
      toast.error("Failed to update session");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/sets/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Set
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold mb-2">Study Plan</h1>
        <p className="text-muted-foreground">A step-by-step guide to mastering this material.</p>
      </div>

      <div className="space-y-4">
        {set.studyPlan.map((session) => (
          <Card key={session.id} className={`transition-all duration-200 ${session.completed ? 'opacity-60 border-primary/20 bg-primary/5' : ''}`}>
            <CardContent className="p-0 flex items-stretch">
              <div className={`w-16 flex flex-col items-center justify-center font-bold text-lg border-r border-border ${session.completed ? 'text-primary' : 'text-muted-foreground'}`}>
                D{session.day}
              </div>
              <div className="flex-1 p-5 flex items-start gap-4">
                <div className="mt-1">
                  <Checkbox 
                    checked={session.completed} 
                    onCheckedChange={() => handleToggle(session.id, session.completed)}
                    className="h-5 w-5"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className={`text-lg font-semibold ${session.completed ? 'line-through' : ''}`}>
                    {session.topic}
                  </h3>
                  <p className="text-sm text-muted-foreground">{session.focus}</p>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0 bg-muted px-2 py-1 rounded-md">
                  <Clock className="h-3 w-3" />
                  {session.estimatedMinutes}m
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}