/**
 * The privacy policy.
 *
 * Written from what the code actually does, not from a template: every claim
 * below is traceable to a table in `drizzle/schema.ts` or a call in `server/`.
 * If you change what is collected or who it is sent to, this page is part of
 * that change — a policy that describes an older version of the app is worse
 * than none, because it is a statement rather than an omission.
 *
 * Known gaps, stated rather than hidden: `activity_events` has no retention
 * policy (AGENTS.md records this as a known, accepted gap), and the section on
 * children's data is the operator's to review — the app stores ages for
 * attendees who are not users and cannot consent for themselves.
 */
import { LegalPage, LEGAL } from "@/components/LegalPage";

export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <p>
        Back To Travelling helps a group plan a trip together. This page says
        what {LEGAL.entity} stores while you do that, who else sees it, and how
        to get rid of it.
      </p>

      <h2>What we store</h2>

      <p>
        <strong>Your account.</strong> Your name, your email address, and either
        a hashed password or a passkey credential — never a password itself. If
        you sign in with a magic link we store a single-use token against your
        address until it is used or expires.
      </p>

      <p>
        <strong>What you plan.</strong> Trip names and descriptions, proposed
        dates, destinations, accommodation links and notes, budgets, your votes,
        your comments, and the preferences you record for a trip.
      </p>

      <p>
        <strong>People you add.</strong> When you add someone who is coming but
        does not use the app — a partner, a child, a pet — we store the name you
        give, whether they are an adult, a child or a pet, and an age if you
        enter one. When you save someone to your contact book we store the name
        and email address you enter for them.
      </p>

      <p>
        <strong>Technical records.</strong> Server logs of requests, each with
        an identifier so a fault can be traced. Logs are structured and
        secret-redacted. A record of actions on a trip — who proposed what, who
        finalised it — is kept so the trip has a history.
      </p>

      <h2>People who are not you</h2>

      <p>
        Two of the things above are other people's information, entered by you:
        the contacts in your address book, and the attendees you add to a trip.
        Only add someone's details if you would be comfortable telling them you
        had. If you enter a child's age, you are recording information about a
        child who cannot agree to it themselves — please only do so where you
        are the person entitled to make that decision.
      </p>

      <h2>Who else sees it</h2>

      <p>
        <strong>Other people on your trip.</strong> A trip is shared by
        definition. Members see proposals, votes, comments and who made them.
        Someone invited as a watcher sees the trip but not who voted how, and
        not contact details.
      </p>

      <p>
        <strong>Google (Gemini).</strong> The AI features — the referee, reading
        dates out of a sentence, importing an accommodation from a link,
        matching a stay against what people asked for — send the relevant trip
        content to Google's Gemini API. That includes member names, the
        preferences they recorded and their budget limits, because the referee's
        job is to say whose requirements conflict. It does not include email
        addresses or credentials. An operator can turn all of this off with the{" "}
        <code>AI_ENABLED</code> setting, in which case nothing is sent.
      </p>

      <p>
        <strong>An email provider.</strong> Magic links and trip invitations are
        sent through Resend or an SMTP server, which necessarily receives the
        recipient's address.
      </p>

      <p>
        <strong>A page-fetching service, sometimes.</strong> When you import an
        accommodation from a link and the site refuses us directly, the URL —
        and only the URL — may be passed to a third-party fetching service. This
        is optional and off unless an operator configures it.
      </p>

      <p>
        <strong>Hosting and storage.</strong> The app runs on Vercel and stores
        data in a PostgreSQL database. They hold the data in order to run the
        service; they are not given it for their own purposes.
      </p>

      <p>
        We do not sell anything to anyone, and there is no advertising or
        third-party analytics in the app.
      </p>

      <h2>How long we keep it</h2>

      <p>
        Trip content stays until the trip is deleted or you delete your account.
        Magic-link tokens expire after fifteen minutes. Server logs are kept for
        as long as the hosting platform retains them. The record of actions on a
        trip currently has no expiry and is deleted with the trip — we would
        rather tell you that than imply a schedule we do not have.
      </p>

      <h2>Deleting your account</h2>

      <p>
        Profile → <strong>Delete my account</strong>, from inside the app. It
        cannot be undone. Here is exactly what happens, because "deleted" is
        doing more work in most policies than it should:
      </p>

      <ul>
        <li>
          Your name, email address, password and passkeys are erased
          immediately, and nothing is left that can sign in as you.
        </li>
        <li>
          Your address book, your votes and your notifications are deleted.
        </li>
        <li>
          Trips you organise are handed to another member so the rest of the
          group keeps their planning. A trip with nobody else in it is deleted
          entirely.
        </li>
        <li>
          Comments and proposals you made stay with the trip, attributed to "a
          former member". They are part of other people's conversation, and a
          record with holes in it is not a record. Nothing in them identifies
          you.
        </li>
      </ul>

      <h2>Your rights</h2>

      <p>
        Depending on where you live — and this service is operated from{" "}
        {LEGAL.jurisdiction} — you may have the right to a copy of your data, to
        correct it, to have it erased, or to object to how it is used. Deletion
        is self-service, as above. For anything else, write to us and we will
        answer.
      </p>

      <h2>Changes</h2>

      <p>
        If what we collect or who we send it to changes, this page changes with
        it and the date at the top moves.
      </p>
    </LegalPage>
  );
}
