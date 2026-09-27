"use client";

import { useState, type CSSProperties } from "react";
import { Check, X } from "lucide-react";
import { getCluster } from "@/lib/clusters";
import { DEFAULT_POSTCARD_ORDER, isPostcardId, postcardById, postcardImage, POSTCARDS_SHOWN } from "@/lib/postcards";
import { MAX_PICK_TAGS } from "@/lib/tags";
import { cn } from "@/lib/utils";

export const MAX_POSTCARDS = MAX_PICK_TAGS;

/**
 * "It feels like…": choose 1–3 postcards (lib/postcards.ts) for a song. `order` is the song's
 * best-fit cards (getSongPostcards), shown first; the rest of the deck is behind "more".
 * `order` undefined = still loading. Older picks' fixed tags stay visible as chips so they can be
 * kept or removed. Values are postcard ids (or those older tags), as saved in song_picks.tags.
 */
export function PostcardPicker({
  value,
  onChange,
  label,
  order,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  order: string[] | undefined;
}) {
  const [showAll, setShowAll] = useState(false);
  const full = value.length >= MAX_POSTCARDS;
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (!full) onChange([...value, id]);
  };

  const legacy = value.filter((v) => !isPostcardId(v));
  const first = order?.filter(isPostcardId) ?? [];
  // The song's best fits, plus anything already chosen from further down the deck.
  const shown = [...first, ...value.filter((v) => isPostcardId(v) && !first.includes(v))];
  const rest = DEFAULT_POSTCARD_ORDER.filter((id) => !shown.includes(id));
  const cards = showAll ? [...shown, ...rest] : shown;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">It feels like…</p>
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {value.length}/{MAX_POSTCARDS}
        </p>
      </div>

      {legacy.length ? (
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Tags from before">
          {legacy.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-sm text-foreground"
              aria-label={`Remove ${tag}`}
            >
              {tag}
              <X className="size-3.5 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      <ul className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={label} aria-busy={!order}>
        {order
          ? cards.map((id) => <Card key={id} id={id} selected={value.includes(id)} disabled={full && !value.includes(id)} onToggle={() => toggle(id)} />)
          : Array.from({ length: POSTCARDS_SHOWN }, (_, i) => <li key={i} className="aspect-[3/2] animate-pulse rounded-2xl bg-white/[0.05]" aria-hidden />)}
      </ul>
      {!order ? <p className="sr-only">Loading postcards for this song</p> : null}

      {order && rest.length ? (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 w-full rounded-full border border-white/10 py-2 text-sm text-muted-foreground hover:text-foreground">
          {showAll ? "Show fewer" : `More postcards (${rest.length})`}
        </button>
      ) : null}

      <Credits ids={order ? cards : []} />
    </div>
  );
}

function Card({ id, selected, disabled, onToggle }: { id: string; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const card = postcardById(id);
  if (!card) return null;
  const image = postcardImage(id);
  const tone = getCluster(card.why).color;
  return (
    <li className={cn(disabled && "opacity-40")}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`It feels like ${card.phrase}: ${card.feeling}`}
        className={cn(
          "group relative block aspect-[3/2] w-full overflow-hidden rounded-2xl border text-left transition-[transform,border-color] duration-200 active:scale-[0.98]",
          selected ? "border-primary ring-2 ring-primary/60" : "border-white/10 hover:border-white/25",
        )}
        style={{ "--tone": tone } as CSSProperties}
      >
        {image ? (
          // Hotlinked from Unsplash's CDN, as their API guidelines require (not proxied or re-hosted).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklab,var(--tone)_45%,transparent),transparent_65%)]" aria-hidden />
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pb-2 pt-6">
          <span className="block text-sm font-semibold leading-tight text-white">{card.phrase}</span>
          <span className="block text-[11px] text-white/70">{card.feeling}</span>
        </span>
        {selected ? (
          <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** Unsplash credits for the illustrations on screen (their API guidelines ask for artist + Unsplash links). */
function Credits({ ids }: { ids: string[] }) {
  const credited = ids.map((id) => ({ id, image: postcardImage(id) })).filter((c) => c.image);
  if (!credited.length) return null;
  const artists = [...new Map(credited.map((c) => [c.image!.artistUrl, c.image!])).values()];
  const utm = "utm_source=song_galaxy&utm_medium=referral";
  return (
    <details className="mt-2 text-[11px] text-muted-foreground">
      <summary className="cursor-pointer">Illustrations from Unsplash</summary>
      <p className="mt-1 leading-relaxed">
        {artists.map((a, i) => (
          <span key={a.artistUrl}>
            {i ? ", " : ""}
            <a href={`${a.artistUrl}?${utm}`} target="_blank" rel="noreferrer" className="underline">
              {a.artist}
            </a>
          </span>
        ))}{" "}
        on{" "}
        <a href={`https://unsplash.com/?${utm}`} target="_blank" rel="noreferrer" className="underline">
          Unsplash
        </a>
      </p>
    </details>
  );
}
