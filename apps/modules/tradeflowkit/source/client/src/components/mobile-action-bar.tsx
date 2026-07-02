import { Button } from "@/components/ui/button";

interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive";
  testId?: string;
  disabled?: boolean;
}

interface MobileActionBarProps {
  actions: ActionItem[];
}

export function MobileActionBar({ actions }: MobileActionBarProps) {
  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t flex items-center gap-2 px-4 py-3 print:hidden"
      data-testid="mobile-action-bar"
    >
      {actions.map((action, i) => (
        <Button
          key={i}
          variant={action.variant || "outline"}
          size="sm"
          className="flex-1 gap-1.5"
          onClick={action.onClick}
          disabled={action.disabled}
          data-testid={action.testId}
        >
          {action.icon}
          <span className="text-xs">{action.label}</span>
        </Button>
      ))}
    </div>
  );
}
