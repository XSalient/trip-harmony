import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageCircle, Trash2, ChevronDown, ChevronUp, Send } from "lucide-react";
import { format } from "date-fns";

type ProposalType = "date" | "destination" | "accommodation";

interface Props {
  proposalType: ProposalType;
  proposalId: number;
  tripId: number;
  isOrganizer: boolean;
  count?: number;
}

export default function ProposalComments({ proposalType, proposalId, tripId, isOrganizer, count }: Props) {
  const { user } = useAuth({});
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");

  const { data: comments = [], refetch } = trpc.comments.list.useQuery(
    { proposalType, proposalId },
    { enabled: expanded }
  );
  const addMutation = trpc.comments.add.useMutation();
  const deleteMutation = trpc.comments.delete.useMutation();

  const handleAdd = async () => {
    if (!text.trim()) return;
    try {
      await addMutation.mutateAsync({ proposalType, proposalId, tripId, content: text.trim() });
      setText("");
      refetch();
    } catch {
      toast.error("Failed to post comment");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      refetch();
    } catch {
      toast.error("Failed to delete comment");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleAdd();
    }
  };

  return (
    <div className="mt-2 border-t border-border/30 pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {count !== undefined && count > 0
          ? <span className="font-medium text-foreground/70">{count}</span>
          : null}
        <span>{count !== undefined && count > 0 ? (expanded ? "· hide" : "· comments") : "Comments"}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No comments yet. Be first!</p>
          )}
          {comments.map((c: any) => (
            <div key={c.id} className="flex gap-2 group">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0 mt-0.5">
                {(c.user?.name || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-medium">{c.user?.name || "Unknown"}</span>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(c.createdAt), "MMM d, h:mm a")}</span>
                </div>
                <p className="text-xs text-foreground/80 break-words">{c.content}</p>
              </div>
              {(c.userId === user?.id || isOrganizer) && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Textarea
              placeholder="Add a comment... (Ctrl+Enter to send)"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="text-xs rounded-lg resize-none flex-1"
            />
            <Button
              size="icon"
              variant="outline"
              className="h-auto w-9 self-end rounded-lg shrink-0"
              onClick={handleAdd}
              disabled={!text.trim() || addMutation.isPending}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
