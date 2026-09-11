/**
 * A whole trip, in memory.
 *
 * Every screen but the landing page is behind a session, so without a database
 * the app is unreviewable: the sign-in screen and a spinner are the only two
 * things you can look at. This is the answer to that — one trip's worth of
 * data in the shapes the routers return, seeded straight into the React Query
 * cache so the *real* screens render against it.
 *
 * It is not a second implementation of anything. Nothing here is imported by
 * the app: the seed route is behind `import.meta.env.DEV`, so a production
 * bundle cannot route to it however the URL is typed.
 *
 * Shapes follow `drizzle/schema.ts` and the projections in `server/db.ts` —
 * `dateProposals` and friends arrive with `proposer` and a `votes` array whose
 * entries carry `user`. Where a screen wants a field this does not have, add
 * it here rather than making the screen defensive.
 */

export const TRIP_ID = 9001;
export const ME = 1;

const iso = (s: string) => new Date(s);

export const users = [
  { id: 1, name: "Ava Bennett", email: "ava@example.com" },
  { id: 2, name: "Priya Raghunathan", email: "priya@example.com" },
  { id: 3, name: "Tomas Ferreira", email: "tomas@example.com" },
  { id: 4, name: "Nina Kowalski", email: "nina@example.com" },
  { id: 5, name: "Dele Adeyemi", email: "dele@example.com" },
  { id: 6, name: "Mei Sato", email: "mei@example.com" },
];
const nameOf = (id: number) => users.find(u => u.id === id)?.name ?? null;

export const me = {
  id: ME,
  name: "Ava Bennett",
  email: "ava@example.com",
  role: "user",
  avatarUrl: null,
  loginMethod: "password",
  createdAt: iso("2026-01-04"),
};

export const trip = {
  id: TRIP_ID,
  name: "Lisbon & the Algarve",
  description:
    "Nine nights, six of us, one car. A few days in the city and then south for the coast. Nobody wants to drive more than three hours in a day.",
  coverImage: null,
  organizerId: ME,
  inviteCode: "DEMO-LISBON",
  phase: "accommodation",
  status: "active",
  startDate: iso("2026-09-21"),
  endDate: iso("2026-09-30"),
  currency: "GBP",
  totalBudget: "600.00",
  votingUnit: "member",
  hiddenSections: [] as string[],
  voterCount: 6,
  createdAt: iso("2026-02-11"),
  updatedAt: iso("2026-08-02"),
};

/** `vote` values differ per scale — dates use availability, the rest preference. */
const votesFor = (proposalId: number, entries: Array<[number, string]>) =>
  entries.map(([userId, vote], i) => ({
    id: proposalId * 100 + i,
    proposalId,
    userId,
    vote,
    createdAt: iso("2026-08-01"),
    updatedAt: iso("2026-08-01"),
    user: nameOf(userId),
  }));

export const dates = [
  {
    id: 301,
    tripId: TRIP_ID,
    proposedBy: 2,
    startDate: iso("2026-08-31"),
    endDate: iso("2026-09-09"),
    label: "First week of September",
    selected: false,
    lockedBy: null,
    lockedAt: null,
    createdAt: iso("2026-07-02"),
    proposer: nameOf(2),
    votes: votesFor(301, [
      [1, "maybe"],
      [2, "available"],
      [3, "available"],
      [4, "unavailable"],
      [5, "unavailable"],
      [6, "available"],
    ]),
  },
  {
    id: 302,
    tripId: TRIP_ID,
    proposedBy: 1,
    startDate: iso("2026-09-21"),
    endDate: iso("2026-09-30"),
    label: "Late September, shoulder season",
    selected: true,
    lockedBy: 1,
    lockedAt: iso("2026-08-02"),
    createdAt: iso("2026-07-02"),
    proposer: nameOf(1),
    votes: votesFor(302, [
      [1, "available"],
      [2, "available"],
      [3, "available"],
      [4, "available"],
      [5, "maybe"],
      [6, "available"],
    ]),
  },
];

export const destinations = [
  {
    id: 401,
    tripId: TRIP_ID,
    name: "Lagos",
    description:
      "Cliffs, a walkable old town and the best beaches within reach of the airport.",
    imageUrl: null,
    estimatedCost: "220.00",
    proposedBy: 3,
    selected: true,
    lockedBy: 1,
    lockedAt: iso("2026-08-02"),
    createdAt: iso("2026-07-04"),
    proposer: nameOf(3),
    votes: votesFor(401, [
      [1, "love"],
      [2, "love"],
      [3, "love"],
      [4, "fine"],
      [5, "fine"],
      [6, "love"],
    ]),
  },
  {
    id: 402,
    tripId: TRIP_ID,
    name: "Sintra day trip",
    description:
      "Palaces in the hills an hour out of the city. Busy, but worth one day.",
    imageUrl: null,
    estimatedCost: "45.00",
    proposedBy: 4,
    selected: false,
    lockedBy: null,
    lockedAt: null,
    createdAt: iso("2026-07-06"),
    proposer: nameOf(4),
    votes: votesFor(402, [
      [1, "love"],
      [2, "fine"],
      [4, "love"],
      [6, "veto"],
    ]),
  },
  {
    id: 403,
    tripId: TRIP_ID,
    name: "Evora",
    description:
      "A Roman temple, a chapel of bones, and nobody else there in September.",
    imageUrl: null,
    estimatedCost: "80.00",
    proposedBy: 6,
    selected: false,
    lockedBy: null,
    lockedAt: null,
    createdAt: iso("2026-07-09"),
    proposer: nameOf(6),
    votes: votesFor(403, [
      [2, "fine"],
      [6, "love"],
    ]),
  },
];

export const accommodations = [
  {
    id: 501,
    tripId: TRIP_ID,
    name: "Casa Azul, Alfama",
    description:
      "Bright 3-bed with a roof terrace over the old town. Ten minutes on foot to the tram.",
    imageUrl: null,
    pricePerNight: "240.00",
    totalPrice: "2160.00",
    perPersonCost: "360.00",
    bedrooms: 3,
    bathrooms: 2,
    singleBeds: 2,
    doubleBeds: 2,
    toilets: 2,
    ensuites: 1,
    freeParking: false,
    camperParking: false,
    amenities: JSON.stringify([
      "Wi-Fi",
      "Air conditioning",
      "Washing machine",
      "Terrace",
    ]),
    preferences: null,
    location: "Alfama, Lisbon",
    link: "https://example.com/casa-azul",
    comfortScore: "8.4",
    matchAnalysis: null,
    matchAnalysedAt: null,
    proposedBy: 1,
    selected: true,
    lockedBy: 1,
    lockedAt: iso("2026-08-02"),
    createdAt: iso("2026-07-12"),
    proposer: nameOf(1),
    votes: votesFor(501, [
      [1, "love"],
      [2, "love"],
      [3, "fine"],
      [4, "love"],
      [5, "fine"],
      [6, "love"],
    ]),
  },
  {
    id: 502,
    tripId: TRIP_ID,
    name: "Quinta do Vale, Lagos",
    description:
      "Farmhouse twenty minutes inland. Pool, a long table outside, and parking for two cars.",
    imageUrl: null,
    pricePerNight: "310.00",
    totalPrice: "2790.00",
    perPersonCost: "465.00",
    bedrooms: 4,
    bathrooms: 3,
    singleBeds: 4,
    doubleBeds: 2,
    toilets: 3,
    ensuites: 2,
    freeParking: true,
    camperParking: false,
    amenities: JSON.stringify([
      "Pool",
      "Wi-Fi",
      "Parking",
      "Barbecue",
      "Air conditioning",
    ]),
    preferences: null,
    location: "Odiaxere, Lagos",
    link: "https://example.com/quinta",
    comfortScore: "9.1",
    matchAnalysis: null,
    matchAnalysedAt: null,
    proposedBy: 5,
    selected: false,
    lockedBy: null,
    lockedAt: null,
    createdAt: iso("2026-07-18"),
    proposer: nameOf(5),
    votes: votesFor(502, [
      [1, "fine"],
      [2, "love"],
      [5, "love"],
    ]),
  },
];

export const budgets = [
  {
    id: 601,
    tripId: TRIP_ID,
    proposedBy: 1,
    title: "Everything in, per person",
    amount: "600.00",
    currency: "GBP",
    scope: "per_person",
    covers: null,
    selected: false,
    lockedBy: null,
    lockedAt: null,
    createdAt: iso("2026-07-20"),
    proposer: nameOf(1),
    votes: votesFor(601, [
      [1, "love"],
      [2, "fine"],
      [3, "veto"],
      [4, "love"],
    ]),
  },
  {
    id: 602,
    tripId: TRIP_ID,
    proposedBy: 3,
    title: "Stay and car only",
    amount: "420.00",
    currency: "GBP",
    scope: "per_person",
    covers: null,
    selected: false,
    lockedBy: null,
    lockedAt: null,
    createdAt: iso("2026-07-22"),
    proposer: nameOf(3),
    votes: votesFor(602, [
      [3, "love"],
      [5, "love"],
      [6, "fine"],
    ]),
  },
];

export const members = users.map((u, i) => ({
  id: 200 + i,
  tripId: TRIP_ID,
  userId: u.id,
  role: i === 0 ? "admin" : i === 5 ? "watcher" : "tripmate",
  status: "accepted",
  groupId: i < 2 ? 101 : i < 4 ? 102 : null,
  budgetMax: i === 2 ? "450.00" : null,
  invitedBy: i === 0 ? null : 1,
  joinedVia: i === 0 ? "creator" : i % 2 ? "email" : "link",
  invitedByName: i === 0 ? null : "Ava Bennett",
  respondedAt: iso("2026-02-14"),
  joinedAt: iso("2026-02-14"),
  user: u,
}));

export const groups = [
  {
    id: 101,
    tripId: TRIP_ID,
    name: "The Bennetts",
    budgetMax: "1200.00",
    createdAt: iso("2026-02-15"),
  },
  {
    id: 102,
    tripId: TRIP_ID,
    name: "Ferreira-Kowalski",
    budgetMax: null,
    createdAt: iso("2026-03-01"),
  },
];

export const attendees = [
  {
    id: 701,
    tripId: TRIP_ID,
    groupId: 101,
    memberUserId: null,
    name: "Rosa Bennett",
    kind: "child",
    age: 7,
    notes: null,
    createdAt: iso("2026-03-02"),
  },
  {
    id: 702,
    tripId: TRIP_ID,
    groupId: 102,
    memberUserId: null,
    name: "Milo",
    kind: "pet",
    age: null,
    notes: "Travels well, hates ferries.",
    createdAt: iso("2026-03-02"),
  },
];

export const invites = [
  {
    id: 801,
    tripId: TRIP_ID,
    email: "jonah@example.com",
    role: "tripmate",
    invitedBy: 1,
    token: "x",
    groupId: null,
    status: "pending",
    sentAt: iso("2026-08-04"),
    respondedAt: null,
  },
  {
    id: 802,
    tripId: TRIP_ID,
    email: "kit@example.com",
    role: "watcher",
    invitedBy: 1,
    token: "y",
    groupId: null,
    status: "declined",
    sentAt: iso("2026-06-11"),
    respondedAt: iso("2026-06-12"),
  },
];

/** `groups.headcount` — the same totals, plus a breakdown per group. */
export const headcount = {
  adults: 6,
  children: 1,
  pets: 1,
  people: 7,
  groups: 2,
  byGroup: {
    "101": { adults: 2, children: 1, pets: 0, people: 3 },
    "102": { adults: 2, children: 0, pets: 1, people: 2 },
    none: { adults: 2, children: 0, pets: 0, people: 2 },
  } as Record<string, { adults: number; children: number; pets: number; people: number }>,
};

export const budgetSummary = {
  headcount,
  myHeads: { adults: 2, children: 1 },
  proposalCount: budgets.length,
  finalised: null,
  leading: {
    id: 601,
    title: "Everything in, per person",
    currency: "GBP",
    amount: 600,
    scope: "per_person",
    tripTotal: 4200,
    perPerson: 600,
    perGroup: 1400,
    yourGroupShare: 1800,
  },
  votersOverCap: 1,
  currency: "GBP",
};

export const notifications = [
  {
    id: 901,
    userId: ME,
    tripId: TRIP_ID,
    type: "vote_request",
    title: "Three suggestions need your vote",
    message: "Sintra, Evora and one more are waiting on you.",
    read: false,
    actionUrl: `/trips/${TRIP_ID}/suggestions`,
    createdAt: iso("2026-09-08"),
  },
  {
    id: 902,
    userId: ME,
    tripId: TRIP_ID,
    type: "consensus",
    title: "Dates are settled",
    message: "21-30 September. Tomas finalised it.",
    read: false,
    actionUrl: `/trips/${TRIP_ID}/dates`,
    createdAt: iso("2026-08-02"),
  },
  {
    id: 903,
    userId: ME,
    tripId: TRIP_ID,
    type: "invite",
    title: "Jonah has not answered",
    message: "Invited four days ago as a tripmate.",
    read: true,
    actionUrl: `/trips/${TRIP_ID}/members`,
    createdAt: iso("2026-08-04"),
  },
];

export const tripsList = [
  { ...trip, memberCount: 6, role: "admin" },
  {
    ...trip,
    id: 9002,
    name: "Ski week, Val Thorens",
    description: "Six of us, one chalet, last week of January.",
    startDate: iso("2027-01-23"),
    endDate: iso("2027-01-30"),
    phase: "dates",
    memberCount: 5,
    role: "tripmate",
  },
];

export const contacts = [
  { id: 1001, ownerUserId: ME, name: "Jonah Prentice", email: "jonah@example.com", contactUserId: null, createdAt: iso("2026-05-02") },
  { id: 1002, ownerUserId: ME, name: "Kit Osei", email: "kit@example.com", contactUserId: null, createdAt: iso("2026-05-02") },
];

export const contactGroups = [
  {
    id: 1101,
    ownerUserId: ME,
    name: "The Prentices",
    createdAt: iso("2026-05-02"),
    members: [
      { id: 1, groupId: 1101, contactId: 1001, name: "Jonah Prentice", email: "jonah@example.com", kind: "adult", age: null, createdAt: iso("2026-05-02") },
      { id: 2, groupId: 1101, contactId: null, name: "Ada Prentice", email: null, kind: "child", age: 5, createdAt: iso("2026-05-02") },
    ],
  },
];
