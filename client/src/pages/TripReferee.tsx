import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Sparkles, RefreshCw, MessageCircle, Shield, Lightbulb, PartyPopper, FileText } from "lucide-react";
import { Streamdown } from "streamdown";

const typeIcons: Record<string, any> = {
  nudge: MessageCircle,
  mediation: Shield,
  compromise: Lightbulb,
  celebration: PartyPopper,
  summary: FileText,
};

const typeColors: Record<string, string> = {
  nudge: "bg-blue-100 text-blue-700",
  mediation: "bg-purple-100 text-purple-700",
  compromise: "bg-yellow-100 text-yellow-700",
  celebration: "bg-green-100 text-green-700",
  summary: "bg-gray-100 text-gray-700",
};

export default function TripReferee() {
  useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: messages, isLoading } = trpc.referee.messages.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const analyzeMutation = trpc.referee.analyze.useMutation();
  const utils = trpc.useUtils();

  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!trip) return;
    setAnalyzing(true);
    try {
      await analyzeMutation.mutateAsync({ tripId, phase: trip.phase });
      utils.referee.messages.invalidate({ tripId });
      toast.success("Referee analysis complete!");
    } catch {
      toast.error("Referee couldn't analyze right now");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <AppShell title="AI Referee" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        {/* Referee intro */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
          <CardContent className="p-4 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
              <Bot className="h-7 w-7" />
            </div>
            <h2 className="font-semibold text-base">Harmony Referee</h2>
            <p className="text-sm text-muted-foreground mt-1">
              I analyze your group's preferences, detect conflicts, and suggest fair compromises.
            </p>
          </CardContent>
        </Card>

        {/* Analyze button */}
        <Button
          onClick={handleAnalyze}
          className="w-full h-12 rounded-xl gap-2"
          disabled={analyzing}
        >
          {analyzing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Analyzing your trip...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Get Referee Analysis
            </>
          )}
        </Button>

        {/* Messages */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        ) : messages && messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((msg: any) => {
              const Icon = typeIcons[msg.messageType] || MessageCircle;
              const colorClass = typeColors[msg.messageType] || "bg-muted text-muted-foreground";
              return (
                <Card key={msg.id} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] capitalize">{msg.messageType}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(msg.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm leading-relaxed prose prose-sm max-w-none">
                      <Streamdown>{msg.content}</Streamdown>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Bot className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No referee messages yet. Click above to get your first analysis!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
