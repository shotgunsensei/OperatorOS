import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  X,
  ArrowLeft,
  CloudUpload,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Client, Site, Asset, Tag } from "@shared/schema";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-tar",
  "application/gzip",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default function EvidenceUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: sites } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const { data: assets } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const { data: tags } = useQuery<Tag[]>({ queryKey: ["/api/tags"] });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      if (notes) formData.append("notes", notes);
      if (clientId) formData.append("clientId", clientId);
      if (siteId) formData.append("siteId", siteId);
      if (assetId) formData.append("assetId", assetId);
      if (selectedTags.length > 0) {
        formData.append("tagIds", JSON.stringify(selectedTags));
      }
      if (tagInput.trim()) {
        formData.append("newTags", tagInput.trim());
      }

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/api/evidence"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      toast({ title: "Evidence uploaded successfully" });
      navigate("/evidence");
    },
    onError: (err: Error) => {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, []);

  const handleFileSelect = (f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Maximum file size is 50 MB.",
        variant: "destructive",
      });
      return;
    }
    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const removeTag = (tagId: string) => {
    setSelectedTags((prev) => prev.filter((t) => t !== tagId));
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/evidence")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-upload-title">
            Upload Evidence
          </h1>
          <p className="text-sm text-muted-foreground">
            Add a new evidence file to the vault.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : file
                ? "border-muted"
                : "border-muted hover:border-primary/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-evidence"
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
              data-testid="input-evidence-file"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  data-testid="button-remove-file"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2 cursor-pointer">
                <CloudUpload className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">Drop a file here or click to browse</p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPEG, PDF, TXT, CSV, ZIP up to 50 MB
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Evidence title"
              required
              data-testid="input-evidence-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details about this evidence..."
              rows={3}
              data-testid="input-evidence-notes"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger data-testid="select-evidence-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Site</Label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger data-testid="select-evidence-site">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Asset</Label>
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger data-testid="select-evidence-asset">
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {assets?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Comma-separated tags (e.g. ransomware, backup, critical)"
              data-testid="input-evidence-tags"
            />
            {tags && tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Button
                    key={tag.id}
                    variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedTags((prev) =>
                        prev.includes(tag.id)
                          ? prev.filter((t) => t !== tag.id)
                          : [...prev, tag.id]
                      );
                    }}
                    data-testid={`button-tag-${tag.id}`}
                  >
                    {tag.name}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <Button
            className="w-full"
            disabled={!file || !title || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
            data-testid="button-upload-submit"
          >
            {uploadMutation.isPending ? (
              "Uploading..."
            ) : (
              <>
                <Upload className="w-4 h-4 mr-1" />
                Upload Evidence
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
