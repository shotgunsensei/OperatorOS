import { useState, useEffect, useCallback } from "react";
import { useGetStudySet, getGetStudySetQueryKey, useUpdateFlashcardStatus } from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, RotateCcw, Check, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
type FlashcardStatusBodyStatus = "new" | "known" | "review";

export default function StudySetFlashcards() {
  const [, params] = useRoute("/sets/:id/flashcards");
  const id = parseInt(params?.id || "0", 10);

  const { data: set, isLoading } = useGetStudySet(id, {
    query: { enabled: !!id, queryKey: getGetStudySetQueryKey(id) },
  });

  const updateStatus = useUpdateFlashcardStatus();
  const queryClient = useQueryClient();

  useDocumentMeta(set ? `${set.title} Flashcards` : "Flashcards");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const cards = set?.flashcards ?? [];
  const currentCard = cards[currentIndex];

  const handleNext = useCallback(() => {
    setCurrentIndex((curr) => {
      if (curr < cards.length - 1) {
        setIsFlipped(false);
        return curr + 1;
      }
      return curr;
    });
  }, [cards.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((curr) => {
      if (curr > 0) {
        setIsFlipped(false);
        return curr - 1;
      }
      return curr;
    });
  }, []);

  const handleStatus = useCallback(
    async (status: FlashcardStatusBodyStatus) => {
      if (!currentCard) return;
      try {
        await updateStatus.mutateAsync({
          id,
          cardId: currentCard.id,
          data: { status },
        });
        // Locally patch the cached set so the chip color updates without a refetch.
        queryClient.setQueryData(getGetStudySetQueryKey(id), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            flashcards: old.flashcards.map((c: any) =>
              c.id === currentCard.id ? { ...c, status } : c,
            ),
          };
        });
        // Auto-advance instead of toasting on every card — review mode hits this
        // dozens of times per session and the toasts pile up.
        handleNext();
      } catch {
        toast.error("Failed to update status");
      }
    },
    [currentCard, id, updateStatus, queryClient, handleNext],
  );

  // Keyboard shortcuts: Space=flip, ←/→=navigate, 1=needs review, 2=known.
  useEffect(() => {
    if (!currentCard) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "1" && isFlipped) {
        e.preventDefault();
        handleStatus("review");
      } else if (e.key === "2" && isFlipped) {
        e.preventDefault();
        handleStatus("known");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentCard, isFlipped, handleNext, handlePrev, handleStatus]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh]">
        <Skeleton className="h-96 w-full max-w-2xl rounded-2xl" />
      </div>
    );
  }

  if (!set || cards.length === 0 || !currentCard) {
    return <div className="text-center py-20">No flashcards available.</div>;
  }

  const progress = (currentIndex / cards.length) * 100;

  return (
    <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8 flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between">
        <Link href={`/sets/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Set
          </Button>
        </Link>
        <div className="text-sm font-medium text-muted-foreground">
          {currentIndex + 1} / {cards.length}
        </div>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="flex-1 flex flex-col items-center justify-center min-h-[320px] sm:min-h-[400px] perspective-1000">
        <div
          className={`relative w-full h-full max-h-[500px] cursor-pointer transition-all duration-500 transform-style-3d ${isFlipped ? "rotate-y-180" : ""}`}
          onClick={() => setIsFlipped(!isFlipped)}
          role="button"
          tabIndex={0}
          aria-label="Flip flashcard"
          onKeyDown={(e) => {
            if (e.key === "Enter") setIsFlipped((f) => !f);
          }}
        >
          {/* Front */}
          <div className="absolute inset-0 bg-card border-2 border-border/50 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center backface-hidden shadow-lg hover-elevate">
            <div className="absolute top-4 left-4 text-xs font-semibold text-muted-foreground uppercase tracking-widest">Question</div>
            <p className="text-xl sm:text-2xl md:text-4xl font-medium">{currentCard.front}</p>
            <div className="absolute bottom-4 flex items-center gap-2 text-muted-foreground text-xs sm:text-sm">
              <RotateCcw className="h-4 w-4" /> Click or press Space to flip
            </div>
          </div>

          {/* Back */}
          <div className="absolute inset-0 bg-primary/5 border-2 border-primary/20 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center backface-hidden rotate-y-180 shadow-lg hover-elevate">
            <div className="absolute top-4 left-4 text-xs font-semibold text-primary uppercase tracking-widest">Answer</div>
            <p className="text-lg sm:text-xl md:text-3xl">{currentCard.back}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0} className="w-full sm:w-auto">
          <ArrowLeft className="mr-2 h-4 w-4" /> Previous
        </Button>

        {isFlipped && (
          <div className="flex gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-bottom-4">
            <Button
              variant="destructive"
              onClick={() => handleStatus("review")}
              className="flex-1 sm:flex-none bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white"
              aria-label="Needs review (1)"
            >
              <X className="mr-2 h-4 w-4" /> Review <span className="hidden sm:inline ml-1 opacity-60">(1)</span>
            </Button>
            <Button
              variant="default"
              onClick={() => handleStatus("known")}
              className="flex-1 sm:flex-none bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500 hover:text-white"
              aria-label="Known (2)"
            >
              <Check className="mr-2 h-4 w-4" /> Known <span className="hidden sm:inline ml-1 opacity-60">(2)</span>
            </Button>
          </div>
        )}

        <Button variant="outline" onClick={handleNext} disabled={currentIndex === cards.length - 1} className="w-full sm:w-auto">
          Next <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Shortcuts: <kbd className="px-1 py-0.5 rounded bg-muted text-foreground">Space</kbd> flip ·
        <kbd className="px-1 py-0.5 rounded bg-muted text-foreground ml-1">←/→</kbd> navigate ·
        <kbd className="px-1 py-0.5 rounded bg-muted text-foreground ml-1">1</kbd> review ·
        <kbd className="px-1 py-0.5 rounded bg-muted text-foreground ml-1">2</kbd> known
      </p>
    </div>
  );
}
