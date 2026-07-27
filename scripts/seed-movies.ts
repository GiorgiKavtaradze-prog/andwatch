import { resolveByTmdbId } from "../src/lib/catalog/resolver";
import { embedMissingByIds } from "../src/lib/embeddings";
import {
  listPopular,
  listTopRated,
  listTrending,
} from "../src/lib/tmdb/client";

const PAGES = Number(process.env.SEED_PAGES ?? "5");

async function collectIds(): Promise<number[]> {
  const ids = new Set<number>();
  const lists = [
    { name: "popular", fetch: listPopular },
    { name: "top-rated", fetch: listTopRated },
    { name: "trending", fetch: listTrending },
  ];
  for (const list of lists) {
    for (let page = 1; page <= PAGES; page++) {
      const res = await list.fetch(page);
      for (const movie of res?.results ?? []) ids.add(movie.id);
      if (res && page >= res.total_pages) break;
    }
  }
  return [...ids];
}

async function main(): Promise<void> {
  console.log(`Seeding movies (${PAGES} pages per list)...`);
  const ids = await collectIds();
  console.log(
    `Collected ${ids.length} unique movie ids. Fetching and caching...`,
  );

  let cached = 0;
  let failed = 0;
  const matchedIds: number[] = [];
  for (const id of ids) {
    try {
      const result = await resolveByTmdbId(id);
      if (result.status === "matched") {
        cached += 1;
        matchedIds.push(result.movie.id);
      } else failed += 1;
    } catch (error) {
      failed += 1;
      console.warn(`  failed ${id}: ${(error as Error).message}`);
    }
    if ((cached + failed) % 25 === 0) {
      console.log(
        `  ${cached + failed}/${ids.length} processed (cached ${cached})`,
      );
    }
  }

  console.log(
    `Cached ${cached}, failed/unmatched ${failed}. Embedding new movies...`,
  );

  let embedded = 0;
  const EMBED_PAGE = 200;
  for (let i = 0; i < matchedIds.length; i += EMBED_PAGE) {
    const page = matchedIds.slice(i, i + EMBED_PAGE);
    try {
      const res = await embedMissingByIds(page);
      embedded += res.embedded.length;
      console.log(
        `  embedded ${embedded}/${matchedIds.length} (skipped ${res.skipped.length} with no text)`,
      );
    } catch (error) {
      console.warn(`  embedding batch failed: ${(error as Error).message}`);
    }
  }

  console.log(
    `Done. Cached ${cached}, embedded ${embedded}, failed/unmatched ${failed}.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
