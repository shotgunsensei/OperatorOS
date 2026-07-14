import { useState, useEffect, memo, useCallback } from "react";
import { useGetStudySet, getGetStudySetQueryKey, useSubmitQuizAttempt, useListQuizAttempts, getListQuizAttemptsQueryKey } from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { LimitModal } from "@/components/limit-modal";

interface QuizQuestionCardProps {
  q: { id: number; question: string; choices: string[] };
  qIndex: number;
  selectedIndex: number | undefined;
  onSelect: (questionId: number, choiceIndex: number) => void;
}

// Memoized so updating answers for one question doesn't re-render every other
// card in the list — noticeable on long quizzes.
const QuizQuestionCard = memo(function QuizQuestionCard({ q, qIndex, selectedIndex, onSelect }: QuizQuestionCardProps) {
  return (
    <Card id={`q-${q.id}`}>
      <CardHeader>
        <CardTitle className="text-lg leading-snug">
          <span className="text-muted-foreground mr-2">{qIndex + 1}.</span>
          {q.question}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.choices.map((choice, cIndex) => {
          const isSelected = selectedIndex === cIndex;
          return (
            <Button
              key={cIndex}
              variant={isSelected ? "default" : "outline"}
              className={`w-full justify-start h-auto py-3 px-4 text-left whitespace-normal ${isSelected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent/5"}`}
              onClick={() => onSelect(q.id, cIndex)}
            >
              <span className="mr-3 font-medium opacity-50">{String.fromCharCode(65 + cIndex)}.</span>
              {choice}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
});

export default function StudySetQuiz() {
  const [, params] = useRoute("/sets/:id/quiz");
  const id = parseInt(params?.id || "0", 10);
  
  const { data: set, isLoading } = useGetStudySet(id, { 
    query: { enabled: !!id, queryKey: getGetStudySetQueryKey(id) } 
  });
  
  const submitQuiz = useSubmitQuizAttempt();
  const { refetch: refetchHistory } = useListQuizAttempts(id, { query: { enabled: !!id, queryKey: getListQuizAttemptsQueryKey(id) } });

  useDocumentMeta(set ? `${set.title} Quiz` : "Practice Quiz");

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<any>(null);
  const [limitModal, setLimitModal] = useState({ isOpen: false, feature: "", currentPlan: "", upgradeTo: "" });

  const onSelect = useCallback((questionId: number, choiceIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
  }, []);

  if (isLoading) {
    return <div className="p-8 space-y-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-64" /></div>;
  }

  if (!set || set.quizQuestions.length === 0) {
    return <div className="text-center py-20">No quiz questions available.</div>;
  }

  const questions = set.quizQuestions;
  const isComplete = Object.keys(answers).length === questions.length;
  const progress = (Object.keys(answers).length / questions.length) * 100;

  const handleSubmit = async () => {
    try {
      const formattedAnswers = Object.entries(answers).map(([qId, sIdx]) => ({
        questionId: parseInt(qId),
        selectedIndex: sIdx
      }));
      
      const res = await submitQuiz.mutateAsync({
        id,
        data: { answers: formattedAnswers }
      });
      setResult(res);
      refetchHistory();
      toast.success("Quiz submitted!");
    } catch (err: any) {
      if (err.status === 402) {
        setLimitModal({
          isOpen: true,
          feature: err.data?.feature || "Quiz Attempts",
          currentPlan: err.data?.currentPlan || "Free",
          upgradeTo: err.data?.upgradeTo || "Pro",
        });
      } else {
        toast.error("Failed to submit quiz");
      }
    }
  };

  if (result) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Link href={`/sets/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Set
            </Button>
          </Link>
        </div>

        <Card className="text-center border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl">Quiz Complete!</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-6xl font-bold text-primary mb-4">{result.attempt.score}%</div>
            <p className="text-muted-foreground">{result.attempt.correctCount} out of {result.attempt.totalCount} correct</p>
          </CardContent>
        </Card>

        {result.weakTopics.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-destructive flex items-center text-lg">
                <AlertCircle className="mr-2 h-5 w-5" /> Topics to Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                {result.weakTopics.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          <h3 className="text-xl font-bold">Review Answers</h3>
          {result.breakdown.map((b: any, i: number) => (
            <Card key={i} className={b.isCorrect ? "border-green-500/20" : "border-destructive/20"}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2">
                  {b.isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                  )}
                  <CardTitle className="text-base leading-snug">{b.question}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {!b.isCorrect && (
                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    <span className="font-semibold">Your Answer:</span> {questions.find(q => q.id === b.questionId)?.choices[b.selectedIndex]}
                  </div>
                )}
                <div className="text-sm text-green-500 bg-green-500/10 p-3 rounded-md">
                  <span className="font-semibold">Correct Answer:</span> {questions.find(q => q.id === b.questionId)?.choices[b.correctIndex]}
                </div>
                <p className="text-sm text-muted-foreground italic mt-2">{b.explanation}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="flex justify-center pt-4">
          <Button onClick={() => { setResult(null); setAnswers({}); }} variant="outline">Take Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link href={`/sets/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Set
          </Button>
        </Link>
        <div className="text-sm font-medium text-muted-foreground">
          {Object.keys(answers).length} / {questions.length} Answered
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="space-y-8 mt-8">
        {questions.map((q, qIndex) => (
          <QuizQuestionCard
            key={q.id}
            q={q}
            qIndex={qIndex}
            selectedIndex={answers[q.id]}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="sticky bottom-4 pt-4 flex justify-end">
        <Button 
          size="lg" 
          onClick={handleSubmit} 
          disabled={!isComplete || submitQuiz.isPending}
          className="w-full sm:w-auto shadow-lg"
        >
          {submitQuiz.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Quiz
        </Button>
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