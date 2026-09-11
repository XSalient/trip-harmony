/**
 * The strip at the top of a proposals screen: what the screen is for on the
 * left, its actions on the right.
 *
 * It exists because the same markup was written three times — Dates, Suggestions and
 * Accommodations — and had the same bug three times. The left column could not
 * shrink (no `min-w-0`) while its "3 finalised · Barcelona, Girona, Sitges"
 * line grew with the trip, so on a phone it pushed "Unlock all" and "Add" past
 * the right edge where nothing could reach them. Accommodations, with three
 * buttons, ran out of room first.
 *
 * Hence: the summary truncates, the actions never shrink, and they wrap to
 * their own line before anything is pushed off screen.
 */
import React from "react";
import { Check } from "lucide-react";

export default function ScreenHeader({
  subtitle,
  highlight,
  actions,
}: {
  subtitle: string;
  /** The finalised selection, when there is one. Free to be long. */
  highlight?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        {/* Success, not brand: this line is always the settled choice, and
            "settled" is green everywhere else in the app. A `Check` in front
            of it so the state does not rest on colour alone. */}
        {highlight ? (
          <p className="mt-1 flex items-start gap-1.5 text-[12px] font-medium text-success">
            <Check className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2">{highlight}</span>
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
