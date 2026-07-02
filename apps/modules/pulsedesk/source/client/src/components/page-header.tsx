import { SidebarTrigger } from "@/components/ui/sidebar";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, action, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col items-stretch gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger data-testid="button-sidebar-toggle" className="lg:hidden" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="line-clamp-2 text-xs text-muted-foreground sm:truncate">{description}</p>
          )}
        </div>
      </div>
      {(action || actions) && <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">{action || actions}</div>}
    </div>
  );
}
