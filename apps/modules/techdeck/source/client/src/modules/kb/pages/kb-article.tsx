import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Save,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";

export default function KbArticlePage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: article, isLoading } = useQuery<any>({
    queryKey: ["/api/kb", id],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PUT", `/api/kb/${id}`, data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kb", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kb"] });
      toast({ title: "Article updated" });
      setEditing(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update article", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/kb/${id}`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kb"] });
      toast({ title: "Article deleted" });
      navigate("/kb");
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete article", description: err.message, variant: "destructive" });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", `/api/kb/${id}`, { isPublished: !article?.isPublished }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kb", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kb"] });
      toast({ title: article?.isPublished ? "Article unpublished" : "Article published" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update article", description: err.message, variant: "destructive" });
    },
  });

  const startEditing = () => {
    setEditTitle(article?.title || "");
    setEditCategory(article?.category || "");
    setEditContent(article?.content || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveEditing = () => {
    updateMutation.mutate({
      title: editTitle,
      category: editCategory,
      content: editContent,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Article not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/kb")} data-testid="button-back-to-kb">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Knowledge Base
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/kb")} data-testid="button-back-to-kb">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-xl font-bold"
              data-testid="input-edit-title"
            />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight truncate" data-testid="text-article-title">
              {article.title}
            </h1>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {editing ? (
          <Input
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            placeholder="Category"
            className="w-48"
            data-testid="input-edit-category"
          />
        ) : (
          article.category && (
            <Badge variant="secondary" data-testid="badge-article-category">
              {article.category}
            </Badge>
          )
        )}
        <Badge
          variant={article.isPublished ? "default" : "secondary"}
          data-testid="badge-article-published"
        >
          {article.isPublished ? "Published" : "Draft"}
        </Badge>
        <span className="text-xs text-muted-foreground" data-testid="text-article-author">
          {article.author
            ? `By ${article.author.firstName || ""} ${article.author.lastName || ""}`.trim()
            : ""}
        </span>
        <span className="text-xs text-muted-foreground" data-testid="text-article-updated">
          {article.updatedAt
            ? `Updated ${formatDistanceToNow(new Date(article.updatedAt), { addSuffix: true })}`
            : ""}
        </span>
        <div className="flex-1" />
        {editing ? (
          <div className="flex items-center gap-2">
            <Button onClick={saveEditing} disabled={updateMutation.isPending} data-testid="button-save-article">
              <Save className="w-4 h-4 mr-1" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={cancelEditing} data-testid="button-cancel-edit">
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => togglePublishMutation.mutate()}
              disabled={togglePublishMutation.isPending}
              data-testid="button-toggle-publish"
            >
              {article.isPublished ? (
                <>
                  <EyeOff className="w-4 h-4 mr-1" />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-1" />
                  Publish
                </>
              )}
            </Button>
            <Button variant="outline" onClick={startEditing} data-testid="button-edit-article">
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm("Delete this article?")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-article"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-6">
          {editing ? (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={20}
              className="font-mono text-sm"
              data-testid="input-edit-content"
            />
          ) : (
            <div
              className="whitespace-pre-wrap text-sm leading-relaxed"
              data-testid="text-article-content"
            >
              {article.content || "No content yet."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
