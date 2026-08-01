/**
 * Root tRPC router: one entry per domain, each in its own file.
 *
 * Keep this file a table of contents. Procedures live in the domain modules so
 * a change to (say) budgeting never requires reading the accommodation code —
 * which also keeps the context an AI agent has to load small.
 */
import { router } from "../_core/trpc.js";
import { systemRouter } from "../_core/systemRouter.js";
import { authRouter } from "./auth.js";
import { travelDnaRouter } from "./travelDna.js";
import { tripsRouter } from "./trips.js";
import { datesRouter } from "./dates.js";
import { destinationsRouter } from "./destinations.js";
import { accommodationsRouter } from "./accommodations.js";
import { budgetRouter } from "./budget.js";
import { refereeRouter } from "./referee.js";
import { notificationsRouter } from "./notifications.js";
import { commentsRouter } from "./comments.js";
import { preferencesRouter } from "./preferences.js";
import { vibeBoardRouter } from "./vibeBoard.js";
import { itineraryRouter } from "./itinerary.js";

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
