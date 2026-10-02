"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { MessagesPane } from "@/components/chat/messages-pane";

/** Laptops: conversations on the left, the open chat (or the Messages page's placeholder) on the right, as in iMessage on a Mac. Phones: just the page. */
export default function MessagesLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id?: string }>();
  return (
    <div className="flex min-h-0 flex-1">
      <aside aria-label="Conversations" className="hidden w-[360px] shrink-0 flex-col border-r border-white/[0.07] lg:flex xl:w-[400px]">
        <MessagesPane activeId={id} />
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
