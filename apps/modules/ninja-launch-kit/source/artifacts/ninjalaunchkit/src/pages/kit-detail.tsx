import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { handlePlanLimitError } from "@/lib/plan-error";
import { useGetKit, useUpdateKit, exportKit, getGetKitQueryKey, ExportKitFormat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, Edit2, Check, ExternalLink, ShieldAlert, Loader2, Sparkles } from "lucide-react";
import { VisualPromoTab } from "@/components/VisualPromoTab";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function KitDetail() {
  const { id } = useParams();
  const kitId = parseInt(id || "0", 10);
  
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: kit, isLoading, error } = useGetKit(kitId, { 
    query: { enabled: !!kitId, queryKey: getGetKitQueryKey(kitId) } 
  });
  
  const updateKit = useUpdateKit();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportKitFormat | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpdateTitle = () => {
    if (!newTitle.trim() || newTitle === kit?.title) {
      setIsEditingTitle(false);
      return;
    }
    
    updateKit.mutate(
      { id: kitId, data: { title: newTitle } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetKitQueryKey(kitId) });
          toast.success("Title updated");
          setIsEditingTitle(false);
        },
        onError: (err) => toast.error("Failed to update title", { description: err.message })
      }
    );
  };

  const handleExport = async (format: ExportKitFormat) => {
    setExportingFormat(format);
    try {
      const data = await exportKit(kitId, { format });
      const blob = new Blob([data.content], { type: data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err) {
      if (!handlePlanLimitError(err, () => setLocation("/pricing"))) {
        toast.error("Export failed", { description: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      setExportingFormat(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 font-mono animate-pulse text-muted-foreground">DECRYPTING_PAYLOAD...</div>;
  }

  if (error || !kit) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold">Payload Not Found</h2>
        <p className="text-muted-foreground mt-2 max-w-md">The requested kit could not be retrieved. It may have been deleted or you don't have access.</p>
        <Link href="/kits">
          <Button className="mt-6 font-mono text-xs">RETURN_TO_DATABASE</Button>
        </Link>
      </div>
    );
  }

  const { content, input } = kit;

  const CopyButton = ({ text, id }: { text: string, id: string }) => (
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-8 w-8 text-muted-foreground hover:text-primary absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card/80 backdrop-blur"
      onClick={() => handleCopy(text, id)}
    >
      {copiedId === id ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <Link href="/kits">
          <Button variant="ghost" size="sm" className="gap-2 font-mono text-xs -ml-3 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> BACK_TO_DATABASE
          </Button>
        </Link>
        <div className="flex gap-2">
          {kit.watermarked && (
            <Badge variant="destructive" className="font-mono text-[10px] animate-pulse">DEMO_WATERMARK_ACTIVE</Badge>
          )}
          <Badge variant="outline" className="font-mono text-[10px] uppercase border-primary/30 text-primary">{input.businessType}</Badge>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-border/40">
        <div className="space-y-1 w-full md:w-auto">
          <p className="text-xs font-mono text-muted-foreground uppercase">TARGET: {input.targetCustomer} | ACTION: {input.desiredAction}</p>
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input 
                  value={newTitle} 
                  onChange={(e) => setNewTitle(e.target.value)} 
                  className="font-bold text-3xl h-12 w-full md:w-[400px] border-primary focus-visible:ring-primary"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateTitle()}
                />
                <Button size="icon" onClick={handleUpdateTitle} disabled={updateKit.isPending}>
                  {updateKit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{kit.title}</h1>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary" onClick={() => { setNewTitle(kit.title); setIsEditingTitle(true); }}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="font-mono text-xs gap-2" onClick={() => handleExport("txt")} disabled={exportingFormat !== null}>
            {exportingFormat === "txt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} TXT
          </Button>
          <Button variant="outline" size="sm" className="font-mono text-xs gap-2" onClick={() => handleExport("markdown")} disabled={exportingFormat !== null}>
            {exportingFormat === "markdown" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} MD
          </Button>
          <Button variant="outline" size="sm" className="font-mono text-xs gap-2" onClick={() => handleExport("json")} disabled={exportingFormat !== null}>
            {exportingFormat === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} JSON
          </Button>
        </div>
      </div>

      <Tabs defaultValue="hero" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto bg-card border border-border/50 justify-start p-1 gap-1 mb-6">
          <TabsTrigger value="hero" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Landing Page</TabsTrigger>
          <TabsTrigger value="ads" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Ads</TabsTrigger>
          <TabsTrigger value="social" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Social & SMS</TabsTrigger>
          <TabsTrigger value="email" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Email Seq.</TabsTrigger>
          <TabsTrigger value="faq" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">FAQ</TabsTrigger>
          <TabsTrigger value="extras" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Extras</TabsTrigger>
          <TabsTrigger value="visual" className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5" data-testid="tab-visual-promo">
            <Sparkles className="h-3 w-3" /> Visual Promo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hero" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-border/50 bg-card/50 relative group col-span-2">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">HERO_SECTION</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">HEADLINE</p>
                  <p className="text-3xl font-bold tracking-tight">{content.heroHeadline}</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">SUBHEADLINE</p>
                  <p className="text-lg text-muted-foreground">{content.subheadline}</p>
                </div>
                <CopyButton text={`${content.heroHeadline}\n\n${content.subheadline}`} id="hero-copy" />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">VALUE_PROPOSITION</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-base leading-relaxed">{content.valueProposition}</p>
                <CopyButton text={content.valueProposition} id="value-prop-copy" />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">OFFER_STACK</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-2">
                  {content.offerStack.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <CopyButton text={content.offerStack.join('\n')} id="offer-stack-copy" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ads" className="space-y-6">
          <div>
            <h3 className="font-mono text-xs text-muted-foreground mb-4">GOOGLE_SEARCH_ADS</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {content.googleAds.map((ad, i) => (
                <Card key={i} className="border-border/50 bg-card/50 relative group">
                  <CardContent className="p-4 space-y-2">
                    <p className="font-bold text-primary text-lg leading-tight">{ad.headline}</p>
                    <p className="text-sm">{ad.description}</p>
                    <div className="flex gap-1 pt-2">
                      <Badge variant="outline" className="text-[9px] font-mono">Ad</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono self-center">www.yourwebsite.com</span>
                    </div>
                    <CopyButton text={`Headline: ${ad.headline}\nDescription: ${ad.description}`} id={`g-ad-${i}`} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">FB/IG_HEADLINES</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {content.adHeadlines.map((hl, i) => (
                  <div key={i} className="p-3 bg-muted/20 rounded border border-border/30 text-sm font-medium">
                    {hl}
                  </div>
                ))}
                <CopyButton text={content.adHeadlines.join('\n\n')} id="ad-headlines" />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">PRIMARY_TEXT</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {content.adDescriptions.map((desc, i) => (
                  <div key={i} className="p-3 bg-muted/20 rounded border border-border/30 text-sm whitespace-pre-wrap">
                    {desc}
                  </div>
                ))}
                <CopyButton text={content.adDescriptions.join('\n\n---\n\n')} id="ad-desc" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="social" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-mono text-primary">SOCIAL_POSTS</CardTitle>
                <Badge className="font-mono text-[10px]">{content.socialPosts.length} POSTS</Badge>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {content.socialPosts.map((post, i) => (
                  <div key={i} className="p-4 bg-muted/20 rounded-md border border-border/50 text-sm whitespace-pre-wrap relative group/post">
                    {post}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary absolute top-2 right-2 opacity-0 group-hover/post:opacity-100 bg-background/80" onClick={() => handleCopy(post, `post-${i}`)}>
                      {copiedId === `post-${i}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 relative group h-fit">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">SMS_BLASTS</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {content.smsPromos.map((sms, i) => (
                  <div key={i} className="p-3 bg-[#0a192f] border-[#1d4ed8]/30 rounded-2xl rounded-tl-sm border text-sm max-w-[85%] relative group/sms">
                    {sms}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary absolute top-1 -right-8 opacity-0 group-hover/sms:opacity-100" onClick={() => handleCopy(sms, `sms-${i}`)}>
                      {copiedId === `sms-${i}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          {content.emailSequence.map((email, i) => (
            <Card key={i} className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30 bg-muted/10">
                <div className="flex justify-between items-center">
                  <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">DAY_{email.day}</Badge>
                  <p className="font-bold">Subject: {email.subject}</p>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="whitespace-pre-wrap text-sm">{email.body}</div>
                <CopyButton text={`Subject: ${email.subject}\n\n${email.body}`} id={`email-${i}`} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="faq" className="space-y-4">
          <Card className="border-border/50 bg-card/50 relative group">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-sm font-mono text-primary">FREQUENTLY_ASKED_QUESTIONS</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-6">
              {content.faq.map((faq, i) => (
                <div key={i} className="space-y-2">
                  <h4 className="font-bold text-lg flex items-start gap-2">
                    <span className="text-primary font-mono text-sm mt-1">Q:</span>
                    {faq.question}
                  </h4>
                  <p className="text-muted-foreground pl-6 border-l-2 border-border ml-2">{faq.answer}</p>
                </div>
              ))}
              <CopyButton text={content.faq.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')} id="faq-copy" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extras" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">CTA_BUTTONS</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 flex flex-wrap gap-3">
                {content.ctaButtons.map((cta, i) => (
                  <Button key={i} variant={i === 0 ? "default" : "secondary"} className="shadow-md">
                    {cta}
                  </Button>
                ))}
                <CopyButton text={content.ctaButtons.join('\n')} id="cta-copy" />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 relative group">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">QR_FLYER_COPY</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="p-6 bg-muted/20 border border-border/50 rounded-lg text-center space-y-4">
                  <h2 className="text-2xl font-black uppercase">{content.heroHeadline.split(' ').slice(0, 5).join(' ')}...</h2>
                  <p className="font-medium text-primary">{content.offerStack[0]}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content.qrFlyerCopy}</p>
                  <div className="mx-auto w-32 h-32 bg-white flex items-center justify-center border-4 border-foreground">
                    <span className="text-background font-mono text-xs font-bold">QR_CODE_HERE</span>
                  </div>
                  <p className="font-bold">{content.ctaButtons[0]}</p>
                </div>
                <CopyButton text={content.qrFlyerCopy} id="qr-copy" />
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 relative group col-span-2">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-mono text-primary">LAUNCH_CHECKLIST</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid md:grid-cols-2 gap-y-3 gap-x-6">
                  {content.launchChecklist.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded border border-primary/50 flex-shrink-0" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
                <CopyButton text={content.launchChecklist.map(i => `[ ] ${i}`).join('\n')} id="checklist-copy" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="visual" className="space-y-4">
          <VisualPromoTab kitId={kitId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}