import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2, ChevronLeft, ClipboardList, Star,
  ThumbsDown, MessageSquare, Users, Lightbulb,
} from "lucide-react";

const SECTIONS = [
  {
    key: "mustHaves" as const,
    label: "Must-Haves / Hard Constraints",
    icon: CheckCircle2,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    placeholder: "e.g. Ground floor or elevator only (bad knee), minimum 3 attached bathrooms, EV charger required, full kitchen with pressure cooker…",
    hint: "These will be enforced. Any proposal failing these will be flagged with a warning.",
  },
  {
    key: "strongPreferences" as const,
    label: "Strong Preferences",
    icon: Star,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    placeholder: "e.g. Pool essential for the kids, large kitchen with 4+ burners, secure bike storage for 4 adults, near beach…",
    hint: "Important but not absolute. The AI uses these for scoring.",
  },
  {
    key: "avoids" as const,
    label: "Avoids / Dealbreakers",
    icon: ThumbsDown,
    color: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    placeholder: "e.g. No more than 10 stairs, avoid car-free parks (long luggage walk), no high energy-cost cottages, not too remote…",
    hint: "Things that would make you vote No. These raise the resentment risk score.",
  },
  {
    key: "openComments" as const,
    label: "Open Comments",
    icon: MessageSquare,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    placeholder: "Anything else — flexible timings, early bedtime needs, happy to share rooms, dietary notes for Jain/vegan cooking, etc.",
    hint: "Freeform context the AI takes into account when analysing proposals.",
  },
];

export default function TripPreferences() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: existing, isLoading } = trpc.preferences.getMy.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: countData } = trpc.preferences.countForTrip.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: members } = trpc.trips.members.useQuery({ tripId }, { enabled: tripId > 0 });

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

  const saveMutation = trpc.preferences.save.useMutation({
    onSuccess: () => {
      setSaved(true);
      toast.success("Your preferences saved!");
      setTimeout(() => setSaved(false), 3000);
    },
    onError: () => toast.error("Failed to save preferences"),
  });

  const handleSave = () => {
    saveMutation.mutate({ tripId, ...form });
  };

  const acceptedCount = members?.filter((m: any) => m.status === "accepted").length || 0;
  const submittedCount = countData?.count || 0;

  if (isLoading) {
    return (
      <AppShell title="My Trip Preferences" showBack backHref={`/trips/${tripId}`}>
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="My Trip Preferences" showBack backHref={`/trips/${tripId}`}>
      <div className="p-4 pb-24 space-y-4 max-w-2xl mx-auto">

        {/* Header info */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{trip?.name || "Your Trip"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tell the group what matters to you for this specific trip. The AI uses these to score every accommodation and destination proposal — showing exactly how well each option fits you.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs gap-1">
                    <Users className="h-3 w-3" />
                    {submittedCount}/{acceptedCount} members submitted
                  </Badge>
                  {existing && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Your preferences saved
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI tip */}
        <div className="flex gap-2 p-3 bg-muted/40 rounded-xl border border-border/50">
          <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Tip:</span> Be specific. "Ground floor or elevator only" is more useful than "accessibility". The more detail you add, the more accurate the AI match scores will be for every proposal.
          </p>
        </div>

        {/* Preference sections */}
        {SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <Card key={section.key} className={`border ${section.border}`}>
              <CardHeader className={`${section.bg} rounded-t-xl pb-2`}>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon className={`h-4 w-4 ${section.color}`} />
                  <span>{section.label}</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{section.hint}</p>
              </CardHeader>
              <CardContent className="p-3">
                <Textarea
                  value={form[section.key]}
                  onChange={e => setForm(prev => ({ ...prev, [section.key]: e.target.value }))}
                  placeholder={section.placeholder}
                  className="min-h-[90px] text-sm resize-none border-0 shadow-none focus-visible:ring-0 p-0 bg-transparent"
                />
              </CardContent>
            </Card>
          );
        })}

        {/* Save button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur border-t border-border/50 z-10">
          <div className="max-w-2xl mx-auto">
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saved ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Saved!
                </span>
              ) : saveMutation.isPending ? "Saving…" : existing ? "Update My Preferences" : "Save My Preferences"}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
