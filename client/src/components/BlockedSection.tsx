/**
 * Who you have blocked, and the way back.
 *
 * Apple's guideline 1.2 wants blocking; a block list is what makes it a
 * decision rather than a trapdoor. Blocking happens in the moment, on a comment
 * that has just annoyed somebody — this is the screen where that can be undone
 * later, when they have calmed down and cannot remember who they blocked.
 *
 * Shaped after `PasskeySection`, which sits beside it on the profile screen.
 */
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Ban } from "lucide-react";

export function BlockedSection() {
  const utils = trpc.useUtils();
  const { data: blocks, isLoading } = trpc.moderation.blocks.useQuery();

  const unblock = trpc.moderation.unblock.useMutation({
    onSuccess: async () => {
      toast.success("Unblocked");
      await utils.moderation.blocks.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  // Nothing to manage and nothing to explain — an empty card here would just be
  // a reminder that blocking exists, on a screen nobody opened to think about
  // it.
  if (!isLoading && (!blocks || blocks.length === 0)) return null;

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Blocked people</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Their comments are hidden from you, and they can't invite you or add
          you to their contacts. They stay on any trips you share, and their
          votes still count.
        </p>

        {isLoading ? (
          <Skeleton className="h-10 rounded-lg" />
        ) : (
          <div className="space-y-2">
            {blocks?.map(b => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-sm truncate">
                  {b.user?.name || "Someone who has left"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={unblock.isPending}
                  onClick={() => unblock.mutate({ userId: b.blockedUserId })}
                >
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
