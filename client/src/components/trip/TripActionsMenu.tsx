/**
 * The admin-only things you can do to a whole trip: rename it, take a copy of
 * it, or delete it.
 *
 * Delete and clone live behind a menu rather than beside the edit pencil
 * because the trip header is the one place a mis-tap is expensive: deleting a
 * trip removes everyone's proposals, votes and comments, not just yours. The
 * confirmation asks for the trip's name for the same reason — a dialog whose
 * only control is a red button is a dialog people dismiss by reflex.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function TripActionsMenu({
  tripId,
  tripName,
  onEdit,
}: {
  tripId: number;
  tripName: string;
  onEdit: () => void;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const cloneTrip = trpc.trips.clone.useMutation();
  const deleteTrip = trpc.trips.delete.useMutation();

  // Re-seed on open, so cancelling and reopening never shows a stale draft or
  // a confirmation that is already half-typed.
  useEffect(() => {
    if (cloneOpen) setCloneName(`${tripName} (copy)`);
  }, [cloneOpen, tripName]);
  useEffect(() => {
    if (deleteOpen) setConfirmName("");
  }, [deleteOpen]);

  const handleClone = async () => {
    try {
      const { id } = await cloneTrip.mutateAsync({
        id: tripId,
        name: cloneName.trim() || undefined,
      });
      await utils.trips.list.invalidate();
      setCloneOpen(false);
      toast.success("Trip copied");
      navigate(`/trips/${id}`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't copy that trip");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTrip.mutateAsync({ id: tripId, confirmName });
      await utils.trips.list.invalidate();
      setDeleteOpen(false);
      toast.success("Trip deleted");
      // Home, not back: back is this trip, which no longer exists.
      navigate("/");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't delete that trip");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Trip actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit} className="text-xs gap-2">
            <Pencil className="h-3.5 w-3.5" /> Edit trip
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setCloneOpen(true)}
            className="text-xs gap-2"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate trip
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-xs gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete trip
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Duplicate trip</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              The copy keeps the dates, suggestions and accommodations. Votes,
              comments, budget spend and members stay with the original — you'll
              be the only member of the copy until you invite people to it.
            </p>
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={cloneName}
                onChange={e => setCloneName(e.target.value)}
                maxLength={255}
                className="rounded-lg mt-1"
              />
            </div>
            <Button
              onClick={handleClone}
              disabled={cloneTrip.isPending}
              className="w-full rounded-lg"
            >
              {cloneTrip.isPending ? "Copying..." : "Create the copy"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Delete this trip?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              This removes the trip for everyone on it, along with every
              proposal, vote, comment and budget entry. It cannot be undone.
            </p>
            <div>
              <Label className="text-xs">
                Type <span className="font-medium">{tripName}</span> to confirm
              </Label>
              <Input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                placeholder={tripName}
                autoComplete="off"
                className="rounded-lg mt-1"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                deleteTrip.isPending || confirmName.trim() !== tripName.trim()
              }
              className="w-full rounded-lg"
            >
              {deleteTrip.isPending ? "Deleting..." : "Delete this trip"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
