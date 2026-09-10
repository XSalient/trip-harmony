import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { STANCE_TONE, type VoteStance } from "@/lib/voting";
import { tone as toneClasses } from "./tone";

export interface Person {
  id: number | string;
  name?: string | null;
  image?: string | null;
  /** When present, the avatar carries a small stance dot. */
  stance?: VoteStance;
}

const SIZES = {
  xs: { box: "size-6 text-[10px]", ring: "ring-2", overlap: "-ml-1.5" },
  sm: { box: "size-8 text-[11px]", ring: "ring-2", overlap: "-ml-2" },
  md: { box: "size-10 text-[13px]", ring: "ring-[3px]", overlap: "-ml-2.5" },
} as const;

/**
 * Overlapping member avatars with a "+N" overflow. Replaces the raw initials
 * divs that were hand-built in TripDashboard.
 */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
  className,
  onClick,
  label,
}: {
  people: Person[];
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
  onClick?: () => void;
  /** Accessible summary; defaults to the joined names. */
  label?: string;
}) {
  const s = SIZES[size];
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  const content = (
    <>
      {shown.map((p, i) => (
        <span
          key={p.id}
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-secondary-foreground ring-card",
            s.box,
            s.ring,
            i > 0 && s.overlap
          )}
          style={{ zIndex: shown.length - i }}
        >
          {p.image ? (
            <img
              src={p.image}
              alt=""
              className="size-full rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            initials(p.name)
          )}
          {p.stance && (
            <span
              aria-hidden
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card",
                toneClasses(STANCE_TONE[p.stance]).solid
              )}
            />
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold tabular text-muted-foreground ring-card",
            s.box,
            s.ring,
            s.overlap
          )}
        >
          +{extra}
        </span>
      )}
    </>
  );

  const cls = cn("flex shrink-0 items-center", className);
  const aria = label ?? `${people.length} members: ${people.map(p => p.name).filter(Boolean).join(", ")}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={aria}
        className={cn(
          cls,
          "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={cls} role="img" aria-label={aria}>
      {content}
    </span>
  );
}
