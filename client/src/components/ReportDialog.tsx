/**
 * Reporting a comment, a proposal, a trip or a person.
 *
 * Apple's guideline 1.2 wants a report mechanism, and the mechanism only works
 * if filing is cheap: a reason, an optional sentence, done. Anything longer and
 * the person who needed it closes the dialog instead.
 *
 * The server answers the same way whether this created a report or hit the
 * uniqueness index, so this always says thank you — telling somebody their
 * report "was already filed" reads as it having been ignored.
 */
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReportTarget = {
  contentType: "comment" | "proposal" | "trip" | "member";
  contentId: number;
  tripId?: number;
  /** Shown in the dialog so it is obvious what is being reported. */
  label?: string;
};

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "harassment", label: "Harassment", hint: "Targeting someone" },
  { value: "hate", label: "Hate speech", hint: "Slurs, or attacks on a group" },
  { value: "sexual", label: "Sexual content", hint: "Explicit or unwanted" },
  { value: "violence", label: "Violence", hint: "Threats or graphic content" },
  { value: "spam", label: "Spam", hint: "Advertising, or repeated noise" },
  { value: "other", label: "Something else", hint: "Tell us below" },
];

type ReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "other";

export function ReportDialog({
  target,
  open,
  onOpenChange,
}: {
  target: ReportTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [note, setNote] = useState("");

  const mutation = trpc.moderation.report.useMutation({
    onSuccess: () => {
      toast.success("Reported. Thank you — an admin will take a look.");
      close(false);
    },
    onError: err => toast.error(err.message),
  });

  function close(next: boolean) {
    if (mutation.isPending) return;
    if (!next) {
      setReason("harassment");
      setNote("");
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this</DialogTitle>
          <DialogDescription>
            {target?.label
              ? `Reporting: “${target.label}”`
              : "An admin will review this."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup
            value={reason}
            onValueChange={v => setReason(v as ReportReason)}
            className="gap-2"
          >
            {REASONS.map(r => (
              <label
                key={r.value}
                htmlFor={`reason-${r.value}`}
                className="flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <RadioGroupItem
                  id={`reason-${r.value}`}
                  value={r.value}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.hint}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="report-note">Anything to add? (optional)</Label>
            <Textarea
              id="report-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="resize-none"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => close(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!target || mutation.isPending}
              onClick={() => {
                if (!target) return;
                mutation.mutate({
                  contentType: target.contentType,
                  contentId: target.contentId,
                  tripId: target.tripId,
                  reason,
                  note: note.trim() || undefined,
                });
              }}
            >
              {mutation.isPending ? "Sending…" : "Report"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
