/**
 * A short physical acknowledgement of a tap.
 *
 * Haptics are one of the clearest differences between an app and a web page:
 * a vote that only changes colour feels like a form field; one that also taps
 * back feels like a control. This uses the Vibration API rather than adding a
 * Capacitor plugin — it works in the Android WebView and in Chrome, and is a
 * no-op everywhere else, so it costs nothing where it is unsupported.
 *
 * iOS Safari does not implement it. That is fine: this is reinforcement, never
 * the only feedback for an action.
 */

type Pattern = "select" | "impact" | "success" | "warning";

const PATTERNS: Record<Pattern, number | number[]> = {
  /** Choosing something — a vote, a chip, a tab. */
  select: 8,
  /** A heavier commitment — submitting, locking a decision in. */
  impact: 14,
  /** Completion worth noticing. */
  success: [10, 40, 16],
  /** Something refused or reverted. */
  warning: [18, 60, 18],
};

let enabled: boolean | null = null;

function supported(): boolean {
  if (enabled !== null) return enabled;
  enabled =
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function" &&
    // Respect the same preference that silences animation: somebody who has
    // asked for less motion has not asked for a buzzing phone either.
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return enabled;
}

export function haptic(pattern: Pattern = "select"): void {
  if (!supported()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some engines throw when the document is not focused. Never let feedback
    // break the action it is decorating.
  }
}
