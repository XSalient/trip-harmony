/**
 * The demo's content: who these people are, what they want, and what they
 * cannot agree on.
 *
 * Pure data. It knows nothing about Postgres — `scripts/seed-demo.ts` turns it
 * into rows — so a marketer who wants different copy can edit this file alone.
 *
 * Two rules held the writing together:
 *
 * 1. **Every screen has to be worth photographing.** An empty vote list or a
 *    trip where everyone agrees demonstrates nothing. So the group argues:
 *    someone needs step-free access, someone else wants the cheap place with
 *    four flights of stairs, and the referee has to say so out loud.
 * 2. **Nothing here may be mistaken for a real person or a real listing.** The
 *    names are invented, the addresses are reserved by RFC 2606, and the
 *    listing links point at `example.com`. A demo that seeds plausible-looking
 *    Airbnb URLs is a demo someone eventually clicks.
 *
 * Times are relative — "26 days ago", "starts in 38 days" — so the demo reads
 * as current whenever it is seeded, rather than ageing into a trip that
 * happened last year.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface DemoPerson {
  /** Referred to by this key everywhere below. */
  key: string;
  name: string;
  /** Local part only; the domain is fixed in `options.ts`. */
  mailbox: string;
}

export interface DemoVote<V extends string> {
  person: string;
  /**
   * `majority` is "I don't mind — go with the group", and is worth nothing in
   * the tally (`shared/votes.ts`). At least one proposal has to carry one, or
   * the demo cannot show what an abstention looks like next to a real vote.
   */
  vote: V;
  /** When it was cast. Defaults to a deterministic spread after the proposal. */
  daysAgo?: number;
  /** Set when this member changed their mind — drives `updatedAt`. */
  changedDaysAgo?: number;
}

export interface DemoComment {
  person: string;
  body: string;
  daysAgo: number;
}

export interface DemoMember {
  person: string;
  role: "watcher" | "tripmate" | "admin";
  status: "pending" | "accepted" | "declined";
  joinedVia: "creator" | "link" | "email";
  joinedDaysAgo: number;
  respondedDaysAgo?: number;
  invitedBy?: string;
  budgetMax?: string;
}

export interface DemoPreference {
  person: string;
  mustHaves: string;
  strongPreferences: string;
  avoids: string;
  openComments: string;
  savedDaysAgo: number;
}

export interface DemoDateProposal {
  key: string;
  label: string;
  proposedBy: string;
  startsInDays: number;
  endsInDays: number;
  createdDaysAgo: number;
  selected?: boolean;
  lockedBy?: string;
  lockedDaysAgo?: number;
  votes: DemoVote<"available" | "maybe" | "unavailable" | "majority">[];
  comments?: DemoComment[];
}

export interface DemoDestination {
  key: string;
  name: string;
  description: string;
  imageUrl?: string;
  estimatedCost?: string;
  proposedBy: string;
  createdDaysAgo: number;
  selected?: boolean;
  lockedBy?: string;
  lockedDaysAgo?: number;
  votes: DemoVote<"love" | "fine" | "veto" | "majority">[];
  comments?: DemoComment[];
}

/** Mirrors what `runAccommodationMatchAnalysis` stores, so the UI reads it unchanged. */
export interface DemoMatchAnalysis {
  groupFitScore: number;
  comfortScore: number;
  resentmentRisk: "low" | "medium" | "high";
  summary: string;
  flags: string[];
  memberMatches: {
    name: string;
    score: number;
    verdict: string;
    reason: string;
  }[];
}

export interface DemoAccommodation {
  key: string;
  name: string;
  description: string;
  imageUrl?: string;
  location: string;
  link?: string;
  pricePerNight: string;
  totalPrice: string;
  perPersonCost: string;
  bedrooms: number;
  bathrooms: number;
  singleBeds?: number;
  doubleBeds?: number;
  toilets?: number;
  ensuites?: number;
  freeParking?: boolean;
  camperParking?: boolean;
  amenities: string;
  comfortScore?: string;
  proposedBy: string;
  createdDaysAgo: number;
  selected?: boolean;
  lockedBy?: string;
  lockedDaysAgo?: number;
  /** Left out on purpose for at least one stay, so the "not analysed yet" state shows. */
  match?: DemoMatchAnalysis;
  matchAnalysedDaysAgo?: number;
  votes: DemoVote<"love" | "fine" | "veto" | "majority">[];
  comments?: DemoComment[];
}

export interface DemoBudgetProposal {
  key: string;
  title: string;
  amount: string;
  scope: "trip_total" | "per_person" | "per_adult" | "per_group";
  covers?: string;
  proposedBy: string;
  createdDaysAgo: number;
  selected?: boolean;
  lockedBy?: string;
  lockedDaysAgo?: number;
  votes: DemoVote<"love" | "fine" | "veto" | "majority">[];
  comments?: DemoComment[];
}

/**
 * A suggestion somebody was offered in My Preferences and turned down.
 *
 * Described the way the app describes it — an amount and a scope — rather than
 * as the fingerprint string that ends up in the row. The seeder builds that
 * with `budgetFingerprint`, the same function the screen uses, so a fixture
 * dismissal always matches the card it is meant to suppress.
 */
export interface DemoDismissal {
  person: string;
  budget: { amount: string; scope: DemoBudgetProposal["scope"] };
  daysAgo: number;
}

/** A family or household on the trip. */
export interface DemoGroup {
  key: string;
  name: string;
  budgetMax?: string;
  /** The `person` keys of the members in it. */
  members: string[];
}

/** Somebody coming who has no account — a child, a partner, the dog. */
export interface DemoAttendee {
  group?: string;
  name: string;
  kind: "adult" | "child" | "pet";
  age?: number;
  notes?: string;
}

export interface DemoRefereeMessage {
  phase: string;
  messageType: "nudge" | "mediation" | "compromise" | "celebration" | "summary";
  content: string;
  daysAgo: number;
}

export interface DemoNotification {
  person: string;
  type:
    | "invite"
    | "vote_request"
    | "budget_alert"
    | "consensus"
    | "phase_change"
    | "referee"
    | "general";
  title: string;
  message: string;
  read?: boolean;
  /** Relative to the trip, resolved to `/trips/<id>…` by the seeder. */
  path?: string;
  daysAgo: number;
}

export interface DemoTrip {
  key: string;
  name: string;
  description: string;
  coverImage?: string;
  /** Must start with DEMO- so the reset can find it. */
  inviteCode: string;
  phase:
    | "setup"
    | "dates"
    | "destination"
    | "accommodation"
    | "activities"
    | "finalized";
  status: "planning" | "active" | "completed" | "cancelled";
  currency: string;
  totalBudget?: string;
  createdDaysAgo: number;
  /** Set once the group has finalised dates; negative means it already happened. */
  startsInDays?: number;
  endsInDays?: number;
  organizer: string;
  members: DemoMember[];
  pendingInvites?: {
    mailbox: string;
    role: "watcher" | "tripmate" | "admin";
    invitedBy: string;
    daysAgo: number;
    /**
     * The trip group they join on acceptance — set only when the invite came
     * from importing a saved family, which is the one thing that knows the
     * group before the person has answered.
     */
    group?: string;
  }[];
  preferences?: DemoPreference[];
  dateProposals?: DemoDateProposal[];
  destinations?: DemoDestination[];
  accommodations?: DemoAccommodation[];
  votingUnit?: "member" | "group";
  groups?: DemoGroup[];
  attendees?: DemoAttendee[];
  budget?: DemoBudgetProposal[];
  dismissedSuggestions?: DemoDismissal[];
  referee?: DemoRefereeMessage[];
  notifications?: DemoNotification[];
}

// ---------------------------------------------------------------------------
// Imagery
// ---------------------------------------------------------------------------

/**
 * Photographs, all from Wikimedia Commons.
 *
 * Kept in one map rather than inline so that a marketer with licensed
 * photography can replace the demo's entire look by editing this block. The
 * URLs are `960px-` thumbnails because Wikimedia only serves widths it has
 * already rendered — an invented width like `900px-` answers HTTP 400, and the
 * card would silently show nothing.
 *
 * The app hides an image that fails to load, so a dead URL here costs a
 * photograph, never a broken screen.
 */
const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/thumb";

export const PHOTOS = {
  lisbon: `${COMMONS}/f/f2/Lisboa_-_Portugal_%2852597836992%29.jpg/960px-Lisboa_-_Portugal_%2852597836992%29.jpg`,
  lagos: `${COMMONS}/5/52/Vista_Centro_Hist%C3%B3rico_de_Lagos_%28cropped%29.jpg/960px-Vista_Centro_Hist%C3%B3rico_de_Lagos_%28cropped%29.jpg`,
  porto: `${COMMONS}/e/e5/Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG/960px-Puente_Don_Luis_I%2C_Oporto%2C_Portugal%2C_2012-05-09%2C_DD_13.JPG`,
  ericeira: `${COMMONS}/c/cc/Vista_da_Ericeira.jpg/960px-Vista_da_Ericeira.jpg`,
  seville: `${COMMONS}/2/2b/Sevilla_Cathedral_-_Southeast.jpg/960px-Sevilla_Cathedral_-_Southeast.jpg`,
  alfama: `${COMMONS}/0/07/Lisbon_alfalma.jpg/960px-Lisbon_alfalma.jpg`,
  praiaDaLuz: `${COMMONS}/7/74/Vista_parcial_da_luz.jpg/960px-Vista_parcial_da_luz.jpg`,
  cascais: `${COMMONS}/e/ed/Cascais_-_Santa_Marta_%2853854018150%29.jpg/960px-Cascais_-_Santa_Marta_%2853854018150%29.jpg`,
  bairroAlto: `${COMMONS}/6/64/Lisboa-Entrada_no_Bairro_Alto-20140917.jpg/960px-Lisboa-Entrada_no_Bairro_Alto-20140917.jpg`,
  benagil: `${COMMONS}/6/6e/Praia_de_Benagil_-_Portugal_%F0%9F%87%B5%F0%9F%87%B9_%2853651979938%29.jpg/960px-Praia_de_Benagil_-_Portugal_%F0%9F%87%B5%F0%9F%87%B9_%2853651979938%29.jpg`,
  pastelDeNata: `${COMMONS}/0/0c/Pasteis_de_Belem.jpg/960px-Pasteis_de_Belem.jpg`,
  lisbonTram: `${COMMONS}/1/16/Lisbon-Day3-1_%2834184431096%29.jpg/960px-Lisbon-Day3-1_%2834184431096%29.jpg`,
  belemTower: `${COMMONS}/f/fa/Bel%C3%A9m_Tower_in_Lisbon%2C_Portugal.jpg/960px-Bel%C3%A9m_Tower_in_Lisbon%2C_Portugal.jpg`,
  costaVicentina: `${COMMONS}/b/ba/Praia_da_Costa_Vicentina.jpg/960px-Praia_da_Costa_Vicentina.jpg`,
  chamonix: `${COMMONS}/1/1f/Chamonix_valley_from_la_Fl%C3%A9g%C3%A8re%2C2010_07.JPG/960px-Chamonix_valley_from_la_Fl%C3%A9g%C3%A8re%2C2010_07.JPG`,
  montBlanc: `${COMMONS}/a/a2/Mont_Blanc_Aiguille.jpg/960px-Mont_Blanc_Aiguille.jpg`,
  zermatt: `${COMMONS}/a/a0/1_zermatt_evening_2022.jpg/960px-1_zermatt_evening_2022.jpg`,
  valThorens: `${COMMONS}/3/3a/View_of_Val_Thorens_in_the_morning_from_Boismint_1.jpg/960px-View_of_Val_Thorens_in_the_morning_from_Boismint_1.jpg`,
  kyoto: `${COMMONS}/6/6b/Kyoto%2C_Japan_%2849667780482%29.jpg/960px-Kyoto%2C_Japan_%2849667780482%29.jpg`,
  arashiyama: `${COMMONS}/c/c2/Arashiyama%2C_Part_II_-_Arashiyama7534.jpg/960px-Arashiyama%2C_Part_II_-_Arashiyama7534.jpg`,
  fushimiInari: `${COMMONS}/0/0e/Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg/960px-Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine%2C_Kyoto%2C_Japan.jpg`,
  kiyomizu: `${COMMONS}/3/3c/Kiyomizu.jpg/960px-Kiyomizu.jpg`,
} as const;

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

/**
 * Invented people. `key` is the handle used by every reference below; `name` is
 * what appears on screen.
 *
 * Ava is the account to sign in as for a walkthrough: an admin on all three
 * trips, so every screen is reachable without switching users.
 */
export const PEOPLE: DemoPerson[] = [
  { key: "ava", name: "Ava Bennett", mailbox: "ava" },
  { key: "marcus", name: "Marcus Oyelaran", mailbox: "marcus" },
  { key: "priya", name: "Priya Raghunathan", mailbox: "priya" },
  { key: "tomas", name: "Tomás Ferreira", mailbox: "tomas" },
  { key: "hannah", name: "Hannah Lindqvist", mailbox: "hannah" },
  { key: "dev", name: "Dev Mehta", mailbox: "dev" },
  { key: "nina", name: "Nina Kowalski", mailbox: "nina" },
  { key: "joel", name: "Joel Abara", mailbox: "joel" },
  { key: "sofia", name: "Sofia Marchetti", mailbox: "sofia" },
  { key: "ben", name: "Ben Whitfield", mailbox: "ben" },
  { key: "yuki", name: "Yuki Tanaka", mailbox: "yuki" },
];

/** The account a walkthrough should sign in as. */
export const PRIMARY_PERSON = "ava";

/**
 * A family saved in somebody's address book, ready to drop onto the next trip.
 *
 * Deliberately not the same shape as `DemoGroup`: a saved family is a label
 * over contacts and grants nothing, while a trip group holds a budget and a
 * vote. The overlap is the point of the feature — the Abaras below are saved
 * here and imported into the Lisbon trip, which is why Joel has a pending
 * invite that already knows which family he lands in.
 */
export interface DemoContactGroupMember {
  /** A demo person, when they have an account and an address-book entry. */
  person?: string;
  /** Everyone else: a child, a partner without an account, the dog. */
  name?: string;
  kind?: "adult" | "child" | "pet";
  /** Years. Never set for a pet. */
  age?: number;
}

export interface DemoContactGroup {
  key: string;
  /** Whose address book this is. */
  owner: string;
  name: string;
  savedDaysAgo: number;
  members: DemoContactGroupMember[];
}

/**
 * Ava's saved families.
 *
 * Three, because the screen has three states worth photographing: two that are
 * already groups on the Lisbon trip (Priya & Dev, Tomás & Bruno) and one just
 * imported and still waiting on an acceptance (the Abaras).
 */
export const CONTACT_GROUPS: DemoContactGroup[] = [
  {
    key: "raos",
    owner: "ava",
    name: "Priya & Dev",
    savedDaysAgo: 240,
    members: [
      { person: "priya" },
      { person: "dev" },
      // No address of her own — she is three. On import she becomes an
      // attendee in the headcount rather than an invite nobody can accept.
      { name: "Meera Rao", kind: "child", age: 3 },
    ],
  },
  {
    key: "ferreiras",
    owner: "ava",
    name: "Tomás & Bruno",
    savedDaysAgo: 180,
    members: [{ person: "tomas" }, { name: "Bruno", kind: "pet" }],
  },
  {
    key: "abaras",
    owner: "ava",
    name: "The Abaras",
    savedDaysAgo: 96,
    members: [
      { person: "joel" },
      { name: "Esme Abara", kind: "child", age: 7 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Trip 1 — the hero. Mid-argument, which is the point.
// ---------------------------------------------------------------------------

const lisbon: DemoTrip = {
  key: "lisbon",
  name: "Lisbon & the Algarve",
  description:
    "Seven of us, ten days, two coasts. Booked together instead of in a group chat nobody can scroll back through.",
  coverImage: PHOTOS.lisbon,
  inviteCode: "DEMO-LISBON",
  phase: "accommodation",
  status: "planning",
  currency: "EUR",
  totalBudget: "11200.00",
  createdDaysAgo: 34,
  startsInDays: 38,
  endsInDays: 47,
  organizer: "ava",

  members: [
    {
      person: "ava",
      role: "admin",
      status: "accepted",
      joinedVia: "creator",
      joinedDaysAgo: 34,
      budgetMax: "1500.00",
    },
    {
      person: "marcus",
      role: "admin",
      status: "accepted",
      joinedVia: "link",
      joinedDaysAgo: 33,
      respondedDaysAgo: 33,
      invitedBy: "ava",
      budgetMax: "1800.00",
    },
    {
      person: "priya",
      role: "tripmate",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 33,
      respondedDaysAgo: 32,
      invitedBy: "ava",
      budgetMax: "1200.00",
    },
    {
      person: "tomas",
      role: "tripmate",
      status: "accepted",
      joinedVia: "link",
      joinedDaysAgo: 31,
      respondedDaysAgo: 31,
      invitedBy: "marcus",
      budgetMax: "2000.00",
    },
    {
      person: "hannah",
      role: "tripmate",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 30,
      respondedDaysAgo: 28,
      invitedBy: "ava",
      budgetMax: "900.00",
    },
    {
      person: "dev",
      role: "tripmate",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 29,
      respondedDaysAgo: 27,
      invitedBy: "marcus",
      budgetMax: "1600.00",
    },
    // A watcher: sees the plan, not who voted how. Worth a screenshot on its own.
    {
      person: "nina",
      role: "watcher",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 24,
      respondedDaysAgo: 23,
      invitedBy: "hannah",
    },
  ],

  pendingInvites: [
    // From importing "The Abaras" out of Ava's address book: the invite knows
    // the group before Joel has answered, and Esme is already in the headcount.
    {
      mailbox: "joel",
      role: "tripmate",
      invitedBy: "ava",
      daysAgo: 5,
      group: "abaras",
    },
  ],

  preferences: [
    {
      person: "ava",
      mustHaves:
        "Step-free entry, or one flight at most — my knee is still not right after the surgery in the spring. A kitchen with a table everyone can actually sit at.",
      strongPreferences:
        "Walking distance to somewhere I can get a coffee before anyone else is awake.",
      avoids: "Anywhere that needs a car for every single thing.",
      openComments:
        "Happy to cook two of the nights if the oven is a real oven. I can do €1,400 each all in and not resent it — say now if that is low.",
      savedDaysAgo: 21,
    },
    {
      person: "marcus",
      mustHaves:
        "Wifi that holds a video call. I have two I cannot move on the Tuesday and the Wednesday.",
      strongPreferences: "A room of my own, if it doesn't wreck the budget.",
      avoids: "Bunk rooms. I did that last year and I'm still tired.",
      openComments:
        "I'll take the smallest room in the house if it has a door that shuts.",
      savedDaysAgo: 21,
    },
    {
      person: "priya",
      mustHaves:
        "Somewhere I can eat properly as a vegetarian without a 40-minute drive.",
      strongPreferences: "Near enough the water to swim before breakfast.",
      avoids: "A long transfer after a late landing.",
      openComments: "I would rather spend the money on food than on the room.",
      savedDaysAgo: 20,
    },
    {
      person: "tomas",
      mustHaves: "Somewhere the boards can live that isn't the hallway.",
      strongPreferences: "Twenty minutes or less from something surfable.",
      avoids: "Anywhere an early start wakes the whole house.",
      openComments:
        "I'll drive. I don't mind being the one who drives, but then I'm not doing the 2am nights.",
      savedDaysAgo: 19,
    },
    {
      person: "hannah",
      mustHaves: "Under €900 each, all in. That is a ceiling, not an opener.",
      strongPreferences: "Twin beds rather than a double — sharing with Nina.",
      avoids: "Resorts. Anything with a lanyard.",
      openComments:
        "If it goes over I'm out, and I'd rather say that now than the week before we fly.",
      savedDaysAgo: 18,
    },
    {
      person: "dev",
      mustHaves: "Air conditioning. September in the Algarve is not a joke.",
      strongPreferences: "A pool. I'll pay the difference for a pool.",
      avoids: "Stairs everywhere.",
      openComments: "Genuinely easy otherwise.",
      savedDaysAgo: 16,
    },
    // Nina sets nothing on purpose: the match analysis has to show the
    // "preferences not set" case, and a demo where everyone filled the form in
    // is a demo of a product nobody has used.
  ],

  dateProposals: [
    {
      key: "late-sept",
      label: "Late September — shoulder season, cheaper flights",
      proposedBy: "ava",
      startsInDays: 38,
      endsInDays: 47,
      createdDaysAgo: 33,
      selected: true,
      lockedBy: "ava",
      lockedDaysAgo: 22,
      votes: [
        { person: "ava", vote: "available" },
        { person: "marcus", vote: "available" },
        { person: "priya", vote: "available" },
        { person: "tomas", vote: "available" },
        { person: "dev", vote: "available" },
        // Changed from "unavailable" once the work trip moved.
        {
          person: "hannah",
          vote: "maybe",
          daysAgo: 30,
          changedDaysAgo: 24,
        },
      ],
      comments: [
        {
          person: "hannah",
          body: "Moving to maybe — the Berlin trip shifted a week, so this is probably fine. Will confirm by Friday.",
          daysAgo: 24,
        },
        {
          person: "ava",
          body: "Locking this in. Five yeses and a warm maybe is as good as this group gets.",
          daysAgo: 22,
        },
      ],
    },
    {
      key: "early-sept",
      label: "First week of September",
      proposedBy: "dev",
      startsInDays: 17,
      endsInDays: 26,
      createdDaysAgo: 32,
      votes: [
        { person: "dev", vote: "available" },
        { person: "marcus", vote: "available" },
        { person: "tomas", vote: "available" },
        { person: "priya", vote: "maybe" },
        { person: "ava", vote: "unavailable" },
        { person: "hannah", vote: "unavailable" },
      ],
      comments: [
        {
          person: "ava",
          body: "Term starts on the 2nd, so this one is a no from me rather than a reluctant yes.",
          daysAgo: 31,
        },
      ],
    },
    {
      key: "mid-oct",
      label: "October half-term",
      proposedBy: "hannah",
      startsInDays: 59,
      endsInDays: 68,
      createdDaysAgo: 29,
      votes: [
        { person: "hannah", vote: "available" },
        { person: "ava", vote: "available" },
        { person: "priya", vote: "maybe" },
        { person: "nina", vote: "maybe" },
        { person: "tomas", vote: "unavailable" },
        { person: "marcus", vote: "unavailable" },
      ],
    },
  ],

  destinations: [
    {
      key: "lisbon",
      name: "Lisbon",
      description:
        "Four nights at the start. Everyone lands here anyway, and nobody has to be persuaded.",
      imageUrl: PHOTOS.lisbon,
      estimatedCost: "420.00",
      proposedBy: "ava",
      createdDaysAgo: 32,
      selected: true,
      lockedBy: "ava",
      lockedDaysAgo: 18,
      votes: [
        { person: "ava", vote: "love" },
        { person: "priya", vote: "love" },
        { person: "marcus", vote: "love" },
        { person: "dev", vote: "love" },
        { person: "hannah", vote: "love" },
        { person: "tomas", vote: "fine" },
      ],
    },
    {
      key: "lagos",
      name: "Lagos, Algarve",
      description:
        "Six nights at the other end. Cliffs, a working town rather than a strip, and a train back to the airport.",
      imageUrl: PHOTOS.lagos,
      estimatedCost: "560.00",
      proposedBy: "tomas",
      createdDaysAgo: 31,
      selected: true,
      lockedBy: "marcus",
      lockedDaysAgo: 17,
      votes: [
        { person: "tomas", vote: "love" },
        { person: "dev", vote: "love" },
        { person: "priya", vote: "love" },
        { person: "ava", vote: "fine" },
        { person: "hannah", vote: "fine" },
        { person: "marcus", vote: "love" },
      ],
    },
    {
      key: "porto",
      name: "Porto",
      description:
        "Two nights in the middle. Three hours each way on the train.",
      imageUrl: PHOTOS.porto,
      estimatedCost: "310.00",
      proposedBy: "priya",
      createdDaysAgo: 30,
      votes: [
        { person: "priya", vote: "love" },
        { person: "marcus", vote: "love" },
        { person: "ava", vote: "fine" },
        { person: "dev", vote: "fine" },
        { person: "hannah", vote: "fine" },
        { person: "tomas", vote: "veto" },
        { person: "nina", vote: "majority" },
      ],
      comments: [
        {
          person: "tomas",
          body: "Six hours on a train out of a ten-day trip. I'd rather have the two days in the Algarve — but I'll go if it matters to people.",
          daysAgo: 27,
        },
        {
          person: "priya",
          body: "It matters to me but not that much. Day trip from Lisbon instead?",
          daysAgo: 26,
        },
      ],
    },
    {
      key: "ericeira",
      name: "Ericeira",
      description:
        "A night on the way south, so the surfers get one clean morning.",
      imageUrl: PHOTOS.ericeira,
      estimatedCost: "140.00",
      proposedBy: "tomas",
      createdDaysAgo: 26,
      votes: [
        { person: "tomas", vote: "love" },
        { person: "dev", vote: "love" },
        { person: "priya", vote: "fine" },
        { person: "marcus", vote: "fine" },
        { person: "ava", vote: "fine" },
        { person: "hannah", vote: "veto" },
      ],
    },
    {
      key: "seville",
      name: "Seville (day trip)",
      description: "Four hours each way, in September, for one afternoon.",
      imageUrl: PHOTOS.seville,
      estimatedCost: "95.00",
      proposedBy: "marcus",
      createdDaysAgo: 25,
      votes: [
        { person: "marcus", vote: "love" },
        { person: "dev", vote: "fine" },
        { person: "ava", vote: "veto" },
        { person: "priya", vote: "veto" },
        { person: "hannah", vote: "veto" },
        { person: "tomas", vote: "veto" },
      ],
      comments: [
        {
          person: "marcus",
          body: "Fine. Withdrawn in spirit if not in the database.",
          daysAgo: 23,
        },
      ],
    },
  ],

  accommodations: [
    {
      key: "benagil",
      name: "Quinta do Benagil",
      description:
        "Five bedrooms round a courtyard, ten minutes above the cliffs. The pool is the reason it costs what it costs.",
      imageUrl: PHOTOS.benagil,
      location: "Benagil, Lagoa, Algarve",
      link: "https://example.com/listings/quinta-do-benagil",
      pricePerNight: "480.00",
      totalPrice: "4800.00",
      perPersonCost: "685.71",
      bedrooms: 5,
      bathrooms: 4,
      singleBeds: 4,
      doubleBeds: 3,
      toilets: 5,
      ensuites: 3,
      freeParking: true,
      camperParking: true,
      amenities:
        "Private pool, Air conditioning, Fibre wifi (250 Mbps), Washing machine, Dishwasher, Outdoor table for 10, Free parking, Board store, Ground-floor bedroom",
      comfortScore: "8.6",
      proposedBy: "dev",
      createdDaysAgo: 12,
      selected: true,
      lockedBy: "marcus",
      lockedDaysAgo: 2,
      matchAnalysedDaysAgo: 3,
      match: {
        groupFitScore: 86,
        comfortScore: 8.6,
        resentmentRisk: "low",
        summary:
          "The only option that clears every hard constraint in the group. It is €80 per person above Hannah's stated ceiling, which is the one thing left to settle — everything else people asked for is here, including the ground-floor bedroom Ava needs and the wifi Marcus has to work on.",
        flags: [
          "€686 per person against Hannah's €900 ceiling — clears it, but only once the hire car is counted separately",
          "Four of the five bedrooms are up one flight",
        ],
        memberMatches: [
          {
            name: "Ava Bennett",
            score: 92,
            verdict: "✅ Great fit",
            reason:
              "The ground-floor bedroom and the step-free entry from the parking meet the constraint directly. Full kitchen with a table for ten.",
          },
          {
            name: "Marcus Oyelaran",
            score: 88,
            verdict: "✅ Great fit",
            reason:
              "Fibre wifi measured at 250 Mbps, and five bedrooms across seven people means a room with a door for the Tuesday calls.",
          },
          {
            name: "Priya Raghunathan",
            score: 74,
            verdict: "⚠️ Some concerns",
            reason:
              "Swimmable beach is a ten-minute drive rather than a walk, and vegetarian options in Benagil itself are thin. The kitchen offsets both.",
          },
          {
            name: "Tomás Ferreira",
            score: 90,
            verdict: "✅ Great fit",
            reason:
              "Board store, free parking and no shared wall to wake at six. Surfable beach 15 minutes west.",
          },
          {
            name: "Hannah Lindqvist",
            score: 71,
            verdict: "⚠️ Some concerns",
            reason:
              "€686 each is inside the €900 ceiling, but only just once flights and the car are added. Twin beds are available in two of the rooms.",
          },
          {
            name: "Dev Mehta",
            score: 95,
            verdict: "✅ Great fit",
            reason:
              "Air conditioning throughout and the pool that was the stated priority.",
          },
          {
            name: "Nina Kowalski",
            score: 65,
            verdict: "⚠️ Some concerns",
            reason:
              "No preferences set for this trip, so this is a neutral score rather than a judgement.",
          },
        ],
      },
      votes: [
        { person: "dev", vote: "love" },
        { person: "tomas", vote: "love" },
        { person: "ava", vote: "love" },
        { person: "marcus", vote: "love" },
        { person: "priya", vote: "fine" },
        { person: "hannah", vote: "fine", daysAgo: 8, changedDaysAgo: 3 },
      ],
      comments: [
        {
          person: "hannah",
          body: "Moving off my veto. €686 is inside my number as long as we're honest that the car is on top.",
          daysAgo: 3,
        },
        {
          person: "marcus",
          body: "Booked. Deposit is on my card, it's in the budget as accommodation.",
          daysAgo: 2,
        },
      ],
    },
    {
      key: "alfama",
      name: "Alfama Terrace House",
      description:
        "Four floors of a 19th-century house with a roof terrace over the river. Cheaper than everything else, for a reason.",
      imageUrl: PHOTOS.alfama,
      location: "Alfama, Lisbon",
      link: "https://example.com/listings/alfama-terrace-house",
      pricePerNight: "310.00",
      totalPrice: "3100.00",
      perPersonCost: "442.86",
      bedrooms: 4,
      bathrooms: 2,
      singleBeds: 2,
      doubleBeds: 3,
      toilets: 3,
      ensuites: 1,
      freeParking: false,
      amenities:
        "Roof terrace, Washing machine, Wifi (40 Mbps), Walk to everything",
      comfortScore: "7.4",
      proposedBy: "priya",
      createdDaysAgo: 15,
      matchAnalysedDaysAgo: 3,
      match: {
        groupFitScore: 64,
        comfortScore: 7.4,
        resentmentRisk: "high",
        summary:
          "The cheapest option by a distance and the best located, and it fails the one constraint that was stated as non-negotiable. Four floors with no lift and no ground-floor bed puts Ava on the stairs several times a day for ten days. No air conditioning in a house facing south.",
        flags: [
          "Four floors, no lift, no ground-floor bedroom — conflicts with a stated accessibility requirement",
          "No air conditioning",
          "Wifi measured at 40 Mbps, shared — thin for two video calls",
        ],
        memberMatches: [
          {
            name: "Ava Bennett",
            score: 28,
            verdict: "❌ Poor match",
            reason:
              "Four flights with no lift, against an explicit step-free requirement. This is the constraint that should decide the vote.",
          },
          {
            name: "Marcus Oyelaran",
            score: 55,
            verdict: "⚠️ Some concerns",
            reason:
              "40 Mbps shared across seven people is workable for one call, risky for two back to back.",
          },
          {
            name: "Priya Raghunathan",
            score: 94,
            verdict: "✅ Great fit",
            reason:
              "Everything vegetarian in Lisbon is a short walk, and the money saved goes where Priya said it should.",
          },
          {
            name: "Tomás Ferreira",
            score: 61,
            verdict: "⚠️ Some concerns",
            reason:
              "No parking and nowhere to keep boards; the surf is an hour away from here.",
          },
          {
            name: "Hannah Lindqvist",
            score: 96,
            verdict: "✅ Great fit",
            reason: "€443 each is comfortably inside the ceiling.",
          },
          {
            name: "Dev Mehta",
            score: 38,
            verdict: "❌ Poor match",
            reason:
              "No air conditioning, south-facing, and stairs on every floor — both stated requirements fail.",
          },
          {
            name: "Nina Kowalski",
            score: 65,
            verdict: "⚠️ Some concerns",
            reason:
              "No preferences set for this trip, so this is a neutral score rather than a judgement.",
          },
        ],
      },
      votes: [
        { person: "priya", vote: "love" },
        { person: "hannah", vote: "love" },
        { person: "marcus", vote: "fine" },
        { person: "tomas", vote: "fine" },
        { person: "ava", vote: "veto" },
        { person: "dev", vote: "veto" },
      ],
      comments: [
        {
          person: "ava",
          body: "I love this house and I can't do four flights twice a day for ten days. Sorry.",
          daysAgo: 11,
        },
        {
          person: "priya",
          body: "That's a fair veto. Withdrawing my push for it — the roof terrace isn't worth someone's knee.",
          daysAgo: 11,
        },
      ],
    },
    {
      key: "praia-da-luz",
      name: "Casa da Luz",
      description:
        "Four bedrooms, two minutes from the beach at Praia da Luz. Quiet street, older fittings.",
      imageUrl: PHOTOS.praiaDaLuz,
      location: "Praia da Luz, Lagos",
      link: "https://example.com/listings/casa-da-luz",
      pricePerNight: "395.00",
      totalPrice: "3950.00",
      perPersonCost: "564.29",
      bedrooms: 4,
      bathrooms: 3,
      singleBeds: 3,
      doubleBeds: 2,
      toilets: 3,
      ensuites: 2,
      freeParking: true,
      amenities:
        "Air conditioning, Two minutes to the beach, Wifi (100 Mbps), Free parking, Garden, Washing machine",
      comfortScore: "8.1",
      proposedBy: "priya",
      createdDaysAgo: 10,
      matchAnalysedDaysAgo: 3,
      match: {
        groupFitScore: 79,
        comfortScore: 8.1,
        resentmentRisk: "low",
        summary:
          "The strongest runner-up and the cheapest option that still clears everyone's hard constraints. Four bedrooms across seven people is the difference: someone shares who would rather not, and Marcus is the person who said so.",
        flags: [
          "Four bedrooms for seven people — two rooms have to be shared",
          "No pool",
        ],
        memberMatches: [
          {
            name: "Ava Bennett",
            score: 84,
            verdict: "✅ Great fit",
            reason:
              "Single-storey with level access from the street, and a café at the end of the road.",
          },
          {
            name: "Marcus Oyelaran",
            score: 62,
            verdict: "⚠️ Some concerns",
            reason:
              "100 Mbps is fine for the calls, but four bedrooms means sharing — the one thing Marcus asked to avoid.",
          },
          {
            name: "Priya Raghunathan",
            score: 91,
            verdict: "✅ Great fit",
            reason:
              "Swimmable beach two minutes away, and Lagos has vegetarian food that isn't an afterthought.",
          },
          {
            name: "Tomás Ferreira",
            score: 78,
            verdict: "✅ Great fit",
            reason:
              "Parking and a garden for the boards; 20 minutes to the west-coast breaks.",
          },
          {
            name: "Hannah Lindqvist",
            score: 88,
            verdict: "✅ Great fit",
            reason: "€564 each, well inside the ceiling, twin beds available.",
          },
          {
            name: "Dev Mehta",
            score: 72,
            verdict: "⚠️ Some concerns",
            reason: "Air conditioning throughout, but no pool.",
          },
          {
            name: "Nina Kowalski",
            score: 65,
            verdict: "⚠️ Some concerns",
            reason:
              "No preferences set for this trip, so this is a neutral score rather than a judgement.",
          },
        ],
      },
      votes: [
        { person: "priya", vote: "love" },
        { person: "hannah", vote: "love" },
        { person: "ava", vote: "love" },
        { person: "tomas", vote: "fine" },
        { person: "dev", vote: "fine" },
        { person: "marcus", vote: "fine" },
        // Nina states nothing anywhere on this trip, and says so rather than
        // leaving the row blank — which is a different thing, and looks
        // different on the card.
        { person: "nina", vote: "majority" },
      ],
      comments: [
        {
          person: "nina",
          body: "I genuinely don't mind. Marking it as go-with-the-majority rather than pretending I have a view.",
          daysAgo: 6,
        },
      ],
    },
    {
      key: "bairro-alto",
      name: "Bairro Alto Loft",
      description:
        "Three bedrooms above a bar on Rua da Atalaia. Sleeps six at a push.",
      imageUrl: PHOTOS.bairroAlto,
      location: "Bairro Alto, Lisbon",
      link: "https://example.com/listings/bairro-alto-loft",
      pricePerNight: "265.00",
      totalPrice: "2650.00",
      perPersonCost: "378.57",
      bedrooms: 3,
      bathrooms: 2,
      singleBeds: 2,
      doubleBeds: 2,
      toilets: 2,
      ensuites: 1,
      freeParking: false,
      amenities: "Wifi (60 Mbps), Air conditioning in two rooms, Lift",
      comfortScore: "6.2",
      proposedBy: "marcus",
      createdDaysAgo: 14,
      matchAnalysedDaysAgo: 3,
      match: {
        groupFitScore: 41,
        comfortScore: 6.2,
        resentmentRisk: "high",
        summary:
          "Sleeps six. The group is seven, and the seventh person is the one who would be on the sofa for ten nights. Directly above a bar that closes at two, which nobody has voted against yet because nobody has read the reviews.",
        flags: [
          "Sleeps 6; the group is 7",
          "Directly above a bar — noise until 02:00 on Thursday to Saturday",
          "No parking, no board storage",
        ],
        memberMatches: [
          {
            name: "Ava Bennett",
            score: 46,
            verdict: "⚠️ Some concerns",
            reason:
              "There is a lift, which meets the access requirement, but no bed for the seventh person.",
          },
          {
            name: "Marcus Oyelaran",
            score: 44,
            verdict: "⚠️ Some concerns",
            reason:
              "Three bedrooms across seven people is the bunk-room problem by another name.",
          },
          {
            name: "Priya Raghunathan",
            score: 70,
            verdict: "⚠️ Some concerns",
            reason: "Location and food are excellent; the noise is not.",
          },
          {
            name: "Tomás Ferreira",
            score: 22,
            verdict: "❌ Poor match",
            reason:
              "No board storage, no parking, and a 6am start would cross the whole flat.",
          },
          {
            name: "Hannah Lindqvist",
            score: 63,
            verdict: "⚠️ Some concerns",
            reason: "Cheapest per person by some way, but no twin room.",
          },
          {
            name: "Dev Mehta",
            score: 40,
            verdict: "❌ Poor match",
            reason: "Air conditioning in two of three rooms, and no pool.",
          },
          {
            name: "Nina Kowalski",
            score: 65,
            verdict: "⚠️ Some concerns",
            reason:
              "No preferences set for this trip, so this is a neutral score rather than a judgement.",
          },
        ],
      },
      votes: [
        { person: "marcus", vote: "fine" },
        { person: "hannah", vote: "fine" },
        { person: "priya", vote: "fine" },
        { person: "tomas", vote: "veto" },
        { person: "dev", vote: "veto" },
      ],
      comments: [
        {
          person: "tomas",
          body: "It sleeps six. There are seven of us. I don't think we need the AI for this one.",
          daysAgo: 13,
        },
      ],
    },
    {
      // Deliberately un-analysed, so the "not analysed yet" state is on screen
      // next to four that have been.
      key: "cascais",
      name: "Cascais Sea House",
      description:
        "Added late. Four bedrooms on the coast road, 40 minutes by train from Lisbon.",
      imageUrl: PHOTOS.cascais,
      location: "Cascais, Lisbon District",
      link: "https://example.com/listings/cascais-sea-house",
      pricePerNight: "430.00",
      totalPrice: "4300.00",
      perPersonCost: "614.29",
      bedrooms: 4,
      bathrooms: 3,
      toilets: 3,
      ensuites: 2,
      singleBeds: 2,
      doubleBeds: 3,
      freeParking: true,
      amenities:
        "Air conditioning, Sea view, Wifi (200 Mbps), Free parking, Washing machine",
      comfortScore: "8.0",
      proposedBy: "hannah",
      createdDaysAgo: 1,
      votes: [
        { person: "hannah", vote: "love" },
        { person: "ava", vote: "fine" },
      ],
      comments: [
        {
          person: "hannah",
          body: "Late entry, I know. Worth a look before the deposit clears.",
          daysAgo: 1,
        },
      ],
    },
  ],

  // Two figures on the table, written in different units on purpose: the
  // screen normalises both to a trip total so they can be compared at all.
  votingUnit: "group",

  groups: [
    {
      key: "kellys",
      name: "The Kellys",
      budgetMax: "3200.00",
      members: ["ava", "marcus"],
    },
    {
      key: "raos",
      name: "Priya & Dev",
      budgetMax: "2600.00",
      members: ["priya", "dev"],
    },
    { key: "tomas", name: "Tomás", budgetMax: "2000.00", members: ["tomas"] },
    // No members yet, and no ceiling: the group an import creates exists from
    // the moment the invites go out, which is before anybody has accepted one.
    { key: "abaras", name: "The Abaras", members: [] },
  ],

  attendees: [
    { group: "kellys", name: "Ines Kelly", kind: "child", age: 9 },
    { group: "kellys", name: "Rafa Kelly", kind: "child", age: 6 },
    { group: "raos", name: "Meera Rao", kind: "child", age: 3 },
    // A pet, so the "no age for a dog" case and the "pets are never a
    // chargeable head" rule are both visible in the demo.
    {
      group: "tomas",
      name: "Bruno",
      kind: "pet",
      notes: "Elderly, sleeps a lot, travels well.",
    },
    // Came in with the import, without an invite: a seven-year-old has no
    // address, and the headcount should not wait on one.
    { group: "abaras", name: "Esme Abara", kind: "child", age: 7 },
  ],

  budget: [
    {
      key: "per-family",
      title: "A flat ceiling per family",
      amount: "2400.00",
      scope: "per_group",
      covers:
        "Accommodation, the hire car and the flights. Food and anything anyone books on the day is on top.",
      proposedBy: "marcus",
      createdDaysAgo: 12,
      selected: true,
      lockedBy: "ava",
      lockedDaysAgo: 4,
      votes: [
        { person: "marcus", vote: "love", daysAgo: 12 },
        { person: "ava", vote: "love", daysAgo: 11 },
        { person: "priya", vote: "fine", daysAgo: 10, changedDaysAgo: 6 },
        { person: "tomas", vote: "love", daysAgo: 9 },
      ],
      comments: [
        {
          person: "priya",
          body: "Flat per family is rough on the ones bringing kids — we're four and Tomás is one. But it's simple and I'd rather have a number.",
          daysAgo: 10,
        },
        {
          person: "marcus",
          body: "That's fair. It's why the per-head version is up there too — pick whichever the group prefers, but let's pick one.",
          daysAgo: 10,
        },
      ],
    },
    {
      key: "per-head",
      title: "Per person instead, kids included",
      amount: "620.00",
      scope: "per_person",
      covers: "The same list. Works out lower for Tomás and higher for us.",
      proposedBy: "priya",
      createdDaysAgo: 10,
      votes: [
        { person: "priya", vote: "love", daysAgo: 10 },
        { person: "tomas", vote: "veto", daysAgo: 8 },
        { person: "nina", vote: "majority", daysAgo: 7 },
      ],
    },
    {
      key: "shoestring",
      title: "Shoestring — half board, no hire car",
      amount: "9000.00",
      scope: "trip_total",
      covers: "Everything, if we take the train and cook most nights.",
      proposedBy: "hannah",
      createdDaysAgo: 15,
      votes: [
        { person: "hannah", vote: "love", daysAgo: 15 },
        { person: "marcus", vote: "veto", daysAgo: 14 },
        { person: "ava", vote: "fine", daysAgo: 13 },
      ],
    },
  ],

  // Ava was offered her own budget cap as a proposal and said no thanks; the
  // €1,400 she wrote in My Preferences is still on the table. One dismissal is
  // what makes the offer credible — a card you cannot turn down is an advert.
  dismissedSuggestions: [
    // Her cap is €1,500 and she is in a family group, which is what the screen
    // fingerprints it as. See `capSuggestion` in `shared/suggestions.ts`.
    {
      person: "ava",
      budget: { amount: "1500.00", scope: "per_group" },
      daysAgo: 12,
    },
  ],

  referee: [
    {
      phase: "dates",
      messageType: "nudge",
      daysAgo: 30,
      content:
        "Three of you haven't voted on any of the three date ranges yet, and the cheapest flights on the late-September option are the ones that move first.\n\nHannah, Dev and Nina — a **maybe** is a useful answer here. It tells the group the shape of the problem without committing you.",
    },
    {
      phase: "dates",
      messageType: "compromise",
      daysAgo: 24,
      content:
        "Late September now has five **available** and one **maybe**; early September has two hard **unavailable** votes that are term dates and will not move.\n\nThe honest read: late September is the only range where nobody is being asked to give something up. Hannah's maybe is the only open question, and it turns on a work trip that has already shifted once.\n\n**Suggestion:** lock late September now and hold one refundable seat rather than waiting for certainty that may not arrive before the fares do.",
    },
    {
      phase: "destination",
      messageType: "mediation",
      daysAgo: 26,
      content:
        "Porto is the only place with a veto on it, and the veto is about the six hours on a train rather than about Porto.\n\nPriya loves it. Tomás doesn't want to lose two Algarve days to travel. Those are not actually in conflict — they're a disagreement about where Porto sits in the week, not about whether to go.\n\n**Compromise worth voting on:** Porto as a day trip from Lisbon on the Thursday, for whoever wants it. Nobody loses beach days, and nobody loses Porto.",
    },
    {
      phase: "accommodation",
      messageType: "mediation",
      daysAgo: 6,
      content:
        "There is a real conflict here and it is worth naming plainly.\n\n**Alfama Terrace House** is the group's favourite on location and the cheapest by €240 a head. It is four floors with no lift. Ava's stated requirement is step-free or one flight, following surgery in the spring. That is a hard constraint, not a preference, and no amount of enthusiasm from the rest of the group makes those stairs shorter.\n\n**Quinta do Benagil** clears every hard constraint in the group — ground-floor bedroom, air conditioning, 250 Mbps, board storage, parking — and costs €686 a head against Hannah's €900 ceiling.\n\nThe gap between them is €243 per person. That is the actual decision: whether the group is willing to spend €243 each so that one member is not on the stairs six times a day for ten days.\n\n**Suggestion:** put Benagil to a vote and treat the price as the thing being debated, rather than re-running the argument about the house.",
    },
    {
      phase: "accommodation",
      messageType: "celebration",
      daysAgo: 2,
      content:
        "Booked — **Quinta do Benagil**, ten nights, €686 each.\n\nEvery hard constraint in this group is met by the place you chose, which is not how most of these end. Hannah moved off a veto after the numbers were laid out rather than after being worn down, and Priya withdrew a proposal she liked because someone else couldn't manage the stairs.\n\nThat's the whole trick. Nice work. 🎉",
    },
  ],

  notifications: [
    {
      person: "ava",
      type: "consensus",
      title: "Quinta do Benagil was finalised",
      message:
        "Marcus locked in Quinta do Benagil for the Algarve leg. €686 each, ten nights.",
      path: "/accommodations",
      daysAgo: 2,
    },
    {
      person: "ava",
      type: "referee",
      title: "The referee weighed in on the accommodation",
      message:
        "It called the stairs a hard constraint and priced the difference at €243 each.",
      path: "/referee",
      daysAgo: 6,
    },
    {
      person: "ava",
      type: "vote_request",
      title: "Cascais Sea House needs your vote",
      message:
        "Hannah added a late option. Five people haven't voted on it yet.",
      path: "/accommodations",
      read: true,
      daysAgo: 1,
    },
    {
      person: "ava",
      type: "budget_alert",
      title: "The trip is at 68% of its budget",
      message:
        "€7,579 committed of €11,200, and the food line is still an estimate.",
      path: "/budget",
      daysAgo: 2,
    },
    {
      person: "ava",
      type: "invite",
      title: "Joel hasn't answered yet",
      message: "The invite to joel@… has been pending for five days.",
      path: "/members",
      read: true,
      daysAgo: 5,
    },
  ],
};

// ---------------------------------------------------------------------------
// Trip 2 — early, unresolved. The screen a new group actually sees.
// ---------------------------------------------------------------------------

const chamonix: DemoTrip = {
  key: "chamonix",
  name: "Chamonix, before the season ends",
  description:
    "Five of us, four nights, and no two people free in the same week. Dates first, everything else later.",
  coverImage: PHOTOS.chamonix,
  inviteCode: "DEMO-CHAMONIX",
  phase: "dates",
  status: "planning",
  currency: "EUR",
  totalBudget: "4200.00",
  createdDaysAgo: 9,
  organizer: "ava",

  members: [
    {
      person: "ava",
      role: "admin",
      status: "accepted",
      joinedVia: "creator",
      joinedDaysAgo: 9,
      budgetMax: "900.00",
    },
    {
      person: "sofia",
      role: "tripmate",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 9,
      respondedDaysAgo: 8,
      invitedBy: "ava",
      budgetMax: "750.00",
    },
    {
      person: "ben",
      role: "tripmate",
      status: "accepted",
      joinedVia: "link",
      joinedDaysAgo: 8,
      respondedDaysAgo: 8,
      invitedBy: "ava",
      budgetMax: "1100.00",
    },
    {
      person: "marcus",
      role: "tripmate",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 7,
      respondedDaysAgo: 6,
      invitedBy: "ava",
    },
    // Declined, so the members screen has one of those too.
    {
      person: "dev",
      role: "tripmate",
      status: "declined",
      joinedVia: "email",
      joinedDaysAgo: 7,
      respondedDaysAgo: 5,
      invitedBy: "ava",
    },
  ],

  pendingInvites: [
    { mailbox: "tomas", role: "tripmate", invitedBy: "ava", daysAgo: 3 },
    { mailbox: "nina", role: "watcher", invitedBy: "sofia", daysAgo: 2 },
  ],

  preferences: [
    {
      person: "ava",
      mustHaves:
        "Somewhere with a green run off the lift. I am not good at this.",
      strongPreferences: "A town you can walk around in the evening.",
      avoids: "Ski-in ski-out places where dinner is a shuttle bus.",
      openComments: "Genuinely happy to spend two of the four days not skiing.",
      savedDaysAgo: 6,
    },
    {
      person: "ben",
      mustHaves: "Off-piste access without a guide fee on top of everything.",
      strongPreferences: "A lift pass that covers more than one valley.",
      avoids: "Beginner-only resorts.",
      openComments: "I will happily ski alone if the group wants a slow day.",
      savedDaysAgo: 5,
    },
  ],

  dateProposals: [
    {
      key: "first-march",
      label: "First week of March",
      proposedBy: "ava",
      startsInDays: 204,
      endsInDays: 208,
      createdDaysAgo: 9,
      votes: [
        { person: "ava", vote: "available" },
        { person: "sofia", vote: "available" },
        { person: "ben", vote: "maybe" },
        { person: "marcus", vote: "unavailable" },
      ],
    },
    {
      key: "mid-march",
      label: "Mid March — better snow, worse prices",
      proposedBy: "ben",
      startsInDays: 218,
      endsInDays: 222,
      createdDaysAgo: 8,
      votes: [
        { person: "ben", vote: "available" },
        { person: "marcus", vote: "available" },
        { person: "ava", vote: "maybe" },
        { person: "sofia", vote: "unavailable" },
      ],
      comments: [
        {
          person: "sofia",
          body: "This is the one week I genuinely can't. Everything else is negotiable.",
          daysAgo: 7,
        },
      ],
    },
    {
      key: "late-march",
      label: "Last weekend in March",
      proposedBy: "sofia",
      startsInDays: 232,
      endsInDays: 235,
      createdDaysAgo: 6,
      votes: [
        { person: "sofia", vote: "available" },
        { person: "ava", vote: "available" },
        { person: "marcus", vote: "maybe" },
        // The abstention that matters: it looks like a fourth vote on the
        // card and counts for nothing in the tally.
        { person: "ben", vote: "majority", daysAgo: 3 },
      ],
    },
  ],

  destinations: [
    {
      key: "chamonix",
      name: "Chamonix",
      description:
        "The default. A real town, and the Aiguille du Midi if the weather holds.",
      imageUrl: PHOTOS.chamonix,
      estimatedCost: "620.00",
      proposedBy: "ava",
      createdDaysAgo: 9,
      votes: [
        { person: "ava", vote: "love" },
        { person: "ben", vote: "love" },
        { person: "sofia", vote: "fine" },
        { person: "marcus", vote: "fine" },
      ],
    },
    {
      key: "val-thorens",
      name: "Val Thorens",
      description:
        "Snow-sure and high, but it is a lift station with hotels attached.",
      imageUrl: PHOTOS.valThorens,
      estimatedCost: "700.00",
      proposedBy: "ben",
      createdDaysAgo: 8,
      votes: [
        { person: "ben", vote: "love" },
        { person: "marcus", vote: "fine" },
        { person: "ava", vote: "veto" },
        { person: "sofia", vote: "fine" },
      ],
    },
    {
      key: "zermatt",
      name: "Zermatt",
      description:
        "Beautiful, car-free, and roughly 40% more expensive than everything else here.",
      imageUrl: PHOTOS.zermatt,
      estimatedCost: "980.00",
      proposedBy: "sofia",
      createdDaysAgo: 6,
      votes: [
        { person: "sofia", vote: "love" },
        { person: "ava", vote: "fine" },
        { person: "ben", vote: "fine" },
        { person: "marcus", vote: "veto" },
      ],
      comments: [
        {
          person: "marcus",
          body: "Love it, can't afford it. That's the whole comment.",
          daysAgo: 5,
        },
      ],
    },
  ],

  referee: [
    {
      phase: "dates",
      messageType: "nudge",
      daysAgo: 4,
      content:
        "None of the three date ranges has everyone on it, and one member hasn't voted on any of them.\n\nAs it stands, the last weekend in March is the only range with no **unavailable** votes — but it is also the one two people haven't answered yet. Worth chasing before you rule the other two out.",
    },
    {
      phase: "dates",
      messageType: "summary",
      daysAgo: 2,
      content:
        "Where this actually stands:\n\n- **First week of March** — 2 available, 1 maybe, 1 unavailable (Marcus, work)\n- **Mid March** — 2 available, 1 maybe, 1 unavailable (Sofia, immovable)\n- **Last weekend in March** — 2 available, 1 maybe, 1 going with the majority, nobody blocked\n\nTwo of the three are blocked by something that has already been described as fixed. The third is short a couple of votes rather than short of agreement, which is a different and much easier problem.\n\nOne note on Ben: **go with the majority** is counted as nothing, not as a yes. Four people have answered the last weekend in March and three of them stated a preference — enough to decide on, as long as nobody reads it as unanimous.",
    },
  ],

  notifications: [
    {
      person: "ava",
      type: "vote_request",
      title: "Three date ranges, nobody has all five",
      message:
        "The last weekend in March is the only one with nothing blocking it.",
      path: "/dates",
      daysAgo: 2,
    },
    {
      person: "ava",
      type: "general",
      title: "Dev declined the invite",
      message: "Dev can't make any of the March dates.",
      path: "/members",
      read: true,
      daysAgo: 5,
    },
  ],
};

// ---------------------------------------------------------------------------
// Trip 3 — finished. The archive state, and the thing you clone next year.
// ---------------------------------------------------------------------------

const kyoto: DemoTrip = {
  key: "kyoto",
  name: "Kyoto in the autumn",
  description:
    "Four of us, nine days, peak momiji. Came in €135 a head under budget, which has never happened before or since.",
  coverImage: PHOTOS.kyoto,
  inviteCode: "DEMO-KYOTO",
  phase: "finalized",
  status: "completed",
  currency: "EUR",
  totalBudget: "8000.00",
  createdDaysAgo: 320,
  startsInDays: -268,
  endsInDays: -260,
  organizer: "ava",

  members: [
    {
      person: "ava",
      role: "admin",
      status: "accepted",
      joinedVia: "creator",
      joinedDaysAgo: 320,
      budgetMax: "2000.00",
    },
    {
      person: "yuki",
      role: "admin",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 319,
      respondedDaysAgo: 318,
      invitedBy: "ava",
      budgetMax: "2000.00",
    },
    {
      person: "priya",
      role: "tripmate",
      status: "accepted",
      joinedVia: "email",
      joinedDaysAgo: 318,
      respondedDaysAgo: 316,
      invitedBy: "ava",
      budgetMax: "1800.00",
    },
    {
      person: "ben",
      role: "tripmate",
      status: "accepted",
      joinedVia: "link",
      joinedDaysAgo: 315,
      respondedDaysAgo: 315,
      invitedBy: "yuki",
      budgetMax: "2200.00",
    },
  ],

  dateProposals: [
    {
      key: "momiji",
      label: "Late November — peak autumn colour",
      proposedBy: "yuki",
      startsInDays: -268,
      endsInDays: -260,
      createdDaysAgo: 318,
      selected: true,
      lockedBy: "ava",
      lockedDaysAgo: 300,
      votes: [
        { person: "yuki", vote: "available" },
        { person: "ava", vote: "available" },
        { person: "priya", vote: "available" },
        { person: "ben", vote: "available" },
      ],
    },
  ],

  destinations: [
    {
      key: "kyoto",
      name: "Kyoto",
      description: "The whole trip. No day trips, no second city, no regrets.",
      imageUrl: PHOTOS.kyoto,
      proposedBy: "yuki",
      createdDaysAgo: 317,
      selected: true,
      lockedBy: "ava",
      lockedDaysAgo: 299,
      votes: [
        { person: "yuki", vote: "love" },
        { person: "ava", vote: "love" },
        { person: "priya", vote: "love" },
        { person: "ben", vote: "love" },
      ],
    },
  ],

  accommodations: [
    {
      key: "machiya",
      name: "Machiya near Nishiki",
      description:
        "A restored townhouse, two floors, sleeps four. Ten minutes from the market and quiet after eight.",
      imageUrl: PHOTOS.arashiyama,
      location: "Nakagyō-ku, Kyoto",
      link: "https://example.com/listings/machiya-nishiki",
      pricePerNight: "295.00",
      totalPrice: "2360.00",
      perPersonCost: "590.00",
      bedrooms: 3,
      bathrooms: 2,
      toilets: 2,
      ensuites: 1,
      singleBeds: 2,
      doubleBeds: 2,
      freeParking: false,
      amenities:
        "Tatami rooms, Deep bath, Wifi (300 Mbps), Washing machine, Bicycle storage, Courtyard garden",
      comfortScore: "8.9",
      proposedBy: "yuki",
      createdDaysAgo: 296,
      selected: true,
      lockedBy: "yuki",
      lockedDaysAgo: 290,
      votes: [
        { person: "yuki", vote: "love" },
        { person: "ava", vote: "love" },
        { person: "priya", vote: "love" },
        { person: "ben", vote: "love" },
      ],
    },
  ],

  budget: [
    {
      key: "kyoto-agreed",
      title: "The number we agreed and then beat",
      amount: "2000.00",
      scope: "per_person",
      covers:
        "Flights, the machiya, trains, temples, and food deliberately left generous.",
      proposedBy: "yuki",
      createdDaysAgo: 320,
      selected: true,
      lockedBy: "yuki",
      lockedDaysAgo: 310,
      votes: [
        { person: "yuki", vote: "love", daysAgo: 320 },
        { person: "ava", vote: "love", daysAgo: 319 },
        { person: "ben", vote: "fine", daysAgo: 318 },
        { person: "priya", vote: "love", daysAgo: 316 },
      ],
    },
  ],

  referee: [
    {
      phase: "finalized",
      messageType: "summary",
      daysAgo: 259,
      content:
        "Final numbers: **€7,460 against a €8,000 budget** — €135 a head under.\n\nFor next time, three things this group did that most don't: one destination rather than three, accommodation booked eleven months out at 2023 prices, and food left deliberately unbudgeted rather than optimistically underbudgeted.\n\nClone this trip and the dates and the machiya come with it. The votes don't, which is the point — next year's group makes next year's decisions.",
    },
  ],

  notifications: [
    {
      person: "ava",
      type: "phase_change",
      title: "Kyoto is done",
      message: "€135 a head under budget. Clone it when you want the next one.",
      // Kept honest against the budget rows above: 8000 − 7460 = 540, over four.
      path: "",
      read: true,
      daysAgo: 259,
    },
  ],
};

export const TRIPS: DemoTrip[] = [lisbon, chamonix, kyoto];
