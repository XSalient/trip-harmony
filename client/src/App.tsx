import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import ScrollRestoration from "./components/ScrollRestoration";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CreateTrip from "./pages/CreateTrip";
import JoinTrip from "./pages/JoinTrip";
import TripDashboard from "./pages/TripDashboard";
import TripDates from "./pages/TripDates";
import TripDestinations from "./pages/TripDestinations";
import TripAccommodations from "./pages/TripAccommodations";
import TripBudget from "./pages/TripBudget";
import TripReferee from "./pages/TripReferee";
import TripPreferences from "./pages/TripPreferences";
import TripMembers from "./pages/TripMembers";
import Notifications from "./pages/Notifications";
import MagicLinkVerify from "./pages/MagicLinkVerify";
import Admin from "@/pages/Admin";
import Profile from "./pages/Profile";

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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
