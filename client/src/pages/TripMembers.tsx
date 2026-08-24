/**
 * Who is on the trip, who was invited and hasn't answered, and what everyone
 * is allowed to do.
 *
 * Replaces the invite dialog that used to hang off the trip header, which could
 * send a link but could not tell you whether anyone had accepted it.
 */
import { useMemo, useState } from "react";
import { useParams } from "wouter";
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
  PawPrint,
  Baby,
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
  const assignMember = trpc.groups.assignMember.useMutation();
  const setVotingUnit = trpc.groups.setVotingUnit.useMutation();
  const addAttendee = trpc.groups.addAttendee.useMutation();
  const removeAttendee = trpc.groups.removeAttendee.useMutation();

  const [newGroupName, setNewGroupName] = useState("");
  // Creating your family and then not being in it is nobody's intent.
  const [joinNewGroup, setJoinNewGroup] = useState(true);
  const [addToGroup, setAddToGroup] = useState<number | null>(null);
  // The plan returned by a preview, held until the person confirms it. Null
  // means nothing is pending; the import writes nothing until this is acted on.
  const [importPlan, setImportPlan] = useState<any | null>(null);
  const [attendeeFor, setAttendeeFor] = useState<number | null | undefined>(
    undefined
  );
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

  const accepted = members?.filter((m: any) => m.status === "accepted") ?? [];
  const myGroupId =
    accepted.find((m: any) => m.userId === user?.id)?.groupId ?? null;
  const groupName = (id: number) =>
    (groups ?? []).find((g: any) => g.id === id)?.name ?? "Group";
  /** Admins act on any group; a tripmate acts on their own and nobody else's. */
  const canAddTo = (groupId: number | null) =>
    isAdmin || (groupId != null && groupId === myGroupId);
  /**
   * Mirrors `mayAssign` on the server. The server is what enforces it — this
   * only decides whether to draw the control.
   */
  const canMove = (m: { userId: number; groupId: number | null }) =>
    isAdmin ||
    m.userId === user?.id ||
    (myGroupId != null && m.groupId === myGroupId);
  /** Who this group could take: yourself, and anyone you may move. */
  const movableInto = (groupId: number) =>
    accepted.filter(
      (m: any) => m.groupId !== groupId && canMove(m) && m.role !== "watcher"
    );
  const pendingInvites =
    invites?.filter((i: any) => i.status === "pending") ?? [];
  const answeredInvites =
    invites?.filter((i: any) => i.status !== "pending") ?? [];

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

  const handleAssign = async (userId: number, groupId: number | null) => {
    try {
      const res = await assignMember.mutateAsync({ tripId, userId, groupId });
      refreshGroups();
      // Say it out loud. A vote disappearing from a proposal with no
      // explanation is worse than the move itself.
      if (res.votesSuperseded > 0)
        toast.success(
          `Moved. ${res.votesSuperseded} duplicate ${res.votesSuperseded === 1 ? "vote was" : "votes were"} dropped, so each group holds one.`
        );
      else toast.success("Moved");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't move them");
    }
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

  const handleAddAttendee = async () => {
    if (!attendeeName.trim()) return toast.error("A name is needed");
    try {
      await addAttendee.mutateAsync({
        tripId,
        groupId: attendeeFor ?? null,
        name: attendeeName.trim(),
        kind: attendeeKind,
        age:
          attendeeKind === "pet" || !attendeeAge ? null : Number(attendeeAge),
      });
      setAttendeeName("");
      setAttendeeAge("");
      setAttendeeFor(undefined);
      refreshGroups();
      toast.success("Added to the trip");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't add them");
    }
  };

  const handleRemoveAttendee = async (id: number) => {
    try {
      await removeAttendee.mutateAsync({ id });
      refreshGroups();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't remove them");
    }
  };

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
            <Card key={g.id} className="border-border/50">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium flex-1 truncate">
                    {g.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {headcountLabel(headcount, g.id)}
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
                  {accepted
                    .filter((m: any) => m.groupId === g.id)
                    .map((m: any) => {
                      const isMe = m.userId === user?.id;
                      return (
                        <span
                          key={`m${m.userId}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                            isMe
                              ? "border-primary/40 bg-primary/5"
                              : "border-border/60"
                          }`}
                        >
                          {m.user?.name || "Member"}
                          {isMe && (
                            <span className="text-muted-foreground">(you)</span>
                          )}
                          {canMove(m) && (
                            <button
                              onClick={() => handleAssign(m.userId, null)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={
                                isMe
                                  ? `Leave ${g.name}`
                                  : `Remove ${m.user?.name || "member"} from ${g.name}`
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}

                  {movableInto(g.id).length > 0 && (
                    <button
                      onClick={() => setAddToGroup(g.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      {myGroupId === g.id ? "Add member" : "Join or add"}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(attendees ?? [])
                    .filter((a: any) => a.groupId === g.id)
                    .map((a: any) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px]"
                      >
                        {a.kind === "pet" ? (
                          <PawPrint className="h-3 w-3 text-muted-foreground" />
                        ) : a.kind === "child" ? (
                          <Baby className="h-3 w-3 text-muted-foreground" />
                        ) : null}
                        {a.name}
                        {/* Never for a pet, and never to a watcher — the
                            server strips it either way. */}
                        {a.age != null && (
                          <span className="text-muted-foreground">{a.age}</span>
                        )}
                        {canAddTo(g.id) && a.memberUserId == null && (
                          <button
                            onClick={() => handleRemoveAttendee(a.id)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${a.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  {canAddTo(g.id) && (
                    <button
                      onClick={() => setAttendeeFor(g.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" /> Add someone
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ungrouped is a normal state, not an error: a trip that never wanted
            families still has everybody here. */}
        {(attendees ?? []).some((a: any) => a.groupId == null) && (
          <Card className="border-border/50 border-dashed">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium flex-1">
                  Not in a group
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {headcountLabel(headcount, null)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(attendees ?? [])
                  .filter((a: any) => a.groupId == null)
                  .map((a: any) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px]"
                    >
                      {a.kind === "pet" ? (
                        <PawPrint className="h-3 w-3 text-muted-foreground" />
                      ) : a.kind === "child" ? (
                        <Baby className="h-3 w-3 text-muted-foreground" />
                      ) : null}
                      {a.name}
                      {a.age != null && (
                        <span className="text-muted-foreground">{a.age}</span>
                      )}
                      {isAdmin && a.memberUserId == null && (
                        <button
                          onClick={() => handleRemoveAttendee(a.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${a.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                {isAdmin && (
                  <button
                    onClick={() => setAttendeeFor(null)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> Add someone
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

      {/* Add someone with no account: a child, a partner, the dog. */}
      <Dialog
        open={attendeeFor !== undefined}
        onOpenChange={open => !open && setAttendeeFor(undefined)}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add someone to the trip</DialogTitle>
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
            <Button
              onClick={handleAddAttendee}
              className="w-full rounded-lg"
              disabled={addAttendee.isPending}
            >
              Add them
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
