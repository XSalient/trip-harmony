/**
 * Edit, clone and delete a proposal from the trip page.
 *
 * These were six near-identical dialogs — three "Edit X" and three "Clone X" —
 * each with its own open flag, its own field state and its own save handler,
 * roughly 380 lines of the trip page saying the same thing six times. One
 * dialog now renders whichever form is asked for.
 *
 * The dialogs are deliberately thin: they carry the fields a proposal can be
 * corrected on. Everything richer — URL import, amenities, the natural-language
 * date parser — lives on the detail screens, which is where the Add buttons go.
 */
import { useState } from "react";
import { format } from "date-fns";
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

type Field = {
  key: string;
  label: string;
  kind?: "text" | "date" | "number" | "textarea";
  /** Renders beside its neighbour, for the start/end date pair. */
  half?: boolean;
};

type Spec = {
  title: string;
  fields: Field[];
  submitLabel: string;
  note?: string;
  submit: (values: Record<string, string>) => Promise<void>;
};

const day = (d: string | Date) => format(new Date(d), "yyyy-MM-dd");
const price = (v: string | null | undefined) =>
  v ? String(parseFloat(v)) : "";

export function useProposalDialogs({
  tripId,
  refetchDates,
  refetchDests,
  refetchAccs,
}: {
  tripId: number;
  refetchDates: () => void;
  refetchDests: () => void;
  refetchAccs: () => void;
}) {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const editDate = trpc.dates.edit.useMutation();
  const editDest = trpc.destinations.edit.useMutation();
  const editAcc = trpc.accommodations.edit.useMutation();
  const proposeDate = trpc.dates.propose.useMutation();
  const createDest = trpc.destinations.create.useMutation();
  const createAcc = trpc.accommodations.create.useMutation();
  const deleteDate = trpc.dates.delete.useMutation();
  const deleteDest = trpc.destinations.delete.useMutation();
  const deleteAcc = trpc.accommodations.delete.useMutation();

  const open = (next: Spec, initial: Record<string, string>) => {
    setValues(initial);
    setSpec(next);
  };

  const DATE_FIELDS: Field[] = [
    { key: "label", label: "Label (optional)" },
    { key: "startDate", label: "Start", kind: "date", half: true },
    { key: "endDate", label: "End", kind: "date", half: true },
  ];

  const openEdit = (kind: "date" | "dest" | "acc", row: any): void => {
    if (kind === "date") {
      open(
        {
          title: "Edit Date Proposal",
          fields: DATE_FIELDS,
          submitLabel: "Save Changes",
          submit: async v => {
            await editDate.mutateAsync({
              id: row.id,
              label: v.label || undefined,
              startDate: v.startDate || undefined,
              endDate: v.endDate || undefined,
            });
            refetchDates();
          },
        },
        {
          label: row.label || "",
          startDate: day(row.startDate),
          endDate: day(row.endDate),
        }
      );
    } else if (kind === "dest") {
      open(
        {
          title: "Edit Place",
          fields: [
            { key: "name", label: "Name" },
            {
              key: "description",
              label: "Description (optional)",
              kind: "textarea",
            },
          ],
          submitLabel: "Save Changes",
          submit: async v => {
            await editDest.mutateAsync({
              id: row.id,
              name: v.name || undefined,
              description: v.description || undefined,
            });
            refetchDests();
          },
        },
        { name: row.name || "", description: row.description || "" }
      );
    } else {
      open(
        {
          title: "Edit Accommodation",
          fields: [
            { key: "name", label: "Name" },
            {
              key: "pricePerNight",
              label: "Price/night (optional)",
              kind: "number",
            },
          ],
          submitLabel: "Save Changes",
          submit: async v => {
            await editAcc.mutateAsync({
              id: row.id,
              name: v.name || undefined,
              pricePerNight: v.pricePerNight || undefined,
            });
            refetchAccs();
          },
        },
        { name: row.name || "", pricePerNight: price(row.pricePerNight) }
      );
    }
  };

  const openClone = (kind: "date" | "dest" | "acc", row: any): void => {
    const note = "Change at least one field to avoid duplicates.";
    if (kind === "date") {
      open(
        {
          title: "Clone Date Proposal",
          fields: DATE_FIELDS,
          submitLabel: "Save as New Proposal",
          note,
          submit: async v => {
            if (!v.startDate || !v.endDate)
              throw new Error("Both dates are required");
            await proposeDate.mutateAsync({
              tripId,
              startDate: v.startDate,
              endDate: v.endDate,
              label: v.label || undefined,
            });
            refetchDates();
          },
        },
        {
          label: row.label || "",
          startDate: day(row.startDate),
          endDate: day(row.endDate),
        }
      );
    } else if (kind === "dest") {
      open(
        {
          title: "Clone Place",
          fields: [
            { key: "name", label: "Name" },
            {
              key: "description",
              label: "Description (optional)",
              kind: "textarea",
            },
          ],
          submitLabel: "Save as New Proposal",
          note,
          submit: async v => {
            if (!v.name?.trim()) throw new Error("Name is required");
            await createDest.mutateAsync({
              tripId,
              name: v.name,
              description: v.description || undefined,
            });
            refetchDests();
          },
        },
        {
          name: `${row.name || ""} (copy)`,
          description: row.description || "",
        }
      );
    } else {
      open(
        {
          title: "Clone Accommodation",
          fields: [
            { key: "name", label: "Name" },
            { key: "link", label: "Link (optional)" },
            {
              key: "pricePerNight",
              label: "Price/night (optional)",
              kind: "number",
            },
          ],
          submitLabel: "Save as New Proposal",
          note,
          submit: async v => {
            if (!v.name?.trim()) throw new Error("Name is required");
            await createAcc.mutateAsync({
              tripId,
              name: v.name,
              link: v.link || undefined,
              pricePerNight: v.pricePerNight || undefined,
            });
            refetchAccs();
          },
        },
        {
          name: row.name || "",
          link: row.link || "",
          pricePerNight: price(row.pricePerNight),
        }
      );
    }
  };

  const remove = async (kind: "date" | "dest" | "acc", id: number) => {
    try {
      if (kind === "date") {
        await deleteDate.mutateAsync({ id });
        refetchDates();
      } else if (kind === "dest") {
        await deleteDest.mutateAsync({ id });
        refetchDests();
      } else {
        await deleteAcc.mutateAsync({ id });
        refetchAccs();
      }
      toast.success("Removed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  const save = async () => {
    if (!spec) return;
    setBusy(true);
    try {
      await spec.submit(values);
      setSpec(null);
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save that");
    } finally {
      setBusy(false);
    }
  };

  const set = (key: string, value: string) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const element = (
    <Dialog open={Boolean(spec)} onOpenChange={o => !o && setSpec(null)}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>{spec?.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            {spec?.fields.map(f => (
              <div key={f.key} className={f.half ? "" : "col-span-2"}>
                <Label className="text-xs">{f.label}</Label>
                {f.kind === "textarea" ? (
                  <Textarea
                    value={values[f.key] ?? ""}
                    onChange={e => set(f.key, e.target.value)}
                    rows={2}
                    className="rounded-lg mt-1 resize-none text-sm"
                  />
                ) : (
                  <Input
                    type={f.kind === "text" || !f.kind ? "text" : f.kind}
                    value={values[f.key] ?? ""}
                    onChange={e => set(f.key, e.target.value)}
                    className="rounded-lg mt-1"
                  />
                )}
              </div>
            ))}
          </div>
          {spec?.note && (
            <p className="text-[11px] text-muted-foreground">{spec.note}</p>
          )}
          <Button onClick={save} className="w-full rounded-lg" disabled={busy}>
            {spec?.submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { openEdit, openClone, remove, element };
}
