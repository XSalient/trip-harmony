/**
 * Root tRPC router: one entry per domain, each in its own file.
 *
 * Keep this file a table of contents. Procedures live in the domain modules so
 * a change to (say) budgeting never requires reading the accommodation code —
 * which also keeps the context an AI agent has to load small.
 */
import { router } from "../_core/trpc";
import { systemRouter } from "../_core/systemRouter";
import { authRouter } from "./auth";
import { travelDnaRouter } from "./travelDna";
import { tripsRouter } from "./trips";
import { datesRouter } from "./dates";
import { destinationsRouter } from "./destinations";
import { accommodationsRouter } from "./accommodations";
import { budgetRouter } from "./budget";
import { refereeRouter } from "./referee";
import { notificationsRouter } from "./notifications";
import { commentsRouter } from "./comments";
import { preferencesRouter } from "./preferences";
import { vibeBoardRouter } from "./vibeBoard";
import { itineraryRouter } from "./itinerary";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  travelDna: travelDnaRouter,
  trips: tripsRouter,
  dates: datesRouter,
  destinations: destinationsRouter,
  accommodations: accommodationsRouter,
  budget: budgetRouter,
  referee: refereeRouter,
  notifications: notificationsRouter,
  comments: commentsRouter,
  preferences: preferencesRouter,
  vibeBoard: vibeBoardRouter,
  itinerary: itineraryRouter,
});

export type AppRouter = typeof appRouter;
