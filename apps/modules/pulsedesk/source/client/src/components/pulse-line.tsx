interface PulseLineProps {
  className?: string;
  color?: string;
  width?: number | string;
  height?: number;
  animate?: boolean;
  variant?: "full" | "minimal" | "divider";
}

export function PulseLine({
  className = "",
  color = "currentColor",
  width = "100%",
  height = 24,
  animate = true,
  variant = "full",
}: PulseLineProps) {
  const paths: Record<string, string> = {
    full: "M0 12 L20 12 L24 12 L28 6 L32 18 L36 4 L40 20 L44 10 L48 12 L60 12 L64 12 L68 8 L72 16 L76 6 L80 18 L84 12 L100 12",
    minimal: "M0 12 L30 12 L34 8 L38 16 L42 4 L46 20 L50 12 L70 12 L74 8 L78 16 L82 12 L100 12",
    divider: "M0 12 L35 12 L39 6 L43 18 L47 3 L51 21 L55 12 L65 12 L100 12",
  };

  return (
    <svg
      viewBox="0 0 100 24"
      fill="none"
      preserveAspectRatio="none"
      style={{ width, height }}
      className={className}
    >
      <path
        d={paths[variant]}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "pulse-line-animate" : ""}
      />
    </svg>
  );
}

export function PulseLoader({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status" aria-live="polite">
      <PulseLine
        variant="divider"
        width={120}
        height={28}
        color="hsl(var(--accent))"
        animate
      />
      <p className="text-xs text-muted-foreground pulse-glow">Loading...</p>
    </div>
  );
}

export function PulseDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-current to-transparent opacity-15" />
      <PulseLine
        variant="minimal"
        width={48}
        height={12}
        color="currentColor"
        animate={false}
      />
      <div className="h-px flex-1 bg-gradient-to-r from-current via-current to-transparent opacity-15" />
    </div>
  );
}
