import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy policy · Song Galaxy",
  description: "What Song Galaxy stores, who it's shared with, and how to delete it.",
};

/** Where deletion and privacy requests go. Also the contact on Google's OAuth consent screen. */
const CONTACT_EMAIL = "anish.swaminathan101@gmail.com";
const UPDATED = "September 27, 2026";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What we store",
    body: (
      <ul>
        <li>
          <strong>Your account:</strong> your email address, the name you show others, and your password (stored only as a
          secure hash by our sign-in provider). If you continue with Google, Google shares your name, email address and
          profile picture with us; we use the name and email.
        </li>
        <li>
          <strong>Your songs:</strong> the songs you pick, the feelings you tag them with, where you place them on the mood
          circle, and anything you write about them. You can edit or remove any song on your profile.
        </li>
        <li>
          <strong>What we work out from your songs:</strong> a private listening portrait (only you can see it), the
          constellation you belong to in the galaxy, and connection cards describing what you share with other people.
        </li>
        <li>
          <strong>Your profile icon or photo</strong>, if you set one.
        </li>
        <li>
          <strong>Your messages and song swaps</strong> with other people. Only you and the person you&apos;re talking to
          can read them.
        </li>
      </ul>
    ),
  },
  {
    title: "What other people see",
    body: (
      <p>
        Other members see your name, your profile icon, your songs with the feelings you gave them, and connection cards between you and them. They never see your email address, your listening portrait, or
        conversations you&apos;re not part of.
      </p>
    ),
  },
  {
    title: "Who we share it with",
    body: (
      <>
        <p>We don&apos;t sell your data, show ads, or share it with advertisers. We use these services to run the app:</p>
        <ul>
          <li>
            <strong>Supabase</strong> stores the database and handles sign-in.
          </li>
          <li>
            <strong>Vercel</strong> hosts the app.
          </li>
          <li>
            <strong>Google Gemini</strong> (Google&apos;s AI) reads song titles and artists, and your songs with their
            feelings, to describe what a song is about, write your listening portrait, and judge whether two people really
            connect. We use Gemini&apos;s paid service, under which Google doesn&apos;t use this data to train its models.
          </li>
          <li>
            <strong>MusicBrainz, Deezer, Apple (iTunes) and the Cover Art Archive</strong> receive song titles and artists
            when you search, so we can identify songs and show album art. When you play a preview, your browser loads the
            clip directly from Deezer or Apple.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "Cookies and browser storage",
    body: (
      <p>
        We use a cookie to keep you signed in, and your browser&apos;s storage to remember things like the songs you&apos;re in
        the middle of choosing. There are no tracking or advertising cookies.
      </p>
    ),
  },
  {
    title: "Deleting your data",
    body: (
      <p>
        You can remove any song from your profile at any time. To delete your whole account, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address you signed up with. We&apos;ll delete your
        account, songs, portrait, connection cards and messages within 30 days.
      </p>
    ),
  },
  {
    title: "Children",
    body: <p>Song Galaxy isn&apos;t meant for anyone under 13, and we don&apos;t knowingly collect their data.</p>,
  },
  {
    title: "Changes",
    body: (
      <p>
        If this policy changes, we&apos;ll update this page and the date below. Questions? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

const slug = (title: string) => title.toLowerCase().replace(/[^a-z]+/g, "-");

export default function PrivacyPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-6 lg:px-10 lg:pt-12">
        <Link href="/" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Song Galaxy
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight lg:text-4xl">Privacy policy</h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
          Song Galaxy connects people through what their favorite songs mean to them. This page explains, in plain language,
          what we store, who can see it, and how to delete it.
        </p>
        <div className="mt-10 flex flex-col gap-9">
          {SECTIONS.map((s) => (
            <section key={s.title} aria-labelledby={slug(s.title)}>
              <h2 id={slug(s.title)} className="text-lg font-semibold tracking-tight">
                {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-pretty leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2.5 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-white/10 pt-6 text-sm text-muted-foreground">Last updated {UPDATED}.</p>
      </div>
    </main>
  );
}
