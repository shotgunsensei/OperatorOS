import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";

type Day = { date: string; count: number };

interface Props {
  current: number;
  longest: number;
  activity: Day[];
}

/**
 * Compact streak panel: shows current/longest streak and the last 14 days
 * of activity as a heatmap row. Activity comes from the dashboard endpoint.
 */
export function StreakWidget({ current, longest, activity }: Props) {
  const last14 = activity.slice(-14);
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-500/15 text-orange-500 flex items-center justify-center">
              <Flame className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none">{current}</div>
              <div className="text-xs text-muted-foreground mt-1">Day streak</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">{longest}</div>
            <div className="text-xs text-muted-foreground">Longest</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-2">Last 14 days</div>
          <div className="flex gap-1" role="list" aria-label="Activity for the last 14 days">
            {last14.map((d) => {
              const intensity =
                d.count === 0
                  ? "bg-muted/40"
                  : d.count === 1
                    ? "bg-primary/30"
                    : d.count === 2
                      ? "bg-primary/55"
                      : "bg-primary/85";
              return (
                <div
                  key={d.date}
                  role="listitem"
                  title={`${d.date}: ${d.count} ${d.count === 1 ? "action" : "actions"}`}
                  className={`h-6 w-6 rounded ${intensity}`}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
