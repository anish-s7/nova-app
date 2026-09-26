"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Lock, RotateCcw, Sparkles } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { GalaxyCanvas } from "@/components/galaxy/galaxy-canvas";
import type { GalaxyApi, GalaxyBridge } from "@/components/galaxy/types";
import { WarpOverlay, type WarpHandle } from "@/components/pitch/warp-overlay";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { getCluster } from "@/lib/clusters";
import type { GalaxyNode, Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CONNECTED, DESTINATION, DESTINATIONS, GATEWAY, GATEWAY_EVIDENCE, HANDSHAKE, HOME_EDGES, ME, MEMBERS, NEARBY } from "./script";

/**
 * The pitch in one visual sentence: a faint stranger introduces you to an unfamiliar musical
 * community, trades a song with you, then becomes a bright star in your home galaxy.
 * Scripted end to end; it draws with the same galaxy components as the app.
 */

type Beat = "ignite" | "home" | "universe" | "preview" | "travel" | "gateway" | "compose" | "reveal" | "returning" | "returned";

/** The four states the pitch moves through. Beats are the overlays and camera moves inside them. */
const STATE_OF: Record<Beat, "home" | "destination" | "handshake" | "return"> = {
  ignite: "home",
  home: "home",
  universe: "home",
  preview: "destination",
  travel: "destination",
  gateway: "handshake",
  compose: "handshake",
  reveal: "handshake",
  returning: "return",
  returned: "return",
};
const STATES = ["home", "destination", "handshake", "return"] as const;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** An external link only: the app never hosts or fetches audio, and no Spotify data flows anywhere. */
const listenUrl = (s: Song) => `https://open.spotify.com/search/${encodeURIComponent(`${s.title} ${s.artist}`)}`;

export default function PitchPage() {
  const [run, setRun] = useState(0);
  return <Pitch key={run} onReplay={() => setRun((r) => r + 1)} />;
}

function Pitch({ onReplay }: { onReplay: () => void }) {
  const apiRef = useRef<GalaxyApi | null>(null);
  const warpRef = useRef<WarpHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [beat, setBeat] = useState<Beat>("ignite");
  const [caption, setCaption] = useState("");
  const [membersIn, setMembersIn] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [tapped, setTapped] = useState<string | null>(null);
  const [cardLoaded, setCardLoaded] = useState(false);
  const [choice, setChoice] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [theirReaction, setTheirReaction] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  // Async choreography checks this so nothing lands after the pitch is replayed or left.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Jordan's journey: a faint stranger in their community, then arriving, then connected at home.
  const gateway: GalaxyNode = useMemo(() => {
    if (beat === "returned") return { ...GATEWAY, relationship: "connected", orbit: 0, destinationId: undefined };
    if (beat === "returning") return { ...GATEWAY, relationship: "arriving", orbit: 0 };
    return GATEWAY;
  }, [beat]);

  const nodes = useMemo(() => [ME, ...CONNECTED, ...NEARBY, ...(membersIn ? [...MEMBERS, gateway] : [])], [membersIn, gateway]);
  const threads = useMemo(
    () => [...CONNECTED.map((c) => ({ userId: c.userId, count: c.traded })), ...(beat === "returned" ? [{ userId: GATEWAY.userId, count: 1 }] : [])],
    [beat],
  );
  const bridges: GalaxyBridge[] = useMemo(() => (beat === "returned" ? [{ personId: GATEWAY.userId, destinationId: DESTINATION.id }] : []), [beat]);
  const selectedId = beat === "gateway" || beat === "compose" || beat === "reveal" ? GATEWAY.userId : beat === "home" || beat === "returned" ? tapped : null;

  // Home: ignite you, then light your galaxy.
  useEffect(() => {
    if (!ready) return;
    const api = apiRef.current;
    if (!api) return;
    (async () => {
      setCaption("This is you.");
      await api.igniteMe(1600);
      await wait(700);
      if (!alive.current) return;
      setCaption("");
      await api.returnHome(2200);
      if (!alive.current) return;
      setBeat("home");
    })();
  }, [ready]);

  const explore = async () => {
    setTapped(null);
    setBeat("universe");
    warpRef.current?.play(2800);
    await apiRef.current?.pullBackToOverview(2800);
  };

  const openPreview = useCallback(
    (id: string) => {
      if (beat !== "universe" && beat !== "preview") return;
      setPreviewId(id);
      setBeat("preview");
    },
    [beat],
  );

  const travel = async () => {
    const api = apiRef.current;
    if (!api) return;
    setBeat("travel");
    setCaption(`Traveling to ${DESTINATION.name}`);
    warpRef.current?.play(2800);
    await api.flyToDestination(DESTINATION.id, { duration: 2800 });
    if (!alive.current) return;
    // The community expands into its members as you arrive.
    setMembersIn(true);
    setCaption(`${DESTINATION.name} · ${DESTINATION.listeners} listeners`);
    await wait(1900);
    if (!alive.current) return;
    setCaption("");
    await api.flyTo(GATEWAY.userId, { duration: 1400, distance: 26, lift: 0.2 });
    if (!alive.current) return;
    setBeat("gateway");
    // Deterministic evidence shows at once; the richer card lands a beat later.
    await wait(1400);
    if (alive.current) setCardLoaded(true);
  };

  const lockIn = async () => {
    setBeat("reveal");
    await wait(900);
    if (!alive.current) return;
    setRevealed(true);
    await wait(1600);
    if (alive.current) setTheirReaction(true);
  };

  const bringHome = async () => {
    const api = apiRef.current;
    if (!api) return;
    setBeat("returning");
    setCaption("");
    warpRef.current?.play(2600);
    await api.returnHome(2600);
    if (!alive.current) return;
    setCaption(`${GATEWAY.name} is coming home with you`);
    warpRef.current?.play(3000);
    await api.flyIntoOrbit(GATEWAY.userId, 3000);
    if (!alive.current) return;
    setCaption("");
    setBeat("returned");
  };

  const onSelect = (id: string | null) => {
    if (beat === "home" || beat === "returned") setTapped(id && id !== ME.userId ? id : null);
  };

  const state = STATE_OF[beat];

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <GalaxyCanvas
        nodes={nodes}
        edges={HOME_EDGES}
        arrangement="home"
        destinations={DESTINATIONS}
        bridges={bridges}
        threads={threads}
        selectedId={selectedId}
        onSelect={onSelect}
        onSelectDestination={openPreview}
        apiRef={apiRef}
        initialPhase="dark"
        onReady={() => setReady(true)}
      />
      <WarpOverlay ref={warpRef} />

      <header className="pointer-events-none relative z-10 flex items-center justify-between gap-3 p-4 pt-5">
        <span className="rounded-full border border-white/10 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">Pitch demo · scripted</span>
        <ol className="flex items-center gap-1.5" aria-label="Pitch progress">
          {STATES.map((s) => (
            <li key={s} className={cn("h-1 w-6 rounded-full transition-colors duration-500", STATES.indexOf(s) <= STATES.indexOf(state) ? "bg-primary" : "bg-white/15")}>
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
      </header>

      <p
        aria-live="polite"
        className={cn(
          "pointer-events-none relative z-10 mx-auto mt-2 max-w-[85%] text-balance text-center font-serif text-xl italic transition-opacity duration-700",
          caption ? "opacity-100" : "opacity-0",
        )}
      >
        {caption}
      </p>

      <div className="pointer-events-none relative z-20 mt-auto flex flex-col gap-3 p-4 pb-6">
        {beat === "home" ? <HomePanel tapped={tapped} onExplore={explore} /> : null}
        {beat === "universe" ? <UniversePanel onPick={openPreview} /> : null}
        {beat === "preview" && previewId ? (
          <PreviewPanel id={previewId} onTravel={travel} onBack={() => setBeat("universe")} />
        ) : null}
        {beat === "gateway" ? <GatewayPanel cardLoaded={cardLoaded} onStart={() => setBeat("compose")} /> : null}
        {beat === "compose" ? <ComposePanel choice={choice} onChoose={setChoice} onLock={lockIn} /> : null}
        {beat === "reveal" ? (
          <RevealPanel choice={choice} revealed={revealed} theirReaction={theirReaction} myReaction={myReaction} onReact={setMyReaction} onBringHome={bringHome} />
        ) : null}
        {beat === "returned" ? <ReturnedPanel tapped={tapped} onReplay={onReplay} /> : null}
      </div>
    </main>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("pointer-events-auto border border-white/10 bg-popover/90 p-4 backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2", className)}>
      {children}
    </section>
  );
}

function Cta({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button className="h-11 w-full rounded-full text-[15px]" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

/** A tapped star at home: who they are to you, in orbit terms rather than scores. */
function StarNote({ id }: { id: string }) {
  const c = CONNECTED.find((p) => p.userId === id);
  const n = NEARBY.find((p) => p.userId === id);
  const isGateway = id === GATEWAY.userId;
  const name = c?.name ?? n?.name ?? (isGateway ? GATEWAY.name : null);
  if (!name) return null;
  const cluster = c?.cluster ?? n?.cluster ?? GATEWAY.cluster;
  const detail = c
    ? `${(c.orbit ?? 0) > 0.66 ? "Inner" : (c.orbit ?? 0) > 0.33 ? "Middle" : "Outer"} orbit · ${c.traded} ${c.traded === 1 ? "song" : "songs"} traded, starting with “${c.song.title}”`
    : n
      ? `${n.nearness} · a suggestion, not a connection yet`
      : `Outer orbit · found in ${DESTINATION.name}, one Song Handshake so far`;
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.07] pb-3">
      <UserAvatar name={name} cluster={cluster} size={36} />
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{name}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function HomePanel({ tapped, onExplore }: { tapped: string | null; onExplore: () => void }) {
  return (
    <Panel className="flex flex-col gap-3">
      {tapped ? <StarNote id={tapped} /> : null}
      <div>
        <p className="font-serif text-lg italic leading-snug">Your home galaxy is made of people who shaped your taste.</p>
        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden /> {CONNECTED.length} connected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary/35" aria-hidden /> {NEARBY.length} nearby
          </span>
        </div>
      </div>
      <Cta onClick={onExplore}>Explore beyond your orbit</Cta>
    </Panel>
  );
}

function UniversePanel({ onPick }: { onPick: (id: string) => void }) {
  return (
    <Panel className="flex flex-col gap-2">
      <p className="font-serif text-lg italic leading-snug">Other music communities, out past your orbit.</p>
      <p className="text-xs text-muted-foreground">Tap one to see who could introduce you.</p>
      <div className="mt-1 flex flex-col gap-1.5">
        {DESTINATIONS.map((d) => (
          <button key={d.id} onClick={() => onPick(d.id)} className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 px-3 text-left hover:bg-white/5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="flex-1 text-sm font-medium">{d.name}</span>
            <span className="text-xs text-muted-foreground">{d.familiarity}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function PreviewPanel({ id, onTravel, onBack }: { id: string; onTravel: () => void; onBack: () => void }) {
  const d = DESTINATIONS.find((x) => x.id === id);
  if (!d) return null;
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold leading-tight">
            <span className="size-2.5 rounded-full" style={{ background: d.color }} aria-hidden />
            {d.name}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {d.familiarity} · {d.listeners} listeners
          </p>
        </div>
        <button onClick={onBack} className="min-h-8 text-xs text-muted-foreground hover:text-foreground">
          Back
        </button>
      </div>
      <div className="flex gap-2">
        {d.covers.map((s) => (
          <div key={s.id} className="min-w-0 flex-1">
            <AlbumArt song={s} size={96} className="!size-auto aspect-square w-full" />
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{s.title}</p>
          </div>
        ))}
      </div>
      {d.bridge ? (
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">{d.bridge.name} is your closest bridge.</span> <span className="text-muted-foreground">{d.bridge.reason}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No bridge into this one yet. (Not part of this demo.)</p>
      )}
      {d.enterable ? <Cta onClick={onTravel}>Travel there</Cta> : null}
    </Panel>
  );
}

function GatewayPanel({ cardLoaded, onStart }: { cardLoaded: boolean; onStart: () => void }) {
  const why = getCluster(GATEWAY.cluster);
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <UserAvatar name={GATEWAY.name} cluster={GATEWAY.cluster} size={44} ring />
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{GATEWAY.name}</p>
          <p className="text-xs text-muted-foreground">
            {DESTINATION.name} · listens for “{why.short.toLowerCase()}”
          </p>
        </div>
      </div>
      <p className="font-serif text-xl italic leading-snug">{GATEWAY_EVIDENCE.headline}</p>
      <div className="flex flex-col gap-1.5">
        {GATEWAY_EVIDENCE.communities.map((c) => (
          <div key={c.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-xs">
            <span className="text-muted-foreground">{c.name}</span>
            <span className="flex gap-1">
              <Bar value={c.jordan} label={GATEWAY.name} color={DESTINATION.color} />
              <Bar value={c.you} label="You" color="var(--primary)" />
            </span>
          </div>
        ))}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {GATEWAY_EVIDENCE.lines.map((l) => (
          <li key={l} className="text-foreground/85">
            {l}
          </li>
        ))}
      </ul>
      <div className="min-h-16 border-l-2 border-primary/60 pl-3">
        {cardLoaded ? (
          <p className="font-serif text-[15px] italic leading-relaxed text-foreground/90 motion-safe:animate-in motion-safe:fade-in">{GATEWAY_EVIDENCE.card}</p>
        ) : (
          <div className="flex flex-col gap-1.5 pt-1" aria-label="Loading the connection card">
            <span className="h-3 w-full animate-pulse rounded bg-white/10" />
            <span className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
            <span className="h-3 w-3/5 animate-pulse rounded bg-white/10" />
          </div>
        )}
      </div>
      <Cta onClick={onStart}>Start a Song Handshake</Cta>
    </Panel>
  );
}

function Bar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1" title={`${label}: ${Math.round(value * 100)}%`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full" style={{ width: `${value * 100}%`, background: color }} />
      </span>
      <span className="w-6 text-[10px] text-muted-foreground">{label === "You" ? "you" : label.slice(0, 1)}</span>
    </span>
  );
}

function ComposePanel({ choice, onChoose, onLock }: { choice: number; onChoose: (i: number) => void; onLock: () => void }) {
  return (
    <Panel className="flex flex-col gap-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-primary">Song Handshake with {GATEWAY.name}</p>
      <p className="font-serif text-xl italic leading-snug">{HANDSHAKE.prompt}</p>
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" aria-hidden />
        {GATEWAY.name} has chosen a song. It stays hidden until you both lock in.
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs text-muted-foreground">Your pick</legend>
        {HANDSHAKE.yours.map((y, i) => (
          <label key={y.song.id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-2.5 py-2", i === choice ? "border-primary/70 bg-primary/10" : "border-white/10 hover:bg-white/5")}>
            <input type="radio" name="pick" className="sr-only" checked={i === choice} onChange={() => onChoose(i)} />
            <AlbumArt song={y.song} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{y.song.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{y.song.artist}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Your note: <span className="italic text-foreground/85">“{HANDSHAKE.yours[choice].note}”</span>
      </p>
      <Cta onClick={onLock}>Lock in my song</Cta>
    </Panel>
  );
}

function RevealPanel({
  choice,
  revealed,
  theirReaction,
  myReaction,
  onReact,
  onBringHome,
}: {
  choice: number;
  revealed: boolean;
  theirReaction: boolean;
  myReaction: string | null;
  onReact: (r: string) => void;
  onBringHome: () => void;
}) {
  const mine = HANDSHAKE.yours[choice];
  if (!revealed) {
    return (
      <Panel className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Sparkles className="size-4 motion-safe:animate-pulse" aria-hidden /> Both locked in. Revealing…
      </Panel>
    );
  }
  return (
    <Panel className="flex flex-col gap-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-primary">Revealed together</p>
      <SongSide from={GATEWAY.name} song={HANDSHAKE.theirs.song} note={HANDSHAKE.theirs.note}>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {HANDSHAKE.reactions.map((r) => (
            <button
              key={r}
              onClick={() => onReact(r)}
              className={cn("min-h-8 rounded-full border px-2.5 text-xs", myReaction === r ? "border-primary bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:bg-white/5")}
            >
              {r}
            </button>
          ))}
        </div>
      </SongSide>
      <SongSide from="You" song={mine.song} note={mine.note}>
        {theirReaction ? (
          <p className="pt-1 text-xs motion-safe:animate-in motion-safe:fade-in">
            <span className="font-semibold text-primary">
              {GATEWAY.name}: {HANDSHAKE.theirReaction.label}
            </span>{" "}
            <span className="text-muted-foreground">at {HANDSHAKE.theirReaction.at}</span>
            <span className="block italic text-foreground/85">“{HANDSHAKE.theirReaction.note}”</span>
          </p>
        ) : (
          <p className="pt-1 text-xs text-muted-foreground">{GATEWAY.name} is listening…</p>
        )}
      </SongSide>
      <Cta onClick={onBringHome} disabled={!myReaction || !theirReaction}>
        {myReaction ? `Bring ${GATEWAY.name} home` : "React to finish the handshake"}
      </Cta>
    </Panel>
  );
}

function SongSide({ from, song, note, children }: { from: string; song: Song; note: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
      <AlbumArt song={song} size={56} className="rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{from === "You" ? "You chose" : `${from} chose`}</p>
        <p className="truncate font-semibold leading-tight">{song.title}</p>
        <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
          {song.artist}
          <a href={listenUrl(song)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
            Listen <ArrowUpRight className="size-3" aria-hidden />
          </a>
        </p>
        <p className="mt-1 text-xs italic text-foreground/85">“{note}”</p>
        {children}
      </div>
    </div>
  );
}

function ReturnedPanel({ tapped, onReplay }: { tapped: string | null; onReplay: () => void }) {
  return (
    <Panel className="flex flex-col gap-3">
      {tapped ? <StarNote id={tapped} /> : null}
      <p className="font-serif text-lg italic leading-snug">
        {GATEWAY.name} joined your galaxy. The bridge to {DESTINATION.name} stays.
      </p>
      <p className="text-xs text-muted-foreground">Every song you trade from here pulls {GATEWAY.name} a little closer to the center.</p>
      <Button variant="outline" className="h-11 w-full rounded-full" onClick={onReplay}>
        <RotateCcw className="size-4" aria-hidden /> Replay
      </Button>
    </Panel>
  );
}
