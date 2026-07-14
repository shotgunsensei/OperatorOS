import { useListActivity } from "@workspace/api-client-react";

export default function Activity() {
  const { data: activities, isLoading } = useListActivity();

  if (isLoading) return <div className="p-8 animate-pulse"><div className="h-8 w-48 bg-muted rounded mb-8"></div></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-8">Activity Log</h1>
      
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="divide-y divide-border">
          {activities?.map((activity) => (
            <div key={activity.id} className="p-4 flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                {activity.userName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm">
                  <span className="font-medium text-foreground">{activity.userName}</span>
                  {" "}
                  <span className="text-muted-foreground">{activity.action}</span>
                  {" "}
                  <span className="font-medium text-foreground">{activity.entityName}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(activity.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {(!activities || activities.length === 0) && (
            <div className="p-8 text-center text-muted-foreground">No recent activity.</div>
          )}
        </div>
      </div>
    </div>
  );
}