import type { ReactNode } from "react";
import { AlertTriangle, Info, Eye, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoticeTone = "info" | "warning" | "danger" | "success" | "quiet";

const TONES: Record<
  NoticeTone,
  { spine: string; icon: string; glyph: typeof Info }
> = {
  info: { spine: "bg-info", icon: "text-info", glyph: Info },
  warning: { spine: "bg-warning", icon: "text-warning", glyph: AlertTriangle },
  danger: { spine: "bg-danger", icon: "text-danger", glyph: AlertTriangle },
  success: { spine: "bg-success", icon: "text-success", glyph: CheckCircle2 },
  quiet: { spine: "bg-border", icon: "text-muted-foreground", glyph: Eye },
};

/**
 * A line of context the reader did not ask for: why a screen has no buttons on
 * it, who is over their cap, what a confirmation is about to move.
 *
 * A card with a soft status fill was the obvious way to write these and the
 * wrong one. At full width the fill is a slab of colour with no edge to it, it
 * pulls more attention than the sentence deserves, and in dark mode a soft
 * amber at any usable lightness is brown. A spine says the same thing in three
 * pixels, in the same vocabulary a settled section already uses — and leaves
 * the notice sitting on the page's own surface rather than on a patch of its
 * own (MASTER §4, §6).
 */
export function Notice({
  tone = "info",
  title,
  children,
  icon,
  className,
}: {
  tone?: NoticeTone;
  /** Optional lead line, in the foreground weight. */
  title?: ReactNode;
  children?: ReactNode;
  /** Override the tone's default glyph. */
  icon?: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  const Glyph = t.glyph;

  return (
    <div
      className={cn(
        "relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-border/70 bg-card py-2.5 pl-4 pr-3 text-[13px] shadow-e1",
        className
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px] rounded-r-full", t.spine)}
      />
      <span aria-hidden className={cn("mt-px shrink-0", t.icon)}>
        {icon ?? <Glyph className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {title && (
          <p className="font-semibold tracking-tight text-foreground">{title}</p>
        )}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
