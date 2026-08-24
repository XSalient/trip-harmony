/**
 * "You wrote this. Shall we ask the group about it?"
 *
 * My Preferences was a dead end: the four boxes fed AI match scoring and
 * nothing else, so somebody who wrote "we can do about £1,200 a family" had
 * stated the trip's most contested number where nobody votes on it.
 *
 * Every card quotes the sentence it came from, because the useful version of
 * this is one you can check at a glance — a suggestion you cannot trace back
 * to your own words is one you either accept blindly or ignore. Nothing here
 * happens without a tap: proposing notifies the whole trip and casts a vote,
 * and doing that because somebody edited a textarea would spend the group's
 * attention rather than earn it.
 */
import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUDGET_SCOPES, BUDGET_SCOPE_LABELS } from "@shared/budget";
import type { BudgetScope } from "@shared/budget";
import type { Suggestion } from "@shared/suggestions";
import { CalendarDays, Lightbulb, Wallet, X } from "lucide-react";

export default function ProposalSuggestions({
  suggestions,
  currency,
  busy,
  onPropose,
  onDismiss,
}: {
  suggestions: Suggestion[];
  currency: string;
  busy?: boolean;
  /** Budget suggestions carry the scope the person confirmed, not the guess. */
  onPropose: (suggestion: Suggestion, scope?: BudgetScope) => void;
  onDismiss: (suggestion: Suggestion) => void;
}) {
  // The scope is a guess from the words around the figure, and the person
  // confirming is the one who knows. Keyed by fingerprint so two figures on
  // one screen do not share a control.
  const [scopes, setScopes] = useState<Record<string, BudgetScope>>({});

  if (suggestions.length === 0) return null;

  return (
    <Card className="rounded-2xl border-primary/30 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Ask the group about this?</p>
            <p className="text-xs text-muted-foreground">
              Your preferences are private to the AI. A proposal is something
              everyone sees and votes on.
            </p>
          </div>
        </div>

        {suggestions.map(s => {
          const scope =
            s.kind === "budget"
              ? (scopes[s.fingerprint] ?? s.scope)
              : undefined;
          return (
            <div
              key={s.fingerprint}
              className="rounded-xl border border-border/60 bg-background p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                {s.kind === "budget" ? (
                  <Wallet className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                ) : (
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {s.kind === "budget"
                      ? `${s.currency} ${Number(s.amount).toFixed(0)}`
                      : s.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.kind === "date" &&
                      `${format(new Date(s.startDate), "d MMM yyyy")} – ${format(
                        new Date(s.endDate),
                        "d MMM yyyy"
                      )}`}
                  </p>
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    {s.source === "cap"
                      ? s.excerpt
                      : `You wrote: "${s.excerpt}"`}
                  </p>
                </div>
                <button
                  onClick={() => onDismiss(s)}
                  className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Not this one"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {s.kind === "budget" && (
                  <Select
                    value={scope}
                    onValueChange={v =>
                      setScopes(prev => ({
                        ...prev,
                        [s.fingerprint]: v as BudgetScope,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 flex-1 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUDGET_SCOPES.map(v => (
                        <SelectItem key={v} value={v} className="text-xs">
                          {BUDGET_SCOPE_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  size="sm"
                  className="h-8 rounded-lg text-xs shrink-0"
                  disabled={busy}
                  onClick={() => onPropose(s, scope)}
                >
                  Propose to the group
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
