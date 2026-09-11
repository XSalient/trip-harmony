/**
 * What a section's own screen shows once the trip has switched it off.
 *
 * A redirect back to the trip page would be tidier and worse: these URLs are in
 * notifications, in the summary's links, and in whatever somebody pasted into
 * the group chat last week. A link that silently lands you somewhere you did
 * not ask for reads as the app being broken. This says what happened, and gives
 * the one person who can undo it the way to.
 *
 * It renders its own `AppShell` so a screen needs one guard and one line rather
 * than a wrapper each, and it asks for the caller's role itself rather than
 * making six pages destructure a capability they otherwise do not use.
 *
 * **Not a permission screen.** The section's data is untouched and its
 * procedures still work — see `trips.setHiddenSections`.
 */
import { Link } from "wouter";
import { EyeOff, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import AppShell from "@/components/AppShell";
import { useTripRole } from "@/_core/hooks/useTripRole";
import { sectionLabel, type SectionKey } from "@shared/sections";

export default function SectionOffNotice({
  tripId,
  section,
}: {
  tripId: number;
  section: SectionKey;
}) {
  const { canAdminister } = useTripRole(tripId);
  const label = sectionLabel(section);

  return (
    <AppShell title={label} showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4">
        <Card className="border-border/70">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="size-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <EyeOff className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-medium">
                {label} is turned off for this trip
              </p>
              <p className="text-xs text-muted-foreground">
                Nothing has been deleted. Anything the group added here is still
                saved, and comes back if the section is turned on again.
              </p>
              {canAdminister ? (
                <Link href={`/trips/${tripId}/settings`}>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Turn it on in Trip settings
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A trip admin can turn it back on.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
