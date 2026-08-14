import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  ASSET_STATUS_LABELS,
  SUPPLY_STATUS_LABELS,
  FACILITY_STATUS_LABELS,
} from "@shared/schema";

const ASSET_STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  under_service: "bg-amber-50 text-amber-700 border-amber-200",
  retired: "bg-slate-100 text-slate-600 border-slate-200",
  offline: "bg-rose-50 text-rose-700 border-rose-200",
};

const SUPPLY_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-sky-50 text-sky-700 border-sky-200",
  ordered: "bg-violet-50 text-violet-700 border-violet-200",
  fulfilled: "bg-emerald-50 text-emerald-700 border-emerald-200",
  denied: "bg-rose-50 text-rose-700 border-rose-200",
};

const FACILITY_PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-sky-50 text-sky-700 border-sky-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  emergency: "bg-rose-50 text-rose-700 border-rose-200",
};

const SLA_STATE_LABELS: Record<string, string> = {
  on_track: "On Track",
  due_soon: "Due Soon",
  overdue: "Overdue",
  blocked: "Blocked",
};

const SLA_STATE_COLORS: Record<string, string> = {
  on_track: "bg-emerald-50 text-emerald-700 border-emerald-200",
  due_soon: "bg-amber-50 text-amber-700 border-amber-200",
  overdue: "bg-rose-50 text-rose-700 border-rose-200",
  blocked: "bg-violet-50 text-violet-700 border-violet-200",
};

type BadgeType = "ticket-status" | "ticket-priority" | "asset-status" | "supply-status" | "facility-status" | "facility-priority" | "sla-state";

interface StatusBadgeProps {
  type: BadgeType;
  value: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function StatusBadge({ type, value, size = "sm", className = "" }: StatusBadgeProps) {
  let label = value;
  let colorClass = "bg-slate-100 text-slate-600 border-slate-200";

  switch (type) {
    case "ticket-status":
      label = TICKET_STATUS_LABELS[value] || value;
      colorClass = TICKET_STATUS_COLORS[value] || colorClass;
      break;
    case "ticket-priority":
      label = TICKET_PRIORITY_LABELS[value] || value;
      colorClass = TICKET_PRIORITY_COLORS[value] || colorClass;
      break;
    case "asset-status":
      label = ASSET_STATUS_LABELS[value] || value;
      colorClass = ASSET_STATUS_COLORS[value] || colorClass;
      break;
    case "supply-status":
      label = SUPPLY_STATUS_LABELS[value] || value;
      colorClass = SUPPLY_STATUS_COLORS[value] || colorClass;
      break;
    case "facility-status":
      label = FACILITY_STATUS_LABELS[value] || value;
      colorClass = TICKET_STATUS_COLORS[value] || colorClass;
      break;
    case "facility-priority":
      label = value.charAt(0).toUpperCase() + value.slice(1);
      colorClass = FACILITY_PRIORITY_COLORS[value] || colorClass;
      break;
    case "sla-state":
      label = SLA_STATE_LABELS[value] || value;
      colorClass = SLA_STATE_COLORS[value] || colorClass;
      break;
  }

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-0.5",
    sm: "text-xs px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${sizeClasses[size]} ${colorClass} ${className}`}
      data-testid={`badge-${type}-${value}`}
    >
      {label}
    </span>
  );
}
