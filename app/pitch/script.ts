import type { GalaxyDestination } from "@/components/galaxy/types";
import type { ClusterId } from "@/lib/clusters";
import type { GalaxyNode, Song } from "@/lib/types";

/**
 * Everything /pitch shows, scripted. Fictional people, real song titles as plain metadata.
 * Nothing here touches Supabase, Gemini or the matcher; the shapes match the real galaxy's so the
 * same components draw it.
 */

const song = (id: string, title: string, artist: string): Song => ({ id, title, artist, source: "manual" });

const person = (userId: string, name: string, cluster: ClusterId, extra: Partial<GalaxyNode> = {}): GalaxyNode => ({
  userId,
  name,
  cluster,
  topMotivations: [],
  isMe: false,
  ...extra,
});

export const ME: GalaxyNode = { userId: "me", name: "You", cluster: "quiet_company", topMotivations: [], isMe: true };

/** Three people you've completed a Song Handshake with, and how much you've traded since. */
export const CONNECTED: (GalaxyNode & { traded: number; song: Song })[] = [
  { ...person("maya", "Maya", "quiet_company", { relationship: "connected", orbit: 0.85 }), traded: 6, song: song("s-motion", "Motion Sickness", "Phoebe Bridgers") },
  { ...person("theo", "Theo", "carrying_loss", { relationship: "connected", orbit: 0.5 }), traded: 3, song: song("s-fade", "Fade Into You", "Mazzy Star") },
  { ...person("amara", "Amara", "old_selves", { relationship: "connected", orbit: 0.12 }), traded: 1, song: song("s-dreams", "Dreams", "Fleetwood Mac") },
];

/** Suggestions from matching, before any verification: soft language, no percentages. */
export const NEARBY: (GalaxyNode & { nearness: string })[] = [
  { ...person("n-rui", "Rui", "armor_up", { relationship: "nearby" }), nearness: "Near your taste" },
  { ...person("lena", "Lena", "somewhere_else", { relationship: "nearby" }), nearness: "Some familiar ground" },
  { ...person("kofi-n", "Kofi", "quiet_company", { relationship: "nearby" }), nearness: "Near your taste" },
  { ...person("ines", "Ines", "carrying_loss", { relationship: "nearby" }), nearness: "Further from your orbit" },
  { ...person("dev", "Dev", "old_selves", { relationship: "nearby" }), nearness: "Some familiar ground" },
];

export type PitchDestination = GalaxyDestination & {
  familiarity: string;
  listeners: number;
  covers: Song[];
  /** Only one community can be entered in the pitch. */
  enterable: boolean;
  bridge?: { name: string; reason: string };
};

export const DESTINATIONS: PitchDestination[] = [
  {
    id: "late-night-electronic",
    name: "Late-night electronic",
    color: "#6f9cf0",
    distance: 0.8,
    familiarity: "Mostly unfamiliar to you",
    listeners: 214,
    covers: [song("s-kiara", "Kiara", "Bonobo"), song("s-avril", "Avril 14th", "Aphex Twin"), song("s-innerbloom", "Innerbloom", "RÜFÜS DU SOL")],
    enterable: true,
    bridge: { name: "Jordan", reason: "You both love spacious, slow-building tracks." },
  },
  {
    id: "modern-soul",
    name: "Modern soul",
    color: "#e39a62",
    distance: 0.35,
    familiarity: "Some familiar ground",
    listeners: 388,
    covers: [song("s-bestpart", "Best Part", "Daniel Caesar"), song("s-cranes", "Cranes in the Sky", "Solange"), song("s-pinkwhite", "Pink + White", "Frank Ocean")],
    enterable: false,
  },
  {
    id: "shoegaze-revival",
    name: "Shoegaze revival",
    color: "#d98cc0",
    distance: 0.55,
    familiarity: "A little familiar",
    listeners: 167,
    covers: [song("s-sunhits", "When the Sun Hits", "Slowdive"), song("s-sometimes", "Sometimes", "My Bloody Valentine"), song("s-alison", "Alison", "Slowdive")],
    enterable: false,
  },
];

export const DESTINATION = DESTINATIONS[0];

/** The one person in the community closest to your taste. Starts as a faint stranger. */
export const GATEWAY = person("jordan", "Jordan", "quiet_company", { relationship: "nearby", destinationId: DESTINATION.id });

/** Everyone else in the community you travel to. */
export const MEMBERS: GalaxyNode[] = (
  [
    ["le-1", "Sol", "somewhere_else"],
    ["le-2", "Kai", "armor_up"],
    ["le-3", "Mira", "somewhere_else"],
    ["le-4", "Ade", "quiet_company"],
    ["le-5", "Yuki", "somewhere_else"],
    ["le-6", "Pax", "armor_up"],
    ["le-7", "Remy", "old_selves"],
    ["le-8", "Isa", "somewhere_else"],
    ["le-9", "Tove", "carrying_loss"],
    ["le-10", "Nico", "somewhere_else"],
  ] as const
).map(([id, name, cluster]) => person(id, name, cluster, { destinationId: DESTINATION.id }));

/** What the gateway card shows at once, before the richer card has loaded. All deterministic. */
export const GATEWAY_EVIDENCE = {
  headline: "Different scene, same quiet company.",
  communities: [
    { name: "Late-night electronic", jordan: 0.6, you: 0.05 },
    { name: "Modern soul", jordan: 0.3, you: 0.35 },
  ],
  lines: ["You both keep songs for when it's too quiet at home.", "Shared artist: Bon Iver.", "Most of Jordan's picks build slowly. So do yours."],
  /** The richer Connection Card sentence, which arrives a beat later. */
  card: "Jordan puts on long, slow electronic tracks so an empty apartment doesn't feel empty. You do the same thing with quiet songs that have one voice in them. Same use, different sound.",
};

export const HANDSHAKE = {
  prompt: "A song for when it's too quiet at home.",
  theirs: { song: DESTINATION.covers[0], note: "It builds so slowly you don't notice the room filling up." },
  /** Your picks to choose from; the first is preselected. */
  yours: [
    { song: song("s-holocene", "Holocene", "Bon Iver"), note: "Wait for the last minute. That's why I chose it." },
    { song: song("s-pinkmoon", "Pink Moon", "Nick Drake"), note: "Two minutes long and it still fills the room." },
    { song: song("s-restacks", "Re: Stacks", "Bon Iver"), note: "The one I play with the lights off." },
  ],
  /** Jordan's reaction to your song. */
  theirReaction: { label: "This one stays", at: "3:12", note: "Same feeling as Kiara, just with a person in the room." },
  reactions: ["This one stays", "Didn't expect that", "Sending it to someone", "Not for me"],
};
