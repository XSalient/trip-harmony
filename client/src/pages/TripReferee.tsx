import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { EmptyState } from "@/components/harmony";
import SectionOffNotice from "@/components/trip/SectionOffNotice";
import WatcherNotice from "@/components/trip/WatcherNotice";
import { useParams } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { refereeCooldownRemainingMs } from "@shared/const";
import {
  Bot,
  Sparkles,
  RefreshCw,
  MessageCircle,
  Shield,
  Lightbulb,
  PartyPopper,
  FileText,
  AlertTriangle,
  Flag,
} from "lucide-react";
import { ReportDialog, type ReportTarget } from "@/components/ReportDialog";
import { Streamdown } from "streamdown";

const typeIcons: Record<string, any> = {
  nudge: MessageCircle,
  mediation: Shield,
  compromise: Lightbulb,
  celebration: PartyPopper,
  summary: FileText,
};

const typeColors: Record<string, string> = {
  nudge: "bg-cat-1-soft text-cat-1-on-soft",
  mediation: "bg-cat-4-soft text-cat-4-on-soft",
  compromise: "bg-cat-6-soft text-cat-6-on-soft",
  celebration: "bg-cat-3-soft text-cat-3-on-soft",
  summary: "bg-muted text-muted-foreground",
};

export default function TripReferee() {
  useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  // The referee summarises the group's argument, member by member, so it is
  // tripmates and up — `referee.messages` refuses a watcher. The dashboard
  // already hides the link; this page is reachable by typing the URL, and it
  // used to answer with a permanent skeleton and a console error.
  const { canAdminister: isAdmin, canContribute } = useTripRole(tripId);

  // Reporting what the model wrote. Google Play's generative-AI policy requires
  // a way to flag AI output from inside the app; this is it, and it files into
  // the same admin queue as a reported comment.
  const [reporting, setReporting] = useState<ReportTarget | null>(null);

  const { data: messages, isLoading } = trpc.referee.messages.useQuery(
    { tripId },
    { enabled: tripId > 0 && canContribute }
  );
  const { data: trip } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  const analyzeMutation = trpc.referee.analyze.useMutation();
  const utils = trpc.useUtils();

  const [analyzing, setAnalyzing] = useState(false);
  // A run the model could not answer is not stored — it is not an analysis, and
  // it must not become the group's newest "read". It is shown here instead, for
  // the admin who pressed the button, until they press it again.
  const [unavailable, setUnavailable] = useState<string | null>(null);
  // Ticks so the countdown moves and the button re-enables on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // The cooldown is simply the age of the newest message — the server reads it
  // the same way, so there is no separate state to keep in step.
  const cooldownLeftMs = refereeCooldownRemainingMs(
    messages?.[0]?.createdAt,
    now
  );
  const cooldownMinutes = Math.ceil(cooldownLeftMs / 60_000);

  const handleAnalyze = async () => {
    if (!trip) return;
    setAnalyzing(true);
    try {
      const result = await analyzeMutation.mutateAsync({
        tripId,
        phase: trip.phase,
      });
      utils.referee.messages.invalidate({ tripId });
      if (result.analysisUnavailable) {
        setUnavailable(result.content);
        toast.error(
          "The referee could not read this trip — nothing was analysed."
        );
        return;
      }
      setUnavailable(null);
      toast.success(
        result.fromCooldown
          ? "Showing the referee's last read — it was analysed moments ago."
          : "Referee analysis complete!"
      );
    } catch (e: any) {
      toast.error(e?.message || "Referee couldn't analyze right now");
    } finally {
      setAnalyzing(false);
    }
  };

  // Switched off for this trip. The data behind this screen is untouched and
  // its procedures still work — this is a display decision, not a permission.
  if ((trip as any)?.hiddenSections?.includes("referee"))
    return <SectionOffNotice tripId={tripId} section="referee" />;

  return (
    <AppShell title="AI Referee" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        {!canContribute && (
          <WatcherNotice>
            You're following this trip. The referee reads every member's
            preferences and votes, so its analysis is for the people travelling.
          </WatcherNotice>
        )}

        {/* Analyze button — admins only, and once per cooldown. Each run reads
            every member's preferences and every vote on every proposal. */}
        {canContribute &&
          (isAdmin ? (
            <div className="space-y-1.5">
              <Button
                onClick={handleAnalyze}
                className="w-full h-12 rounded-xl gap-2"
                disabled={analyzing || cooldownLeftMs > 0}
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Analyzing your trip...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Get Referee Analysis
                  </>
                )}
              </Button>
              {cooldownLeftMs > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  Just analysed — available again in {cooldownMinutes} minute
                  {cooldownMinutes === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              A trip admin can ask the referee for a fresh read.
            </p>
          ))}

        {/* The failed run, said plainly. Not a message card: it was never
            stored, and it is not the referee's reading of the trip. */}
        {canContribute && unavailable && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">Not analysed</span>
              </div>
              <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                <Streamdown>{unavailable}</Streamdown>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages */}
        {!canContribute ? null : isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((msg: any) => {
              const Icon = typeIcons[msg.messageType] || MessageCircle;
              const colorClass =
                typeColors[msg.messageType] || "bg-muted text-muted-foreground";
              return (
                <Card key={msg.id} className="border-border/70">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className={`h-7 w-7 rounded-lg flex items-center justify-center ${colorClass}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-[10px] capitalize"
                      >
                        {msg.messageType}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(msg.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        aria-label="Report this message"
                        title="Report this message"
                        // Padded out and pulled back in: a 12px flag is a
                        // 12px tap target otherwise, which on a phone means
                        // the control exists without being usable.
                        className="-m-2 p-2 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() =>
                          setReporting({
                            contentType: "referee_message",
                            contentId: msg.id,
                            tripId,
                            label: String(msg.content).slice(0, 80),
                          })
                        }
                      >
                        <Flag className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                      <Streamdown>{msg.content}</Streamdown>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          // One robot, not two. This screen opened on a card introducing the
          // referee, directly above an empty state saying the referee had not
          // run — the same icon and the same subject, twice, before anything
          // actionable. The introduction belongs in the empty state, because
          // the empty state is the only time anybody needs it.
          <EmptyState
            icon={Bot}
            title="The referee hasn't weighed in yet"
            description="It reads every member's preferences and every vote, finds the conflicts, and proposes a compromise. Run it once the group has started voting."
          />
        )}
      </div>

      <ReportDialog
        target={reporting}
        open={reporting !== null}
        onOpenChange={next => !next && setReporting(null)}
      />
    </AppShell>
  );
}
