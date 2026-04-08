import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import AppShell from "@/components/AppShell";
import { useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, MapPin, Clock, DollarSign, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";

const TYPE_COLORS: Record<string, string> = {
  activity: "bg-blue-100 text-blue-700",
  food: "bg-orange-100 text-orange-700",
  transport: "bg-purple-100 text-purple-700",
  accommodation: "bg-green-100 text-green-700",
  free: "bg-gray-100 text-gray-600",
  other: "bg-muted text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  activity: "Activity",
  food: "Food & Drink",
  transport: "Transport",
  accommodation: "Stay",
  free: "Free Time",
  other: "Other",
};

export default function TripItinerary() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: days, isLoading, refetch } = trpc.itinerary.getDays.useQuery({ tripId }, { enabled: tripId > 0 });
  const addDayMutation = trpc.itinerary.addDay.useMutation();
  const deleteDayMutation = trpc.itinerary.deleteDay.useMutation();
  const addItemMutation = trpc.itinerary.addItem.useMutation();
  const deleteItemMutation = trpc.itinerary.deleteItem.useMutation();

  const isOrganizer = trip?.organizerId === user?.id;

  const [addDayOpen, setAddDayOpen] = useState(false);
  const [dayDate, setDayDate] = useState("");
  const [dayTitle, setDayTitle] = useState("");
  const [dayNotes, setDayNotes] = useState("");

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [itemTime, setItemTime] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemLocation, setItemLocation] = useState("");
  const [itemType, setItemType] = useState<"activity" | "food" | "transport" | "accommodation" | "free" | "other">("activity");
  const [itemCost, setItemCost] = useState("");
  const [itemLink, setItemLink] = useState("");

  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());

  const toggleDay = (id: number) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleAddDay = async () => {
    if (!dayDate) { toast.error("Date is required"); return; }
    try {
      await addDayMutation.mutateAsync({ tripId, date: dayDate, title: dayTitle || undefined, notes: dayNotes || undefined });
      refetch();
      setAddDayOpen(false);
      setDayDate(""); setDayTitle(""); setDayNotes("");
      toast.success("Day added!");
    } catch { toast.error("Failed to add day"); }
  };

  const handleDeleteDay = async (id: number) => {
    try {
      await deleteDayMutation.mutateAsync({ id });
      refetch();
      toast.success("Day removed");
    } catch { toast.error("Failed to remove day"); }
  };

  const openAddItem = (dayId: number) => {
    setActiveDayId(dayId);
    setItemTime(""); setItemTitle(""); setItemDesc(""); setItemLocation("");
    setItemType("activity"); setItemCost(""); setItemLink("");
    setAddItemOpen(true);
  };

  const handleAddItem = async () => {
    if (!activeDayId || !itemTitle.trim()) { toast.error("Title is required"); return; }
    try {
      await addItemMutation.mutateAsync({
        dayId: activeDayId,
        tripId,
        time: itemTime || undefined,
        title: itemTitle.trim(),
        description: itemDesc.trim() || undefined,
        location: itemLocation.trim() || undefined,
        type: itemType,
        cost: itemCost || undefined,
        link: itemLink.trim() || undefined,
      });
      refetch();
      setAddItemOpen(false);
      toast.success("Item added!");
    } catch { toast.error("Failed to add item"); }
  };

  const handleDeleteItem = async (id: number) => {
    try {
      await deleteItemMutation.mutateAsync({ id });
      refetch();
    } catch { toast.error("Failed to remove"); }
  };

  return (
    <AppShell title="Itinerary" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Plan your days together.</p>
          </div>
          {isOrganizer && (
            <Dialog open={addDayOpen} onOpenChange={setAddDayOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl gap-1.5">
                  <Plus className="h-4 w-4" /> Add Day
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm mx-4 rounded-2xl">
                <DialogHeader><DialogTitle>Add a Day</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-xs">Date *</Label>
                    <Input type="date" value={dayDate} onChange={e => setDayDate(e.target.value)} className="rounded-lg mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Title (optional)</Label>
                    <Input value={dayTitle} onChange={e => setDayTitle(e.target.value)} placeholder="e.g. Arrival Day" className="rounded-lg mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea value={dayNotes} onChange={e => setDayNotes(e.target.value)} rows={2} className="rounded-lg mt-1 resize-none text-sm" />
                  </div>
                  <Button onClick={handleAddDay} className="w-full rounded-lg" disabled={addDayMutation.isPending}>
                    {addDayMutation.isPending ? "Adding..." : "Add Day"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        ) : days && days.length > 0 ? (
          <div className="space-y-3">
            {days.map((day: any) => {
              const isCollapsed = collapsedDays.has(day.id);
              const formatted = (() => { try { return format(new Date(day.date), "EEE, MMM d"); } catch { return day.date; } })();
              const totalCost = day.items.reduce((sum: number, item: any) => sum + (parseFloat(item.cost) || 0), 0);

              return (
                <Card key={day.id} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-sm">{formatted}</span>
                          {day.title && <span className="text-muted-foreground text-xs">· {day.title}</span>}
                          {totalCost > 0 && <span className="text-xs text-muted-foreground ml-auto">{trip?.currency || "$"}{totalCost.toFixed(0)}</span>}
                        </div>
                        {day.notes && <p className="text-xs text-muted-foreground mt-1 ml-6">{day.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button onClick={() => toggleDay(day.id)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                          {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                        </button>
                        {isOrganizer && (
                          <button onClick={() => handleDeleteDay(day.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="space-y-2 mt-3">
                        {day.items.length > 0 ? day.items.map((item: any) => (
                          <div key={item.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/40">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.time && <span className="text-[11px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />{item.time}</span>}
                                <span className="text-sm font-medium">{item.title}</span>
                                <Badge className={`text-[10px] rounded-full px-2 py-0 ${TYPE_COLORS[item.type] || TYPE_COLORS.other}`}>{TYPE_LABELS[item.type] || "Other"}</Badge>
                              </div>
                              {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {item.location && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><MapPin className="h-3 w-3" />{item.location}</span>}
                                {item.cost && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><DollarSign className="h-3 w-3" />{trip?.currency || "$"}{parseFloat(item.cost).toFixed(0)}</span>}
                                {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-0.5 hover:underline"><ExternalLink className="h-3 w-3" />Link</a>}
                              </div>
                            </div>
                            {(item.addedBy === user?.id || isOrganizer) && (
                              <button onClick={() => handleDeleteItem(item.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )) : (
                          <p className="text-xs text-muted-foreground text-center py-2">No items yet</p>
                        )}

                        <Button variant="ghost" size="sm" className="w-full rounded-lg text-xs h-8 border border-dashed border-border/50" onClick={() => openAddItem(day.id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No days planned yet</p>
              {isOrganizer ? (
                <p className="text-xs text-muted-foreground mt-1">Add your first day to start building the itinerary.</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">The organizer will add days to the itinerary.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Add Item</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Time (optional)</Label>
                <Input type="time" value={itemTime} onChange={e => setItemTime(e.target.value)} className="rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <select value={itemType} onChange={e => setItemType(e.target.value as any)} className="w-full mt-1 rounded-lg border border-border bg-background text-sm px-3 py-2">
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={itemTitle} onChange={e => setItemTitle(e.target.value)} placeholder="e.g. Visit Rijksmuseum" className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={itemDesc} onChange={e => setItemDesc(e.target.value)} rows={2} className="rounded-lg mt-1 resize-none text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Location</Label>
                <Input value={itemLocation} onChange={e => setItemLocation(e.target.value)} className="rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-xs">Cost</Label>
                <Input type="number" value={itemCost} onChange={e => setItemCost(e.target.value)} placeholder="0" className="rounded-lg mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Link (optional)</Label>
              <Input value={itemLink} onChange={e => setItemLink(e.target.value)} placeholder="https://..." className="rounded-lg mt-1" />
            </div>
            <Button onClick={handleAddItem} className="w-full rounded-lg" disabled={addItemMutation.isPending}>
              {addItemMutation.isPending ? "Adding..." : "Add to Itinerary"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
