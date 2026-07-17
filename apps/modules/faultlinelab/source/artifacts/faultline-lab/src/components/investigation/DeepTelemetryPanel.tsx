import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, Activity, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';

interface Series {
  id: string;
  label: string;
  color: string;
  unit: string;
  values: number[];
  baseline: number;
  variance: number;
}

const POINTS = 60;

export default function DeepTelemetryPanel() {
  const currentCaseDef = useAppStore((s) => s.currentCaseDef);
  const currentCaseState = useAppStore((s) => s.currentCaseState);

  const initialSeries = useMemo<Series[]>(() => {
    const sevWeight =
      currentCaseDef?.symptoms.reduce((acc, s) => {
        const w = { low: 5, medium: 15, high: 30, critical: 50 }[s.severity] || 10;
        return acc + w;
      }, 0) || 20;
    return [
      { id: 'cpu', label: 'CPU', color: '#22d3ee', unit: '%', values: [], baseline: 30 + sevWeight * 0.3, variance: 12 },
      { id: 'mem', label: 'Memory', color: '#a78bfa', unit: '%', values: [], baseline: 45 + sevWeight * 0.2, variance: 6 },
      { id: 'net', label: 'Net I/O', color: '#34d399', unit: 'MB/s', values: [], baseline: 8 + sevWeight * 0.05, variance: 5 },
      { id: 'lat', label: 'Latency', color: '#fbbf24', unit: 'ms', values: [], baseline: 40 + sevWeight * 0.4, variance: 18 },
    ];
  }, [currentCaseDef]);

  const [series, setSeries] = useState<Series[]>(initialSeries);
  const [anomalies, setAnomalies] = useState<{ t: number; series: string; value: number }[]>([]);
  const tickRef = useRef(0);

  useEffect(() => {
    setSeries(initialSeries);
    setAnomalies([]);
    tickRef.current = 0;
  }, [initialSeries]);

  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;
      setSeries((prev) =>
        prev.map((s) => {
          const noise = (Math.random() - 0.5) * s.variance * 2;
          const spike = Math.random() < 0.05 ? s.variance * 2.5 : 0;
          const next = Math.max(0, Math.min(100, s.baseline + noise + spike));
          const values = [...s.values, next].slice(-POINTS);
          if (spike > 0) {
            setAnomalies((a) => [...a, { t: tickRef.current, series: s.label, value: next }].slice(-20));
          }
          return { ...s, values };
        })
      );
    }, 800);
    return () => clearInterval(id);
  }, []);

  const evidenceFound = currentCaseState?.unlockedEvidence.length || 0;
  const totalEvidence = currentCaseDef?.evidence.length || 0;

  return (
    <div className="flex flex-col h-full bg-[#0c1017] rounded-lg border border-purple-900/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#111822] border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <Gauge size={14} className="text-purple-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Deep Telemetry · live stream
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
          <span>Evidence {evidenceFound}/{totalEvidence}</span>
          <span className="text-amber-300">{anomalies.length} anomalies</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {series.map((s) => (
          <MetricCard key={s.id} series={s} />
        ))}

        <div className="md:col-span-2 bg-[#0a0e14] border border-zinc-800/50 rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={12} className="text-amber-300" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Anomaly Heatmap (last 60 ticks)
            </span>
          </div>
          <Heatmap series={series} />
        </div>

        <div className="md:col-span-2 bg-[#0a0e14] border border-zinc-800/50 rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={12} className="text-amber-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Anomaly Markers
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[11px]">
            {anomalies.length === 0 && (
              <div className="text-zinc-600 text-center py-2">Waiting for anomalies…</div>
            )}
            {[...anomalies].reverse().map((a, i) => (
              <div key={i} className="flex justify-between text-zinc-400 border-l-2 border-amber-500/40 pl-2">
                <span>t+{a.t}s · {a.series}</span>
                <span className="text-amber-300">{a.value.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ series }: { series: Series }) {
  const last = series.values[series.values.length - 1] ?? 0;
  const max = Math.max(100, ...series.values);
  const w = 240;
  const h = 60;
  const points = series.values
    .map((v, i) => `${(i / (POINTS - 1)) * w},${h - (v / max) * h}`)
    .join(' ');

  return (
    <div className="bg-[#0a0e14] border border-zinc-800/50 rounded p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          {series.label}
        </span>
        <span className="font-mono text-sm" style={{ color: series.color }}>
          {last.toFixed(1)} {series.unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16">
        <polyline fill="none" stroke={series.color} strokeWidth="1.5" points={points} />
        {series.values.map((v, i) =>
          v > series.baseline + series.variance * 1.8 ? (
            <circle
              key={i}
              cx={(i / (POINTS - 1)) * w}
              cy={h - (v / max) * h}
              r="2"
              fill="#fbbf24"
            />
          ) : null
        )}
      </svg>
    </div>
  );
}

function Heatmap({ series }: { series: Series[] }) {
  return (
    <div className="space-y-1">
      {series.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 w-16">{s.label}</span>
          <div className="flex-1 grid grid-cols-[repeat(60,_minmax(0,_1fr))] gap-px">
            {Array.from({ length: POINTS }).map((_, i) => {
              const v = s.values[i];
              if (v === undefined) {
                return <div key={i} className="h-3 bg-zinc-900/40" />;
              }
              const intensity = Math.min(1, v / 100);
              return (
                <div
                  key={i}
                  className="h-3"
                  style={{ backgroundColor: s.color, opacity: 0.15 + intensity * 0.85 }}
                  title={`${v.toFixed(1)} ${s.unit}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
