import { getCluster, type ClusterId } from "./clusters";

/**
 * Hand-written phrasing for the five original mock clusters, so their openers read naturally
 * instead of generically. Any other cluster id (real-mode's dynamic `topic_clusters` rows) falls
 * back to a phrase built from its fetched `short` label — see `whyForPhrase`/`firstPerson`/
 * `secondPerson` below, which are what every call site here actually uses.
 */

/** Finishes "N for ...": how a group of listeners uses a song, said about them. */
const WHY_FOR: Partial<Record<ClusterId, string>> = {
  quiet_company: "company",
  armor_up: "hard days",
  carrying_loss: "missing someone",
  somewhere_else: "escape",
  old_selves: "going back",
};

/** First person: "I put it on ...". */
const MINE: Partial<Record<ClusterId, string>> = {
  quiet_company: "when it's too quiet",
  armor_up: "before a hard day",
  carrying_loss: "when I miss someone",
  somewhere_else: "to disappear for a bit",
  old_selves: "when I want to go back",
};

/** Second person: "you have it ...". */
const THEIRS: Partial<Record<ClusterId, string>> = {
  quiet_company: "for the quiet",
  armor_up: "for hard days",
  carrying_loss: "for someone you miss",
  somewhere_else: "to get away for a bit",
  old_selves: "for going back",
};

/** A cluster with no hand-written noun phrase reads by its own fetched short label instead. */
const shortPhrase = (id: string): string => WHY_FOR[id as ClusterId] ?? getCluster(id).short.toLowerCase();
/** A cluster with no hand-written clause falls back to a generic "for <short>"-shaped one. */
const fallbackClause = (id: string) => `for ${getCluster(id).short.toLowerCase()}`;

const firstPerson = (id: string): string => MINE[id as ClusterId] ?? fallbackClause(id);
const secondPerson = (id: string): string => THEIRS[id as ClusterId] ?? fallbackClause(id);

/** "1 for company, 3 for missing someone". */
export function whySummary(counts: { id: string; count: number }[]) {
  return counts.map((c) => `${c.count} for ${shortPhrase(c.id)}`).join(", ");
}

/**
 * A first message a person can edit before sending: names the song and both reasons. A plain
 * template, so browsing the galaxy never costs an LLM call, and only plain title strings are used.
 */
export function bridgeOpener({ title, mine, theirs, iHaveIt }: { title: string; mine: string; theirs: string; iHaveIt: boolean }) {
  const lead = iHaveIt ? `We both have "${title}".` : `I just found "${title}" in the galaxy.`;
  const put = iHaveIt ? `I put it on ${firstPerson(mine)}` : `I'd put it on ${firstPerson(mine)}`;
  return mine === theirs
    ? `${lead} ${put}. Is that what it is for you too?`
    : `${lead} ${put}, and it looks like you have it ${secondPerson(theirs)}. What does it do for you?`;
}
