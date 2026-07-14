import { useState } from "react";
import { useListStudySets, useDeleteStudySet, getListStudySetsQueryKey } from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Search, Plus, Folder as FolderIcon, MoreVertical, Trash, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function StudySets() {
  useDocumentMeta("Study Sets");
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  const { data: sets, isLoading } = useListStudySets({ search: search || undefined });
  const deleteSet = useDeleteStudySet();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteSet.mutateAsync({ id: deleteId });
      queryClient.invalidateQueries({ queryKey: getListStudySetsQueryKey() });
      toast.success("Study set deleted");
    } catch (err) {
      toast.error("Failed to delete study set");
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <h1 className="text-3xl font-bold">Study Sets</h1>
        <div className="flex gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sets..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link href="/sets/new">
            <Button><Plus className="h-4 w-4 mr-2" /> New Set</Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : sets?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border/50">
          <FolderIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No study sets found</h3>
          <p className="text-muted-foreground mb-6">Create your first study set to start learning.</p>
          <Link href="/sets/new">
            <Button>Create Study Set</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sets?.map((set) => (
            <Card key={set.id} className="group hover:border-primary/50 transition-colors">
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex justify-between items-start mb-2">
                  <Link href={`/sets/${set.id}`} className="font-semibold text-lg hover:text-primary transition-colors line-clamp-1">
                    {set.title}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDeleteId(set.id)} className="text-destructive focus:bg-destructive/10">
                        <Trash className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-1">{set.subject}</p>
                
                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-4">
                  <div className="flex gap-4">
                    <span>{set.flashcardCount} cards</span>
                    <span>{set.quizQuestionCount} Qs</span>
                  </div>
                  {set.qualityScore && (
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      Score: {set.qualityScore}/100
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your study set and all associated flashcards and quizzes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}