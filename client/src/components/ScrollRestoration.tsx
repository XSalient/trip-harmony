/**
 * A new screen starts at its top; going back returns you to where you were.
 *
 * The browser only does this for real navigations. A single-page app swaps the
 * component tree and leaves the scroll offset alone, so opening Places from
 * halfway down the trip page landed you halfway down Places — its heading and
 * its "Unlock all" / "Add" buttons already scrolled off, which reads as a
 * screen that is cut off at the top rather than one that is merely scrolled.
 *
 * Back is the exception, and worth the extra few lines: restoring the position
 * is the whole reason the browser has `scrollRestoration`, and a back button
 * that dumps you at the top of a long list of proposals is its own bug.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

export default function ScrollRestoration() {
  const [location] = useLocation();
  const positions = useRef(new Map<string, number>());
  const previous = useRef(location);
  // Set by `popstate`, which fires before wouter re-renders with the new path.
  const wentBack = useRef(false);

  useEffect(() => {
    // Ours to manage now; otherwise the browser also restores and the two fight.
    const original = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const onPop = () => {
      wentBack.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.history.scrollRestoration = original;
    };
  }, []);

  useEffect(() => {
    if (location === previous.current) return;
    positions.current.set(previous.current, window.scrollY);
    previous.current = location;

    const restoring = wentBack.current;
    wentBack.current = false;
    const target = restoring ? (positions.current.get(location) ?? 0) : 0;

    // After paint: the new screen renders at zero height first, and a scroll
    // issued before it has content is clamped to zero and silently lost.
    requestAnimationFrame(() => window.scrollTo(0, target));
  }, [location]);

  return null;
}
