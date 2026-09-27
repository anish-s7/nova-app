import type { Schema } from "@google/genai";
import { getGeminiClient, GEMINI_JUDGMENT_MODELS } from "./client";

/**
 * Cap on "thinking" tokens. gemini-flash-latest now thinks by default (500+ tokens even for a tiny
 * prompt), which made a connection assessment take 5-18s instead of ~2s and bills those tokens as
 * output. A small budget keeps a little reasoning for these judgment calls without the wait.
 */
const THINKING_BUDGET = 1024;

/** Errors that mean "try the next model", not "the request is wrong". */
function isRetryable(err: unknown) {
  const status = (err as { status?: number })?.status;
  return status === 429 || status === 503 || status === 500 || status === 404;
}

type JsonInput = {
  system: string;
  prompt: string;
  schema: Schema;
  /**
   * Tail-latency guard: if the first model hasn't answered after this many ms, also ask the next
   * model and take whichever answers first (the slower call is cancelled). Flash usually answers a
   * connection assessment in ~2.5s but occasionally takes 6s+; Flash-Lite answers in ~2s. Off when
   * omitted: then models are only tried one after another, on errors.
   */
  hedgeAfterMs?: number;
};

async function callModel<T>(model: string, input: JsonInput, abortSignal?: AbortSignal): Promise<{ data: T; model: string }> {
  const response = await getGeminiClient().models.generateContent({
    model,
    contents: input.prompt,
    config: {
      systemInstruction: input.system,
      responseMimeType: "application/json",
      responseSchema: input.schema,
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      abortSignal,
    },
  });
  const text = response.text?.trim();
  if (!text) throw new Error(`${model} returned an empty response`);
  return { data: JSON.parse(text) as T, model };
}

/**
 * One structured Gemini call: enforced JSON against `schema`, trying each judgment model in turn
 * when one is overloaded, rate-limited or unavailable (and, with `hedgeAfterMs`, when the first is
 * slow). Returns the parsed object and the model that answered. Throws if every model fails or the
 * answer isn't valid JSON.
 */
export async function generateJson<T>(input: JsonInput): Promise<{ data: T; model: string }> {
  if (input.hedgeAfterMs !== undefined && GEMINI_JUDGMENT_MODELS.length > 1) return hedged<T>(input, input.hedgeAfterMs);

  let lastError: unknown;
  for (const model of GEMINI_JUDGMENT_MODELS) {
    try {
      return await callModel<T>(model, input);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) break;
      console.warn(`Gemini ${model} unavailable, trying the next model:`, (err as Error).message?.slice(0, 160));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini call failed");
}

/**
 * The first model, plus the backup started early when the first is slow (after `hedgeAfterMs`) or
 * right away when it fails with a retryable error. First answer wins; the other call is aborted.
 * A non-retryable failure of the first model before the backup started fails the call, as above.
 */
function hedged<T>(input: JsonInput, hedgeAfterMs: number): Promise<{ data: T; model: string }> {
  const [primary, backup] = GEMINI_JUDGMENT_MODELS;
  const controllers = [new AbortController(), new AbortController()];

  return new Promise((resolve, reject) => {
    let settled = false;
    let backupStarted = false;
    let pending = 0;
    let lastError: unknown;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const run = (i: 0 | 1) => {
      pending++;
      callModel<T>(i === 0 ? primary : backup, input, controllers[i].signal).then(
        (result) => {
          pending--;
          finish(() => {
            controllers[1 - i].abort();
            resolve(result);
          });
        },
        (err) => {
          pending--;
          if (settled) return;
          lastError = err;
          if (i === 0 && isRetryable(err)) {
            console.warn(`Gemini ${primary} unavailable, trying ${backup}:`, (err as Error).message?.slice(0, 160));
            startBackup();
          }
          // Fails only once nothing is left running (a started backup can still answer).
          if (pending === 0) finish(() => reject(lastError instanceof Error ? lastError : new Error("Gemini call failed")));
        },
      );
    };
    const startBackup = () => {
      if (backupStarted || settled) return;
      backupStarted = true;
      run(1);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      console.info(`Gemini ${primary} still thinking after ${hedgeAfterMs}ms, also asking ${backup}`);
      startBackup();
    }, hedgeAfterMs);

    run(0);
  });
}
