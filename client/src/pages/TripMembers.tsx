/**
 * Who is on the trip, who was invited and hasn't answered, and what everyone
 * is allowed to do.
 *
 * Replaces the invite dialog that used to hang off the trip header, which could
 * send a link but could not tell you whether anyone had accepted it.
 */
import { useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import { trpc } from "@/lib/trpc";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import DraggableMemberChip, {
  DROP_ATTR,
  groupUnderPointer,
} from "@/components/trip/DraggableMemberChip";
import AttendeePill from "@/components/trip/AttendeePill";
import type { PanInfo } from "framer-motion";
import { format } from "date-fns";
import {
  Copy,
  Send,
  MoreVertical,
  UserPlus,
  BookUser,
  Trash2,
  Link2,
  Mail,
  Clock,
  Check,
  X,
  Users,
  Plus,
} from "lucide-react";
import {
  TRIP_ROLES,
  TRIP_ROLE_LABELS,
  TRIP_ROLE_DESCRIPTIONS,
  type TripRole,
} from "@shared/roles";

function RoleBadge({ role }: { role: TripRole }) {
  const tone =
    role === "admin"
      ? "bg-primary/10 text-primary border-primary/20"
      : role === "watcher"
        ? "bg-muted text-muted-foreground border-border"
        : "bg-chart-2/10 text-chart-2 border-chart-2/20";
  return (
    <Badge variant="outline" className={`text-[10px] ${tone}`}>
      {TRIP_ROLE_LABELS[role]}
    </Badge>
  );
}

/** How someone arrived, in words rather than an enum value. */
function JoinedVia({
  via,
  invitedByName,
}: {
  via: string | null | undefined;
  invitedByName?: string | null;
}) {
  if (via === "creator")
    return <span className="flex items-center gap-1">Created the trip</span>;
  if (via === "email")
    return (
      <span className="flex items-center gap-1">
        <Mail className="h-3 w-3" /> Email invite
        {invitedByName ? ` from ${invitedByName}` : ""}
      </span>
    );
  if (via === "link")
    return (
      <span className="flex items-center gap-1">
        <Link2 className="h-3 w-3" /> Invite link
      </span>
    );
  return <span className="text-muted-foreground/70">Not recorded</span>;
}

/**
 * For the ungrouped chips, which have no family to be removed from and so draw
 * no cross. Module-level so it is the same function on every render — an inline
 * `() => {}` would defeat the chip's `memo` on its own.
 */
const noop = () => {};

/** "2 adults · 2 children" for one group, from the single headcount source. */
function headcountLabel(headcount: any, groupId: number | null): string {
  const h = headcount?.byGroup?.[groupId == null ? "none" : String(groupId)];
  if (!h) return "";
  const parts: string[] = [];
  if (h.adults)
    parts.push(`${h.adults} ${h.adults === 1 ? "adult" : "adults"}`);
  if (h.children)
    parts.push(`${h.children} ${h.children === 1 ? "child" : "children"}`);
  if (h.pets) parts.push(`${h.pets} ${h.pets === 1 ? "pet" : "pets"}`);
  return parts.join(" · ");
}

export default function TripMembers() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");
  const utils = trpc.useUtils();

  const { data: trip } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  const { data: members, isLoading } = trpc.trips.members.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const {
    canAdminister: isAdmin,
    canContribute,
    canSeeMemberDetails: canSeeDetails,
  } = useTripRole(tripId);

  const { data: invites } = trpc.trips.invites.useQuery(
    { tripId },
    { enabled: tripId > 0 && canSeeDetails }
  );
  // Tripmates save members to their own book too, so this is no longer an
  // admin-only query — the invite form below is what stays admin-only.
  const { data: contacts } = trpc.contacts.list.useQuery(undefined, {
    enabled: canSeeDetails,
  });

  const { data: groups } = trpc.groups.list.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: attendees } = trpc.groups.attendees.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: headcount } = trpc.groups.headcount.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );

  const createGroup = trpc.groups.create.useMutation();
  const renameGroup = trpc.groups.rename.useMutation();
  const removeGroup = trpc.groups.remove.useMutation();
  /**
   * Moving somebody is applied to the cache first and confirmed afterwards.
   *
   * Waiting for the server meant the chip could not appear in its new card
   * until the mutation and a fistful of refetches had all landed, so the drag
   * read as a drag that did nothing and people did it again. The authoritative
   * answer still arrives — `onSettled` reconciles — but the person is not made
   * to watch for it. See ADR 0021 for which caches are patched and why.
   */
  const assignMember = trpc.groups.assignMember.useMutation({
    onMutate: async ({ userId, groupId }) => {
      // Stop refetches already in flight from landing on top of the patch.
      await Promise.all([
        utils.trips.members.cancel({ tripId }),
        utils.groups.attendees.cancel({ tripId }),
      ]);

      const previous = {
        members: utils.trips.members.getData({ tripId }),
        attendees: utils.groups.attendees.getData({ tripId }),
      };

      // The one that moves the chip. Everything below is so the rest of the
      // card agrees with it.
      utils.trips.members.setData({ tripId }, (old: any) =>
        old?.map((m: any) => (m.userId === userId ? { ...m, groupId } : m))
      );
      // A member's own attendee row follows them on the server
      // (`db.setMemberGroup`), so it follows them here too.
      utils.groups.attendees.setData({ tripId }, (old: any) =>
        old?.map((a: any) =>
          a.memberUserId === userId ? { ...a, groupId } : a
        )
      );

      return previous;
    },

    onSuccess: res => {
      // Say it out loud. A vote disappearing from a proposal with no
      // explanation is worse than the move itself.
      if (res.votesSuperseded > 0)
        toast.success(
          `Moved. ${res.votesSuperseded} duplicate ${res.votesSuperseded === 1 ? "vote was" : "votes were"} dropped, so each group holds one.`
        );
      else toast.success("Moved");
    },

    onError: (error, _vars, previous) => {
      // Put it back. A patch without a rollback leaves the screen lying
      // permanently, which is worse than the wait it replaced.
      if (previous) {
        utils.trips.members.setData({ tripId }, previous.members);
        utils.groups.attendees.setData({ tripId }, previous.attendees);
      }
      toast.error(error.message || "Couldn't move them — put back");
    },

    onSettled: () => {
      // Two, not the five `refreshGroups` fired. `groups.list` cannot have
      // changed — it reads `trip_groups` alone, no members and no counts — and
      // `trips.get` only moves when the trip votes by group, because the only
      // field affected is the voter denominator.
      utils.trips.members.invalidate({ tripId });
      utils.groups.headcount.invalidate({ tripId });
      if ((trip as any)?.votingUnit === "group")
        utils.trips.get.invalidate({ id: tripId });
    },
  });
  /**
   * Who is mid-move. The chip is already in its new card by then — this only
   * dims it, so a second drag before the server has answered is not offered.
   */
  const movingUserId = assignMember.isPending
    ? (assignMember.variables?.userId ?? null)
    : null;

  const setVotingUnit = trpc.groups.setVotingUnit.useMutation();
  const addAttendee = trpc.groups.addAttendee.useMutation();
  const editAttendee = trpc.groups.editAttendee.useMutation();
  const assignAttendee = trpc.groups.assignAttendee.useMutation();
  const removeAttendee = trpc.groups.removeAttendee.useMutation();

  const [newGroupName, setNewGroupName] = useState("");
  // Creating your family and then not being in it is nobody's intent.
  const [joinNewGroup, setJoinNewGroup] = useState(true);
  const [addToGroup, setAddToGroup] = useState<number | null>(null);
  // The plan returned by a preview, held until the person confirms it. Null
  // means nothing is pending; the import writes nothing until this is acted on.
  const [importPlan, setImportPlan] = useState<any | null>(null);
  // Who is being dragged, and which card the pointer is over. Both are needed:
  // the first to know what to move, the second only so the card can light up.
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null | undefined>(
    undefined
  );
  /**
   * The dialog's destination group, in both of its modes: which group a new
   * person is being added to, and which one the person being edited should end
   * up in. `undefined` is the third state and means the dialog is closed —
   * `null`, the ungrouped bucket, is a real answer here as everywhere else on
   * this page.
   */
  const [attendeeFor, setAttendeeFor] = useState<number | null | undefined>(
    undefined
  );
  /** The row being edited, or null when the dialog is adding somebody new. */
  const [attendeeEdit, setAttendeeEdit] = useState<any | null>(null);
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeKind, setAttendeeKind] = useState<"adult" | "child" | "pet">(
    "child"
  );
  const [attendeeAge, setAttendeeAge] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TripRole>("tripmate");
  const [saveToContacts, setSaveToContacts] = useState(true);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);

  const sendInvite = trpc.trips.sendInviteEmail.useMutation();
  const revokeInvite = trpc.trips.revokeInvite.useMutation();
  const updateRole = trpc.trips.updateMemberRole.useMutation();
  const removeMember = trpc.trips.removeMember.useMutation();
  const { data: contactGroups } = trpc.contacts.groups.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const saveGroupFromTrip = trpc.contacts.saveGroupFromTrip.useMutation();
  const importGroup = trpc.contacts.importGroupToTrip.useMutation();
  const removeContactGroup = trpc.contacts.removeGroup.useMutation();
  const addContact = trpc.contacts.add.useMutation();
  const addContactFromTrip = trpc.contacts.addFromTrip.useMutation();
  const removeContact = trpc.contacts.remove.useMutation();

  /** Emails already in the book, so a member row can say "saved" rather than offer again. */
  const savedEmails = useMemo(
    () =>
      new Set(
        (contacts ?? []).map((c: any) => String(c.email || "").toLowerCase())
      ),
    [contacts]
  );

  const handleSaveMember = async (userId: number) => {
    try {
      const saved = await addContactFromTrip.mutateAsync({ tripId, userId });
      await utils.contacts.list.invalidate();
      toast.success(`${saved.name} saved to your contacts`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save that contact");
    }
  };

  const inviteUrl = useMemo(
    () =>
      trip?.inviteCode
        ? `${window.location.origin}/join/${trip.inviteCode}`
        : "",
    [trip?.inviteCode]
  );

  const accepted = useMemo(
    () => members?.filter((m: any) => m.status === "accepted") ?? [],
    [members]
  );
  const myGroupId = useMemo(
    () => accepted.find((m: any) => m.userId === user?.id)?.groupId ?? null,
    [accepted, user?.id]
  );

  const groupName = usePersistFn(
    (id: number) =>
      (groups ?? []).find((g: any) => g.id === id)?.name ?? "Group"
  );
  /** Admins act on any group; a tripmate acts on their own and nobody else's. */
  const canAddTo = usePersistFn(
    (groupId: number | null) =>
      isAdmin || (groupId != null && groupId === myGroupId)
  );
  /**
   * Mirrors `mayAssign` on the server. The server is what enforces it — this
   * only decides whether to draw the control.
   */
  const canMove = usePersistFn(
    (m: { userId: number; groupId: number | null }) =>
      isAdmin ||
      m.userId === user?.id ||
      (myGroupId != null && m.groupId === myGroupId)
  );
  /** Who this group could take: yourself, and anyone you may move. */
  const movableInto = usePersistFn((groupId: number) =>
    accepted.filter(
      (m: any) => m.groupId !== groupId && canMove(m) && m.role !== "watcher"
    )
  );

  /**
   * Everything the cards need, bucketed once instead of filtered per card.
   *
   * Each of these used to be a fresh pass over the whole trip inside the render
   * of every group card, and `movableInto` was a pass per card on top of that —
   * so a page with six families did O(families × members) work on every render,
   * and a drag re-rendered on every pointer frame. The keys are strings because
   * "not in a group" is a real bucket here, and `null` is not a usable Map key
   * alongside numeric ids.
   */
  const bucketKey = (groupId: number | null) =>
    groupId == null ? "none" : String(groupId);

  const membersByGroup = useMemo(() => {
    const by = new Map<string, any[]>();
    for (const m of accepted) {
      const key = bucketKey(m.groupId);
      const bucket = by.get(key);
      if (bucket) bucket.push(m);
      else by.set(key, [m]);
    }
    return by;
  }, [accepted]);

  /** Only the people with no account — a member's own row is drawn as a chip. */
  const attendeesByGroup = useMemo(() => {
    const by = new Map<string, any[]>();
    for (const a of attendees ?? []) {
      if (a.memberUserId != null) continue;
      const key = bucketKey(a.groupId);
      const bucket = by.get(key);
      if (bucket) bucket.push(a);
      else by.set(key, [a]);
    }
    return by;
  }, [attendees]);

  const someoneIsUngrouped = useMemo(
    () =>
      accepted.some((m: any) => m.groupId == null) ||
      (attendees ?? []).some((a: any) => a.groupId == null),
    [accepted, attendees]
  );

  /**
   * How many people each card could take. Only ever compared against zero, so
   * the count is all that is kept — the list itself is built on demand, by the
   * dialog that actually shows it.
   */
  const movableCountByGroup = useMemo(() => {
    const counts = new Map<number, number>();
    for (const g of groups ?? []) counts.set(g.id, 0);
    for (const m of accepted) {
      if (m.role === "watcher" || !canMove(m)) continue;
      for (const g of groups ?? [])
        if (m.groupId !== g.id) counts.set(g.id, (counts.get(g.id) ?? 0) + 1);
    }
    return counts;
    // `canMove` is stable; what it reads is not, so those are the dependencies.
  }, [accepted, groups, canMove, isAdmin, user?.id, myGroupId]);

  /** "2 adults · 2 children" per card, built once from the one headcount source. */
  const headcountLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const g of groups ?? [])
      labels.set(String(g.id), headcountLabel(headcount, g.id));
    labels.set("none", headcountLabel(headcount, null));
    return labels;
  }, [headcount, groups]);

  const pendingInvites = useMemo(
    () => invites?.filter((i: any) => i.status === "pending") ?? [],
    [invites]
  );
  const answeredInvites = useMemo(
    () => invites?.filter((i: any) => i.status !== "pending") ?? [],
    [invites]
  );

  const handleInvite = async (email: string, name?: string) => {
    if (!email) return;
    try {
      // A tripmate can only invite a watcher. Pinned here rather than trusted
      // from the picker, so a stale selection cannot post a role the server
      // will refuse.
      const role: TripRole = isAdmin ? inviteRole : "watcher";
      await sendInvite.mutateAsync({ tripId, email, role });
      toast.success(`Invite sent to ${email}`);
      if (saveToContacts && name !== undefined) {
        // A contact saved here is a convenience only — it grants nothing.
        await addContact.mutateAsync({ name: name || email, email });
        utils.contacts.list.invalidate();
      }
      setInviteEmail("");
      utils.trips.invites.invalidate({ tripId });
    } catch (e: any) {
      toast.error(e?.message || "Failed to send invite");
    }
  };

  /**
   * For the paths that genuinely change the *list* of groups — creating,
   * renaming, removing, importing, switching the voting unit. Assigning a
   * member no longer comes through here: it patches the cache and reconciles
   * two queries rather than five (see `assignMember` above).
   */
  const refreshGroups = () => {
    utils.groups.list.invalidate({ tripId });
    utils.groups.attendees.invalidate({ tripId });
    utils.groups.headcount.invalidate({ tripId });
    utils.trips.members.invalidate({ tripId });
    // The denominator on every proposal screen changes with the grouping, and
    // it comes from `trips.get`.
    utils.trips.get.invalidate({ id: tripId });
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroup.mutateAsync({
        tripId,
        name: newGroupName.trim(),
        joinMe: joinNewGroup,
      });
      setNewGroupName("");
      refreshGroups();
      toast.success(
        joinNewGroup ? "Group added — you're in it" : "Group added"
      );
    } catch (e: any) {
      toast.error(e?.message || "Couldn't add that group");
    }
  };

  const handleRenameGroup = async (id: number, current: string) => {
    const name = window.prompt("Rename this group", current);
    if (!name || name === current) return;
    try {
      await renameGroup.mutateAsync({ id, name });
      refreshGroups();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't rename that group");
    }
  };

  const handleRemoveGroup = async (id: number) => {
    try {
      await removeGroup.mutateAsync({ id });
      refreshGroups();
      toast.success("Group removed. Everyone in it is still on the trip.");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't remove that group");
    }
  };

  /**
   * Which card the pointer is over, recomputed at most once a frame and only
   * set when the answer actually changes.
   *
   * Both halves matter. `groupUnderPointer` calls `elementsFromPoint`, which
   * forces layout, and this ran on every pointer event — several times a frame
   * on a trackpad. And the old handler set state unconditionally, so a drag
   * that never left one card still re-rendered the whole page a few hundred
   * times over the gesture.
   *
   * `Object.is` rather than `===` because `null` — the "Not in a group" card —
   * and `undefined` — no target at all — are different answers here, and the
   * difference is what makes dragging somebody out of a family possible.
   */
  const dragOverRef = useRef<number | null | undefined>(undefined);
  const hitTestQueued = useRef(false);

  const handleDragOver = usePersistFn((info: PanInfo) => {
    if (hitTestQueued.current) return;
    hitTestQueued.current = true;
    // Read the coordinates now: framer reuses the `PanInfo` object between
    // events, so by the next frame this one describes a later position.
    const point = { x: info.point.x, y: info.point.y };
    requestAnimationFrame(() => {
      hitTestQueued.current = false;
      const next = groupUnderPointer({ point } as PanInfo);
      if (Object.is(dragOverRef.current, next)) return;
      dragOverRef.current = next;
      setDragOver(next);
    });
  });

  const handleDragStart = usePersistFn((userId: number) => {
    dragOverRef.current = undefined;
    setDragging(userId);
  });

  /** The `×` on a chip: out of whichever family they are in, not into another. */
  const handleRemoveFromGroup = usePersistFn((userId: number) =>
    handleAssign(userId, null)
  );

  /**
   * Drops a member onto whatever card the pointer was released over.
   *
   * A drop outside every card is a cancelled drag, not a move to nowhere —
   * `undefined` from `groupUnderPointer` means no target, while `null` means
   * the "Not in a group" card, which is a real destination.
   */
  const handleDrop = usePersistFn((userId: number, info: PanInfo) => {
    // Read the target before clearing `dragging`: the hit test sees past this
    // chip by looking for `DRAGGING_ATTR`, which this state still carries.
    const target = groupUnderPointer(info);
    setDragging(null);
    dragOverRef.current = undefined;
    setDragOver(undefined);
    if (target === undefined) return;
    const current =
      accepted.find((m: any) => m.userId === userId)?.groupId ?? null;
    if (current === target) return;
    handleAssign(userId, target);
  });

  const handleSaveGroup = async (groupId: number) => {
    try {
      const res = await saveGroupFromTrip.mutateAsync({ tripId, groupId });
      await utils.contacts.groups.invalidate();
      await utils.contacts.list.invalidate();
      toast.success(
        res.added > 0
          ? `${res.name} saved — ${res.added} added${res.alreadyThere > 0 ? `, ${res.alreadyThere} already there` : ""}`
          : `${res.name} was already saved, with everyone in it`
      );
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save that group");
    }
  };

  /** Step one: ask what this would do. Writes nothing. */
  const previewImport = async (contactGroupId: number) => {
    try {
      const plan = await importGroup.mutateAsync({
        tripId,
        contactGroupId,
        role: isAdmin ? "tripmate" : "watcher",
        confirm: false,
      });
      setContactPickerOpen(false);
      setImportPlan({ ...plan, contactGroupId });
    } catch (e: any) {
      toast.error(e?.message || "Couldn't read that group");
    }
  };

  /** Step two, once they have seen who it would move. */
  const confirmImport = async () => {
    if (!importPlan) return;
    try {
      const res = await importGroup.mutateAsync({
        tripId,
        contactGroupId: importPlan.contactGroupId,
        role: isAdmin ? "tripmate" : "watcher",
        confirm: true,
      });
      // The two modes return different shapes; this is the acting one.
      if (!res.confirmed) return;
      setImportPlan(null);
      refreshGroups();
      utils.trips.invites.invalidate({ tripId });
      const parts = [];
      if (res.moved) parts.push(`${res.moved} moved`);
      if (res.invited) parts.push(`${res.invited} invited`);
      if (res.attendeesAdded) parts.push(`${res.attendeesAdded} added`);
      toast.success(`${res.groupName}: ${parts.join(", ") || "nothing to do"}`);
      if (res.votesSuperseded > 0)
        toast.info(
          `${res.votesSuperseded} ${res.votesSuperseded === 1 ? "vote was" : "votes were"} dropped: a group casts one vote, and regrouping means some of those were now duplicates.`
        );
      if (res.undelivered.length > 0)
        toast.error(
          `Couldn't email ${res.undelivered.join(", ")} — share the invite link with them instead.`
        );
    } catch (e: any) {
      toast.error(e?.message || "Couldn't add that group");
    }
  };

  /**
   * Fire-and-forget on purpose: the cache is patched synchronously inside
   * `onMutate`, so there is nothing left for a caller to wait for. Both the
   * outcomes worth reporting — the confirmation and the rollback — are the
   * mutation's own business.
   */
  const handleAssign = (userId: number, groupId: number | null) => {
    assignMember.mutate({ tripId, userId, groupId });
  };

  const handleVotingUnit = async (unit: "member" | "group") => {
    try {
      await setVotingUnit.mutateAsync({ tripId, votingUnit: unit });
      refreshGroups();
      toast.success(
        unit === "group"
          ? "Each group now casts one vote. Votes already cast are untouched — the first new vote in a group replaces its others."
          : "Everyone votes for themselves again."
      );
    } catch (e: any) {
      toast.error(e?.message || "Couldn't change that");
    }
  };

  /** Opens the dialog empty, to add somebody new to `groupId`. */
  const openAddAttendee = (groupId: number | null) => {
    setAttendeeEdit(null);
    setAttendeeName("");
    setAttendeeKind("child");
    setAttendeeAge("");
    setAttendeeFor(groupId);
  };

  /**
   * Opens the same dialog on somebody who is already here.
   *
   * `attendeeFor` is seeded with the group they are in, so the picker starts
   * on the truth and "Save" without touching it moves nobody.
   */
  const openEditAttendee = usePersistFn((a: any) => {
    setAttendeeEdit(a);
    setAttendeeName(a.name ?? "");
    setAttendeeKind(a.kind ?? "adult");
    setAttendeeAge(a.age == null ? "" : String(a.age));
    setAttendeeFor(a.groupId ?? null);
  });

  const closeAttendeeDialog = () => {
    setAttendeeFor(undefined);
    setAttendeeEdit(null);
    setAttendeeName("");
    setAttendeeAge("");
  };

  /**
   * One button for both modes.
   *
   * Editing is two calls rather than one because the server keeps them apart:
   * `editAttendee` corrects a name or an age, `assignAttendee` reorganises —
   * a different permission rule, and a different line in the activity trail.
   * The move goes second, so a rejected move does not silently discard the
   * rename that was accepted.
   */
  const handleSaveAttendee = async () => {
    if (!attendeeName.trim()) return toast.error("A name is needed");
    const age =
      attendeeKind === "pet" || !attendeeAge ? null : Number(attendeeAge);
    try {
      if (attendeeEdit) {
        await editAttendee.mutateAsync({
          id: attendeeEdit.id,
          name: attendeeName.trim(),
          kind: attendeeKind,
          age,
        });
        const to = attendeeFor ?? null;
        const moved = to !== (attendeeEdit.groupId ?? null);
        if (moved)
          await assignAttendee.mutateAsync({
            id: attendeeEdit.id,
            groupId: to,
          });
        closeAttendeeDialog();
        refreshGroups();
        toast.success(
          moved
            ? `Moved to ${to == null ? "no group" : groupName(to)}`
            : "Saved"
        );
        return;
      }
      await addAttendee.mutateAsync({
        tripId,
        groupId: attendeeFor ?? null,
        name: attendeeName.trim(),
        kind: attendeeKind,
        age,
      });
      closeAttendeeDialog();
      refreshGroups();
      toast.success("Added to the trip");
    } catch (e: any) {
      // Whatever landed before the failure is on screen either way.
      refreshGroups();
      toast.error(e?.message || "Couldn't save that");
    }
  };

  // Persisted for the same reason the drag handlers are: `AttendeePill` is
  // memoised, and a fresh closure per render would make that memo do nothing.
  const handleRemoveAttendee = usePersistFn(async (id: number) => {
    try {
      await removeAttendee.mutateAsync({ id });
      refreshGroups();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't remove them");
    }
  });

  const handleRoleChange = async (userId: number, role: TripRole) => {
    try {
      await updateRole.mutateAsync({ tripId, userId, role });
      toast.success("Role updated");
      utils.trips.members.invalidate({ tripId });
    } catch (e: any) {
      toast.error(e?.message || "Couldn't change that role");
    }
  };

  const handleRemove = async (userId: number) => {
    try {
      await removeMember.mutateAsync({ tripId, userId });
      toast.success("Member removed");
      utils.trips.members.invalidate({ tripId });
    } catch (e: any) {
      toast.error(e?.message || "Couldn't remove that member");
    }
  };

  if (isLoading) {
    return (
      <AppShell title="Members" showBack backHref={`/trips/${tripId}`}>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Members" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-5">
        {/* ── Who's coming ──
            Members are attendees too, so this is one count and not "members
            plus guests, mind the overlap". Pets are counted and shown, and
            never divided by. */}
        {headcount && (
          <Card className="bg-muted/40 border-border/50">
            <CardContent className="p-3 flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                {headcount.adults} {headcount.adults === 1 ? "adult" : "adults"}
                {headcount.children > 0 &&
                  ` · ${headcount.children} ${headcount.children === 1 ? "child" : "children"}`}
                {headcount.pets > 0 &&
                  ` · ${headcount.pets} ${headcount.pets === 1 ? "pet" : "pets"}`}
              </span>
            </CardContent>
          </Card>
        )}

        {/* ── Groups ── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Families and households
          </h2>

          {canContribute && (
            <Card className="border-border/50">
              <CardContent className="p-3 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a group, e.g. The Patels"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCreateGroup()}
                    className="rounded-lg h-9"
                  />
                  <Button
                    size="sm"
                    className="rounded-lg shrink-0"
                    onClick={handleCreateGroup}
                    disabled={createGroup.isPending}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={joinNewGroup}
                    onChange={e => setJoinNewGroup(e.target.checked)}
                    className="rounded"
                  />
                  Put me in it
                </label>

                {/* The switch lives here, beside the groups, because it is a
                    statement about the people and this is where its effect
                    can be seen. Admin-only even though the card is not: it
                    changes every vote denominator on the trip. */}
                {isAdmin && (
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">One vote per family</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(trip as any)?.votingUnit === "group"
                          ? "Each group casts one vote. Anyone in it can cast or change it."
                          : "Everyone votes for themselves."}
                      </p>
                    </div>
                    <Button
                      variant={
                        (trip as any)?.votingUnit === "group"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      className="rounded-lg shrink-0 text-xs h-8"
                      onClick={() =>
                        handleVotingUnit(
                          (trip as any)?.votingUnit === "group"
                            ? "member"
                            : "group"
                        )
                      }
                      disabled={setVotingUnit.isPending}
                    >
                      {(trip as any)?.votingUnit === "group" ? "On" : "Off"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(groups ?? []).length === 0 && !canContribute && (
            <p className="text-sm text-muted-foreground">
              Nobody is grouped on this trip.
            </p>
          )}

          {(groups ?? []).map((g: any) => (
            <Card
              key={g.id}
              {...{ [DROP_ATTR]: String(g.id) }}
              className={`transition-colors ${
                dragOver === g.id
                  ? "border-primary bg-primary/5"
                  : "border-border/50"
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium flex-1 truncate">
                    {g.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {headcountLabels.get(String(g.id))}
                  </span>
                  {canAddTo(g.id) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleRenameGroup(g.id, g.name)}
                          className="text-xs"
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSaveGroup(g.id)}
                          disabled={saveGroupFromTrip.isPending}
                          className="text-xs gap-2"
                        >
                          <BookUser className="h-3 w-3" /> Save to my contacts
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRemoveGroup(g.id)}
                          className="text-xs text-destructive focus:text-destructive gap-2"
                        >
                          <Trash2 className="h-3 w-3" /> Remove group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Who is in this family and has an account. Chips rather than
                    drag-and-drop: this page is used on a phone, where a drag
                    target this size is a coin toss and there is no keyboard
                    path at all. */}
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {(membersByGroup.get(String(g.id)) ?? []).map((m: any) => {
                    const isMe = m.userId === user?.id;
                    return (
                      <DraggableMemberChip
                        key={`m${m.userId}`}
                        userId={m.userId}
                        label={m.user?.name || "Member"}
                        isMe={isMe}
                        canMove={canMove(m)}
                        removeLabel={
                          isMe
                            ? `Leave ${g.name}`
                            : `Remove ${m.user?.name || "member"} from ${g.name}`
                        }
                        dragging={dragging === m.userId}
                        isPending={movingUserId === m.userId}
                        layoutId={`member-chip-${m.userId}`}
                        onRemove={handleRemoveFromGroup}
                        onDragStart={handleDragStart}
                        onDrag={handleDragOver}
                        onDragEnd={handleDrop}
                      />
                    );
                  })}

                  {(movableCountByGroup.get(g.id) ?? 0) > 0 && (
                    <button
                      onClick={() => setAddToGroup(g.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> Add a member
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(attendeesByGroup.get(String(g.id)) ?? []).map((a: any) => (
                    <AttendeePill
                      key={a.id}
                      attendee={a}
                      canEdit={canAddTo(g.id)}
                      onEdit={openEditAttendee}
                      onRemove={handleRemoveAttendee}
                    />
                  ))}
                  {canAddTo(g.id) && (
                    <button
                      onClick={() => openAddAttendee(g.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> Add without an account
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ungrouped is a normal state, not an error: a trip that never wanted
            families still has everybody here. */}
        {/* Shown while a drag is in progress even when it is empty, or there
            would be nowhere to drop somebody in order to take them out of a
            family. */}
        {(someoneIsUngrouped || dragging !== null) && (
          <Card
            {...{ [DROP_ATTR]: "none" }}
            className={`border-dashed transition-colors ${
              dragOver === null && dragging !== null
                ? "border-primary bg-primary/5"
                : "border-border/50"
            }`}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium flex-1">
                  Not in a group
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {headcountLabels.get("none")}
                </span>
              </div>

              {/* Members first, then the people with no account — the same two
                  rows every group card has. */}
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {(membersByGroup.get("none") ?? []).map((m: any) => (
                  <DraggableMemberChip
                    key={`m${m.userId}`}
                    userId={m.userId}
                    label={m.user?.name || "Member"}
                    isMe={m.userId === user?.id}
                    // Nothing to remove them from, so no cross — but they
                    // can still be dragged into a family.
                    canMove={canMove(m) && (groups ?? []).length > 0}
                    removeLabel=""
                    dragging={dragging === m.userId}
                    isPending={movingUserId === m.userId}
                    layoutId={`member-chip-${m.userId}`}
                    onRemove={noop}
                    onDragStart={handleDragStart}
                    onDrag={handleDragOver}
                    onDragEnd={handleDrop}
                  />
                ))}
                {(membersByGroup.get("none") ?? []).length > 0 &&
                  (groups ?? []).length === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      Add a family above to start grouping people.
                    </span>
                  )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(attendeesByGroup.get("none") ?? []).map((a: any) => (
                  <AttendeePill
                    key={a.id}
                    attendee={a}
                    canEdit={isAdmin}
                    onEdit={openEditAttendee}
                    onRemove={handleRemoveAttendee}
                  />
                ))}
                {isAdmin && (
                  <button
                    onClick={() => openAddAttendee(null)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> Add without an account
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Members ── */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            On this trip · {accepted.length}
          </h2>
          {accepted.map((m: any) => {
            const isMe = m.userId === user?.id;
            return (
              <Card key={m.id ?? m.userId} className="border-border/50">
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                    {(m.user?.name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {m.user?.name || "Member"}
                        {isMe && (
                          <span className="text-muted-foreground"> (you)</span>
                        )}
                      </span>
                      <RoleBadge role={m.role} />
                      {m.groupId != null && (
                        <Badge variant="outline" className="text-[10px]">
                          {groupName(m.groupId)}
                        </Badge>
                      )}
                    </div>
                    {/* Watchers get names and roles; everything below is detail. */}
                    {canSeeDetails && (
                      <>
                        {m.user?.email && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {m.user.email}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <JoinedVia
                            via={m.joinedVia}
                            invitedByName={m.invitedByName}
                          />
                          {m.joinedAt && (
                            <span>
                              · {format(new Date(m.joinedAt), "d MMM yyyy")}
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                  {/* Tripmates get this menu too, for saving someone they are
                      travelling with — and now for their own row, because
                      moving yourself into a group is the thing this page could
                      not do at all. An empty menu is worse than no menu, so it
                      only appears when it would hold something. */}
                  {canSeeDetails &&
                    ((!isMe && Boolean(m.user?.email)) ||
                      (isAdmin && !isMe) ||
                      (canMove(m) &&
                        ((groups ?? []).length > 0 || m.groupId != null))) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isMe &&
                            m.user?.email &&
                            (savedEmails.has(
                              String(m.user.email).toLowerCase()
                            ) ? (
                              <DropdownMenuItem
                                disabled
                                className="text-xs gap-2"
                              >
                                <BookUser className="h-3 w-3" /> In your
                                contacts
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleSaveMember(m.userId)}
                                disabled={addContactFromTrip.isPending}
                                className="text-xs gap-2"
                              >
                                <BookUser className="h-3 w-3" /> Save to my
                                contacts
                              </DropdownMenuItem>
                            ))}
                          {canMove(m) && (
                            <>
                              {(groups ?? []).map((g: any) => (
                                <DropdownMenuItem
                                  key={`g${g.id}`}
                                  disabled={m.groupId === g.id}
                                  onClick={() => handleAssign(m.userId, g.id)}
                                  className="text-xs"
                                >
                                  {isMe
                                    ? `Join ${g.name}`
                                    : `Move to ${g.name}`}
                                </DropdownMenuItem>
                              ))}
                              {m.groupId != null && (
                                <DropdownMenuItem
                                  onClick={() => handleAssign(m.userId, null)}
                                  className="text-xs"
                                >
                                  {isMe
                                    ? "Leave my group"
                                    : "Remove from group"}
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          {isAdmin && !isMe && (
                            <>
                              {TRIP_ROLES.map(r => (
                                <DropdownMenuItem
                                  key={r}
                                  disabled={m.role === r}
                                  onClick={() => handleRoleChange(m.userId, r)}
                                  className="text-xs"
                                >
                                  Make {TRIP_ROLE_LABELS[r]}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem
                                onClick={() => handleRemove(m.userId)}
                                className="text-xs text-destructive focus:text-destructive gap-2"
                              >
                                <Trash2 className="h-3 w-3" /> Remove from trip
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Pending invites ── */}
        {canSeeDetails && pendingInvites.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Invited · waiting to hear back
            </h2>
            {pendingInvites.map((i: any) => (
              <Card key={i.id} className="border-dashed border-border/60">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{i.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Invited as {TRIP_ROLE_LABELS[i.role as TripRole]} ·{" "}
                      {format(new Date(i.sentAt), "d MMM yyyy")}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={async () => {
                        await revokeInvite.mutateAsync({
                          tripId,
                          inviteId: i.id,
                        });
                        utils.trips.invites.invalidate({ tripId });
                        toast.success("Invite revoked");
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Answered invites: declined and revoked leave a record ── */}
        {canSeeDetails && answeredInvites.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Earlier invites
            </h2>
            {answeredInvites.map((i: any) => (
              <div
                key={i.id}
                className="flex items-center gap-2 text-xs text-muted-foreground px-1"
              >
                {i.status === "accepted" ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                <span className="truncate flex-1">{i.email}</span>
                <span className="capitalize">{i.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Invite ── */}
        {canContribute && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Invite someone
            </h2>

            <Card className="border-border/50">
              <CardContent className="p-3 space-y-3">
                <div>
                  <Label className="text-xs">Join as</Label>
                  {isAdmin ? (
                    <Select
                      value={inviteRole}
                      onValueChange={v => setInviteRole(v as TripRole)}
                    >
                      <SelectTrigger className="mt-1 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRIP_ROLES.map(r => (
                          <SelectItem key={r} value={r}>
                            {TRIP_ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    // Not a disabled Select: there is nothing to choose from, so
                    // a dropdown that cannot drop down is a control that lies.
                    <div className="mt-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                      {TRIP_ROLE_LABELS.watcher}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {TRIP_ROLE_DESCRIPTIONS[isAdmin ? inviteRole : "watcher"]}
                  </p>
                  {!isAdmin && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Tripmates can add watchers — people who follow the trip
                      without voting, so no decision waits on them. Ask an admin
                      to add someone who votes.
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Email</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="email"
                      placeholder="friend@example.com"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="flex-1 rounded-lg"
                    />
                    <Button
                      size="icon"
                      disabled={!inviteEmail || sendInvite.isPending}
                      onClick={() => handleInvite(inviteEmail, "")}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={saveToContacts}
                    onChange={e => setSaveToContacts(e.target.checked)}
                    className="rounded"
                  />
                  Save to my contacts so I don't type it again
                </label>

                <Button
                  variant="outline"
                  className="w-full rounded-lg gap-2"
                  onClick={() => setContactPickerOpen(true)}
                >
                  <BookUser className="h-4 w-4" />
                  Invite from my contacts
                  {contacts?.length ? ` (${contacts.length})` : ""}
                </Button>
              </CardContent>
            </Card>

            {/* Admins only, whatever the invite form above allows: this link
                makes tripmates, so handing it to a tripmate would hand out
                votes — the one thing the loosened invite rule protects. */}
            {isAdmin && (
              <Card className="border-border/50">
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Or share this link. Anyone who follows it joins as a
                    Tripmate.
                  </p>
                  <div className="flex gap-2">
                    <code className="flex-1 text-[11px] bg-muted p-2.5 rounded-lg break-all">
                      {inviteUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteUrl);
                        toast.success("Invite link copied!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ── Contact picker ── */}
      <Dialog open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My contacts</DialogTitle>
          </DialogHeader>

          {(contactGroups ?? []).length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Saved families
              </p>
              {(contactGroups ?? []).map((cg: any) => (
                <div
                  key={cg.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cg.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {cg.members.length}{" "}
                      {cg.members.length === 1 ? "person" : "people"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 shrink-0"
                    disabled={importGroup.isPending}
                    onClick={() => previewImport(cg.id)}
                  >
                    <UserPlus className="h-3 w-3" /> Add to trip
                  </Button>
                  <button
                    className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                    aria-label={`Forget ${cg.name}`}
                    onClick={async () => {
                      await removeContactGroup.mutateAsync({ id: cg.id });
                      utils.contacts.groups.invalidate();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="border-t border-border/50 pt-1" />
            </div>
          )}

          {!contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No saved contacts yet. Invite someone by email with "Save to my
              contacts" ticked, or save anyone — or a whole family — already on
              this trip from the ⋮ menu beside their name.
            </p>
          ) : (
            <div className="space-y-2 pt-1">
              {contacts.map((c: any) => {
                const alreadyOn = accepted.some(
                  (m: any) => m.userId === c.contactUserId
                );
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-border/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.email}
                      </p>
                    </div>
                    {alreadyOn ? (
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        On this trip
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 shrink-0"
                        disabled={sendInvite.isPending}
                        onClick={async () => {
                          await handleInvite(c.email);
                          setContactPickerOpen(false);
                        }}
                      >
                        <UserPlus className="h-3 w-3" /> Invite
                      </Button>
                    )}
                    <button
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={async () => {
                        await removeContact.mutateAsync({ id: c.id });
                        utils.contacts.list.invalidate();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* What adding a saved family would do, before it does any of it. The
          conflicts are named rather than counted: "Sam is already in The
          Patels" is the sentence somebody needs to make this decision. */}
      <Dialog
        open={importPlan !== null}
        onOpenChange={open => !open && setImportPlan(null)}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {importPlan?.groupName} to this trip</DialogTitle>
          </DialogHeader>
          {importPlan && (
            <div className="space-y-3 pt-1 text-sm">
              {importPlan.conflicts.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1.5">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Already in another group
                  </p>
                  {importPlan.conflicts.map((c: any) => (
                    <p
                      key={c.userId}
                      className="text-xs text-amber-900/80 dark:text-amber-200/80"
                    >
                      {c.name} is already on this trip in {c.currentGroupName}.
                      Adding this group moves them into {importPlan.groupName}.
                    </p>
                  ))}
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    A group casts one vote, so moving somebody can drop a vote
                    that has become a duplicate.
                  </p>
                </div>
              )}

              <ul className="space-y-1 text-muted-foreground text-xs">
                {!importPlan.groupExists && (
                  <li>Creates the group "{importPlan.groupName}".</li>
                )}
                {importPlan.willMove.length > 0 && (
                  <li>
                    Moves{" "}
                    {importPlan.willMove.map((m: any) => m.name).join(", ")}{" "}
                    into it.
                  </li>
                )}
                {importPlan.willInvite.length > 0 && (
                  <li>
                    Emails an invite to{" "}
                    {importPlan.willInvite
                      .map((i: any) => i.name || i.email)
                      .join(", ")}
                    {isAdmin ? " as tripmates." : " as watchers."}
                  </li>
                )}
                {importPlan.willAddAttendees.length > 0 && (
                  <li>
                    Adds{" "}
                    {importPlan.willAddAttendees
                      .map((a: any) => a.name)
                      .join(", ")}{" "}
                    to the headcount — no login, no vote.
                  </li>
                )}
                {importPlan.alreadyInThisGroup.length > 0 && (
                  <li>
                    Leaves{" "}
                    {importPlan.alreadyInThisGroup
                      .map((m: any) => m.name)
                      .join(", ")}{" "}
                    where they are — already in this group.
                  </li>
                )}
              </ul>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-lg"
                  onClick={() => setImportPlan(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-lg"
                  onClick={confirmImport}
                  disabled={importGroup.isPending}
                >
                  {importGroup.isPending ? "Adding…" : "Add them"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Move somebody into a group — yourself first, because putting your
          own family together is the common case and used to be impossible. */}
      <Dialog
        open={addToGroup !== null}
        onOpenChange={open => !open && setAddToGroup(null)}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              Add to {addToGroup != null ? groupName(addToGroup) : "group"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-1">
            {addToGroup != null &&
              [...movableInto(addToGroup)]
                .sort((a: any, b: any) =>
                  a.userId === user?.id ? -1 : b.userId === user?.id ? 1 : 0
                )
                .map((m: any) => (
                  <button
                    key={m.userId}
                    onClick={async () => {
                      const to = addToGroup;
                      setAddToGroup(null);
                      await handleAssign(m.userId, to);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                  >
                    <span className="flex-1 truncate">
                      {m.userId === user?.id ? "You" : m.user?.name || "Member"}
                    </span>
                    {m.groupId != null && (
                      <Badge variant="outline" className="text-[10px]">
                        {groupName(m.groupId)}
                      </Badge>
                    )}
                  </button>
                ))}
            {addToGroup != null && movableInto(addToGroup).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nobody left that you can move. Ask an admin for the rest.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Somebody with no account: a child, a partner, the dog. The same
          dialog adds them and, afterwards, corrects them — a name typed wrong
          or a group picked wrong used to mean removing them and starting
          again. */}
      <Dialog
        open={attendeeFor !== undefined}
        onOpenChange={open => !open && closeAttendeeDialog()}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {attendeeEdit
                ? `Edit ${attendeeEdit.name}`
                : "Add someone without an account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              They are counted in the headcount and in what the trip costs. They
              get no login, no vote and no emails.
            </p>
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={attendeeName}
                onChange={e => setAttendeeName(e.target.value)}
                className="rounded-lg mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">What are they?</Label>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {(["adult", "child", "pet"] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAttendeeKind(k)}
                    className={`rounded-lg border px-2 py-1.5 text-xs capitalize transition-colors ${
                      attendeeKind === k
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/60 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            {/* No age for a pet — the question does not apply, and the server
                drops one even if a caller sends it. */}
            {attendeeKind !== "pet" && (
              <div>
                <Label className="text-xs">Age (optional)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={attendeeAge}
                  onChange={e => setAttendeeAge(e.target.value)}
                  className="rounded-lg mt-1"
                />
              </div>
            )}
            {/* Only when editing: which family they are in. Adding already
                knows, because the `+` that opened this belongs to a card.
                Every destination is offered and the server is the authority —
                the same rule that governs moving a member, `mayMoveBetween`. */}
            {attendeeEdit && (groups ?? []).length > 0 && (
              <div>
                <Label className="text-xs">Which group?</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[...(groups ?? []).map((g: any) => g), null].map(
                    (g: any, i: number) => {
                      const id = g ? g.id : null;
                      return (
                        <button
                          key={g ? `g${g.id}` : `none${i}`}
                          type="button"
                          onClick={() => setAttendeeFor(id)}
                          className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                            (attendeeFor ?? null) === id
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border/60 text-muted-foreground hover:border-border"
                          }`}
                        >
                          {g ? g.name : "Not in a group"}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            )}
            <Button
              onClick={handleSaveAttendee}
              className="w-full rounded-lg"
              disabled={
                addAttendee.isPending ||
                editAttendee.isPending ||
                assignAttendee.isPending
              }
            >
              {attendeeEdit ? "Save" : "Add them"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
