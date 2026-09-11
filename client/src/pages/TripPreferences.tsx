import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import AppShell from "@/components/AppShell";
import SectionOffNotice from "@/components/trip/SectionOffNotice";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { BudgetScope } from "@shared/budget";
import type { Suggestion } from "@shared/suggestions";
import PreferencesSummary from "@/components/trip/PreferencesSummary";
import ProposalSuggestions from "@/components/trip/ProposalSuggestions";
import WatcherNotice from "@/components/trip/WatcherNotice";
import { Notice } from "@/components/harmony/Notice";
import {
  CheckCircle2,
  ClipboardList,
  Star,
  ThumbsDown,
  MessageSquare,
  Users,
  Lightbulb,
} from "lucide-react";

const SECTIONS = [
  {
    key: "mustHaves" as const,
    label: "Must-haves",
    icon: CheckCircle2,
    color: "text-success",
    bg: "bg-success-soft",
    onBg: "text-success-on-soft",
    border: "border-success-border",
    placeholder:
      "e.g. Ground floor or elevator only (bad knee), minimum 3 attached bathrooms, EV charger required, full kitchen with pressure cooker…",
    hint: "Enforced. Anything that fails one of these is flagged.",
  },
  {
    key: "strongPreferences" as const,
    label: "Nice to have",
    icon: Star,
    color: "text-info",
    bg: "bg-info-soft",
    onBg: "text-info-on-soft",
    border: "border-info-border",
    placeholder:
      "e.g. Pool essential for the kids, large kitchen with 4+ burners, secure bike storage for 4 adults, near beach…",
    hint: "Weighted, not enforced — these move the match score.",
  },
  {
    key: "avoids" as const,
    label: "Dealbreakers",
    icon: ThumbsDown,
    color: "text-danger",
    bg: "bg-danger-soft",
    onBg: "text-danger-on-soft",
    border: "border-danger-border",
    placeholder:
      "e.g. No more than 10 stairs, avoid car-free parks (long luggage walk), no high energy-cost cottages, not too remote…",
    hint: "Things that would make you vote No. These raise the resentment risk score.",
  },
  {
    key: "openComments" as const,
    label: "Open Comments",
    icon: MessageSquare,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
    placeholder:
      "Anything else — flexible timings, early bedtime needs, happy to share rooms, dietary notes for Jain/vegan cooking, etc.",
    hint: "Freeform context the AI takes into account when analysing proposals.",
  },
];

export default function TripPreferences() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  // A watcher has no requirements to state: they are not going on the trip,
  // and `preferences.save` refuses them. The form is read-only rather than
  // absent, so the page still explains what the group is being scored against.
  const { canContribute, isWatcher } = useTripRole(tripId);

  const { data: trip } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  const { data: existing, isLoading } = trpc.preferences.getMy.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: countData } = trpc.preferences.countForTrip.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: members } = trpc.trips.members.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  // What you have written that the group could actually vote on. Read-only and
  // free — no model runs here; see `server/routers/suggestions.ts`.
  const { data: suggested } = trpc.suggestions.fromPreferences.useQuery(
    { tripId },
    { enabled: tripId > 0 && canContribute }
  );

  const [form, setForm] = useState({
    mustHaves: "",
    strongPreferences: "",
    avoids: "",
    openComments: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        mustHaves: existing.mustHaves || "",
        strongPreferences: existing.strongPreferences || "",
        avoids: existing.avoids || "",
        openComments: existing.openComments || "",
      });
    }
  }, [existing]);

  const utils = trpc.useUtils();
  const proposeDates = trpc.dates.propose.useMutation();
  const proposeBudget = trpc.budget.create.useMutation();
  const dismissSuggestion = trpc.suggestions.dismiss.useMutation();

  /**
   * Turns one suggestion into an ordinary proposal, through the same mutations
   * the proposal screens use — so it arrives with the implicit vote and the
   * notification those already handle, rather than by a second route in.
   */
  const handlePropose = async (s: Suggestion, scope?: BudgetScope) => {
    try {
      if (s.kind === "budget") {
        await proposeBudget.mutateAsync({
          tripId,
          title: s.title,
          amount: s.amount,
          currency: s.currency,
          scope: scope ?? s.scope,
        });
        utils.budget.list.invalidate({ tripId });
        utils.budget.summary.invalidate({ tripId });
      } else {
        await proposeDates.mutateAsync({
          tripId,
          startDate: s.startDate,
          endDate: s.endDate,
          label: s.label,
        });
        utils.dates.list.invalidate({ tripId });
      }
      // It is a proposal now, so its fingerprint matches one and it stops
      // being offered — nothing needs recording for an accepted suggestion.
      utils.suggestions.fromPreferences.invalidate({ tripId });
      toast.success("Proposed — everyone can vote on it now");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't propose that");
    }
  };

  const handleDismiss = async (s: Suggestion) => {
    await dismissSuggestion.mutateAsync({
      tripId,
      kind: s.kind,
      fingerprint: s.fingerprint,
    });
    utils.suggestions.fromPreferences.invalidate({ tripId });
  };

  const saveMutation = trpc.preferences.save.useMutation({
    onSuccess: () => {
      setSaved(true);
      toast.success("Your preferences saved!");
      // Re-read what is now proposable. This is what makes writing a figure
      // and pressing Save offer to put it to the group.
      utils.suggestions.fromPreferences.invalidate({ tripId });
      setTimeout(() => setSaved(false), 3000);
    },
    onError: () => toast.error("Failed to save preferences"),
  });

  const handleSave = () => {
    saveMutation.mutate({ tripId, ...form });
  };

  const acceptedCount =
    members?.filter((m: any) => m.status === "accepted").length || 0;
  const myMembership = members?.find((m: any) => m.userId === user?.id);
  const submittedCount = countData?.count || 0;

  if (isLoading) {
    return (
      <AppShell
        title="My Trip Preferences"
        showBack
        backHref={`/trips/${tripId}`}
      >
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  // Switched off for this trip. The data behind this screen is untouched and
  // its procedures still work — this is a display decision, not a permission.
  if ((trip as any)?.hiddenSections?.includes("preferences"))
    return <SectionOffNotice tripId={tripId} section="preferences" />;

  return (
    <AppShell
      title="My Trip Preferences"
      showBack
      backHref={`/trips/${tripId}`}
    >
      <div className="mx-auto max-w-2xl space-y-5 p-4 pb-44 sm:p-5 sm:pb-44">
        <PreferencesSummary
          tripId={tripId}
          tripName={trip?.name || "Your Trip"}
          currency={trip?.currency || ""}
          budgetMax={myMembership?.budgetMax ?? null}
          savedAt={existing?.updatedAt ?? null}
          submittedCount={submittedCount}
          memberCount={acceptedCount}
        />

        {canContribute && (
          <ProposalSuggestions
            suggestions={(suggested?.suggestions ?? []) as Suggestion[]}
            currency={trip?.currency || ""}
            busy={proposeBudget.isPending || proposeDates.isPending}
            onPropose={handlePropose}
            onDismiss={handleDismiss}
          />
        )}

        {isWatcher && (
          <WatcherNotice>
            You're following this trip. Requirements are stated by the people
            travelling, so this form is read-only for you.
          </WatcherNotice>
        )}

        <Notice tone="warning" icon={<Lightbulb className="size-4" />}>
          Be specific. "Ground floor or elevator only" scores better than
          "accessibility" — the detail is what the match runs on.
        </Notice>

        {/* Preference sections */}
        {SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            // The header used to be a full-bleed bar in the section's own
            // colour — three saturated slabs down the screen, each louder than
            // the field it introduced. The colour lives in the icon tile now,
            // which is how every other list on the app is headed.
            <Card
              key={section.key}
              className="overflow-hidden rounded-2xl border-border/70 shadow-e1"
            >
              {/* A plain row, not `CardHeader`: that component is a grid in
                  this version of shadcn, so a tile beside a title stacks. */}
              <div className="flex items-start gap-3 px-3.5 pb-2.5 pt-3">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${section.bg} ${section.onBg}`}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[17px] font-bold tracking-tight">
                    {section.label}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                    {section.hint}
                  </span>
                </span>
              </div>
              <CardContent className="p-0">
                <Textarea
                  value={form[section.key]}
                  onChange={e =>
                    setForm(prev => ({
                      ...prev,
                      [section.key]: e.target.value,
                    }))
                  }
                  placeholder={section.placeholder}
                  readOnly={!canContribute}
                  className="min-h-[120px] resize-none border-0 border-t border-border/50 bg-transparent px-3.5 py-3 text-base leading-relaxed shadow-none focus-visible:ring-0"
                />
              </CardContent>
            </Card>
          );
        })}

        {/* Save button — sits above the bottom nav bar (h-14 = 56px) */}
        {canContribute && (
          <div className="glass fixed bottom-nav left-3 right-3 z-30 rounded-2xl p-3 shadow-e3">
            <div className="max-w-2xl mx-auto">
              <Button
                className="h-11 w-full text-base font-medium"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                {saved ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Saved!
                  </span>
                ) : saveMutation.isPending ? (
                  "Saving…"
                ) : existing ? (
                  "Update My Preferences"
                ) : (
                  "Save My Preferences"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
