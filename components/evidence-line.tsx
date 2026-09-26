import { AudioLines, BookOpen, Tag } from "lucide-react";
import type { Evidence, Song } from "@/lib/types";
import { AlbumArt } from "./album-art";

const KIND = {
  listening_pattern: { icon: AudioLines, label: "Listening pattern" },
  song_context: { icon: BookOpen, label: "About the song" },
  user_tag: { icon: Tag, label: "You tagged" },
} as const;

export function EvidenceLine({ evidence, songs }: { evidence: Evidence; songs: Song[] }) {
  const song = songs.find((s) => s.id === evidence.songIds[0]);
  const { icon: Icon, label } = KIND[evidence.kind];
  return (
    <li className="flex items-start gap-3">
      <AlbumArt song={song} size={36} className="mt-0.5 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="size-3" aria-hidden />
          {label}
        </p>
        <p className="text-pretty text-sm leading-snug text-foreground/90">{evidence.text}</p>
      </div>
    </li>
  );
}
