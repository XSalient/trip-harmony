import { Compass, Home } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/harmony";

/**
 * The fallback route, and one of only two screens that bypass AppShell — so it
 * still has to render when the app around it has failed. It depends on nothing
 * but the tokens.
 */
export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <StatusScreen
      icon={Compass}
      tone="neutral"
      title="We can't find that page"
      // Names a likely cause and offers the way out, rather than blaming the
      // visitor for a link that may simply be old.
      description="The link may be out of date, or the trip it pointed to may have been removed."
      action={
        <Button size="lg" className="w-full" onClick={() => setLocation("/")}>
          <Home />
          Go home
        </Button>
      }
    />
  );
}
