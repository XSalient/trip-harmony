import {
  Bed, Bike, Bus, Calendar, CalendarDays, Check, Coffee, DollarSign, FileText,
  Home, Lightbulb, MapPin, MessageCircle, MessageSquare, PartyPopper, Plane,
  Scale, Shield, Sparkles, Ticket, TrendingUp, UserPlus, Utensils, Vote,
  Wallet, type LucideIcon,
} from "lucide-react";

/**
 * One home for every "type -> icon + colour + label" map in the app. These
 * were previously redeclared in Notifications, TripBudget, TripItinerary,
 * TripReferee and Home, each with its own hardcoded palette classes.
 *
 * `tone` names a semantic token family; components turn it into classes so
 * status/category colours never appear as raw utilities in a page.
 */
export type Tone =
  | "neutral" | "primary" | "success" | "warning" | "danger" | "info"
  | "cat-1" | "cat-2" | "cat-3" | "cat-4" | "cat-5" | "cat-6";

export interface TaxonomyEntry {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  /** Optional one-line description for empty states and tooltips. */
  hint?: string;
}

function lookup<T extends Record<string, TaxonomyEntry>>(
  map: T,
  fallback: TaxonomyEntry
) {
  return (key: string | null | undefined): TaxonomyEntry =>
    (key && map[key]) || fallback;
}

/* -------------------------------------------------------------- budget --- */

export const BUDGET_CATEGORIES: Record<string, TaxonomyEntry> = {
  accommodation: { label: "Stays", icon: Home, tone: "cat-1" },
  transport: { label: "Transport", icon: Bus, tone: "cat-5" },
  food: { label: "Food & drink", icon: Utensils, tone: "cat-2" },
  activities: { label: "Activities", icon: Ticket, tone: "cat-3" },
  other: { label: "Other", icon: Wallet, tone: "cat-6" },
};
export const budgetCategory = lookup(BUDGET_CATEGORIES, BUDGET_CATEGORIES.other);

/* ------------------------------------------------------- notifications --- */

export const NOTIFICATION_TYPES: Record<string, TaxonomyEntry> = {
  invite: { label: "Invite", icon: UserPlus, tone: "cat-1" },
  vote_request: { label: "Needs your vote", icon: Vote, tone: "cat-4" },
  budget_alert: { label: "Budget", icon: TrendingUp, tone: "danger" },
  consensus: { label: "Agreed", icon: Check, tone: "success" },
  phase_change: { label: "Update", icon: Sparkles, tone: "warning" },
};
export const notificationType = lookup(NOTIFICATION_TYPES, {
  label: "Update", icon: MessageCircle, tone: "neutral",
});

/* ----------------------------------------------------------- itinerary --- */

export const ITINERARY_TYPES: Record<string, TaxonomyEntry> = {
  activity: { label: "Activity", icon: Ticket, tone: "cat-1" },
  food: { label: "Food & drink", icon: Coffee, tone: "cat-2" },
  transport: { label: "Transport", icon: Plane, tone: "cat-5" },
  accommodation: { label: "Stay", icon: Bed, tone: "cat-3" },
  free: { label: "Free time", icon: Bike, tone: "neutral" },
  other: { label: "Other", icon: MapPin, tone: "cat-6" },
};
export const itineraryType = lookup(ITINERARY_TYPES, ITINERARY_TYPES.other);

/* ------------------------------------------------------------- referee --- */

export const REFEREE_TYPES: Record<string, TaxonomyEntry> = {
  nudge: { label: "Nudge", icon: MessageCircle, tone: "cat-1" },
  mediation: { label: "Mediation", icon: Shield, tone: "cat-4" },
  compromise: { label: "Compromise", icon: Lightbulb, tone: "cat-6" },
  celebration: { label: "Good news", icon: PartyPopper, tone: "cat-3" },
  summary: { label: "Summary", icon: FileText, tone: "neutral" },
};
export const refereeType = lookup(REFEREE_TYPES, {
  label: "Note", icon: Scale, tone: "neutral",
});

/* -------------------------------------------------------- trip phases --- */

/** Ordered — the phase tracker relies on this sequence. */
export const TRIP_PHASES = [
  { key: "dates", label: "Dates", icon: CalendarDays, href: "dates" },
  { key: "destination", label: "Destination", icon: MapPin, href: "destinations" },
  { key: "accommodation", label: "Stay", icon: Home, href: "accommodations" },
  { key: "booked", label: "Booked", icon: Check, href: "" },
] as const;

export type PhaseKey = (typeof TRIP_PHASES)[number]["key"] | "finalized";

export const PHASE_META: Record<string, TaxonomyEntry> = {
  dates: { label: "Picking dates", icon: CalendarDays, tone: "cat-1" },
  destination: { label: "Choosing where", icon: MapPin, tone: "cat-5" },
  accommodation: { label: "Finding a stay", icon: Home, tone: "cat-4" },
  booked: { label: "Booked", icon: Check, tone: "success" },
  finalized: { label: "Finalised", icon: Check, tone: "success" },
};
export const phaseMeta = lookup(PHASE_META, PHASE_META.dates);

/** Zero-based index of a phase, for progress trackers. */
export function phaseIndex(phase: string | null | undefined): number {
  if (phase === "finalized" || phase === "booked") return TRIP_PHASES.length - 1;
  const i = TRIP_PHASES.findIndex(p => p.key === phase);
  return i < 0 ? 0 : i;
}

/* ------------------------------------------------- preference sections --- */

export const PREFERENCE_SECTIONS = [
  {
    key: "mustHaves" as const,
    label: "Must-haves",
    icon: Check,
    tone: "success" as Tone,
    prompt: "Non-negotiable. Proposals that fail these get flagged.",
    placeholder: "Ground floor or lift (bad knee) · at least 3 bathrooms · full kitchen",
    suggestions: ["Step-free access", "Private bathroom", "Full kitchen", "Air conditioning", "Parking"],
  },
  {
    key: "strongPreferences" as const,
    label: "Strong preferences",
    icon: Sparkles,
    tone: "info" as Tone,
    prompt: "Important, not absolute. Used for scoring.",
    placeholder: "Pool for the kids · big kitchen · near the beach",
    suggestions: ["Pool", "Near transit", "Sea view", "Quiet area", "Workspace"],
  },
  {
    key: "avoids" as const,
    label: "Avoids",
    icon: MessageSquare,
    tone: "danger" as Tone,
    prompt: "Things that would make you vote no.",
    placeholder: "No long stair climbs · not too remote · no shared bathrooms",
    suggestions: ["Long stairs", "Remote location", "Shared bathroom", "Late checkout only", "No lift"],
  },
  {
    key: "openComments" as const,
    label: "Anything else",
    icon: MessageCircle,
    tone: "neutral" as Tone,
    prompt: "Context the AI should know.",
    placeholder: "Flexible on timings · early bedtime · vegan cooking",
    suggestions: ["Flexible dates", "Early riser", "Dietary needs", "Travelling with kids"],
  },
];

/* ---------------------------------------------------- travel DNA traits --- */

export const DNA_TRAITS: Record<
  string,
  TaxonomyEntry & { low: string; high: string; scale: string[] }
> = {
  budgetComfort: {
    label: "Budget comfort", icon: DollarSign, tone: "cat-6",
    low: "Frugal", high: "Splurge",
    scale: ["Every penny counts", "Careful spender", "Balanced", "Comfortable", "Treat yourself"],
  },
  socialEnergy: {
    label: "Social energy", icon: PartyPopper, tone: "cat-4",
    low: "Quiet", high: "Social",
    scale: ["Need alone time", "Small groups", "Balanced", "Loves company", "Life of the party"],
  },
  adventureLevel: {
    label: "Adventure", icon: Bike, tone: "cat-3",
    low: "Relaxed", high: "Daring",
    scale: ["Play it safe", "Gentle exploring", "Balanced", "Up for a lot", "Thrill seeker"],
  },
  planningStyle: {
    label: "Planning style", icon: Calendar, tone: "cat-1",
    low: "Spontaneous", high: "Structured",
    scale: ["Wing it", "Loose plan", "Balanced", "Mostly planned", "Every hour booked"],
  },
  culturalCuriosity: {
    label: "Cultural curiosity", icon: MapPin, tone: "cat-5",
    low: "Unwind", high: "Immerse",
    scale: ["Here to relax", "A little culture", "Balanced", "Keen explorer", "Deep dive"],
  },
  comfortNeed: {
    label: "Comfort need", icon: Bed, tone: "cat-2",
    low: "Rough it", high: "Pampered",
    scale: ["Happy roughing it", "Simple is fine", "Balanced", "Comfort matters", "Only the best"],
  },
  foodPriority: {
    label: "Food priority", icon: Utensils, tone: "cat-2",
    low: "Fuel", high: "Foodie",
    scale: ["Food is fuel", "Easy going", "Balanced", "Enjoys good food", "Trip is the food"],
  },
  activityPace: {
    label: "Pace", icon: TrendingUp, tone: "cat-3",
    low: "Slow", high: "Packed",
    scale: ["Very slow", "Leisurely", "Balanced", "Busy days", "Dawn to midnight"],
  },
};

/** Turn a 1–10 slider value into its semantic word. */
export function traitWord(key: string, value: number): string {
  const trait = DNA_TRAITS[key];
  if (!trait) return String(value);
  const i = Math.min(trait.scale.length - 1, Math.max(0, Math.round(((value - 1) / 9) * (trait.scale.length - 1))));
  return trait.scale[i];
}
