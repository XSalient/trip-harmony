/**
 * The trip page's sections, named once for both sides.
 *
 * This list used to be a union in `client/src/components/trip/useSectionState.ts`
 * and nowhere else, which was fine while the only question about a section was
 * whether this browser had it collapsed. A trip can now switch sections off for
 * everybody, so the server has to validate the keys it stores — and a key the
 * client knows about and the server does not is a section that silently cannot
 * be hidden.
 *
 * **Hidden is not collapsed.** Collapsed is per-person, per-device, and lives in
 * localStorage; hidden is one decision the trip's admin made for the whole
 * group, and lives in the database.
 */

export const TRIP_SECTIONS = [
  /**
   * Not hideable, and not an oversight: the summary is where the page says
   * whether the group is going yet, and every other section starts collapsed
   * precisely because it exists. A trip with everything switched off would
   * otherwise render an empty screen with no way back.
   */
  { key: "summary", label: "Summary", hideable: false },
  { key: "description", label: "Trip description", hideable: true },
  { key: "preferences", label: "My trip preferences", hideable: true },
  { key: "dates", label: "Dates", hideable: true },
  { key: "accommodations", label: "Accommodations", hideable: true },
  { key: "suggestions", label: "Suggestions", hideable: true },
  { key: "budget", label: "Budget", hideable: true },
  { key: "referee", label: "AI Referee", hideable: true },
] as const;

export type SectionKey = (typeof TRIP_SECTIONS)[number]["key"];

export const HIDEABLE_SECTIONS = TRIP_SECTIONS.filter(s => s.hideable);

/**
 * Non-empty by construction, because `z.enum` needs a tuple and refuses an
 * array that could be empty.
 */
export const HIDEABLE_SECTION_KEYS = HIDEABLE_SECTIONS.map(s => s.key) as [
  SectionKey,
  ...SectionKey[],
];

const KNOWN = new Set<string>(TRIP_SECTIONS.map(s => s.key));

/**
 * The stored blob, read back as keys this build understands.
 *
 * Unknown keys are dropped rather than kept: a section removed from the app
 * would otherwise leave a value that nothing can display and nothing can clear.
 * A blob that will not parse reads as "nothing hidden" — showing a section that
 * was meant to be hidden is recoverable in a tap; hiding the whole page because
 * one column held bad JSON is not.
 */
export function parseHiddenSections(
  raw: string | null | undefined
): SectionKey[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (k): k is SectionKey => typeof k === "string" && KNOWN.has(k)
    );
  } catch {
    return [];
  }
}

/** The label a screen shows when it has been switched off. */
export function sectionLabel(key: SectionKey): string {
  return TRIP_SECTIONS.find(s => s.key === key)?.label ?? key;
}
