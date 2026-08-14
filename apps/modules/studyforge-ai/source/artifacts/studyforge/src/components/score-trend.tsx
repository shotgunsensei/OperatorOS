import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  data: { date: string; score: number }[];
}

/**
 * Compact line chart of recent quiz scores. Skips rendering the chart when
 * there are fewer than two points so we don't show a meaningless flat line.
 */
export function ScoreTrend({ data }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Quiz score trend</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Take a couple of quizzes to see your score trend.
          </p>
        ) : (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
