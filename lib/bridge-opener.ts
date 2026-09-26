import type { ClusterId } from "./clusters";

/** Finishes "N for ...": how a group of listeners uses a song, said about them. */
export const WHY_FOR: Record<ClusterId, string> = {
  quiet_company: "company",
  armor_up: "hard days",
  carrying_loss: "missing someone",
  somewhere_else: "escape",
  old_selves: "going back",
};

/** First person: "I put it on ...". */
const MINE: Record<ClusterId, string> = {
  quiet_company: "when it's too quiet",
  armor_up: "before a hard day",
  carrying_loss: "when I miss someone",
  somewhere_else: "to disappear for a bit",
  old_selves: "when I want to go back",
};

/** Second person: "you have it ...". */
const THEIRS: Record<ClusterId, string> = {
  quiet_company: "for the quiet",
  armor_up: "for hard days",
  carrying_loss: "for someone you miss",
  somewhere_else: "to get away for a bit",
  old_selves: "for going back",
};

/** "1 for company, 3 for missing someone". */
export function whySummary(counts: { id: ClusterId; count: number }[]) {
  return counts.map((c) => `${c.count} for ${WHY_FOR[c.id]}`).join(", ");
}

/**
 * A first message a person can edit before sending: names the song and both reasons. A plain
 * template, so browsing the galaxy never costs an LLM call, and only plain title strings are used.
 */
export function bridgeOpener({ title, mine, theirs, iHaveIt }: { title: string; mine: ClusterId; theirs: ClusterId; iHaveIt: boolean }) {
  const lead = iHaveIt ? `We both have "${title}".` : `I just found "${title}" in the galaxy.`;
  const put = iHaveIt ? `I put it on ${MINE[mine]}` : `I'd put it on ${MINE[mine]}`;
  return mine === theirs
    ? `${lead} ${put}. Is that what it is for you too?`
    : `${lead} ${put}, and it looks like you have it ${THEIRS[theirs]}. What does it do for you?`;
}
