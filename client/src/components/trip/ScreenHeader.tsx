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
        {highlight ? (
          <p className="text-xs text-primary font-medium mt-0.5 line-clamp-2">
            {highlight}
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
