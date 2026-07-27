import { describe, expect, it } from "vitest";
import { detectSource, parseRatingsCsv } from "./parse";

function csvFile(content: string, name = "ratings.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

const LETTERBOXD_HEADER = "Date,Name,Year,Letterboxd URI,Rating";
const IMDB_HEADER =
  "Const,Your Rating,Date Rated,Title,Title Type,IMDb Rating,Runtime (mins),Year,Genres";

describe("detectSource (AC-2)", () => {
  it("recognizes a Letterboxd export from its headers", () => {
    expect(
      detectSource(["Date", "Name", "Year", "Letterboxd URI", "Rating"]),
    ).toBe("letterboxd");
  });

  it("recognizes an IMDb export from its headers", () => {
    expect(detectSource(["Const", "Your Rating", "Title", "Title Type"])).toBe(
      "imdb",
    );
  });

  it("returns null for an unrecognized file", () => {
    expect(detectSource(["foo", "bar", "baz"])).toBeNull();
  });
});

describe("parseRatingsCsv — Letterboxd (AC-2, AC-3)", () => {
  it("maps rated rows and preserves the raw rating on its own scale", async () => {
    const csv = `${LETTERBOXD_HEADER}
2024-01-02,The Matrix,1999,https://letterboxd.com/x,4.5
2024-03-04,Amelie,2001,https://letterboxd.com/y,5`;
    const result = await parseRatingsCsv(csvFile(csv));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.source).toBe("letterboxd");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      title: "The Matrix",
      year: 1999,
      imdbId: null,
      rawValue: 4.5,
      ratedAt: "2024-01-02",
    });
  });

  it("skips watched-but-unrated rows (empty Rating) and counts them", async () => {
    const csv = `${LETTERBOXD_HEADER}
2024-01-02,The Matrix,1999,https://letterboxd.com/x,4
2024-03-04,Unrated Film,2010,https://letterboxd.com/y,`;
    const result = await parseRatingsCsv(csvFile(csv));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe("The Matrix");
    expect(result.skipped).toBe(1);
  });
});

describe("parseRatingsCsv — IMDb (AC-2, AC-3)", () => {
  it("maps movie rows, carries the tt id, and skips TV rows as skipped", async () => {
    const csv = `${IMDB_HEADER}
tt0133093,9,2024-01-02,The Matrix,movie,8.7,136,1999,Action
tt0903747,10,2024-02-03,Breaking Bad,tvSeries,9.5,49,2008,Drama
tt4154796,8,2024-03-04,Avengers Endgame,movie,8.4,181,2019,Action`;
    const result = await parseRatingsCsv(csvFile(csv));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.source).toBe("imdb");
    expect(result.rows.map((r) => r.title)).toEqual([
      "The Matrix",
      "Avengers Endgame",
    ]);
    expect(result.skipped).toBe(1);
    expect(result.rows[0]).toEqual({
      title: "The Matrix",
      year: 1999,
      imdbId: "tt0133093",
      rawValue: 9,
      ratedAt: "2024-01-02",
    });
  });

  it("respects a forced source over auto-detection", async () => {
    const csv = `${LETTERBOXD_HEADER}
2024-01-02,The Matrix,1999,https://letterboxd.com/x,4.5`;
    const result = await parseRatingsCsv(csvFile(csv), "imdb");
    expect(result.status).toBe("error");
  });
});

describe("parseRatingsCsv — error cases", () => {
  it("reports an error for an unrecognized file", async () => {
    const csv = "colA,colB\n1,2";
    const result = await parseRatingsCsv(csvFile(csv));
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toMatch(/Letterboxd or IMDb/);
  });

  it("reports an error when a recognized file has no rated movies", async () => {
    const csv = `${LETTERBOXD_HEADER}
2024-01-02,Unrated,1999,https://letterboxd.com/x,`;
    const result = await parseRatingsCsv(csvFile(csv));
    expect(result.status).toBe("error");
  });
});
