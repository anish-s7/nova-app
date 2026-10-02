"use client";

import { useRef, useState, useEffect, type ChangeEvent } from "react";
import { Camera, RefreshCw, Shuffle, Trash2, Sparkles, Smile, Glasses, Palette, Scissors } from "lucide-react";
import { BottomSheet } from "@/components/layout/bottom-sheet";
import {
  AVATAR_BACKGROUNDS,
  AVATAR_HAIR_COLORS,
  AVATAR_SHIRT_COLORS,
  AVATAR_SKIN_TONES,
  EXPRESSION_OPTIONS,
  EYE_STYLE_OPTIONS,
  EYEWEAR_OPTIONS,
  FACIAL_HAIR_OPTIONS,
  getDefaultAvatarConfig,
  HAIR_STYLES,
  HairCategory,
  SHIRT_STYLES,
  UserAvatar,
} from "@/components/profile/user-avatar";
import { setSession, useSession, type AvatarConfig } from "@/lib/data/session";
import { cn } from "@/lib/utils";

type MainTab = "hair" | "face" | "features" | "style";

export function AvatarCustomizerSheet({
  open,
  onClose,
  userName = "You",
  userCluster = "",
}: {
  open: boolean;
  onClose: () => void;
  userName?: string;
  userCluster?: string;
}) {
  const session = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialConfig = session.avatarConfig ?? getDefaultAvatarConfig(userName);
  const [draft, setDraft] = useState<AvatarConfig>(initialConfig);
  const [activeTab, setActiveTab] = useState<MainTab>("hair");
  const [hairCategory, setHairCategory] = useState<HairCategory>("all");

  useEffect(() => {
    if (open) {
      setDraft(session.avatarConfig ?? getDefaultAvatarConfig(userName));
    }
  }, [open, session.avatarConfig, userName]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      if (url) {
        setDraft((prev) => ({ ...prev, avatarUrl: url }));
      }
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    setDraft((prev) => ({ ...prev, avatarUrl: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleShuffle() {
    const randomPick = <T,>(arr: readonly T[] | T[]): T => arr[Math.floor(Math.random() * arr.length)];
    setDraft((prev) => ({
      ...prev,
      avatarUrl: undefined,
      hairStyle: randomPick(HAIR_STYLES).id as AvatarConfig["hairStyle"],
      hairColor: randomPick(AVATAR_HAIR_COLORS),
      skinColor: randomPick(AVATAR_SKIN_TONES),
      shirtStyle: randomPick(SHIRT_STYLES).id,
      shirtColor: randomPick(AVATAR_SHIRT_COLORS),
      facialHair: randomPick(FACIAL_HAIR_OPTIONS).id,
      eyewear: randomPick(EYEWEAR_OPTIONS).id,
      expression: randomPick(EXPRESSION_OPTIONS).id,
      eyeStyle: randomPick(EYE_STYLE_OPTIONS).id,
      background: randomPick(AVATAR_BACKGROUNDS),
    }));
  }

  function handleSave() {
    setSession({ avatarConfig: draft }, true);
    onClose();
  }

  // Filter hair styles by subcategory
  const filteredHairStyles = HAIR_STYLES.filter((item) => {
    if (hairCategory === "all") return true;
    return item.category === hairCategory;
  });

  return (
    <BottomSheet open={open} onClose={onClose} label="Customize Avatar" className="lg:max-w-[580px]">
      <div className="flex flex-col max-h-[84vh]">
        {/* Top Header & Avatar Live Preview */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 px-1 pt-1">
          <div className="flex items-center gap-4">
            <UserAvatar name={userName} cluster={userCluster} config={draft} size={72} ring className="shadow-lg" />
            <div>
              <h3 className="text-base font-semibold text-foreground">Customize Avatar</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Design your listening profile portrait</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {draft.avatarUrl ? (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
              >
                <Trash2 className="size-3.5" />
                Remove photo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-white/10 hover:bg-white/15 text-foreground transition-all border border-white/10 active:scale-95"
              >
                <Camera className="size-3.5" />
                Upload photo
              </button>
            )}
          </div>
        </div>

        {/* Organized Navigation Bar (Main Tabs) */}
        <nav className="flex items-center gap-1.5 p-1 my-3 bg-white/[0.04] border border-white/10 rounded-xl">
          <TabButton
            active={activeTab === "hair"}
            onClick={() => setActiveTab("hair")}
            icon={<Scissors className="size-3.5" />}
            label="Hair & Headwear"
          />
          <TabButton
            active={activeTab === "face"}
            onClick={() => setActiveTab("face")}
            icon={<Smile className="size-3.5" />}
            label="Face & Eyes"
          />
          <TabButton
            active={activeTab === "features"}
            onClick={() => setActiveTab("features")}
            icon={<Glasses className="size-3.5" />}
            label="Facial Hair & Extras"
          />
          <TabButton
            active={activeTab === "style"}
            onClick={() => setActiveTab("style")}
            icon={<Palette className="size-3.5" />}
            label="Apparel & BG"
          />
        </nav>

        {/* Tab Content Panels */}
        <div className="flex-1 overflow-y-auto py-3 space-y-6 px-1 pr-2 min-h-[300px]">
          {/* TAB 1: HAIR & HEADWEAR */}
          {activeTab === "hair" && (
            <>
              {/* Hair Sub-category Filter Pills */}
              <Section label="Hair & Headwear Category">
                <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/5 rounded-lg w-fit">
                  <SubFilterButton
                    active={hairCategory === "all"}
                    onClick={() => setHairCategory("all")}
                    label="All"
                  />
                  <SubFilterButton
                    active={hairCategory === "short"}
                    onClick={() => setHairCategory("short")}
                    label="Short Styles"
                  />
                  <SubFilterButton
                    active={hairCategory === "long"}
                    onClick={() => setHairCategory("long")}
                    label="Long & Updos"
                  />
                  <SubFilterButton
                    active={hairCategory === "hats"}
                    onClick={() => setHairCategory("hats")}
                    label="Hats & Caps"
                  />
                </div>
              </Section>

              {/* Filtered Hair Styles */}
              <Section label="Hair Style">
                <div className="flex flex-wrap gap-2 w-full">
                  {filteredHairStyles.map((style) => {
                    const isSelected = draft.hairStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, hairStyle: style.id as AvatarConfig["hairStyle"] }))}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border",
                          isSelected
                            ? "border-[#f3cb8b] bg-[#f3cb8b]/15 text-[#f3cb8b] ring-1 ring-[#f3cb8b]/40 shadow-sm"
                            : "border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/[0.08] hover:text-foreground"
                        )}
                      >
                        {style.label}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Hair Color Palette */}
              <Section label="Hair Color">
                <div className="grid grid-cols-6 sm:grid-cols-11 gap-2.5 w-full justify-items-center">
                  {AVATAR_HAIR_COLORS.map((color) => {
                    const isSelected = draft.hairColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, hairColor: color }))}
                        style={{ backgroundColor: color }}
                        className={cn(
                          "size-8 rounded-full transition-transform active:scale-95 border border-white/20 shadow-inner flex items-center justify-center",
                          isSelected && "ring-2 ring-[#f3cb8b] ring-offset-2 ring-offset-[#1b1929] scale-110"
                        )}
                      />
                    );
                  })}
                </div>
              </Section>
            </>
          )}

          {/* TAB 2: FACE & EYES */}
          {activeTab === "face" && (
            <>
              {/* Skin Tone Palette */}
              <Section label="Skin Tone">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5 w-full justify-items-center">
                  {AVATAR_SKIN_TONES.map((color) => {
                    const isSelected = draft.skinColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, skinColor: color }))}
                        style={{ backgroundColor: color }}
                        className={cn(
                          "size-8 rounded-full transition-transform active:scale-95 border border-white/20 shadow-inner flex items-center justify-center",
                          isSelected && "ring-2 ring-[#f3cb8b] ring-offset-2 ring-offset-[#1b1929] scale-110"
                        )}
                      />
                    );
                  })}
                </div>
              </Section>

              {/* Expression */}
              <Section label="Expression / Mouth">
                <div className="flex flex-wrap gap-2 w-full">
                  {EXPRESSION_OPTIONS.map((exp) => {
                    const isSelected = draft.expression === exp.id;
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, expression: exp.id }))}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border",
                          isSelected
                            ? "border-[#f3cb8b] bg-[#f3cb8b]/15 text-[#f3cb8b] ring-1 ring-[#f3cb8b]/40 shadow-sm"
                            : "border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/[0.08] hover:text-foreground"
                        )}
                      >
                        {exp.label}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Eye Style */}
              <Section label="Eye Style">
                <div className="flex flex-wrap gap-2 w-full">
                  {EYE_STYLE_OPTIONS.map((eye) => {
                    const isSelected = draft.eyeStyle === eye.id;
                    return (
                      <button
                        key={eye.id}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, eyeStyle: eye.id }))}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border",
                          isSelected
                            ? "border-[#f3cb8b] bg-[#f3cb8b]/15 text-[#f3cb8b] ring-1 ring-[#f3cb8b]/40 shadow-sm"
                            : "border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/[0.08] hover:text-foreground"
                        )}
                      >
                        {eye.label}
                      </button>
                    );
                  })}
                </div>
              </Section>
            </>
          )}

          {/* TAB 3: FACIAL HAIR & EXTRAS */}
          {activeTab === "features" && (
            <>
              {/* Facial Hair */}
              <Section label="Facial Hair (Beard & Mustache)">
                <div className="flex flex-wrap gap-2 w-full">
                  {FACIAL_HAIR_OPTIONS.map((fh) => {
                    const isSelected = draft.facialHair === fh.id;
                    return (
                      <button
                        key={fh.id}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, facialHair: fh.id }))}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border",
                          isSelected
                            ? "border-[#f3cb8b] bg-[#f3cb8b]/15 text-[#f3cb8b] ring-1 ring-[#f3cb8b]/40 shadow-sm"
                            : "border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/[0.08] hover:text-foreground"
                        )}
                      >
                        {fh.label}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Eyewear & Accessories */}
              <Section label="Eyewear & Accessories">
                <div className="flex flex-wrap gap-2 w-full">
                  {EYEWEAR_OPTIONS.map((opt) => {
                    const isSelected = draft.eyewear === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, eyewear: opt.id }))}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border",
                          isSelected
                            ? "border-[#f3cb8b] bg-[#f3cb8b]/15 text-[#f3cb8b] ring-1 ring-[#f3cb8b]/40 shadow-sm"
                            : "border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/[0.08] hover:text-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </Section>
            </>
          )}

          {/* TAB 4: APPAREL & BACKGROUND */}
          {activeTab === "style" && (
            <>
              {/* Shirt Style */}
              <Section label="Shirt Style">
                <div className="flex flex-wrap gap-2 w-full">
                  {SHIRT_STYLES.map((style) => {
                    const isSelected = draft.shirtStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, shirtStyle: style.id }))}
                        className={cn(
                          "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border",
                          isSelected
                            ? "border-[#f3cb8b] bg-[#f3cb8b]/15 text-[#f3cb8b] ring-1 ring-[#f3cb8b]/40 shadow-sm"
                            : "border-white/10 bg-white/[0.04] text-foreground/80 hover:bg-white/[0.08] hover:text-foreground"
                        )}
                      >
                        {style.label}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Shirt Color Palette */}
              <Section label="Shirt Color">
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2.5 w-full justify-items-center">
                  {AVATAR_SHIRT_COLORS.map((color) => {
                    const isSelected = draft.shirtColor === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, shirtColor: color }))}
                        style={{ backgroundColor: color }}
                        className={cn(
                          "size-8 rounded-full transition-transform active:scale-95 border border-white/20 shadow-inner flex items-center justify-center",
                          isSelected && "ring-2 ring-[#f3cb8b] ring-offset-2 ring-offset-[#1b1929] scale-110"
                        )}
                      />
                    );
                  })}
                </div>
              </Section>

              {/* Background Color Palette */}
              <Section label="Background Color">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5 w-full justify-items-center">
                  {AVATAR_BACKGROUNDS.map((color) => {
                    const isSelected = draft.background === color;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, background: color }))}
                        style={{ backgroundColor: color }}
                        className={cn(
                          "size-8 rounded-full transition-transform active:scale-95 border border-white/20 shadow-inner flex items-center justify-center",
                          isSelected && "ring-2 ring-[#f3cb8b] ring-offset-2 ring-offset-[#1b1929] scale-110"
                        )}
                      />
                    );
                  })}
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Bottom Action Footer (Shuffle & Save) */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10 px-1 pb-1 mt-1">
          <button
            type="button"
            onClick={handleShuffle}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-medium text-foreground transition-all border border-white/10 active:scale-95"
          >
            <Shuffle className="size-3.5" />
            Shuffle
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-8 py-2.5 rounded-full bg-[#f3cb8b] text-[#1c160c] font-semibold text-xs hover:bg-[#e7bd7a] transition-all shadow-md active:scale-95"
          >
            Save
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all",
        active
          ? "bg-white/15 text-white shadow-sm font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SubFilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
        active ? "bg-[#f3cb8b]/20 text-[#f3cb8b] font-semibold" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-full space-y-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h4>
      {children}
    </div>
  );
}
