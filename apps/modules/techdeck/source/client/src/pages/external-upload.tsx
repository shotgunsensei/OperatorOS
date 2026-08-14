import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, CheckCircle, XCircle, Shield, Lock, FileText, AlertTriangle } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function ExternalUploadPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const { data: request, isLoading, error } = useQuery<any>({
    queryKey: ["/api/public/intake", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/intake/${token}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Not found" }));
        throw new Error(data.message);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch(`/api/public/intake/${token}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAuthError(data.message || "Invalid password");
      } else {
        setAuthenticated(true);
      }
    } catch {
      setAuthError("Connection error");
    }
    setAuthLoading(false);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (request?.requiresPassword && password) {
      formData.append("password", password);
    }

    try {
      const res = await fetch(`/api/public/intake/${token}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.message || "Upload failed");
        setUploading(false);
        return;
      }
      setUploadResult(data);
    } catch {
      setUploadError("Connection error. Please try again.");
    }
    setUploading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-orange-500" />
            <h2 className="text-xl font-bold mb-2" data-testid="text-upload-error">Upload Unavailable</h2>
            <p className="text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (uploadResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            <h2 className="text-xl font-bold" data-testid="text-upload-success">Upload Successful</h2>
            <p className="text-muted-foreground">
              {uploadResult.uploadedCount} file{uploadResult.uploadedCount !== 1 ? "s" : ""} uploaded successfully.
            </p>
            <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
              {uploadResult.files?.map((f: any) => (
                <div key={f.id} className="flex justify-between">
                  <span className="truncate">{f.name}</span>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">You may close this window.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request?.requiresPassword && !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <CardTitle data-testid="text-password-required">Password Required</CardTitle>
            <CardDescription>Enter the password to access this upload area</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-upload-password" />
              </div>
              {authError && <p className="text-sm text-destructive">{authError}</p>}
              <Button type="submit" className="w-full" disabled={authLoading} data-testid="button-verify-password">
                {authLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                Verify
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <Shield className="w-10 h-10 mx-auto mb-3 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-upload-title">{request?.title || "Secure File Upload"}</h1>
          {request?.spaceName && <p className="text-muted-foreground">{request.spaceName}</p>}
        </div>

        {request?.instructions && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm whitespace-pre-wrap">{request.instructions}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              data-testid="dropzone-upload"
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium mb-1">Drag and drop files here</p>
              <p className="text-sm text-muted-foreground mb-3">or click to browse</p>
              <input type="file" multiple onChange={handleFileSelect} className="hidden" id="file-input" />
              <Button variant="outline" onClick={() => document.getElementById("file-input")?.click()} data-testid="button-browse-files">
                Browse Files
              </Button>
              {request?.allowedFileTypes?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">Allowed types: {request.allowedFileTypes.join(", ")}</p>
              )}
              {request?.maxUploads && (
                <p className="text-xs text-muted-foreground mt-1">
                  {request.maxUploads - request.uploadCount} upload{request.maxUploads - request.uploadCount !== 1 ? "s" : ""} remaining
                </p>
              )}
            </div>

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`file-item-${i}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{file.name}</span>
                      <span className="text-muted-foreground flex-shrink-0">{formatBytes(file.size)}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(i)}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {uploadError && <p className="text-sm text-destructive mt-3">{uploadError}</p>}

            {files.length > 0 && (
              <Button className="w-full mt-4" onClick={handleUpload} disabled={uploading} data-testid="button-submit-upload">
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Upload {files.length} File{files.length !== 1 ? "s" : ""}
              </Button>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Powered by Tech Deck Secure Intake
        </p>
      </div>
    </div>
  );
}
