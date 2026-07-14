import { useGetProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export default function Profile() {
  const { data: profile, isLoading } = useGetProfile({ query: { queryKey: getGetProfileQueryKey() } });

  if (isLoading) return <div className="p-8 animate-pulse"><div className="h-8 w-48 bg-muted rounded mb-8"></div></div>;
  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-8">Your Profile</h1>
      
      <div className="bg-card border border-border rounded-lg p-6 max-w-2xl">
        <div className="flex items-center gap-6 mb-8">
          <div className="w-20 h-20 rounded-full bg-primary/20 text-primary flex items-center justify-center text-2xl font-bold shadow-inner">
            {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl font-bold">{profile.firstName} {profile.lastName}</h2>
            <p className="text-muted-foreground">{profile.role} • {profile.email}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Phone</label>
              <p className="mt-1">{profile.phone || "Not provided"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Job Title</label>
              <p className="mt-1">{profile.jobTitle || "Not provided"}</p>
            </div>
          </div>
          <div className="pt-4">
            <Button variant="outline">Edit Profile</Button>
          </div>
        </div>
      </div>
    </div>
  );
}