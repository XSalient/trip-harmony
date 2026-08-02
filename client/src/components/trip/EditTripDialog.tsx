/**
 * Renaming a trip, and giving it a description.
 *
 * `trips.update` has always accepted both and — since E2 — required admin. The
 * only reason a trip's name was fixed at creation is that nothing in the UI ever
 * called it.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function EditTripDialog({
  tripId,
  name,
  description,
  open,
  onOpenChange,
}: {
  tripId: number;
  name: string;
  description: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const utils = trpc.useUtils();
  const update = trpc.trips.update.useMutation();

  // Re-seed each time it opens, so cancelling really does discard.
  useEffect(() => {
    if (open) {
      setDraftName(name);
      setDraftDescription(description ?? "");
    }
  }, [open, name, description]);

  const save = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      toast.error("A trip needs a name");
      return;
    }
    try {
      await update.mutateAsync({
        id: tripId,
        name: trimmed,
        description: draftDescription.trim(),
      });
      await utils.trips.get.invalidate({ id: tripId });
      await utils.trips.list.invalidate();
      toast.success("Trip updated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save that");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Trip</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              maxLength={255}
              className="rounded-lg mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              value={draftDescription}
              onChange={e => setDraftDescription(e.target.value)}
              rows={4}
              placeholder="What is this trip about?"
              className="rounded-lg mt-1 resize-none text-sm"
            />
          </div>
          <Button
            onClick={save}
            className="w-full rounded-lg"
            disabled={update.isPending}
          >
            {update.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
