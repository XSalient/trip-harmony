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
import {
  ArrowLeft,
  Bot,
  Calendar,
  DollarSign,
  FileText,
  Home,
  Lightbulb,
  ClipboardList,
  Settings2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Notice } from "@/components/harmony/Notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { HIDEABLE_SECTIONS, type SectionKey } from "@shared/sections";

/**
 * The icon and hue each section wears on the trip page.
 *
 * Repeated here rather than shared with `TripDashboard` on purpose: that page
 * passes them to `SectionCard` per call site, and a shared map would have to be
 * keyed by something both pages agree on, which is a refactor of the dashboard
 * rather than of this screen. If a third screen needs them, move them into
 * `shared/sections.ts` — where the labels already live.
 */
const SECTION_STYLE: Partial<
  Record<SectionKey, { icon: typeof Calendar; tone: string }>
> = {
  description: { icon: FileText, tone: "bg-cat-4-soft text-cat-4-on-soft" },
  preferences: {
    icon: ClipboardList,
    tone: "bg-cat-3-soft text-cat-3-on-soft",
  },
  dates: { icon: Calendar, tone: "bg-cat-1-soft text-cat-1-on-soft" },
  accommodations: { icon: Home, tone: "bg-cat-5-soft text-cat-5-on-soft" },
  suggestions: { icon: Lightbulb, tone: "bg-cat-2-soft text-cat-2-on-soft" },
  budget: { icon: DollarSign, tone: "bg-cat-6-soft text-cat-6-on-soft" },
  // The referee is the brand feature, so it wears the brand rather than a
  // seventh category hue there are only six of.
  referee: { icon: Bot, tone: "bg-primary/12 text-primary" },
};

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
        {/* One explanatory paragraph does not need a card around it, and a
            card is what made this screen open on a wall of small grey text
            before the first control. */}
        <Notice
          tone="info"
          title="Sections on the trip page"
          icon={<Settings2 className="size-4" />}
        >
          Turn off what this trip does not need. Everyone on the trip sees the
          same set.{" "}
          <strong className="font-medium text-foreground">
            Nothing is deleted
          </strong>{" "}
          — proposals and votes in a section you switch off come back exactly as
          they were when you switch it on again.
        </Notice>

        {!canAdminister && (
          <Notice tone="quiet">
            Only a trip admin can change these. This is what the trip is set to.
          </Notice>
        )}

        <Card className="border-border/70 py-0">
          <CardContent className="p-0 divide-y divide-border/40">
            {HIDEABLE_SECTIONS.map(section => {
              const visible = !hidden.includes(section.key);
              const style = SECTION_STYLE[section.key];
              const Glyph = style?.icon ?? Settings2;
              return (
                <div
                  key={section.key}
                  className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  {/* The same tile and hue the section carries on the trip
                      page, so this list reads as that page rather than as an
                      unrelated set of switches. */}
                  <label
                    htmlFor={`section-${section.key}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span
                      aria-hidden
                      className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-opacity ${style?.tone ?? "bg-primary/12 text-primary"} ${visible ? "" : "opacity-40"}`}
                    >
                      <Glyph className="size-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold tracking-tight">
                        {section.label}
                      </span>
                      {!visible && (
                        <span className="block text-[12px] text-muted-foreground">
                          Hidden on the trip page
                        </span>
                      )}
                    </span>
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

        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl"
          onClick={() => navigate(`/trips/${tripId}`)}
        >
          <ArrowLeft className="size-4" />
          Back to the trip
        </Button>
      </div>
    </AppShell>
  );
}
