import { Eye } from "lucide-react";

/**
 * Why this screen has no buttons on it.
 *
 * A watcher who is simply shown fewer controls reads it as the app being
 * broken. One line, on every screen that hides something, is cheaper than
 * three support conversations — and it is the same line everywhere, which is
 * the point of it living here.
 */
export default function WatcherNotice({
  children = "You're following this trip. Voting, proposals and comments are for tripmates.",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Eye className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
