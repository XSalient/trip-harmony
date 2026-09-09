/**
 * Which sections this trip uses.
 *
 * The trip page renders every section for every trip, and most trips do not
 * want all of them — a weekend at somebody's house has no accommodation to vote
 * on, a day trip has no budget to split, and an empty section is not neutral:
 * it is a card to scroll past, a "0 proposed" line in the summary, and a gap
 * the AI Referee reports as missing information.
 *
 * Switching one off hides it for everybody on the trip. It deletes nothing —
 * see the note on `trips.setHiddenSections`.
 */
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { HIDEABLE_SECTIONS, type SectionKey } from "@shared/sections";

export default function TripSettings() {
  useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const tripId = parseInt(params.id || "0");

  const { data: trip, isLoading } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  const { canAdminister } = useTripRole(tripId);
  const utils = trpc.useUtils();
  const setHidden = trpc.trips.setHiddenSections.useMutation();

  const hidden: SectionKey[] = trip?.hiddenSections ?? [];

  // No optimistic patch: this is a form control, not a gesture. ADR 0021 scopes
  // optimism to direct manipulation and says "only those" — and unlike a
  // dragged chip, a switch that flicks back on failure reads as a switch that
  // did not take, which is exactly the truth.
  const toggle = async (key: SectionKey, visible: boolean) => {
    const next = visible ? hidden.filter(k => k !== key) : [...hidden, key];
    try {
      await setHidden.mutateAsync({ tripId, hidden: next });
      await utils.trips.get.invalidate({ id: tripId });
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save that");
    }
  };

  if (isLoading) {
    return (
      <AppShell title="Trip settings" showBack backHref={`/trips/${tripId}`}>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Trip settings" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Sections on the trip page</p>
              <p className="text-xs text-muted-foreground mt-1">
                Turn off what this trip does not need. Everyone on the trip sees
                the same set.{" "}
                <strong className="font-medium text-foreground">
                  Nothing is deleted
                </strong>{" "}
                — proposals and votes in a section you switch off come back
                exactly as they were when you switch it on again.
              </p>
            </div>
          </CardContent>
        </Card>

        {!canAdminister && (
          <Card className="border-border/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Only a trip admin can change these. This is what the trip is set
                to.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50 py-0">
          <CardContent className="p-0 divide-y divide-border/40">
            {HIDEABLE_SECTIONS.map(section => {
              const visible = !hidden.includes(section.key);
              return (
                <div
                  key={section.key}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <label
                    htmlFor={`section-${section.key}`}
                    className="text-sm min-w-0"
                  >
                    {section.label}
                    {!visible && (
                      <span className="block text-xs text-muted-foreground">
                        Hidden on the trip page
                      </span>
                    )}
                  </label>
                  <Switch
                    id={`section-${section.key}`}
                    checked={visible}
                    disabled={!canAdminister || setHidden.isPending}
                    onCheckedChange={next => toggle(section.key, next)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1">
          Summary is always shown — it is where the page says whether the group
          is going yet.
        </p>

        <button
          onClick={() => navigate(`/trips/${tripId}`)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
        >
          Back to the trip
        </button>
      </div>
    </AppShell>
  );
}
