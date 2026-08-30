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
 * The one thing on these pages that is genuinely the code's: when the text last
 * changed. It moves when somebody edits the wording, so it belongs beside the
 * wording rather than in configuration where it would drift.
 */
export const LEGAL_UPDATED = "28 August 2026";

/**
 * Who operates this deployment — served by `system.support` from `LEGAL_*`
 * configuration, not baked in.
 *
 * Configuration because the answer differs per deployment and because filling
 * it in should not need a rebuild: a placeholder that ships to production is
 * the failure mode, and one that can only be fixed by a code change ships for
 * longer. Unset renders as a visible bracket rather than an empty gap, because
 * a policy that silently omits the operator's name reads as finished.
 *
 * `docs/runbooks/launch.md` lists these as submission blockers.
 */
export function useLegal() {
  const { data } = trpc.system.support.useQuery();
  return {
    email: data?.email ?? null,
    entity: data?.entity ?? "[LEGAL ENTITY NAME]",
    jurisdiction: data?.jurisdiction ?? "[JURISDICTION]",
    address: data?.address ?? "[POSTAL ADDRESS]",
  };
}

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const legal = useLegal();

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
          Last updated {LEGAL_UPDATED}
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
            {legal.email ? (
              <>
                Questions about this page, or anything else:{" "}
                <a href={`mailto:${legal.email}`}>{legal.email}</a>.
              </>
            ) : (
              <>
                A contact address has not been configured for this deployment
                yet.
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {legal.entity} · {legal.address}
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
