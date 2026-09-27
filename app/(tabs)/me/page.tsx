"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, ListMusic, Orbit, Sparkles, User } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { AccountRow } from "@/components/auth/account-row";
import { useAccount } from "@/components/auth/use-account";
import { AvatarCustomizerSheet } from "@/components/avatar-customizer-sheet";
import { ClusterStar } from "@/components/cluster-star";
import { EmptyState } from "@/components/empty-state";
import { SourceSettings } from "@/components/listening/source-settings";
import { WeeklySummary } from "@/components/listening/weekly-summary";
import { MotivationCard } from "@/components/motivation-card";
import { ReachQuestion } from "@/components/reach-question";
import { ReasonSpectrum } from "@/components/reason-spectrum";
import { ScreenHeader } from "@/components/screen-header";
import { SongFeelingSheet } from "@/components/song-feeling-sheet";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { getConversations, getMySongs, getStoredAnalysis, REAL_DATA, type MySong } from "@/lib/api";
import { getCluster } from "@/lib/clusters";
import { setSession, useHydrated, useSession } from "@/lib/session";
import type { InferredMotivation, Song } from "@/lib/types";
import { cn } from "@/lib/utils";

const SONGS_SHOWN = 9;
const sectionLabel = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

export default function MePage() {
  const hydrated = useHydrated();
  const session = useSession();
  const account = useAccount();
  const { data: conversations } = useSWR(["conversations", session.version], getConversations);
  // Your saved songs with how each one feels (real mode: your picks; mock: the session). One entry per song.
  const mine = useSWR(["my-songs", session.version], getMySongs);
  const [editing, setEditing] = useState<MySong | null>(null);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  // Real mode, signed in somewhere new: this browser's session has no reading yet, but the stored portrait does.
  const needsPortrait = REAL_DATA && hydrated && !session.analysis;
  const stored = useSWR(needsPortrait ? ["portrait", session.version] : null, getStoredAnalysis);
  useEffect(() => {
    if (stored.data && !session.analysis) setSession({ analysis: stored.data, motivations: stored.data.motivations });
  }, [stored.data, session.analysis]);
  if (!hydrated) return <main className="flex-1" />;

  const songs = mine.data?.map((m) => m.song) ?? [];
  const kept = session.motivations.filter((m) => m.feedback !== "rejected");
  const primary = [...kept].sort((a, b) => b.confidence - a.confidence)[0];
  const tone = primary ? getCluster(primary.cluster).color : undefined;
  const traded = conversations?.reduce((n, c) => n + (c.threadSongs ?? 0), 0);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Profile" className="border-b border-white/[0.07] pb-2" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {!session.analysis ? (
          <EmptyState
            title="We don't know you yet"
            body="Bring a few songs to see why you listen, and who listens the same way."
            action={
              <Link href="/onboarding/pick" className={cn(buttonVariants(), "h-11 rounded-none px-6")}>
                Bring your music
              </Link>
            }
          />
        ) : (
          <>
            {/* Who you are here, at a glance. */}
            <section className="px-5 pb-5 pt-6" style={{ "--tone": tone } as CSSProperties} aria-label="Your profile">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setCustomizerOpen(true)}
                  className="relative group rounded-full text-left outline-none transition-transform hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary"
                  title="Customize avatar"
                  aria-label="Customize avatar"
                >
                  <UserAvatar name={account.name ?? "You"} cluster={primary?.cluster ?? ""} isMe size={64} ring />
                  <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-[#f3cb8b] text-[#1c160c] shadow-md transition-transform group-hover:scale-110">
                    <Sparkles className="size-3.5" />
                  </span>
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">{account.name ?? "You"}</h1>
                  {primary ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground/85">
                      <ClusterStar color="var(--tone)" size={10} />
                      <span className="truncate">{getCluster(primary.cluster).label}</span>
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="mt-5 border-l-2 border-[var(--tone,var(--primary))] pl-3 text-balance font-serif text-xl italic leading-snug">{session.analysis.headline}</p>

              <dl className="mt-5 grid grid-cols-3 border border-white/10">
                <Stat label="Songs" value={songs.length} />
                <Stat label="Reasons" value={kept.length} />
                <Stat label="Traded" value={traded ?? "–"} href="/messages" />
              </dl>
            </section>

            {kept.length ? (
              <section className="mx-5 border border-white/10 bg-card/50 p-4" aria-labelledby="mix-heading">
                <h2 id="mix-heading" className={cn(sectionLabel, "mb-3")}>
                  Your listening mix
                </h2>
                <ReasonSpectrum motivations={session.motivations} />
              </section>
            ) : null}

            <Reasons motivations={session.motivations} songs={songs} />

            <ReachQuestion className="mx-5 mt-8" />

            {mine.data?.length ? <Songs items={mine.data} onSelect={setEditing} /> : null}
          </>
        )}

        <WeeklySummary />
        <SourceSettings />

        <section className="mt-8" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className={cn(sectionLabel, "px-5")}>
            Settings
          </h2>
          <ul className="mt-2 border-y border-white/[0.07]">
            <li className="border-b border-white/[0.07]">
              <button
                type="button"
                onClick={() => setCustomizerOpen(true)}
                className="flex min-h-14 w-full items-center gap-3 px-5 text-sm transition-colors hover:bg-white/[0.03] text-left"
              >
                <span className="text-muted-foreground"><User className="size-4" aria-hidden /></span>
                <span className="flex-1">Customize avatar</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
            <SettingsLink href="/onboarding/pick" icon={<ListMusic className="size-4" aria-hidden />}>
              Add or change songs
            </SettingsLink>
            {session.analysis ? (
              <SettingsLink href="/onboarding/reveal?replay=1" icon={<Orbit className="size-4" aria-hidden />}>
                Replay your reveal
              </SettingsLink>
            ) : null}
            {account.configured ? (
              <li>
                <AccountRow className="flex min-h-14 items-center gap-3 px-5" />
              </li>
            ) : null}
          </ul>
        </section>
      </div>
      <SongFeelingSheet
        item={editing}
        onClose={() => setEditing(null)}
        onChanged={() => {
          void mine.mutate();
          setSession({}, true); // other screens keyed on the session version (galaxy, connections) refetch too
        }}
      />
      <AvatarCustomizerSheet
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        userName={account.name ?? "You"}
        userCluster={primary?.cluster ?? ""}
      />
    </main>
  );
}

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
    </>
  );
  const cell = "flex flex-col-reverse items-center justify-center gap-0.5 border-r border-white/10 py-3 last:border-r-0";
  return href ? (
    <Link href={href} className={cn(cell, "transition-colors hover:bg-white/[0.04]")}>
      {body}
    </Link>
  ) : (
    <div className={cell}>{body}</div>
  );
}

function Reasons({ motivations, songs }: { motivations: InferredMotivation[]; songs: Song[] }) {
  const toReview = motivations.filter((m) => m.feedback === "unreviewed");
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="mt-8" aria-labelledby="reasons-heading">
      <div className="flex items-baseline justify-between px-5">
        <h2 id="reasons-heading" className={sectionLabel}>
          Your reasons
        </h2>
        {toReview.length ? <span className="text-xs text-primary">{toReview.length} to review</span> : null}
      </div>
      <ul className="mt-2 border-y border-white/[0.07]">
        {motivations.map((m) => {
          const isOpen = open === m.id;
          const c = getCluster(m.cluster);
          return (
            <li key={m.id} className="border-b border-white/[0.07] last:border-b-0" style={{ "--tone": c.color } as CSSProperties}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : m.id)}
                aria-expanded={isOpen}
                className={cn("flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]", isOpen && "bg-white/[0.02]")}
              >
                <span className="size-2 shrink-0 rounded-full bg-[var(--tone)]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", m.feedback === "rejected" && "text-muted-foreground line-through decoration-white/30")}>{m.label}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{Math.round(m.confidence * 100)}% sure</span>
                    <Status m={m} />
                  </span>
                </span>
                {m.feedback === "confirmed" ? (
                  m.isPublic ? <Eye className="size-4 shrink-0 text-muted-foreground" aria-label="Public on Connection Cards" /> : <EyeOff className="size-4 shrink-0 text-muted-foreground" aria-label="Private" />
                ) : null}
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
              </button>
              {isOpen ? <MotivationCard motivation={m} songs={songs} inline /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Status({ m }: { m: InferredMotivation }) {
  if (m.feedback === "confirmed")
    return (
      <span className="inline-flex items-center gap-0.5 text-[var(--tone)]">
        <Check className="size-3" aria-hidden />
        That&apos;s you
      </span>
    );
  if (m.feedback === "rejected") return <span>Not quite you</span>;
  return <span className="font-medium text-primary">Review</span>;
}

function Songs({ items, onSelect }: { items: MySong[]; onSelect: (item: MySong) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SONGS_SHOWN);
  return (
    <section className="mt-8 px-5" aria-labelledby="songs-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="songs-heading" className={sectionLabel}>
          {items.length === 1 ? "1 song" : `${items.length} songs`}
        </h2>
        <Link href="/onboarding/pick" className="text-xs text-muted-foreground hover:text-foreground">
          Add songs
        </Link>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-4">
        {shown.map((item) => (
          <li key={item.pickId} className="min-w-0">
            <button type="button" onClick={() => onSelect(item)} className="group block w-full text-left" aria-label={`Edit ${item.song.title}`}>
              <div className="relative aspect-square w-full">
                <AlbumArt song={item.song} size={200} className="!absolute inset-0 !size-full rounded-md transition-opacity group-hover:opacity-80" />
              </div>
              <p className="mt-1.5 truncate text-xs font-medium">{item.song.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{item.feeling.tags.length ? item.feeling.tags.join(" · ") : item.song.artist}</p>
            </button>
          </li>
        ))}
      </ul>
      {items.length > SONGS_SHOWN ? (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-4 min-h-10 w-full border border-white/10 text-sm text-muted-foreground hover:bg-white/[0.03] hover:text-foreground">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null}
    </section>
  );
}

function SettingsLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="border-b border-white/[0.07]">
      <Link href={href} className="flex min-h-14 items-center gap-3 px-5 text-sm transition-colors hover:bg-white/[0.03]">
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1">{children}</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}
