import { AudioLines, BookOpen, Tag } from "lucide-react";
import type { Evidence, Song } from "@/lib/types";
import { AlbumArt } from "./album-art";

const KIND = {
  listening_pattern: { icon: AudioLines, label: "How you listen" },
  song_context: { icon: BookOpen, label: "About the song" },
  user_tag: { icon: Tag, label: "You tagged" },
} as const;

export function EvidenceLine({ evidence, songs }: { evidence: Evidence; songs: Song[] }) {
  const song = songs.find((s) => s.id === evidence.songIds[0]);
  const { icon: Icon, label } = KIND[evidence.kind];
  return (
    <li className="flex items-start gap-3">
      <AlbumArt song={song} size={36} className="mt-0.5 rounded-md" />
      {/* The kind is an icon, not a heading row: one line of text per piece of evidence. */}
      <p className="min-w-0 flex-1 text-pretty text-sm leading-snug text-foreground/90">
        <Icon className="mr-1.5 inline size-3.5 -translate-y-px text-muted-foreground" aria-label={label} />
        {evidence.text}
      </p>
    </li>
  );
}
