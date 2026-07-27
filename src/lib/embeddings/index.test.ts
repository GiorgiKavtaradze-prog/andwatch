import { describe, expect, it, vi } from "vitest";

const createMock = vi.fn(
  async ({ input }: { input: string[] }) =>
    ({
      data: input.map((_, index) => ({ index, embedding: [3, 4, 0] })),
    }) as unknown,
);
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: createMock };
  },
}));

import {
  buildMovieDocument,
  embedTexts,
  l2normalize,
  parseVector,
  toVectorLiteral,
} from "./index";

describe("buildMovieDocument (AC-5)", () => {
  it("blends overview, genres, keywords, directors, and cast into one document", () => {
    const doc = buildMovieDocument({
      id: 1,
      overview: "A hacker learns the truth.",
      genres: [{ id: 1, name: "Science Fiction" }],
      keywords: [{ id: 2, name: "simulated reality" }],
      directors: [{ id: 3, name: "Lana Wachowski" }],
      top_cast: [{ id: 4, name: "Keanu Reeves", character: "Neo" }],
    });
    expect(doc).toContain("A hacker learns the truth.");
    expect(doc).toContain("Genres: Science Fiction");
    expect(doc).toContain("Themes: simulated reality");
    expect(doc).toContain("Directed by Lana Wachowski");
    expect(doc).toContain("Starring Keanu Reeves");
  });

  it("returns an empty string when there is no usable text (movie stays unembedded)", () => {
    const doc = buildMovieDocument({
      id: 1,
      overview: null,
      genres: null,
      keywords: null,
      directors: null,
      top_cast: null,
    });
    expect(doc).toBe("");
  });
});

describe("l2normalize (AC-5)", () => {
  it("scales a vector to unit length", () => {
    const unit = l2normalize([3, 4, 0]);
    expect(unit).toEqual([0.6, 0.8, 0]);
    const norm = Math.sqrt(unit.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it("leaves a zero vector unchanged (no divide by zero)", () => {
    expect(l2normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("toVectorLiteral / parseVector (AC-5)", () => {
  it("round-trips a vector through the pgvector string form", () => {
    const literal = toVectorLiteral([0.1, 0.2, 0.3]);
    expect(literal).toBe("[0.1,0.2,0.3]");
    expect(parseVector(literal)).toEqual([0.1, 0.2, 0.3]);
  });

  it("parses an array passthrough and null, and rejects junk", () => {
    expect(parseVector([1, 2, 3])).toEqual([1, 2, 3]);
    expect(parseVector(null)).toBeNull();
    expect(parseVector("not-json")).toBeNull();
  });
});

describe("embedTexts (AC-5)", () => {
  it("returns one unit-normalized vector per input, ordered by index", async () => {
    const vectors = await embedTexts(["a", "b"]);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toEqual([0.6, 0.8, 0]);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "text-embedding-3-small",
        dimensions: 1536,
      }),
    );
  });

  it("short-circuits on empty input without calling the API", async () => {
    createMock.mockClear();
    const vectors = await embedTexts([]);
    expect(vectors).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });
});
