"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, Shuffle, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FacePortrait } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { removeAvatarPhoto, saveAvatarFace, uploadAvatarPhoto } from "@/lib/api";
import { EXPRESSIONS, FACE_BACKGROUNDS, FACE_HAIR, FACE_SHIRTS, FACE_SKIN, HAIR_STYLES, faceFromName, randomFace, sameFace, type Face } from "@/lib/avatar";
import { useAvatar } from "@/lib/avatar-store";
import { cn } from "@/lib/utils";

/** Edit my profile icon: an optional photo (it shows instead of the face), and the illustrated face itself. */
export function AvatarEditorSheet({ open, onClose, name }: { open: boolean; onClose: () => void; name: string }) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Edit profile icon">
      {/* Mounted only while open, so each visit starts from what's saved. */}
      {open ? <Editor name={name} onClose={onClose} /> : null}
    </BottomSheet>
  );
}

function Editor({ name, onClose }: { name: string; onClose: () => void }) {
  const saved = useAvatar("me");
  const savedFace = saved?.face ?? faceFromName(name);
  const [face, setFace] = useState<Face>(savedFace);
  const [busy, setBusy] = useState<"save" | "photo" | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const photoUrl = saved?.photoUrl ?? null;
  const set = (patch: Partial<Face>) => setFace((f) => ({ ...f, ...patch }));

  const run = async (kind: "save" | "photo", action: () => Promise<void>, close = false) => {
    setBusy(kind);
    setError("");
    try {
      await action();
      if (close) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex max-h-[75vh] flex-col">
      <div className="flex items-center gap-4">
        <span className="relative size-20 shrink-0 overflow-hidden rounded-full ring-2 ring-white/15">
          {photoUrl ? <Image src={photoUrl} alt="Your photo" fill sizes="80px" className="object-cover" /> : <FacePortrait face={face} />}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // choosing the same file again should still upload
              if (file) void run("photo", () => uploadAvatarPhoto(file));
            }}
          />
          <Button variant="secondary" className="h-10 justify-start rounded-full" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy === "photo" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            {photoUrl ? "Change photo" : "Upload photo"}
          </Button>
          {photoUrl ? (
            <button type="button" disabled={!!busy} onClick={() => void run("photo", removeAvatarPhoto)} className="inline-flex min-h-9 items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground">
              <Trash2 className="size-3.5" aria-hidden />
              Remove photo
            </button>
          ) : null}
        </div>
      </div>

      <div className={cn("mt-5 flex min-h-0 flex-col gap-4 overflow-y-auto pb-1", photoUrl && "opacity-60")}>
        {photoUrl ? <p className="text-xs text-muted-foreground">Your photo shows instead of this face.</p> : null}

        <Row label="Hair">
          {HAIR_STYLES.map((label, i) => (
            <Chip key={label} selected={face.hairStyle === i} onClick={() => set({ hairStyle: i })}>
              {label}
            </Chip>
          ))}
        </Row>
        <Swatches label="Hair color" colors={FACE_HAIR} value={face.hair} onChange={(hair) => set({ hair })} />
        <Swatches label="Skin" colors={FACE_SKIN} value={face.skin} onChange={(skin) => set({ skin })} />
        <Swatches label="Shirt" colors={FACE_SHIRTS} value={face.shirt} onChange={(shirt) => set({ shirt })} />
        <Swatches label="Background" colors={FACE_BACKGROUNDS} value={face.background} onChange={(background) => set({ background })} />
        <Row label="Expression">
          {EXPRESSIONS.map((label, i) => (
            <Chip key={label} selected={face.expression === i} onClick={() => set({ expression: i })}>
              {label}
            </Chip>
          ))}
        </Row>
        <label className="flex items-center justify-between text-sm font-medium">
          Glasses
          <Switch checked={face.glasses} onCheckedChange={(glasses) => set({ glasses })} />
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button variant="secondary" className="h-11 rounded-full" disabled={!!busy} onClick={() => setFace(randomFace())}>
          <Shuffle className="size-4" aria-hidden />
          Shuffle
        </Button>
        {saved?.face ? (
          <button type="button" disabled={!!busy} onClick={() => setFace(faceFromName(name))} className="min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground">
            Reset
          </button>
        ) : null}
        <Button
          className="ml-auto h-11 rounded-full px-6"
          disabled={!!busy || (!!saved?.face && sameFace(face, saved.face))}
          onClick={() => void run("save", () => saveAvatarFace(face), true)}
        >
          {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn("min-h-9 rounded-full border px-3 text-sm transition-colors", selected ? "border-primary bg-primary/15 text-foreground" : "border-white/10 text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  );
}

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <Row label={label}>
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${i + 1}`}
          aria-pressed={value === i}
          onClick={() => onChange(i)}
          className={cn("size-8 rounded-full ring-offset-2 ring-offset-background transition-shadow", value === i ? "ring-2 ring-primary" : "ring-1 ring-white/15")}
          style={{ background: c }}
        />
      ))}
    </Row>
  );
}
