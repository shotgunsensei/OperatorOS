export type TicketSlaState = "on_track" | "due_soon" | "overdue" | "blocked";

export interface TicketSlaInput {
  priority: string;
  status: string;
  dueDate?: Date | string | null;
  createdAt?: Date | string | null;
  isPatientImpacting?: boolean | null;
}

export interface TicketSlaResult {
  slaState: TicketSlaState;
  slaDueAt: Date | null;
  slaReason: string;
  slaTargetHours: number | null;
}

const CLOSED_STATUSES = new Set(["resolved", "closed"]);
const BLOCKED_STATUSES = new Set(["waiting_vendor", "waiting_department"]);

const PRIORITY_TARGET_HOURS: Record<string, number> = {
  critical: 4,
  high: 24,
  normal: 72,
  low: 168,
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function targetHours(priority: string, isPatientImpacting?: boolean | null): number {
  const base = PRIORITY_TARGET_HOURS[priority] ?? PRIORITY_TARGET_HOURS.normal;
  if (!isPatientImpacting) return base;
  return Math.min(base, priority === "low" ? 48 : 12);
}

export function computeTicketSla(input: TicketSlaInput, now = new Date()): TicketSlaResult {
  const target = targetHours(input.priority, input.isPatientImpacting);
  const explicitDueDate = asDate(input.dueDate);
  const createdAt = asDate(input.createdAt);
  const slaDueAt = explicitDueDate ?? (createdAt ? new Date(createdAt.getTime() + target * 60 * 60 * 1000) : null);

  if (CLOSED_STATUSES.has(input.status)) {
    return {
      slaState: "on_track",
      slaDueAt,
      slaReason: "Ticket is closed",
      slaTargetHours: target,
    };
  }

  if (BLOCKED_STATUSES.has(input.status)) {
    return {
      slaState: "blocked",
      slaDueAt,
      slaReason: input.status === "waiting_vendor" ? "Waiting on vendor" : "Waiting on department",
      slaTargetHours: target,
    };
  }

  if (!slaDueAt) {
    return {
      slaState: "on_track",
      slaDueAt: null,
      slaReason: "No SLA due date available",
      slaTargetHours: target,
    };
  }

  const msUntilDue = slaDueAt.getTime() - now.getTime();
  if (msUntilDue < 0) {
    return {
      slaState: "overdue",
      slaDueAt,
      slaReason: "SLA target has passed",
      slaTargetHours: target,
    };
  }

  const dueSoonWindowMs = Math.min(24, Math.max(4, target / 3)) * 60 * 60 * 1000;
  if (msUntilDue <= dueSoonWindowMs) {
    return {
      slaState: "due_soon",
      slaDueAt,
      slaReason: "SLA target is approaching",
      slaTargetHours: target,
    };
  }

  return {
    slaState: "on_track",
    slaDueAt,
    slaReason: "Within SLA target",
    slaTargetHours: target,
  };
}
