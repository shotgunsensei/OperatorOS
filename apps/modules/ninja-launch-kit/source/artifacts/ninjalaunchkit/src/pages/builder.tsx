import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateKit,
  usePreviewKit,
  useListBrandProfiles,
  useGetLaunchTemplate,
  getGetLaunchTemplateQueryKey,
  getListKitsQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Zap, Eye, Save } from "lucide-react";
import { handlePlanLimitError } from "@/lib/plan-error";

const builderSchema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  businessType: z.string().min(2, "Business type is required"),
  targetCustomer: z.string().min(5, "Target customer is required"),
  offer: z.string().min(5, "Core offer is required"),
  price: z.string().optional(),
  location: z.string().optional(),
  tone: z.enum(["bold", "friendly", "professional", "playful", "urgent", "premium"]),
  painPoint: z.string().min(5, "Pain point is required"),
  desiredAction: z.string().min(5, "Desired action is required"),
  promoDeadline: z.string().optional(),
  websiteUrl: z.string().optional(),
  socialLinks: z.string().optional(),
  brandProfileId: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof builderSchema>;

export default function Builder() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createKit = useCreateKit();
  const previewKit = usePreviewKit();
  const { data: brands } = useListBrandProfiles();

  const [previewData, setPreviewData] = useState<any>(null);

  // Read ?template=<slug> from the URL (wouter does not parse query strings).
  const templateSlug = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("template") ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const { data: templateData, error: templateError } = useGetLaunchTemplate(templateSlug, {
    query: { enabled: !!templateSlug, queryKey: getGetLaunchTemplateQueryKey(templateSlug) },
  });

  useEffect(() => {
    if (templateSlug && templateError) {
      toast.error(`Template "${templateSlug}" not found`);
    }
  }, [templateSlug, templateError]);

  const form = useForm<FormValues>({
    resolver: zodResolver(builderSchema),
    defaultValues: {
      businessName: "",
      businessType: "Local Service",
      targetCustomer: "",
      offer: "",
      price: "",
      location: "",
      tone: "bold",
      painPoint: "",
      desiredAction: "Buy Now",
      promoDeadline: "",
      websiteUrl: "",
      socialLinks: "",
    },
  });

  useEffect(() => {
    if (!templateData) return;
    if (templateData.locked || !templateData.prefill) {
      toast.error(`The "${templateData.name}" template requires the ${templateData.tier.toUpperCase()} plan.`, {
        action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
      });
      return;
    }
    const p = templateData.prefill;
    form.reset({
      businessName: p.businessName ?? "",
      businessType: p.businessType ?? "Local Service",
      targetCustomer: p.targetCustomer ?? "",
      offer: p.offer ?? "",
      price: p.price ?? "",
      location: p.location ?? "",
      tone: (p.tone as FormValues["tone"]) ?? "bold",
      painPoint: p.painPoint ?? "",
      desiredAction: p.desiredAction ?? "Buy Now",
      promoDeadline: p.promoDeadline ?? "",
      websiteUrl: p.websiteUrl ?? "",
      socialLinks: p.socialLinks ?? "",
    });
    toast.success(`Loaded "${templateData.name}" template — review and generate`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateData]);

  function onSubmit(values: FormValues) {
    createKit.mutate(
      { data: { input: values } },
      {
        onSuccess: (newKit) => {
          queryClient.invalidateQueries({ queryKey: getListKitsQueryKey() });
          toast.success("Launch kit generated & saved!");
          setLocation(`/kits/${newKit.id}`);
        },
        onError: (err) => {
          if (handlePlanLimitError(err, () => setLocation("/pricing"))) return;
          toast.error("Failed to generate kit", { description: err.message });
        },
      }
    );
  }

  async function handlePreview() {
    const isValid = await form.trigger();
    if (!isValid) return;
    const values = form.getValues();

    previewKit.mutate(
      { data: { input: values } },
      {
        onSuccess: (data) => {
          setPreviewData(data.content);
          toast.success("Preview generated successfully");
        },
        onError: (err) => {
          toast.error("Preview failed", { description: err.message });
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Launch Kit Builder</h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">Input parameters to generate weaponized copy</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="font-mono text-primary flex items-center gap-2">
              <Zap className="h-5 w-5" />
              INPUT_PARAMETERS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="businessName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono">BUSINESS_NAME *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="businessType" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono">BUSINESS_TYPE *</FormLabel>
                      <Select key={`bt-${templateSlug || "none"}`} onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Local Service">Local Service</SelectItem>
                          <SelectItem value="Online Product">Online Product</SelectItem>
                          <SelectItem value="Course/Coaching">Course/Coaching</SelectItem>
                          <SelectItem value="Restaurant/Cafe">Restaurant/Cafe</SelectItem>
                          <SelectItem value="Musician/Artist">Musician/Artist</SelectItem>
                          <SelectItem value="Mechanic/Trade">Mechanic/Trade</SelectItem>
                          <SelectItem value="Consultant">Consultant</SelectItem>
                          <SelectItem value="Agency">Agency</SelectItem>
                          <SelectItem value="E-commerce">E-commerce</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="brandProfileId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">BRAND_PROFILE (OPTIONAL)</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select brand profile" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None (Default Styling)</SelectItem>
                        {brands?.map(b => (
                          <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="targetCustomer" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">TARGET_CUSTOMER *</FormLabel>
                    <FormControl><Input placeholder="e.g. Busy professionals in tech" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="painPoint" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">PAIN_POINT *</FormLabel>
                    <FormControl><Input placeholder="e.g. Wasting time on manual tasks" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="offer" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">CORE_OFFER *</FormLabel>
                    <FormControl><Textarea placeholder="e.g. A 4-week automated marketing system" className="h-20" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono">PRICE (OPTIONAL)</FormLabel>
                      <FormControl><Input placeholder="$199" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tone" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono">BRAND_TONE *</FormLabel>
                      <Select key={`tone-${templateSlug || "none"}`} onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="bold">Bold & Aggressive</SelectItem>
                          <SelectItem value="friendly">Friendly & Approachable</SelectItem>
                          <SelectItem value="professional">Corporate & Professional</SelectItem>
                          <SelectItem value="playful">Playful & Fun</SelectItem>
                          <SelectItem value="urgent">Urgent & Direct</SelectItem>
                          <SelectItem value="premium">Premium & Exclusive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="desiredAction" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono">DESIRED_ACTION *</FormLabel>
                      <FormControl><Input placeholder="e.g. Book a call" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="promoDeadline" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-mono">DEADLINE (OPTIONAL)</FormLabel>
                      <FormControl><Input placeholder="e.g. Friday at midnight" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="button" variant="outline" className="flex-1 font-mono text-xs" onClick={handlePreview} disabled={previewKit.isPending || createKit.isPending}>
                    {previewKit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                    GENERATE_PREVIEW
                  </Button>
                  <Button type="submit" className="flex-1 font-mono text-xs shadow-[0_0_10px_rgba(220,38,38,0.4)]" disabled={createKit.isPending || previewKit.isPending}>
                    {createKit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    GENERATE_AND_SAVE
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50 h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle className="font-mono text-muted-foreground flex items-center gap-2">
              <Eye className="h-5 w-5" />
              PREVIEW_OUTPUT
            </CardTitle>
          </CardHeader>
          <CardContent>
            {previewData ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-md border border-border/50">
                  <h3 className="font-bold text-lg mb-2">{previewData.heroHeadline}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{previewData.subheadline}</p>
                  <Button size="sm" className="w-full">{previewData.ctaButtons?.[0] || 'Take Action'}</Button>
                </div>
                <div className="p-4 bg-muted/50 rounded-md border border-border/50 text-sm">
                  <h4 className="font-bold text-xs font-mono text-primary mb-2">EMAIL_PREVIEW (DAY 1)</h4>
                  <p className="font-semibold">Subject: {previewData.emailSequence?.[0]?.subject}</p>
                  <p className="text-muted-foreground mt-2 line-clamp-3">{previewData.emailSequence?.[0]?.body}</p>
                </div>
                <div className="text-xs text-center text-muted-foreground font-mono mt-4 pt-4 border-t border-border/30">
                  FULL PAYLOAD AVAILABLE UPON SAVE
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Zap className="h-12 w-12 mb-4 opacity-20" />
                <p className="font-mono text-sm">AWAITING_PARAMETERS</p>
                <p className="text-xs mt-2 max-w-xs text-center">Fill out the form and generate a preview to see sample output here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}