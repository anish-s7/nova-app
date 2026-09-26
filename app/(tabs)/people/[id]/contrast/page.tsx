"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { ConnectionCardSkeleton } from "@/components/connection-card-skeleton";
import { ContrastCardView } from "@/components/contrast-card-view";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { getContrastCard, getMe, getUser } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ContrastCardPage() {
  const { id } = useParams<{ id: string }>();
  const { version } = useSession();
  const card = useSWR(["contrast", id, version], ([, uid]) => getContrastCard(uid), { shouldRetryOnError: false });
  const other = useSWR(["user", id], ([, uid]) => getUser(uid));
  const me = useSWR(["me", version], getMe);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader onBack={() => history.back()} title="Same song, different feeling" subtitle={other.data ? `You & ${other.data.name}` : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        {card.error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-serif text-xl italic">We couldn&apos;t put this card together.</p>
            <p className="text-sm text-muted-foreground">{card.error.message}</p>
            <Button className="mt-2 rounded-full" disabled={card.isValidating} onClick={() => card.mutate()}>
              Try again
            </Button>
          </div>
        ) : card.data && other.data && me.data ? (
          <ContrastCardView card={card.data} me={me.data} other={other.data} />
        ) : (
          <ConnectionCardSkeleton name={other.data?.name} />
        )}
      </div>
    </main>
  );
}
