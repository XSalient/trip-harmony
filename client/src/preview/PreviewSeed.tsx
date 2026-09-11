import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as fx from "./fixtures";
import { requestFixtures, seedFixtures } from "./seedCache";

/**
 * The way in to the fixture preview: seeds the cache, remembers that it did,
 * and lists the screens.
 *
 * The seeding itself lives in `seedCache.ts` because it also has to run at
 * boot — the cache is in memory, so a reload or a link followed outside the
 * router would otherwise land on an empty one.
 *
 * Development only; the route is behind `import.meta.env.DEV`.
 */

export default function PreviewSeed() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    requestFixtures();
    seedFixtures(qc);
    setSeeded(true);
  }, [qc]);

  const screens: Array<[string, string]> = [
    ["Trip", `/trips/${fx.TRIP_ID}`],
    ["Dates", `/trips/${fx.TRIP_ID}/dates`],
    ["Suggestions", `/trips/${fx.TRIP_ID}/suggestions`],
    ["Stays", `/trips/${fx.TRIP_ID}/accommodations`],
    ["Budget", `/trips/${fx.TRIP_ID}/budget`],
    ["Members", `/trips/${fx.TRIP_ID}/members`],
    ["Settings", `/trips/${fx.TRIP_ID}/settings`],
    ["Preferences", `/trips/${fx.TRIP_ID}/preferences`],
    ["Referee", `/trips/${fx.TRIP_ID}/referee`],
    ["Home", "/"],
    ["Alerts", "/notifications"],
    ["Profile", "/profile"],
    ["Design system", "/preview"],
  ];

  return (
    <div className="min-h-dvh bg-background px-5 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            Seeded
          </h1>
          <p className="text-sm text-muted-foreground">
            One trip is in the cache. Every link below is the real screen,
            rendering fixture data. Mutations will fail — this is for judging
            how it looks, not what it does.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {screens.map(([label, href]) => (
            <Link key={href} href={href} asChild>
              <a className="pressable-lg flex min-h-12 items-center justify-between rounded-xl border border-border/70 bg-card px-3.5 text-sm font-medium shadow-e1">
                {label}
                <ArrowRight className="size-4 text-muted-foreground" />
              </a>
            </Link>
          ))}
        </div>

        <Button
          className="w-full"
          disabled={!seeded}
          onClick={() => navigate(`/trips/${fx.TRIP_ID}`)}
        >
          Open the trip
        </Button>
      </div>
    </div>
  );
}
