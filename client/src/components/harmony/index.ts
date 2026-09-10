/**
 * Trip Harmony's shared design-system layer.
 *
 * Kept separate from components/ui/ so the stock shadcn primitives stay
 * upgradeable. Pages should import from here, not reach past it into ui/.
 *
 * Spec: design-system/MASTER.md §6
 */

export {
  IconTile, StatusPill, Meta, Surface, EmptyState, SectionHead,
  StaggerList, StaggerItem, PageGrid, GridSpan,
  type SurfaceProps,
} from "./primitives";

export { StatCard, SectionCard, Meter, type StatCardProps, type SectionCardProps } from "./cards";

export { ProposalCard, CardMedia, type ProposalCardProps } from "./ProposalCard";

export { VoteControl, VoteBar, ScoreChip } from "./VoteControl";

export { AvatarStack, type Person } from "./AvatarStack";

export { BottomSheet, type BottomSheetProps } from "./BottomSheet";

export { ChipPicker, StickyActionBar, Fab, StatusScreen, type ChipOption } from "./controls";

export { tone, TONES, type ToneClasses } from "./tone";

export * from "./motion";
