import { createListeningAdapters } from "../lib/listening/adapters";
import { createSupabaseWorker } from "../lib/listening/worker";
import { listeningEnabled } from "../lib/listening/config";
import { createServerClient } from "../lib/supabase/server";

async function main() {
  if (!listeningEnabled()) throw new Error("LISTENING_ENABLED must be true to run listening sync");
  const run = createSupabaseWorker({ client: createServerClient(), adapters: createListeningAdapters() });
  let processed = 0;
  while (true) {
    const result = await run();
    if (result.status === "idle") break;
    processed += 1;
    console.log(JSON.stringify(result));
  }
  console.log(`Listening sync finished (${processed} job invocation${processed === 1 ? "" : "s"})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Listening sync failed");
  process.exitCode = 1;
});
