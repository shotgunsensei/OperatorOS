import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  BookOpen,
  Trash2,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EmptyState } from "@/components/empty-state";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";

const createArticleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().optional(),
  content: z.string().optional(),
});

type CreateArticleForm = z.infer<typeof createArticleSchema>;

export default function KbListPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [publishedFilter, setPublishedFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const queryParams = new URLSearchParams();
  if (categoryFilter && categoryFilter !== "all") queryParams.set("category", categoryFilter);
  if (publishedFilter && publishedFilter !== "all") queryParams.set("isPublished", publishedFilter);
  if (searchQuery) queryParams.set("query", searchQuery);
  const queryString = queryParams.toString();

  const { data: articles, isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/kb${queryString ? `?${queryString}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load articles");
      return res.json();
    },
  });

  const categories = articles
    ? Array.from(new Set(articles.map((a: any) => a.category).filter(Boolean)))
    : [];

  const createMutation = useMutation({
    mutationFn: async (data: CreateArticleForm) => {
      const body: any = { ...data };
      if (!body.category) delete body.category;
      if (!body.content) body.content = "";
      return apiRequest("POST", "/api/kb", body);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kb"] });
      toast({ title: "Article created" });
      setShowCreateDialog(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create article", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/kb/${id}`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kb"] });
      toast({ title: "Article deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete article", description: err.message, variant: "destructive" });
    },
  });

  const form = useForm<CreateArticleForm>({
    resolver: zodResolver(createArticleSchema),
    defaultValues: {
      title: "",
      category: "",
      content: "",
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-kb-title">
            Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage internal documentation and articles.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-article">
          <Plus className="w-4 h-4 mr-1" />
          New Article
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search articles..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-kb"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-category-filter">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat: string) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={publishedFilter} onValueChange={setPublishedFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-published-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="true">Published</SelectItem>
            <SelectItem value="false">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {!articles?.length ? (
            <EmptyState
              icon={BookOpen}
              title="No articles found"
              description="Create your first knowledge base article."
              action={{ label: "New Article", onClick: () => setShowCreateDialog(true), testId: "button-create-article-empty" }}
            />
          ) : (
            <div>
              <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground font-medium">
                <span className="flex-1">Title</span>
                <span className="w-24">Category</span>
                <span className="w-20">Status</span>
                <span className="w-32">Author</span>
                <span className="w-24">Updated</span>
                <span className="w-10"></span>
              </div>
              {articles.map((article: any) => (
                <div
                  key={article.id}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover-elevate cursor-pointer"
                  data-testid={`kb-row-${article.id}`}
                >
                  <Link href={`/kb/${article.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="flex-1 text-sm font-medium truncate" data-testid={`text-article-title-${article.id}`}>
                      {article.title}
                    </span>
                    <span className="w-24">
                      {article.category ? (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${article.id}`}>
                          {article.category}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </span>
                    <span className="w-20">
                      <Badge
                        variant={article.isPublished ? "default" : "secondary"}
                        className="text-xs"
                        data-testid={`badge-published-${article.id}`}
                      >
                        {article.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </span>
                    <span className="w-32 text-xs text-muted-foreground truncate" data-testid={`text-author-${article.id}`}>
                      {article.author
                        ? `${article.author.firstName || ""} ${article.author.lastName || ""}`.trim()
                        : "-"}
                    </span>
                    <span className="w-24 text-xs text-muted-foreground" data-testid={`text-updated-${article.id}`}>
                      {article.updatedAt
                        ? formatDistanceToNow(new Date(article.updatedAt), { addSuffix: true })
                        : "-"}
                    </span>
                  </Link>
                  <span className="w-10 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this article?")) {
                          deleteMutation.mutate(article.id);
                        }
                      }}
                      data-testid={`button-delete-article-${article.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Article</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Article title" data-testid="input-article-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Getting Started, FAQ" data-testid="input-article-category" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Article content..." rows={6} data-testid="input-article-content" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-article">
                  {createMutation.isPending ? "Creating..." : "Create Article"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
