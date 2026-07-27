import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ resolveMany: vi.fn() }));
vi.mock("@/lib/embeddings", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/embeddings")>();
  return { ...actual, embedMissingByIds: vi.fn(async () => ({ embedded: [], skipped: [] })) };
});

import { resolveMany } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { processImportChunk } from "./actions";

type Upsert = { rows: Array<Record<string, unknown>>; opts: unknown };

function makeSupabase() {
  const upserts: Upsert[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from(table: string) {
      if (table === "imports") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { source: "letterboxd", matched_rows: 0, unmatched_rows: 0, unmatched: [] },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "ratings") {
        return {
          upsert: (rows: Array<Record<string, unknown>>, opts: unknown) => {
            upserts.push({ rows, opts });
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, upserts };
}

function matched(id: number) {
  return {
    ref: { kind: "title" as const, title: "x" },
    result: { status: "matched" as const, movie: { id } },
  };
}

describe("processImportChunk — duplicate movie in one chunk (harden)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("collapses two rows that resolve to the same movie into one rating (latest wins)", async () => {
    const { client, upserts } = makeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(resolveMany).mockResolvedValue([matched(42), matched(42)] as never);

    const result = await processImportChunk({
      importId: "imp-1",
      chunkIndex: 0,
      rows: [
        { title: "The Matrix", year: 1999, imdbId: null, rawValue: 5, ratedAt: null },
        { title: "The Matrix (re-release)", year: 1999, imdbId: null, rawValue: 4, ratedAt: null },
      ],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.counts.matched).toBe(1);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].rows).toHaveLength(1);
    expect(upserts[0].rows[0]).toMatchObject({ movie_id: 42, normalized_value: 80 });
  });

  it("normalizes distinct movies independently and keeps both", async () => {
    const { client, upserts } = makeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(resolveMany).mockResolvedValue([matched(1), matched(2)] as never);

    const result = await processImportChunk({
      importId: "imp-1",
      chunkIndex: 0,
      rows: [
        { title: "A", year: 2000, imdbId: null, rawValue: 5, ratedAt: null },
        { title: "B", year: 2001, imdbId: null, rawValue: 2.5, ratedAt: null },
      ],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.counts.matched).toBe(2);
    expect(upserts[0].rows).toHaveLength(2);
    expect(upserts[0].rows.map((r) => r.normalized_value)).toEqual([100, 50]);
  });
});
