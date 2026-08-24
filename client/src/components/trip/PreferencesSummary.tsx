/**
 * What you have already told the group, at the top of the preferences screen.
 *
 * The page used to open on four empty-looking textareas whether or not you had
 * filled them in last week. This says plainly: here is your budget cap, here is
 * when you last saved, here is how many of you have done it.
 *
 * The budget cap is editable here because it is the one number a member is
 * asked for that lives on a different screen entirely — reading it back without
 * a way to change it would just move the problem.
 *
 * The cap stays **private**: it is what you are willing to spend, and the
 * server never shows it to anybody else. Proposing a figure is the separate,
 * public act, which is why it is a separate control saying so rather than a
 * side effect of setting a cap.
 */
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, ClipboardList, Users, Wallet } from "lucide-react";

export default function PreferencesSummary({
  tripId,
  tripName,
  currency,
  budgetMax,
  savedAt,
  submittedCount,
  memberCount,
}: {
  tripId: number;
  tripName: string;
  currency: string;
  /** `tripMembers.budgetMax` for the signed-in member — null until they set one. */
  budgetMax: string | null;
  /** When these preferences were last saved, or null if never. */
  savedAt: Date | string | null;
  submittedCount: number;
  memberCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(budgetMax ?? "");
  const utils = trpc.useUtils();
  const updateBudget = trpc.trips.updateMemberBudget.useMutation();

  // The cap arrives with the members query, after the first render.
  useEffect(() => {
    if (!editing) setDraft(budgetMax ?? "");
  }, [budgetMax, editing]);

  const saveBudget = async () => {
    const value = draft.trim();
    if (value && !Number.isFinite(Number(value))) {
      toast.error("Budget cap must be a number");
      return;
    }
    try {
      await updateBudget.mutateAsync({ tripId, budgetMax: value });
      await utils.trips.members.invalidate({ tripId });
      await utils.budget.summary.invalidate({ tripId });
      setEditing(false);
      toast.success("Budget cap updated");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save your budget cap");
    }
  };

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{tripName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tell the group what matters to you for this specific trip. The AI
              uses these to score every accommodation and place proposal —
              showing exactly how well each option fits you.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs gap-1">
                <Users className="h-3 w-3" />
                {submittedCount}/{memberCount} members submitted
              </Badge>
              {savedAt ? (
                <Badge
                  variant="outline"
                  className="text-xs text-green-600 border-green-300 gap-1"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Saved {format(new Date(savedAt), "d MMM")}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  Not saved yet
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border/50 pt-3">
          <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground flex-1">
            My budget cap
          </span>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{currency}</span>
              <Input
                type="number"
                inputMode="decimal"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="0"
                className="h-8 w-24 rounded-lg text-sm"
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={saveBudget}
                disabled={updateBudget.isPending}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg text-xs"
                onClick={() => {
                  setDraft(budgetMax ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-medium underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
            >
              {budgetMax
                ? `${currency} ${Number(budgetMax).toFixed(0)}`
                : "Set a cap"}
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground -mt-1">
          Yours alone — nobody else on the trip sees it.
          {budgetMax
            ? " To put the figure to the group, propose it above."
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}
