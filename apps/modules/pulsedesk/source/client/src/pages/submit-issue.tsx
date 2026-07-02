import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams, useSearch } from "wouter";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS, type Department, type Asset } from "@shared/schema";
import { AlertCircle, Cpu } from "lucide-react";

function inferRoomFromLocation(location: string): string {
  const match = location.match(/\broom\s+([a-z0-9-]+)/i);
  return match?.[1] ?? "";
}

export default function SubmitIssue() {
  const [, setLocation] = useLocation();
  const { assetId: routeAssetId } = useParams<{ assetId?: string }>();
  const search = useSearch();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [departmentId, setDepartmentId] = useState("");
  const [location_, setLocation_] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [room, setRoom] = useState("");
  const [assetId, setAssetId] = useState("");
  const [vendorReference, setVendorReference] = useState("");
  const [isPatientImpacting, setIsPatientImpacting] = useState(false);
  const [isRepeatIssue, setIsRepeatIssue] = useState(false);
  const [assetPrefillApplied, setAssetPrefillApplied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: departments } = useQuery<Department[]>({ queryKey: ["/api/departments"] });
  const { data: assets } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });
  const requestedAssetId = routeAssetId || new URLSearchParams(search).get("assetId") || "";
  const selectedAsset = useMemo(
    () => assets?.find((asset) => asset.id === assetId),
    [assets, assetId]
  );

  useEffect(() => {
    if (!requestedAssetId || !assets || assetPrefillApplied) return;
    const asset = assets.find((item) => item.id === requestedAssetId);
    if (!asset) return;
    setAssetId(asset.id);
    setDepartmentId(asset.departmentId || "");
    setLocation_(asset.location || "");
    setRoom(inferRoomFromLocation(asset.location || ""));
    setCategory("medical_equipment");
    setTitle((current) => current || `Issue with ${asset.assetTag}: ${asset.name}`);
    setDescription((current) => current || [
      `Asset: ${asset.assetTag} - ${asset.name}`,
      asset.assetType ? `Type: ${asset.assetType}` : "",
      asset.serviceVendor ? `Service vendor: ${asset.serviceVendor}` : "",
      "",
    ].filter(Boolean).join("\n"));
    setVendorReference(asset.serviceVendor ? `Vendor: ${asset.serviceVendor}` : "");
    setAssetPrefillApplied(true);
  }, [assetPrefillApplied, assets, requestedAssetId]);

  const submitMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tickets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: "Issue reported successfully", description: "Your issue has been logged and the operations team has been notified." });
      setLocation("/tickets");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    },
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "A brief description of the issue is required";
    if (title.trim().length > 0 && title.trim().length < 5) newErrors.title = "Please provide a more descriptive title (at least 5 characters)";
    if (isPatientImpacting && !description.trim()) newErrors.description = "Please describe the patient impact";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    submitMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      departmentId: departmentId && departmentId !== "none" ? departmentId : null,
      location: location_.trim(),
      building: building.trim(),
      floor: floor.trim(),
      room: room.trim(),
      assetId: assetId && assetId !== "none" ? assetId : null,
      vendorReference: vendorReference.trim(),
      isPatientImpacting,
      isRepeatIssue,
    });
  };

  const FieldError = ({ field }: { field: string }) => {
    if (!errors[field]) return null;
    return (
      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        {errors[field]}
      </p>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Report Issue"
        description="Log a new issue for your facility's operations team"
      />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Issue Details</CardTitle>
              <CardDescription>Describe the problem clearly so the team can respond quickly</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">What's the issue? *</Label>
                <Input
                  id="title"
                  data-testid="input-title"
                  placeholder="Brief description of the problem..."
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors({ ...errors, title: "" }); }}
                  className={`mt-1 ${errors.title ? "border-destructive" : ""}`}
                />
                <FieldError field="title" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="mt-1" data-testid="select-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TICKET_CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">Helps route to the right team</p>
                </div>
                <div>
                  <Label>Urgency</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="mt-1" data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={(value) => setDepartmentId(value === "none" ? "" : value)}>
                  <SelectTrigger className="mt-1" data-testid="select-department">
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Description {isPatientImpacting ? "*" : ""}</Label>
                <Textarea
                  id="description"
                  data-testid="input-description"
                  placeholder="Provide more details about the issue, when it started, and any troubleshooting already attempted..."
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); if (errors.description) setErrors({ ...errors, description: "" }); }}
                  rows={4}
                  className={`mt-1 ${errors.description ? "border-destructive" : ""}`}
                />
                <FieldError field="description" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Location</CardTitle>
              <CardDescription>Where in the facility is the issue occurring?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="location">Location Description</Label>
                <Input
                  id="location"
                  data-testid="input-location"
                  placeholder="e.g., Building A, Floor 2, Near nurses station"
                  value={location_}
                  onChange={(e) => setLocation_(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="building">Building</Label>
                  <Input id="building" data-testid="input-building" placeholder="A" value={building} onChange={(e) => setBuilding(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="floor">Floor</Label>
                  <Input id="floor" data-testid="input-floor" placeholder="2" value={floor} onChange={(e) => setFloor(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="room">Room</Label>
                  <Input id="room" data-testid="input-room" placeholder="205" value={room} onChange={(e) => setRoom(e.target.value)} className="mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Affected Equipment</Label>
                <Select value={assetId} onValueChange={(value) => setAssetId(value === "none" ? "" : value)}>
                  <SelectTrigger className="mt-1" data-testid="select-asset">
                    <SelectValue placeholder="Select equipment (if applicable)..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {assets?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.assetTag} - {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAsset && (
                <div className="rounded-lg border bg-muted/30 p-3" data-testid="asset-prefill-context">
                  <div className="flex items-start gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{selectedAsset.assetTag} - {selectedAsset.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[selectedAsset.assetType, selectedAsset.location, selectedAsset.serviceVendor].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="vendor-reference">Vendor Reference</Label>
                <Input
                  id="vendor-reference"
                  data-testid="input-vendor-reference"
                  value={vendorReference}
                  onChange={(e) => setVendorReference(e.target.value)}
                  placeholder="Vendor name, work order, or service reference"
                  className="mt-1"
                />
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="patient-impacting"
                    data-testid="check-patient-impacting"
                    checked={isPatientImpacting}
                    onCheckedChange={(v) => setIsPatientImpacting(!!v)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="patient-impacting" className="text-sm font-normal cursor-pointer">
                      This issue is impacting patient care or safety
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Flags the issue for priority triage</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="repeat-issue"
                    data-testid="check-repeat-issue"
                    checked={isRepeatIssue}
                    onCheckedChange={(v) => setIsRepeatIssue(!!v)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="repeat-issue" className="text-sm font-normal cursor-pointer">
                      This is a repeat or recurring issue
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Helps identify patterns that need root-cause resolution</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              type="submit"
              data-testid="button-submit-issue"
              disabled={submitMutation.isPending}
              className="flex-1"
            >
              {submitMutation.isPending ? "Submitting..." : "Report Issue"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setLocation("/tickets")} data-testid="button-cancel-issue">
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
