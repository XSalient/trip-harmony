import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AppShell from "@/components/AppShell";
import { useParams } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  DollarSign, Plus, Trash2, AlertTriangle, TrendingUp,
  Plane, UtensilsCrossed, Home, Ticket, Package, PieChart, Settings
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const categoryIcons: Record<string, any> = {
  accommodation: Home,
  transport: Plane,
  food: UtensilsCrossed,
  activities: Ticket,
  other: Package,
};

const categoryColors: Record<string, string> = {
  accommodation: "bg-blue-100 text-blue-700",
  transport: "bg-purple-100 text-purple-700",
  food: "bg-orange-100 text-orange-700",
  activities: "bg-green-100 text-green-700",
  other: "bg-gray-100 text-gray-700",
};

export default function TripBudget() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: items, isLoading } = trpc.budget.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: summary } = trpc.budget.summary.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: members } = trpc.trips.members.useQuery({ tripId }, { enabled: tripId > 0 });
  const addMutation = trpc.budget.add.useMutation();
  const deleteMutation = trpc.budget.delete.useMutation();
  const updateBudgetMutation = trpc.trips.updateMemberBudget.useMutation();
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [category, setCategory] = useState<string>("accommodation");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [myBudgetMax, setMyBudgetMax] = useState("");

  const currency = trip?.currency || "USD";
  const myMember = useMemo(() => members?.find((m: any) => m.userId === user?.id), [members, user?.id]);

  const handleAdd = async () => {
    if (!description.trim() || !amount) { toast.error("Description and amount are required"); return; }
    try {
      await addMutation.mutateAsync({
        tripId,
        category: category as any,
        description: description.trim(),
        amount,
        currency,
      });
      utils.budget.list.invalidate({ tripId });
      utils.budget.summary.invalidate({ tripId });
      setAddOpen(false);
      setDescription(""); setAmount("");
      toast.success("Budget item added!");
    } catch { toast.error("Failed to add"); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      utils.budget.list.invalidate({ tripId });
      utils.budget.summary.invalidate({ tripId });
      toast.success("Item removed");
    } catch { toast.error("Failed to delete"); }
  };

  const handleSetBudget = async () => {
    if (!myBudgetMax) return;
    try {
      await updateBudgetMutation.mutateAsync({ tripId, budgetMax: myBudgetMax });
      utils.trips.members.invalidate({ tripId });
      utils.budget.summary.invalidate({ tripId });
      setBudgetOpen(false);
      toast.success("Budget limit updated!");
    } catch { toast.error("Failed to update"); }
  };

  const overBudgetMembers = summary?.memberBudgets?.filter((b: any) => b.overBudget) || [];

  return (
    <AppShell
      title="Budget Guardian"
      showBack
      backHref={`/trips/${tripId}`}
      headerRight={
        <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9"><Settings className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm mx-4 rounded-2xl">
            <DialogHeader><DialogTitle>Your Budget Limit</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">Set your maximum per-person budget. You'll get alerts when costs exceed this.</p>
              <div className="space-y-2">
                <Label>Max Budget ({currency})</Label>
                <Input
                  type="number"
                  placeholder={myMember?.budgetMax ? String(myMember.budgetMax) : "e.g., 500"}
                  value={myBudgetMax}
                  onChange={e => setMyBudgetMax(e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <Button onClick={handleSetBudget} className="w-full rounded-lg" disabled={updateBudgetMutation.isPending}>
                {updateBudgetMutation.isPending ? "Saving..." : "Set Limit"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="px-4 py-4 space-y-4">
        {/* Summary Cards */}
        {summary && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Budget</p>
                  <p className="text-2xl font-bold">{currency} {summary.total.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{summary.itemCount} items</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-accent to-accent/50">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Per Person</p>
                  <p className="text-2xl font-bold">{currency} {summary.perPerson.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{summary.memberCount} members</p>
                </CardContent>
              </Card>
            </div>

            {/* Over budget warning */}
            {overBudgetMembers.length > 0 && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="p-3 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Budget Alert</p>
                    <p className="text-xs text-muted-foreground">{overBudgetMembers.length} member{overBudgetMembers.length > 1 ? "s" : ""} over their budget limit</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category breakdown */}
            {Object.keys(summary.byCategory).length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <PieChart className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">By Category</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(summary.byCategory).map(([cat, amt]) => {
                      const Icon = categoryIcons[cat] || Package;
                      const pct = summary.total > 0 ? ((amt as number) / summary.total) * 100 : 0;
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 capitalize">
                              <Icon className="h-3.5 w-3.5" /> {cat}
                            </span>
                            <span className="font-medium">{currency} {(amt as number).toFixed(0)} ({pct.toFixed(0)}%)</span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Add button */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="w-full rounded-xl h-11 gap-2">
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm mx-4 rounded-2xl">
            <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accommodation">Accommodation</SelectItem>
                    <SelectItem value="transport">Transport</SelectItem>
                    <SelectItem value="food">Food & Dining</SelectItem>
                    <SelectItem value="activities">Activities</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="e.g., Villa deposit" value={description} onChange={e => setDescription(e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label>Amount ({currency})</Label>
                <Input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} className="rounded-lg" />
              </div>
              <Button onClick={handleAdd} className="w-full rounded-lg" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Adding..." : "Add Expense"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Items List */}
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : items && items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item: any) => {
              const Icon = categoryIcons[item.category] || Package;
              return (
                <Card key={item.id} className="border-border/50">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${categoryColors[item.category] || "bg-muted"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{currency} {parseFloat(item.amount).toFixed(0)}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No expenses tracked yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
