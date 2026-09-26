"use client";

import { useParams, useSearchParams } from "next/navigation";
import { SongSwapComposer } from "@/components/song-swap-composer";

export default function SongSwapPage() {
  const { id } = useParams<{ id: string }>();
  const replyTo = useSearchParams().get("replyTo") ?? undefined;
  return <SongSwapComposer userId={id} replyToSwapId={replyTo} />;
}
