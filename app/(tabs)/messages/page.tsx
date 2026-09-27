"use client";

import { MessageCircle } from "lucide-react";
import { MessagesPane } from "@/components/messages-pane";

export default function MessagesPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      {/* Phones: the list is the screen. Laptops: it's the left pane (layout.tsx), so this side waits for a pick. */}
      <MessagesPane className="lg:hidden" />
      <div className="hidden flex-1 flex-col items-center justify-center gap-3 px-8 text-center font-chat lg:flex">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageCircle className="size-7" strokeWidth={1.6} aria-hidden />
        </span>
        <p className="text-lg font-semibold">Your messages</p>
        <p className="max-w-xs text-sm text-muted-foreground">Pick a conversation, or start one with someone you connect with.</p>
      </div>
    </main>
  );
}
