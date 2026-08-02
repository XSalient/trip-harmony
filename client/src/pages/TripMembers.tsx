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

export default function TripMembers() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");
  const utils = trpc.useUtils();

  const { data: trip } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  const { data: myRole } = trpc.trips.myRole.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: members, isLoading } = trpc.trips.members.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const isAdmin = myRole?.role === "admin";
  const canSeeDetails = myRole?.role !== "watcher";

  const { data: invites } = trpc.trips.invites.useQuery(
    { tripId },
    { enabled: tripId > 0 && canSeeDetails }
  );
  const { data: contacts } = trpc.contacts.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TripRole>("tripmate");
  const [saveToContacts, setSaveToContacts] = useState(true);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);

  const sendInvite = trpc.trips.sendInviteEmail.useMutation();
  const revokeInvite = trpc.trips.revokeInvite.useMutation();
  const updateRole = trpc.trips.updateMemberRole.useMutation();
  const removeMember = trpc.trips.removeMember.useMutation();
  const addContact = trpc.contacts.add.useMutation();
  const removeContact = trpc.contacts.remove.useMutation();

  const inviteUrl = useMemo(
    () =>
      trip?.inviteCode
        ? `${window.location.origin}/join/${trip.inviteCode}`
        : "",
    [trip?.inviteCode]
  );

  const accepted = members?.filter((m: any) => m.status === "accepted") ?? [];
  const pendingInvites =
    invites?.filter((i: any) => i.status === "pending") ?? [];
  const answeredInvites =
    invites?.filter((i: any) => i.status !== "pending") ?? [];

  const handleInvite = async (email: string, name?: string) => {
    if (!email) return;
    try {
      await sendInvite.mutateAsync({ tripId, email, role: inviteRole });
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
                  {isAdmin && !isMe && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
        {isAdmin && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Invite someone
            </h2>

            <Card className="border-border/50">
              <CardContent className="p-3 space-y-3">
                <div>
                  <Label className="text-xs">Join as</Label>
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
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {TRIP_ROLE_DESCRIPTIONS[inviteRole]}
                  </p>
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

            <Card className="border-border/50">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Or share this link. Anyone who follows it joins as a Tripmate.
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
          </div>
        )}
      </div>

      {/* ── Contact picker ── */}
      <Dialog open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My contacts</DialogTitle>
          </DialogHeader>
          {!contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No saved contacts yet. Invite someone by email with "Save to my
              contacts" ticked and they'll appear here.
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
    </AppShell>
  );
}
