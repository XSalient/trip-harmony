export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/**
 * How long the AI Referee waits before it will analyse a trip again.
 *
 * Shared so the button and the server agree on when it is available; the server
 * is what enforces it. Long enough that a nervous refresh costs nothing, short
 * enough that a group actually mid-argument is not locked out.
 */
export const REFEREE_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * How much of the referee's cooldown is left, given when it last spoke.
 *
 * One function so the button and the server cannot disagree about whether the
 * referee is available — they were computing the same thing from opposite ends
 * and would have drifted the first time either was edited.
 *
 * Returns 0 when it has never run, or the window has passed.
 */
export function refereeCooldownRemainingMs(
  lastMessageAt: Date | string | null | undefined,
  now: number = Date.now()
): number {
  if (!lastMessageAt) return 0;
  const last = new Date(lastMessageAt).getTime();
  if (Number.isNaN(last)) return 0;
  return Math.max(0, REFEREE_COOLDOWN_MS - (now - last));
}
