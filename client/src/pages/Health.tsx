/**
 * The diagnostics screen: what is actually working right now.
 *
 * It exists because the cheap answer kept being the wrong one. `/api/health`
 * reports whether an environment variable is set, and twice that has read
 * "configured" while the thing behind it was dead — a retired AI model, and a
 * mail provider that could not be reached while a trip's invitations silently
 * went nowhere. Every row here comes from something the server asked.
 *
 * Two levels of certainty, kept apart on purpose. A **check** asks a
 * dependency whether it is there and whether its settings cohere; the page
 * runs all of them on open. A **test** makes the dependency do its job — send
 * the mail, write the row, call the model — and only ever runs when somebody
 * presses the button next to it, because each one costs something real.
 *
 * Admin-only, and that is enforced by `adminProcedure` on the server, not by
 * this page choosing what to draw. Two reasons, either sufficient: the report
 * is a map of which secrets exist and where they are weak, and running any of
 * it costs outbound requests somebody pays for.
 */
import { useState } from "react";
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
  Play,
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

/**
 * The checks that have a real counterpart to run, and what pressing it will
 * actually do. Said plainly on the button's own row: a control that spends
 * money or puts mail in an inbox should say so before it is pressed, not after.
 */
const TESTABLE: Record<string, { service: Service; does: string }> = {
  database: {
    service: "database",
    does: "Writes a row inside a transaction and reads it back. Touches no real table.",
  },
  email: {
    service: "email",
    does: "Sends a real email to your own address — and only ever to yours.",
  },
  ai: {
    service: "ai",
    does: "Makes one real model call. Costs a few tokens.",
  },
  scraper: {
    service: "scraper",
    does: "Fetches one page through the vendor. Costs a scraper credit.",
  },
};

type Service = "database" | "email" | "ai" | "scraper";

type TestResult = {
  service: string;
  passed: boolean;
  inconclusive?: boolean;
  summary: string;
  detail?: string;
  durationMs: number;
  facts?: Record<string, string | number | null>;
};

/**
 * A test's verdict, kept visually distinct from the check above it — they are
 * different claims and reading one as the other is the mistake this whole page
 * is built to prevent.
 */
function TestVerdict({ result }: { result: TestResult }) {
  const p = result.inconclusive
    ? PRESENTATION.unknown
    : result.passed
      ? PRESENTATION.ok
      : PRESENTATION.fail;

  return (
    <div className="rounded-lg border border-border/70 bg-muted/40 p-3 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium">
          {result.inconclusive
            ? "Test inconclusive"
            : result.passed
              ? "Test passed"
              : "Test failed"}
        </p>
        <StatusPill tone={p.tone} icon={p.icon}>
          {result.durationMs}ms
        </StatusPill>
      </div>
      <p className="text-xs text-foreground/90 break-words">{result.summary}</p>
      {result.detail && (
        <p className="text-[11px] text-muted-foreground break-words">
          {result.detail}
        </p>
      )}
    </div>
  );
}

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
  const testable = TESTABLE[check.id];
  const [result, setResult] = useState<TestResult | null>(null);

  const runTest = trpc.system.testService.useMutation({
    onSuccess: setResult,
    onError: error =>
      setResult({
        service: check.id,
        passed: false,
        summary: "The test could not be run",
        detail: error.message,
        durationMs: 0,
      }),
  });

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

        {testable && (
          <div className="space-y-2 pt-1">
            {result && <TestVerdict result={result} />}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              disabled={runTest.isPending}
              onClick={() => runTest.mutate({ service: testable.service })}
            >
              <Play className="h-3.5 w-3.5" />
              {runTest.isPending
                ? "Running…"
                : result
                  ? "Run it again"
                  : "Test it for real"}
            </Button>
            <p className="text-[11px] text-muted-foreground">{testable.does}</p>
          </div>
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
          Every row was measured just now by asking the dependency — not read
          off an environment variable. Where a row can be <em>exercised</em>{" "}
          rather than merely asked, it carries a test button: those do the real
          work, cost something, and run only when pressed.
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
