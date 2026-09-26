"use client";

import { useParams, useSearchParams } from "next/navigation";
import { SongSwapComposer } from "@/components/song-swap-composer";

export default function SongSwapPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  return <SongSwapComposer userId={id} replyToSwapId={params.get("replyTo") ?? undefined} initialSongId={params.get("song") ?? undefined} />;
}
