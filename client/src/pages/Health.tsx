/**
 * The diagnostics screen: what is actually working right now.
 *
 * It exists because the cheap answer kept being the wrong one. `/api/health`
 * reports whether an environment variable is set, and twice that has read
 * "configured" while the thing behind it was dead — a retired AI model, and a
 * mail provider that could not be reached while a trip's invitations silently
 * went nowhere. Every row here comes from something the server asked.
 *
 * Admin-only, and that is enforced by `adminProcedure` on the server, not by
 * this page choosing what to draw. Two reasons, either sufficient: the report
 * is a map of which secrets exist and where they are weak, and running it
 * costs an outbound request per check.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppShell from "@/components/AppShell";
import NotFound from "@/pages/NotFound";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/harmony";
import { Notice } from "@/components/harmony/Notice";
import type { Tone } from "@/lib/taxonomy";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  HelpCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";

type CheckStatus = "ok" | "warn" | "fail" | "off" | "unknown";

/**
 * A status colour and a glyph, never colour alone (MASTER §1) — this screen is
 * read in a hurry and sometimes on a phone in sunlight.
 *
 * `unknown` is deliberately not green and not red. A check that could not
 * reach a verdict is the one state a diagnostics page must never round off:
 * folding it into "ok" is how the last two outages stayed invisible.
 */
const PRESENTATION: Record<
  CheckStatus,
  { tone: Tone; icon: typeof CheckCircle2; label: string }
> = {
  fail: { tone: "danger", icon: XCircle, label: "Failing" },
  warn: { tone: "warning", icon: AlertTriangle, label: "Warning" },
  unknown: { tone: "info", icon: HelpCircle, label: "Unknown" },
  ok: { tone: "success", icon: CheckCircle2, label: "OK" },
  off: { tone: "neutral", icon: CircleSlash, label: "Off" },
};

/** Worst first. Nobody opens this page to read the rows that are fine. */
const RANK: Record<CheckStatus, number> = {
  fail: 0,
  warn: 1,
  unknown: 2,
  ok: 3,
  off: 4,
};

function CheckRow({
  check,
}: {
  check: {
    id: string;
    label: string;
    status: CheckStatus;
    summary: string;
    detail?: string;
    facts?: Record<string, string | number | null>;
  };
}) {
  const p = PRESENTATION[check.status] ?? PRESENTATION.unknown;
  const facts = Object.entries(check.facts ?? {}).filter(
    ([, v]) => v !== null && v !== ""
  );

  return (
    <Card className="border-border/70">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-sm">{check.label}</h3>
          <StatusPill tone={p.tone} icon={p.icon}>
            {p.label}
          </StatusPill>
        </div>

        <p className="text-sm text-foreground/90 break-words">
          {check.summary}
        </p>

        {check.detail && (
          <p className="text-xs text-muted-foreground break-words">
            {check.detail}
          </p>
        )}

        {facts.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1">
            {facts.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-[11px] text-muted-foreground">{key}</dt>
                <dd className="text-[11px] font-mono text-foreground/80 break-all">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

export default function Health() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    // On demand only. Each run makes outbound requests, so a screen left open
    // on a second monitor must not quietly poll a paid API all afternoon.
  } = trpc.system.diagnostics.useQuery(undefined, {
    enabled: user?.role === "admin",
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: Infinity,
    retry: false,
  });

  if (loading) {
    return (
      <AppShell title="Health" showBack backHref="/admin">
        <div className="px-4 py-4 space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </AppShell>
    );
  }

  // Renders as though the route does not exist, rather than as a locked door.
  if (user?.role !== "admin") return <NotFound />;

  const checks = [...(data?.checks ?? [])].sort(
    (a, b) => RANK[a.status as CheckStatus] - RANK[b.status as CheckStatus]
  );
  const overall = (data?.overall ?? "unknown") as CheckStatus;
  const overallPresentation = PRESENTATION[overall] ?? PRESENTATION.unknown;

  return (
    <AppShell
      title="Health"
      showBack
      backHref="/admin"
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Run the checks again"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw
            className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
        </Button>
      }
    >
      <div className="px-4 py-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Every row below was measured just now, by asking the dependency. This
          is not the same as <code className="font-mono">/api/health</code>,
          which only reports whether a variable is set.
        </p>

        {error && (
          <Notice tone="danger" title="The checks did not run">
            {error.message}
          </Notice>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : (
          data && (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    {overall === "ok"
                      ? "Everything checked out"
                      : overall === "off"
                        ? "Nothing is switched on"
                        : "Something needs attention"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(data.checkedAt).toLocaleTimeString()} ·{" "}
                    {data.durationMs}ms
                  </p>
                </div>
                <StatusPill
                  tone={overallPresentation.tone}
                  icon={overallPresentation.icon}
                >
                  {overallPresentation.label}
                </StatusPill>
              </div>

              <div className="space-y-3">
                {checks.map(check => (
                  <CheckRow
                    key={check.id}
                    check={check as Parameters<typeof CheckRow>[0]["check"]}
                  />
                ))}
              </div>
            </>
          )
        )}
      </div>
    </AppShell>
  );
}
