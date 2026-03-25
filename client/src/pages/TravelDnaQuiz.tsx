import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Wallet, Users, Mountain, ClipboardList, Globe,
  Bed, UtensilsCrossed, Zap, ChevronRight, ChevronLeft, Check, Sparkles
} from "lucide-react";

const questions = [
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

type DnaValues = Record<string, number>;

export default function TravelDnaQuiz() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const { data: existingDna, isLoading } = trpc.travelDna.get.useQuery();
  const saveMutation = trpc.travelDna.save.useMutation();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<DnaValues>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (existingDna && !initialized) {
      const existing: DnaValues = {};
      for (const q of questions) {
        existing[q.key] = (existingDna as any)[q.key] ?? 5;
      }
      setValues(existing);
      setInitialized(true);
    } else if (!existingDna && !isLoading && !initialized) {
      const defaults: DnaValues = {};
      for (const q of questions) defaults[q.key] = 5;
      setValues(defaults);
      setInitialized(true);
    }
  }, [existingDna, isLoading, initialized]);

  const currentQ = questions[step];
  const isLast = step === questions.length - 1;
  const isReview = step === questions.length;

  const stableValues = useMemo(() => values, [JSON.stringify(values)]);

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        budgetComfort: stableValues.budgetComfort || 5,
        socialEnergy: stableValues.socialEnergy || 5,
        adventureLevel: stableValues.adventureLevel || 5,
        planningStyle: stableValues.planningStyle || 5,
        culturalCuriosity: stableValues.culturalCuriosity || 5,
        comfortNeed: stableValues.comfortNeed || 5,
        foodPriority: stableValues.foodPriority || 5,
        activityPace: stableValues.activityPace || 5,
      });
      toast.success("Travel DNA saved!");
      navigate("/");
    } catch {
      toast.error("Failed to save. Please try again.");
    }
  };

  if (isLoading || !initialized) {
    return (
      <AppShell title="Travel DNA" showBack backHref="/">
        <div className="p-4 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </AppShell>
    );
  }

  if (isReview) {
    return (
      <AppShell title="Your Travel DNA" showBack>
        <div className="px-4 py-4 space-y-4">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
            <CardContent className="p-4 text-center">
              <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
              <h2 className="font-semibold text-lg">Your Travel Profile</h2>
              <p className="text-sm text-muted-foreground mt-1">Here's how Harmony sees you</p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {questions.map((q) => (
              <Card key={q.key} className="border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <q.icon className={`h-4 w-4 ${q.color}`} />
                    <span className="text-sm font-medium">{q.title}</span>
                    <span className="ml-auto text-sm font-bold text-primary">{values[q.key]}/10</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{q.low}</span>
                    <span>{q.high}</span>
                  </div>
                  <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(values[q.key] / 10) * 100}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-3 pt-2 pb-4">
            <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setStep(0)}>
              Retake
            </Button>
            <Button
              className="flex-1 h-12 rounded-xl"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save DNA"}
              <Check className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Travel DNA" showBack backHref="/">
      <div className="px-4 py-6 space-y-6">
        {/* Progress */}
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        {/* Question */}
        <div className="text-center pt-4">
          <div className={`h-16 w-16 rounded-2xl ${currentQ.color} bg-primary/10 flex items-center justify-center mx-auto mb-4`}>
            <currentQ.icon className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold mb-1">{currentQ.title}</h2>
          <p className="text-muted-foreground text-sm">{currentQ.question}</p>
        </div>

        {/* Slider */}
        <div className="pt-6 pb-2">
          <div className="text-center mb-6">
            <span className="text-5xl font-extrabold text-primary">{values[currentQ.key] ?? 5}</span>
            <span className="text-xl text-muted-foreground">/10</span>
          </div>
          <Slider
            value={[values[currentQ.key] ?? 5]}
            onValueChange={([v]) => setValues(prev => ({ ...prev, [currentQ.key]: v }))}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between mt-3 text-xs text-muted-foreground">
            <span>{currentQ.low}</span>
            <span>{currentQ.high}</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-4">
          {step > 0 && (
            <Button variant="outline" className="h-12 rounded-xl px-6" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            className="flex-1 h-12 rounded-xl"
            onClick={() => setStep(s => s + 1)}
          >
            {isLast ? "Review Results" : "Next"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
