/**
 * The frame the privacy policy and terms share.
 *
 * **These pages must render signed out.** Apple requires a privacy policy at a
 * URL a reviewer can open, and that reviewer has no account — so unlike every
 * other screen here, this one never calls `useAuth` and never redirects. It
 * also avoids `AppShell`, whose header assumes somebody is signed in.
 *
 * The published contact address comes from `system.support`, which is a public
 * procedure for the same reason.
 */
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

/**
 * Everything here that is the operator's to decide rather than the code's.
 *
 * Kept together and obvious, because a legal page carrying a placeholder into
 * production is worse than one that is late. `docs/runbooks/launch.md` lists
 * these as blockers for a store submission.
 */
export const LEGAL = {
  /** The name of the company or person operating the service. */
  entity: "[LEGAL ENTITY NAME]",
  /** Where disputes are heard, and whose data-protection law applies. */
  jurisdiction: "[JURISDICTION, e.g. England and Wales]",
  /** Postal address. Required by some stores and by GDPR Article 13. */
  address: "[POSTAL ADDRESS]",
  /** Last substantive revision, shown to the reader. */
  updated: "28 August 2026",
} as const;

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { data: support } = trpc.system.support.useQuery();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-semibold">{title}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <p className="text-xs text-muted-foreground mb-6">
          Last updated {LEGAL.updated}
        </p>

        {/* Styled with child selectors rather than `prose`: the typography
            plugin is a devDependency but is not loaded — `index.css` imports
            only tailwindcss and tw-animate-css — so every `prose-*` class here
            would silently do nothing. Two text pages are not a reason to add a
            plugin to the global stylesheet. */}
        <div
          className="
            space-y-3
            [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-8 [&_h2]:mb-2
            [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-foreground/80
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5
            [&_li]:text-sm [&_li]:leading-relaxed [&_li]:text-foreground/80
            [&_strong]:text-foreground [&_strong]:font-medium
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
            [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
          "
        >
          {children}

          <h2>Contact</h2>
          <p>
            {support?.email ? (
              <>
                Questions about this page, or anything else:{" "}
                <a href={`mailto:${support.email}`}>{support.email}</a>.
              </>
            ) : (
              <>
                A contact address has not been configured for this deployment
                yet.
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {LEGAL.entity} · {LEGAL.address}
          </p>
        </div>

        <nav className="mt-10 pt-6 border-t flex gap-4 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/" className="hover:text-foreground">
            Back to the app
          </Link>
        </nav>
      </main>
    </div>
  );
}
