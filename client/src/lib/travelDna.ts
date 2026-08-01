/**
 * The eight Travel DNA axes, with the wording and iconography the UI uses.
 *
 * Shared by the quiz (which asks the questions) and the profile (which plays
 * the answers back), so a reworded axis can never say two different things in
 * two places. Keys match the columns on `travel_dna`.
 */
import {
  Bed,
  ClipboardList,
  Globe,
  Mountain,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type TravelDnaTrait = {
  key: string;
  icon: LucideIcon;
  title: string;
  question: string;
  low: string;
  high: string;
  color: string;
};

export const travelDnaTraits: TravelDnaTrait[] = [
  {
    key: "budgetComfort",
    icon: Wallet,
    title: "Budget Comfort",
    question: "How do you feel about spending on trips?",
    low: "Budget-conscious",
    high: "Spare no expense",
    color: "text-chart-4",
  },
  {
    key: "socialEnergy",
    icon: Users,
    title: "Social Energy",
    question: "How social are you while traveling?",
    low: "Quiet & private",
    high: "Party animal",
    color: "text-chart-2",
  },
  {
    key: "adventureLevel",
    icon: Mountain,
    title: "Adventure Level",
    question: "What's your thrill tolerance?",
    low: "Relaxed & easy",
    high: "Extreme thrills",
    color: "text-primary",
  },
  {
    key: "planningStyle",
    icon: ClipboardList,
    title: "Planning Style",
    question: "How structured do you like your trips?",
    low: "Go with the flow",
    high: "Minute-by-minute",
    color: "text-chart-3",
  },
  {
    key: "culturalCuriosity",
    icon: Globe,
    title: "Cultural Curiosity",
    question: "How important is cultural immersion?",
    low: "Tourist classics",
    high: "Deep dive local",
    color: "text-chart-5",
  },
  {
    key: "comfortNeed",
    icon: Bed,
    title: "Comfort Need",
    question: "What's your accommodation standard?",
    low: "Hostel is fine",
    high: "5-star only",
    color: "text-chart-2",
  },
  {
    key: "foodPriority",
    icon: UtensilsCrossed,
    title: "Food Priority",
    question: "How important is food in your trip?",
    low: "Fuel, not focus",
    high: "Foodie first",
    color: "text-chart-4",
  },
  {
    key: "activityPace",
    icon: Zap,
    title: "Activity Pace",
    question: "How packed should each day be?",
    low: "Slow & relaxed",
    high: "Non-stop action",
    color: "text-primary",
  },
];

/**
 * A one-line characterisation of a profile, e.g. "Comfort-seeking foodie".
 * Picks the two axes furthest from the middle so the summary says something
 * specific rather than describing an average traveller.
 */
export function summariseTravelDna(
  dna: Record<string, unknown> | null | undefined
): string | null {
  if (!dna) return null;
  const scored = travelDnaTraits
    .map(trait => {
      const value = dna[trait.key];
      if (typeof value !== "number") return null;
      return { trait, value, distance: Math.abs(value - 5.5) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 2);

  if (scored.length === 0) return null;
  // Everything within a point of the middle: a genuinely balanced traveller.
  if (scored[0].distance < 1.5) return "Easygoing all-rounder";

  return scored
    .map(({ trait, value }) => (value >= 5.5 ? trait.high : trait.low))
    .join(" · ");
}
