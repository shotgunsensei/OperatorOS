import { useState } from "react";
import { X, Download, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EvidencePreviewProps {
  id: string;
  title: string;
  fileType: string;
  fileName: string;
}

export function EvidencePreviewButton({ id, title, fileType, fileName }: EvidencePreviewProps) {
  const [open, setOpen] = useState(false);
  const isImage = fileType.startsWith("image/");
  const isPdf = fileType === "application/pdf";
  const canPreview = isImage || isPdf;

  if (!canPreview) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid={`button-preview-${id}`}
      >
        <Maximize2 className="w-3.5 h-3.5 mr-1" />
        Preview
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between gap-4">
            <DialogTitle className="text-base truncate">{title}</DialogTitle>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/evidence/${id}/download`} download data-testid="button-preview-download">
                <Download className="w-3.5 h-3.5 mr-1" />
                Download
              </a>
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {isImage && (
              <img
                src={`/api/evidence/${id}/download`}
                alt={title}
                className="w-full h-auto rounded-md object-contain max-h-[70vh]"
                data-testid="img-preview-full"
              />
            )}
            {isPdf && (
              <iframe
                src={`/api/evidence/${id}/download#toolbar=0`}
                title={title}
                className="w-full rounded-md border-0"
                style={{ height: "70vh" }}
                data-testid="iframe-preview-pdf"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
