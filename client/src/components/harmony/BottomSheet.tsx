import { type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Rendered in a sticky footer, safe-area padded. */
  footer?: ReactNode;
  /** `tall` caps at 92dvh for long forms; `auto` hugs its content. */
  size?: "auto" | "tall";
  className?: string;
}

/**
 * A titled sheet: a named wrapper over `Dialog`, which is already a bottom
 * sheet on phones and a centred dialog from `sm` up (see the `sheet-surface`
 * utility and `useSheetDrag`).
 *
 * This used to render vaul's Drawer below `md` and Dialog above it. That gave
 * the app two sheet implementations with two sets of physics and two
 * breakpoints, reachable from the same screen — which is the kind of seam the
 * eye reads as "assembled" rather than "designed". One presentation, one
 * gesture, one breakpoint.
 *
 * Use this where the sheet has a title and a footer; use `Dialog` directly
 * where it does not.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "auto",
  className,
}: BottomSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(size === "tall" && "max-h-[92dvh] sm:max-h-[85dvh]", className)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="min-h-0">{children}</div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
