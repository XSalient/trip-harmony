/**
 * How to delete your account, at a URL that needs no account to read.
 *
 * Apple's requirement is in-app deletion, and that exists (Profile → Delete my
 * account). This page is Google Play's: the Data safety form asks for a web URL
 * where someone can request account and data deletion, and it has to work for
 * a person who has uninstalled the app or can no longer sign in — the exact
 * case in-app deletion cannot serve. Submitting the form without one is a
 * rejection; pointing it at `/privacy` is a weaker answer, because that page
 * describes deletion among twenty other things rather than offering it.
 *
 * Signed out, like the other two: no `useAuth`, no `AppShell`. `legal.test.ts`
 * enforces it.
 */
import { Link } from "wouter";

import { LegalPage, useLegal } from "@/components/LegalPage";

export default function DeleteAccount() {
  const legal = useLegal();
  return (
    <LegalPage title="Deleting your account">
      <p>
        You can delete your {legal.entity} account and the data attached to it
        at any time. There are two routes: one you can do yourself in seconds,
        and one for when you cannot get in.
      </p>

      <h2>In the app — immediate</h2>

      <p>
        Open <strong>Profile</strong>, choose <strong>Delete my account</strong>
        , and type <code>DELETE</code> to confirm. If your account has a
        password you will be asked for it, since this is the one action nothing
        can undo. The deletion happens as you watch; there is no queue and no
        grace period.
      </p>

      <h2>By email — if you cannot sign in</h2>

      <p>
        {legal.email ? (
          <>
            Write to <a href={`mailto:${legal.email}`}>{legal.email}</a> from
            the address on the account, with the word "delete" in the subject.
          </>
        ) : (
          <>
            Write to the contact address at the bottom of this page from the
            address on the account, with the word "delete" in the subject.
          </>
        )}{" "}
        We reply from the same address to confirm it is you — an email asking us
        to delete somebody else's account is not something we will act on — and
        complete the deletion within 30 days of confirming. Nothing else is
        required of you, and there is no form to fill in.
      </p>

      <h2>What is deleted</h2>

      <ul>
        <li>
          Your name, email address, password and passkeys, erased immediately.
          Nothing is left that can sign in as you.
        </li>
        <li>
          Any unused sign-in link sent to your address, so none of them can be
          used afterwards.
        </li>
        <li>
          Your address book and contact groups, your recorded preferences, your
          notifications, and every vote you cast.
        </li>
        <li>
          Trips nobody else has joined, in full — dates, destinations,
          accommodation, budget, comments and all.
        </li>
      </ul>

      <h2>What is not, and why</h2>

      <ul>
        <li>
          <strong>Trips you organise that other people are on</strong> pass to
          the longest-standing member, who becomes the organiser. Leaving must
          not delete four other people's planning.
        </li>
        <li>
          <strong>Comments and proposals you made on those trips</strong> stay
          with the trip, attributed to "a former member". They are part of other
          people's conversation, and nothing in them identifies you once the
          account is gone.
        </li>
        <li>
          <strong>Server logs</strong>, for as long as the hosting platform
          retains them. They record that a request happened, not who you are.
        </li>
      </ul>

      <p>
        The full picture of what is stored while the account exists is on the{" "}
        <Link href="/privacy">privacy page</Link>. If you want a copy of your
        data rather than the end of it, write to the same address.
      </p>
    </LegalPage>
  );
}
