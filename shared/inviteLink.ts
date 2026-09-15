/**
 * Whether a trip's shared invite link is answering, and what to say when it is
 * not.
 *
 * The link was an open door: following it wrote an accepted membership, so
 * possession of a URL was membership. It is now three facts an admin sets — is
 * it on, how many more people may it admit, and when does it stop regardless —
 * and this module is the one place that reads them.
 * See [ADR-0028](../docs/adr/0028-the-shared-link-is-off-by-default.md).
 *
 * Shared because three screens and one procedure ask the same question: the
 * join screen (should there be a button), the members screen (what does the
 * card say), and `trips.join` (may this person in). The server is what enforces
 * it — `spendInviteLinkUse` is the gate, and it is a conditional UPDATE so two
 * people tapping at once cannot both take the last use. This decides what
 * everybody is *told*, which is why the wording lives beside the rule rather
 * than being written out three times.
 */

/** The three columns, as any caller has them. */
export interface InviteLinkState {
  inviteLinkEnabled?: boolean | null;
  inviteUsesLeft?: number | null;
  inviteLinkExpiresAt?: Date | string | null;
}

/** Why the link is not admitting anybody. Null means it is. */
export type InviteLinkClosure = "off" | "spent" | "expired";

/**
 * A link that has never been given a number is as closed as one that has run
 * out: the switch and the count are set together, and a count of null is the
 * state of every trip that predates them.
 */
export function inviteLinkClosure(
  link: InviteLinkState | null | undefined,
  now: Date = new Date()
): InviteLinkClosure | null {
  if (!link?.inviteLinkEnabled) return "off";
  const expiry = link.inviteLinkExpiresAt
    ? new Date(link.inviteLinkExpiresAt)
    : null;
  // An unparseable date is not an excuse to let somebody in.
  if (
    expiry &&
    (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime())
  )
    return "expired";
  if (typeof link.inviteUsesLeft !== "number" || link.inviteUsesLeft <= 0)
    return "spent";
  return null;
}

export function inviteLinkIsOpen(
  link: InviteLinkState | null | undefined,
  now: Date = new Date()
): boolean {
  return inviteLinkClosure(link, now) === null;
}

/**
 * What the person holding the link is told.
 *
 * Deliberately the same sentence for all three: which of them it is, is the
 * trip's business. "This link has been used 5 times" tells a stranger how
 * popular the trip is and invites them to try again later; "ask an admin" is
 * the only thing that is any use to them anyway.
 */
export const INVITE_LINK_CLOSED_MESSAGE =
  "This invite link isn't accepting anyone at the moment. Ask a trip admin for a new one.";

/** What the admin is told, on the card where they can do something about it. */
export function inviteLinkStatusLabel(
  link: InviteLinkState | null | undefined,
  now: Date = new Date()
): string {
  switch (inviteLinkClosure(link, now)) {
    case "off":
      return "Off — nobody can join with this link";
    case "expired":
      return "Expired — nobody can join until you set a new date";
    case "spent":
      return "Used up — nobody else can join until you allow more";
    default: {
      const left = link?.inviteUsesLeft ?? 0;
      return `On — ${left} ${left === 1 ? "person" : "people"} can still join`;
    }
  }
}
