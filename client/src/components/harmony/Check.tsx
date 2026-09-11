import { Check as CheckGlyph } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A checkbox, and the label that goes with it.
 *
 * A plain `<button role="checkbox">` rather than a Radix primitive. The
 * control is four lines of state and the whole design is in the styling, so a
 * dependency buys nothing here — and the one we tried brought a duplicate
 * React into the dev module graph, which is a lot of risk for a tick.
 *
 * The painted box is 20px because a 44px square of colour beside a line of
 * text looks wrong; the *target* is 44px, extended past the paint by the
 * wrapper's padding (MASTER §2 `touch-target-size`). Tapping the label counts,
 * which is most of what a real checkbox is for on a phone.
 */
export function CheckField({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "pressable-lg group flex min-h-11 w-full items-center gap-3 rounded-xl text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-[7px] border transition-[background-color,border-color,transform] duration-150",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-transparent group-hover:border-primary/50"
        )}
      >
        <CheckGlyph
          className={cn(
            "size-3.5 stroke-[3px] transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            checked ? "scale-100" : "scale-0"
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-muted-foreground">{label}</span>
        {hint && (
          <span className="block text-[12px] text-muted-foreground/80">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}
