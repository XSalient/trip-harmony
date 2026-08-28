import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ScrollRestoration from "./components/ScrollRestoration";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

/**
 * Every page but the first two is fetched when somebody goes to it.
 *
 * All fifteen used to be imported here, so the first load carried recharts,
 * streamdown, framer-motion, embla and react-day-picker whichever page you had
 * actually asked for — including the sign-in screen, which uses none of them.
 *
 * `Home` and `NotFound` stay eager: the first is what an unauthenticated visitor
 * lands on, so splitting it only adds a round trip before anything is drawn, and
 * the second is the fallback, which should never itself fail to load.
 */
const CreateTrip = lazy(() => import("./pages/CreateTrip"));
const JoinTrip = lazy(() => import("./pages/JoinTrip"));
const TripDashboard = lazy(() => import("./pages/TripDashboard"));
const TripDates = lazy(() => import("./pages/TripDates"));
const TripDestinations = lazy(() => import("./pages/TripDestinations"));
const TripAccommodations = lazy(() => import("./pages/TripAccommodations"));
const TripBudget = lazy(() => import("./pages/TripBudget"));
const TripReferee = lazy(() => import("./pages/TripReferee"));
const TripPreferences = lazy(() => import("./pages/TripPreferences"));
const TripMembers = lazy(() => import("./pages/TripMembers"));
const Notifications = lazy(() => import("./pages/Notifications"));
const MagicLinkVerify = lazy(() => import("./pages/MagicLinkVerify"));
const Admin = lazy(() => import("@/pages/Admin"));
const Profile = lazy(() => import("./pages/Profile"));
// Reachable without an account, and that is the requirement: a store reviewer
// opens the privacy URL signed out. See `components/LegalPage.tsx`.
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));

/** Shown while a page's chunk is on its way. */
function PageLoading() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth/magic/:token" component={MagicLinkVerify} />
      <Route path="/trips/new" component={CreateTrip} />
      <Route path="/join/:code" component={JoinTrip} />
      <Route path="/trips/:id" component={TripDashboard} />
      <Route path="/trips/:id/dates" component={TripDates} />
      <Route path="/trips/:id/suggestions" component={TripDestinations} />
      <Route path="/trips/:id/accommodations" component={TripAccommodations} />
      <Route path="/trips/:id/budget" component={TripBudget} />
      <Route path="/trips/:id/referee" component={TripReferee} />
      <Route path="/trips/:id/preferences" component={TripPreferences} />
      <Route path="/trips/:id/members" component={TripMembers} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/profile" component={Profile} />
      <Route path="/admin" component={Admin} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <ScrollRestoration />
          {/* Inside the boundary on purpose: a chunk that fails to load — a
              stale deploy, a flaky connection — is an error to be shown, not a
              white screen. */}
          <Suspense fallback={<PageLoading />}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
