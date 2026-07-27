import { embedMissingByIds } from "../src/lib/embeddings";
import { getServiceClient } from "../src/lib/supabase/service";

const PAGE = 200;

async function main(): Promise<void> {
  const service = getServiceClient();
  console.log("Backfilling movie embeddings...");

  let embedded = 0;
  let skipped = 0;
  let scanned = 0;

  let offset = 0;
  for (;;) {
    const { data, error } = await service
      .from("movies")
      .select("id")
      .is("embedding", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error(`Query failed: ${error.message}`);
      process.exit(1);
    }
    const ids = (data ?? []).map((r) => r.id as number);
    if (ids.length === 0) break;

    const res = await embedMissingByIds(ids);
    embedded += res.embedded.length;
    skipped += res.skipped.length;
    scanned += ids.length;
    offset += res.skipped.length;
    console.log(
      `  scanned ${scanned}, embedded ${embedded}, skipped ${skipped}`,
    );
  }

  console.log(`Done. Embedded ${embedded}, skipped ${skipped} (no text).`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
