/**
 * Terms of use.
 *
 * Apple's guideline 1.2 requires an app with user-generated content to publish
 * the standards it holds people to, and to be able to point at them when
 * removing something. The acceptable-use section below is that, and it matches
 * what the code enforces — the filter in `shared/moderation.ts`, the report
 * queue, and blocking.
 *
 * Deliberately short. A page nobody reads protects nobody; the parts that
 * actually bind somebody's behaviour are worth more than length.
 */
import { LegalPage, useLegal } from "@/components/LegalPage";

export default function Terms() {
  const legal = useLegal();
  return (
    <LegalPage title="Terms">
      <p>
        These terms cover your use of Back To Travelling, operated by{" "}
        {legal.entity}. Using the app means accepting them.
      </p>

      <h2>Your account</h2>

      <p>
        You need to be 13 or older to have an account. Keep your sign-in details
        to yourself; you are responsible for what happens under your account.
        Give a real email address — it is how you get back in, and how trip
        invitations reach you.
      </p>

      <h2>What you may not post</h2>

      <p>
        A trip is a small group of people who mostly know each other, and the
        bar is simply that nobody should dread opening it. Do not post:
      </p>

      <ul>
        <li>Abuse, harassment, or threats against anyone.</li>
        <li>
          Slurs or attacks on people for who they are — race, religion, sex,
          gender, sexuality, disability, nationality.
        </li>
        <li>Sexual content, or anything sexualising a child.</li>
        <li>Content encouraging violence or self-harm.</li>
        <li>
          Other people's private information, posted without their agreement.
        </li>
        <li>
          Spam, advertising, or anything you are posting to sell something.
        </li>
        <li>Anything unlawful where you are, or where we operate.</li>
      </ul>

      <p>
        Some wording is refused automatically when you submit it. That filter is
        crude by design and catches only the unambiguous cases — passing it is
        not approval, and these terms still apply to everything else.
      </p>

      <h2>Reporting and blocking</h2>

      <p>
        Every comment has a menu with <strong>Report</strong> and{" "}
        <strong>Block</strong> on it. Reports reach an administrator, who can
        remove content and suspend accounts. Blocking someone hides their
        comments from you and stops them inviting you or adding you to their
        contacts; because a trip is shared, they stay on any trip you both
        belong to and their votes still count. You can undo a block from your
        profile.
      </p>

      <p>
        We aim to look at reports within a few days. We may remove content or
        suspend an account for breaking the rules above, and we may do so
        without warning where the content is serious.
      </p>

      <h2>What the app is not</h2>

      <p>
        Back To Travelling helps a group decide. It does not book anything, take
        payment for travel, or hold money. Any arrangement you make — a booking,
        a deposit, splitting a bill — is between you and the people or companies
        involved. Prices, availability and links shown in the app come from what
        members enter or from pages we read on their behalf, and may be wrong or
        out of date.
      </p>

      <p>
        The AI referee is a suggestion, not advice. It reads what the group has
        recorded and proposes compromises; it can be wrong, and it does not know
        anything you have not told it.
      </p>

      <h2>Availability</h2>

      <p>
        We will try to keep the service running and your data intact, but it is
        provided as-is, without warranty. We are not liable for indirect losses,
        or for a trip that went badly. Nothing here limits liability that cannot
        be limited by law.
      </p>

      <h2>Ending things</h2>

      <p>
        You can delete your account at any time from your profile; what that
        does is set out in the privacy policy. We can suspend or close an
        account that breaks these terms.
      </p>

      <h2>Governing law</h2>

      <p>
        These terms are governed by the law of {legal.jurisdiction}, and its
        courts have jurisdiction over any dispute.
      </p>

      <h2>Changes</h2>

      <p>
        We may update these terms. If a change matters, the date at the top
        moves and we will say so in the app.
      </p>
    </LegalPage>
  );
}
