import { useGetStudySet, getGetStudySetQueryKey } from "@workspace/api-client-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Printer, Flame } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudySetReview() {
  const [, params] = useRoute("/sets/:id/review");
  const id = parseInt(params?.id || "0", 10);
  
  const { data: set, isLoading } = useGetStudySet(id, { 
    query: { enabled: !!id, queryKey: getGetStudySetQueryKey(id) } 
  });

  useDocumentMeta(set ? `${set.title} Review Sheet` : "Review Sheet");

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  }

  if (!set || !set.reviewSheet) {
    return <div className="text-center py-20">Review sheet not available.</div>;
  }

  const exportAsMarkdown = () => {
    let md = `# ${set.title} - Review Sheet\n\n`;
    
    set.reviewSheet.sections.forEach(section => {
      md += `## ${section.heading}\n`;
      section.bullets.forEach(bullet => {
        md += `- ${bullet}\n`;
      });
      md += `\n`;
    });

    if (set.reviewSheet.cramSection.length > 0) {
      md += `## Last Minute Cram\n`;
      set.reviewSheet.cramSection.forEach(bullet => {
        md += `- ${bullet}\n`;
      });
    }

    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${set.title.replace(/\s+/g, '_')}_review.md`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/sets/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Set
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportAsMarkdown}>
            <Download className="mr-2 h-4 w-4" /> Markdown
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <div className="print-container">
        <Card className="border-none shadow-none print:shadow-none print:border-0">
          <CardHeader className="text-center pb-8 border-b border-border/40">
            <h1 className="text-3xl font-bold mb-2">{set.title}</h1>
            <p className="text-muted-foreground uppercase tracking-widest text-sm">{set.subject} • Review Sheet</p>
          </CardHeader>
          <CardContent className="pt-8 space-y-10">
            
            <div className="space-y-8">
              {set.reviewSheet.sections.map((sec, i) => (
                <section key={i} className="break-inside-avoid">
                  <h2 className="text-xl font-bold mb-4 text-primary border-b border-border/20 pb-2">{sec.heading}</h2>
                  <ul className="space-y-3">
                    {sec.bullets.map((bullet, j) => (
                      <li key={j} className="flex gap-3 text-muted-foreground leading-relaxed">
                        <span className="text-primary mt-1">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {set.reviewSheet.cramSection && set.reviewSheet.cramSection.length > 0 && (
              <section className="bg-accent/5 border border-accent/20 p-6 rounded-xl break-inside-avoid mt-12">
                <h2 className="text-xl font-bold mb-4 text-accent flex items-center gap-2">
                  <Flame className="h-5 w-5" /> Last Minute Cram
                </h2>
                <ul className="space-y-3">
                  {set.reviewSheet.cramSection.map((bullet, j) => (
                    <li key={j} className="flex gap-3 text-foreground font-medium">
                      <span className="text-accent mt-1 font-bold">›</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            
          </CardContent>
        </Card>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}} />
    </div>
  );
}