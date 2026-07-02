import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary";
  testId?: string;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}
      data-testid="empty-state"
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight mb-1" data-testid="empty-state-title">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4" data-testid="empty-state-description">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {action && (action.href ? (
            <Button asChild variant={action.variant ?? "default"} data-testid={action.testId ?? "button-empty-action"}>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            <Button variant={action.variant ?? "default"} onClick={action.onClick} data-testid={action.testId ?? "button-empty-action"}>
              {action.label}
            </Button>
          ))}
          {secondaryAction && (secondaryAction.href ? (
            <Button asChild variant={secondaryAction.variant ?? "outline"} data-testid={secondaryAction.testId ?? "button-empty-secondary"}>
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : (
            <Button variant={secondaryAction.variant ?? "outline"} onClick={secondaryAction.onClick} data-testid={secondaryAction.testId ?? "button-empty-secondary"}>
              {secondaryAction.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
