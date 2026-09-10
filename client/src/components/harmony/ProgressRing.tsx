import { cn } from "@/lib/utils";

/**
 * A circular progress dial with a gradient stroke.
 *
 * SVG rather than a conic-gradient background: a stroked circle gives real
 * round line caps and animates a single property (`stroke-dashoffset`), and the
 * gradient can follow the arc instead of sweeping the whole box.
 *
 * The value is exposed to assistive tech through the wrapper's role, and also
 * printed in the middle — a ring on its own communicates nothing to a screen
 * reader and not much to anyone glancing at it.
 */
export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  label,
  className,
}: {
  /** 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  /** Accessible name, e.g. "Trip progress". */
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  // Unique per instance so two rings on one screen cannot share a gradient id.
  const gradientId = `ring-${Math.round(size)}-${pct}-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ? `${label}: ` : ""}${pct}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--coral)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="tabular absolute inset-0 flex items-center justify-center text-[13px] font-bold">
        {pct}%
      </span>
    </div>
  );
}
