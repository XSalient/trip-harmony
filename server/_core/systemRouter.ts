import { z } from "zod";
import { config } from "./env.js";
import { runHealthChecks } from "./healthChecks.js";
import { notifyOwner } from "./notification.js";
import { adminProcedure, publicProcedure, router } from "./trpc.js";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  /**
   * The published contact address, or null where this deployment has not set
   * one.
   *
   * Public because the pages that show it are: Apple requires a privacy policy
   * reachable without an account, and a reviewer fetching that URL is not
   * signed in. Null rather than an empty string so the page can say support is
   * unavailable instead of rendering a `mailto:` that goes nowhere.
   */
  support: publicProcedure.query(() => ({
    email: config.supportEmail || null,
    /**
     * Who operates this deployment, for the privacy policy and terms.
     *
     * Null where unset, so the page can show a visible placeholder rather than
     * an empty gap: a policy that silently omits the operator's name reads as
     * finished, and one that says `[LEGAL ENTITY NAME]` does not.
     */
    entity: config.legal.entity || null,
    jurisdiction: config.legal.jurisdiction || null,
    address: config.legal.address || null,
  })),

  /**
   * The live state of every dependency, for the admin diagnostics screen.
   *
   * `adminProcedure`, not `publicProcedure`, for two independent reasons and
   * either would be enough. It reports which secrets are set, which model is
   * in use, how far behind the migrations are and why mail is failing — a map
   * of where to push. And it makes an outbound request per check, so an
   * unauthenticated version would let anyone spend this deployment's Resend
   * and Google rate limit by holding down F5.
   *
   * The public `/api/health` stays where it is and keeps answering the cheap
   * question for uptime probes. This one is the honest, expensive answer.
   */
  diagnostics: adminProcedure.query(() => runHealthChecks()),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
