import { z } from "zod";
import { config } from "./env.js";
import { runHealthChecks } from "./healthChecks.js";
import { runServiceTest, SERVICES } from "./healthTests.js";
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
   * `adminProcedure` — which reads `users.role`, the operator of this
   * deployment, and has nothing to do with the `admin` role a member holds on
   * a trip. Two independent reasons for the gate, either enough. It reports which secrets are set, which model is
   * in use, how far behind the migrations are and why mail is failing — a map
   * of where to push. And it makes an outbound request per check, so an
   * unauthenticated version would let anyone spend this deployment's Resend
   * and Google rate limit by holding down F5.
   *
   * The public `/api/health` stays where it is and keeps answering the cheap
   * question for uptime probes. This one is the honest, expensive answer.
   */
  diagnostics: adminProcedure.query(() => runHealthChecks()),

  /**
   * Actually exercise one service, rather than inspecting it.
   *
   * `diagnostics` asks each dependency whether it is there. This does the
   * work: sends the mail, writes the row, calls the model, fetches the page.
   * A separate procedure because the costs are different in kind — a check is
   * a look, a test leaves something behind — and because nothing should run
   * these except a person pressing a button.
   *
   * The test email goes to `ctx.user.email` and there is no parameter that
   * could change that. An admin-only endpoint that emails an arbitrary address
   * is a relay with a login on it.
   */
  testService: adminProcedure
    // `.strict()` rather than the default, which drops unknown keys quietly.
    // The key this endpoint must never grow is a destination address, and a
    // schema that ignores one is a schema that would ignore it after a
    // refactor moved the recipient into the input by mistake. Refuse loudly.
    .input(z.object({ service: z.enum(SERVICES) }).strict())
    .mutation(({ ctx, input }) =>
      runServiceTest(input.service, {
        id: ctx.user.id,
        name: ctx.user.name || ctx.user.email || "an admin",
        email: ctx.user.email,
      })
    ),

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
