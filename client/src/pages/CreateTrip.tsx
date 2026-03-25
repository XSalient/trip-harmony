import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { Plane } from "lucide-react";

export default function CreateTrip() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const createMutation = trpc.trips.create.useMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("USD");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Trip name is required"); return; }
    try {
      const result = await createMutation.mutateAsync({ name: name.trim(), description: description.trim() || undefined, currency });
      toast.success("Trip created!");
      navigate(`/trips/${result.id}`);
    } catch {
      toast.error("Failed to create trip");
    }
  };

  return (
    <AppShell title="New Trip" showBack backHref="/">
      <form onSubmit={handleSubmit} className="px-4 py-6 space-y-6">
        <div className="text-center pb-2">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <Plane className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground">Start planning your next group adventure</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Trip Name</Label>
            <Input
              id="name"
              placeholder="e.g., Summer in Bali"
              value={name}
              onChange={e => setName(e.target.value)}
              className="h-12 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea
              id="desc"
              placeholder="What's this trip about?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="rounded-xl resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
                <SelectItem value="INR">INR (₹)</SelectItem>
                <SelectItem value="JPY">JPY (¥)</SelectItem>
                <SelectItem value="AUD">AUD (A$)</SelectItem>
                <SelectItem value="CAD">CAD (C$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create Trip"}
        </Button>
      </form>
    </AppShell>
  );
}
