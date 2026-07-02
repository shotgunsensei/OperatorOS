import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, parseISO } from "date-fns";

interface RevenueChartProps {
  data: { date: string; amount: number }[];
}

function formatDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "MMM d");
  } catch {
    return dateStr;
  }
}

function formatDollar(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

export function RevenueChart({ data }: RevenueChartProps) {
  const hasData = data.some((d) => d.amount > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No revenue recorded in the last 30 days
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval={6}
        />
        <YAxis
          tickFormatter={formatDollar}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          formatter={(val: number) => [`$${val.toFixed(2)}`, "Revenue"]}
          labelFormatter={formatDate}
          contentStyle={{
            fontSize: 12,
            borderRadius: "6px",
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
          }}
        />
        <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={`cell-${i}`}
              fill={entry.amount > 0 ? "hsl(217 91% 35%)" : "hsl(var(--muted))"}
              opacity={entry.amount > 0 ? 1 : 0.4}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
