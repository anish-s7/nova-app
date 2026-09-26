"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ChatView } from "@/components/chat-view";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const draft = useSearchParams().get("draft") ?? "";
  return <ChatView key={id} userId={id} initialDraft={draft} />;
}
