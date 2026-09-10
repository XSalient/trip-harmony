import { useState } from "react";
import {
  Bed, Bath, CalendarDays, Check, DollarSign, Home, Lightbulb, MapPin, Moon,
  MoreVertical, Plus, Sun, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { AVAILABILITY_SCALE, PREFERENCE_SCALE, tally } from "@/lib/voting";
import { dateRange, money, nights, signed } from "@/lib/format";
import { BUDGET_CATEGORIES, budgetCategory, notificationType } from "@/lib/taxonomy";
import {
  AvatarStack, BottomSheet, CardMedia, ChipPicker, EmptyState, Fab, GridSpan,
  IconTile, Meta, Meter, PageGrid, ProposalCard, ScoreChip, SectionCard,
  SectionHead, StaggerItem, StaggerList, StatCard, StatusPill, Surface,
  VoteBar, VoteControl,
} from "@/components/harmony";

/**
 * Component gallery.
 *
 * Every screen below the top-level routes is auth-gated, so this route exists
 * to make the design system inspectable — and reviewable in both themes and at
 * any viewport — without a session or database. It replaces the old unrouted
 * ComponentShowcase, which demoed stock shadcn rather than this system.
 */

const PEOPLE = [
  { id: 1, name: "Priya Raman", stance: "up" as const },
  { id: 2, name: "Tom Okafor", stance: "up" as const },
  { id: 3, name: "Lena Fischer", stance: "mid" as const },
  { id: 4, name: "Marco Silva", stance: "down" as const },
  { id: 5, name: "Aisha Khan" },
];

const DATE_VOTES = [
  { vote: "available" }, { vote: "available" }, { vote: "available" },
  { vote: "maybe" }, { vote: "unavailable" },
];

const PREF_VOTES = [
  { vote: "love" }, { vote: "love" }, { vote: "love" }, { vote: "love" },
  { vote: "fine" }, { vote: "veto" },
];

const VIBES = [
  { value: "beach", label: "Beach" },
  { value: "city", label: "City break" },
  { value: "food", label: "Food" },
  { value: "hiking", label: "Hiking" },
  { value: "nightlife", label: "Nightlife" },
  { value: "quiet", label: "Quiet" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GridSpan className="space-y-3">
      <SectionHead title={title} />
      {children}
    </GridSpan>
  );
}

export default function Preview() {
  const { resolvedTheme, toggleTheme, theme } = useTheme();
  const [dateVote, setDateVote] = useState<string | null>("available");
  const [prefVote, setPrefVote] = useState<string | null>(null);
  const [vibes, setVibes] = useState<string[]>(["beach", "food"]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const dateTally = tally(AVAILABILITY_SCALE, DATE_VOTES);
  const prefTally = tally(PREFERENCE_SCALE, PREF_VOTES);

  const start = new Date(2027, 2, 12);
  const end = new Date(2027, 2, 18);

  return (
    <div className="min-h-dvh bg-background pb-nav">
      <header className="sticky top-0 z-40 safe-area-top border-b border-border/70 bg-card/85 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <h1 className="flex-1 font-display text-lg font-bold tracking-tight">
            Design system
          </h1>
          <StatusPill tone="neutral">{theme}</StatusPill>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Theme: ${theme}. Switch.`}
          >
            {resolvedTheme === "dark" ? <Moon /> : <Sun />}
          </Button>
        </div>
      </header>

      <PageGrid>
        {/* ------------------------------------------------------- tones -- */}
        <Section title="Status & category tones">
          <Surface className="flex flex-wrap gap-2 p-4">
            <StatusPill tone="success" icon={Check}>Locked</StatusPill>
            <StatusPill tone="warning">3 to vote</StatusPill>
            <StatusPill tone="danger">Over budget</StatusPill>
            <StatusPill tone="info">Invite</StatusPill>
            <StatusPill tone="cat-1">Stays</StatusPill>
            <StatusPill tone="cat-2">Food</StatusPill>
            <StatusPill tone="cat-3">Activities</StatusPill>
            <StatusPill tone="cat-4">Vote</StatusPill>
            <StatusPill tone="cat-5">Transport</StatusPill>
            <StatusPill tone="cat-6">Other</StatusPill>
          </Surface>
        </Section>

        {/* ---------------------------------------------------- stat cards -- */}
        <StatCard
          icon={Users}
          label="Needs your vote"
          value="3 proposals"
          tone="warning"
          badge={3}
          onClick={() => {}}
          navigational
        />
        <StatCard
          icon={Wallet}
          label="Per person"
          value={money(842, "GBP")}
          hint="of £600 limit"
          tone="danger"
        />
        <StatCard icon={CalendarDays} label="Trip dates" value={dateRange(start, end)} />
        <StatCard icon={MapPin} label="Destination" value="Lisbon" tone="cat-5" />

        {/* ------------------------------------------------------- votes -- */}
        <Section title="Voting — availability scale">
          <Surface className="space-y-3 p-4">
            <VoteBar tally={dateTally} memberCount={7} scale={AVAILABILITY_SCALE} />
            <VoteControl
              scale={AVAILABILITY_SCALE}
              value={dateVote as never}
              onVote={(wire, isUnvote) => setDateVote(isUnvote ? null : wire)}
            />
            <p className="text-xs text-muted-foreground">
              Tapping the active option clears the vote — the control decides that,
              not the caller.
            </p>
          </Surface>
        </Section>

        <Section title="Voting — preference scale, icon layout">
          <Surface className="flex flex-wrap items-center gap-3 p-4">
            <VoteControl
              scale={PREFERENCE_SCALE}
              value={prefVote as never}
              onVote={(wire, isUnvote) => setPrefVote(isUnvote ? null : wire)}
              layout="icon"
              size="sm"
            />
            <ScoreChip score={prefTally.score} />
            <AvatarStack people={PEOPLE} size="sm" />
          </Surface>
        </Section>

        {/* ------------------------------------------------ proposal cards -- */}
        <Section title="Proposal card — full density">
          <ProposalCard
            title="Casa Azul, Alfama"
            subtitle="Bright 3-bed with a roof terrace over the old town. Ten minutes' walk to the tram."
            media={
              <CardMedia
                src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800"
                alt="Casa Azul"
                icon={Home}
                tone="cat-1"
                overlay={<ScoreChip score={prefTally.score} />}
              />
            }
            badges={<StatusPill tone="success" icon={Check}>Locked</StatusPill>}
            meta={
              <>
                <Meta icon={DollarSign} numeric>{money(180, "GBP")}/night</Meta>
                <Meta icon={Bed} numeric>3 beds</Meta>
                <Meta icon={Bath} numeric>2 baths</Meta>
                <Meta icon={MapPin}>Alfama</Meta>
              </>
            }
            bar={<VoteBar tally={prefTally} memberCount={7} scale={PREFERENCE_SCALE} />}
            vote={<VoteControl scale={PREFERENCE_SCALE} value={null} onVote={() => {}} />}
            voters={<AvatarStack people={PEOPLE} size="xs" max={3} />}
            actions={
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreVertical />
              </Button>
            }
            footer={
              <button className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
                4 comments
              </button>
            }
          />
        </Section>

        <Section title="Proposal card — condensed (dashboard inline)">
          <Surface className="space-y-2 p-3">
            {[
              { t: "Easter week", d: dateRange(start, end), locked: true },
              { t: "Late April", d: dateRange(new Date(2027, 3, 22), new Date(2027, 3, 29)), locked: false },
            ].map(row => (
              <ProposalCard
                key={row.t}
                density="condensed"
                title={row.t}
                meta={
                  <>
                    <Meta icon={CalendarDays} numeric>{row.d}</Meta>
                    <Meta numeric>{nights(start, end)} nights</Meta>
                  </>
                }
                badges={row.locked ? <StatusPill tone="success" icon={Check}>Locked</StatusPill> : undefined}
                bar={<VoteBar tally={dateTally} memberCount={7} scale={AVAILABILITY_SCALE} showLegend={false} />}
                vote={
                  <VoteControl
                    scale={AVAILABILITY_SCALE}
                    value={null}
                    onVote={() => {}}
                    layout="icon"
                    size="sm"
                  />
                }
              />
            ))}
          </Surface>
        </Section>

        {/* ---------------------------------------------------- sections -- */}
        <Section title="Collapsible section + meters">
          <SectionCard
            title="AI match"
            icon={Lightbulb}
            tone="cat-4"
            description="How this stay fits each traveller"
            collapsible
            action={<StatusPill tone="success">82% fit</StatusPill>}
          >
            <div className="space-y-3">
              {PEOPLE.slice(0, 3).map((p, i) => (
                <Meter
                  key={p.id}
                  value={[92, 78, 54][i]}
                  tone={["success", "success", "warning"][i] as never}
                  label={p.name}
                  valueLabel={`${[92, 78, 54][i]}%`}
                />
              ))}
            </div>
          </SectionCard>
        </Section>

        <Section title="Budget breakdown">
          <Surface className="space-y-4 p-4">
            <Meter
              value={842}
              max={600}
              tone="danger"
              label="Spent per person"
              valueLabel={`${money(842, "GBP")} of ${money(600, "GBP")}`}
              markerAt={71}
            />
            <div className="space-y-2.5">
              {Object.entries(BUDGET_CATEGORIES).map(([key, entry], i) => {
                const amount = [1420, 380, 610, 240, 95][i];
                return (
                  <div key={key} className="flex items-center gap-3">
                    <IconTile icon={entry.icon} tone={entry.tone} size="sm" />
                    <span className="flex-1 text-sm">{entry.label}</span>
                    <span className="tabular text-sm font-semibold">
                      {money(amount, "GBP")}
                    </span>
                  </div>
                );
              })}
            </div>
          </Surface>
        </Section>

        {/* ------------------------------------------------------- chips -- */}
        <Section title="Chip picker">
          <Surface className="space-y-3 p-4">
            <ChipPicker
              options={VIBES}
              value={vibes}
              onChange={setVibes}
              multiple
              label="Trip vibes"
            />
            <p className="text-xs text-muted-foreground">
              Selected: {vibes.length ? vibes.join(", ") : "none"}
            </p>
          </Surface>
        </Section>

        {/* -------------------------------------------------- taxonomy -- */}
        <Section title="Notification types">
          <Surface className="divide-y divide-border/70">
            {["invite", "vote_request", "budget_alert", "consensus", "phase_change"].map(t => {
              const meta = notificationType(t);
              return (
                <div key={t} className="flex items-center gap-3 p-3.5">
                  <IconTile icon={meta.icon} tone={meta.tone} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{meta.label}</p>
                    <p className="line-clamp-1 text-[13px] text-muted-foreground">
                      Priya proposed a new set of dates for Lisbon
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">2h</span>
                </div>
              );
            })}
          </Surface>
        </Section>

        {/* --------------------------------------------------- empty state -- */}
        <Section title="Empty state">
          <EmptyState
            icon={MapPin}
            title="No destinations yet"
            description="Suggest a place and the group can start voting on it."
            action={<Button><Plus />Suggest a place</Button>}
          />
        </Section>

        {/* ------------------------------------------------------ stagger -- */}
        <Section title="Staggered list entrance">
          <StaggerList className="space-y-2">
            {["Lisbon", "Porto", "Seville", "Valencia"].map(city => (
              <StaggerItem key={city}>
                <Surface className="flex items-center gap-3 p-3.5" interactive onClick={() => {}}>
                  <IconTile icon={MapPin} tone="cat-5" size="md" />
                  <span className="flex-1 font-display font-bold">{city}</span>
                  <ScoreChip score={Math.floor(Math.random() * 14) - 3} />
                </Surface>
              </StaggerItem>
            ))}
          </StaggerList>
        </Section>

        {/* -------------------------------------------------- bottom sheet -- */}
        <Section title="Bottom sheet (drawer on mobile, dialog on desktop)">
          <Button onClick={() => setSheetOpen(true)} variant="outline">
            Open sheet
          </Button>
        </Section>

        <GridSpan className="pb-8 text-center text-xs text-muted-foreground">
          {signed(prefTally.score)} · rendered in {resolvedTheme} mode
        </GridSpan>
      </PageGrid>

      <Fab icon={Plus} label="New trip" onClick={() => setSheetOpen(true)} />

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Suggest a destination"
        description="Everyone in the trip can vote on it."
        size="tall"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => setSheetOpen(false)}>
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          <ChipPicker options={VIBES} value={vibes} onChange={setVibes} multiple label="Vibes" />
          <EmptyState
            icon={Lightbulb}
            size="sm"
            title="Form fields go here"
            description="Sheet body scrolls; the footer stays put and is safe-area padded."
          />
        </div>
      </BottomSheet>
    </div>
  );
}
