import { type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
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
 * A bottom sheet on phones, a centred dialog from `md` up.
 *
 * The app had ~60 centred `Dialog`s, several of them long forms, which is a
 * poor fit for a 390px screen. vaul was already a dependency but only reachable
 * from an unrouted demo page.
 *
 * Important: the variant is chosen by viewport and must not flip while open —
 * React would remount and lose child state. Every form here keeps its state at
 * page level, so a remount on rotation is harmless; keep it that way.
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
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn(
            "rounded-t-[1.75rem] border-border/70",
            size === "tall" ? "max-h-[92dvh]" : "max-h-[88dvh]",
            className
          )}
        >
          <DrawerHeader className="px-5 pb-2 pt-1 text-left">
            <DrawerTitle className="font-display text-xl font-bold tracking-tight">
              {title}
            </DrawerTitle>
            {description && (
              <DrawerDescription className="text-sm">{description}</DrawerDescription>
            )}
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
            {children}
          </div>

          {footer && (
            <DrawerFooter className="safe-area-bottom gap-2 border-t border-border/70 bg-card px-5 pt-3">
              {footer}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-lg gap-4 rounded-2xl", size === "tall" && "max-h-[85dvh]", className)}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold tracking-tight">
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className={cn("min-h-0", size === "tall" && "overflow-y-auto")}>{children}</div>

        {footer && <DialogFooter className="gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
