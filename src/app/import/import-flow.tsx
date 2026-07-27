"use client";

import { AlertCircle, ArrowRight, CheckCircle2, FileText, RotateCcw, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toastError } from "@/components/ui/toast";
import { parseRatingsCsv } from "@/lib/import/parse";
import type { ImportSource, ParsedRow, UnmatchedRow } from "@/lib/import/types";
import { createImport, finalizeImport, getImportStatus, processImportChunk } from "./actions";

const CHUNK_SIZE = 100;

type Phase = "idle" | "parsing" | "ready" | "processing" | "done" | "below-floor" | "error";

const SOURCE_LABEL: Record<ImportSource, string> = {
  letterboxd: "Letterboxd",
  imdb: "IMDb",
};

export function ImportFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<ImportSource | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [progress, setProgress] = useState(0);
  const [counts, setCounts] = useState({ matched: 0, unmatched: 0 });
  const [belowFloor, setBelowFloor] = useState({ matched: 0, floor: 0 });
  const [unmatchedRows, setUnmatchedRows] = useState<UnmatchedRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const rowsRef = useRef<ParsedRow[]>([]);
  const importIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reset = useCallback(() => {
    setPhase("idle");
    setSource(null);
    setSkipped(0);
    setProgress(0);
    setCounts({ matched: 0, unmatched: 0 });
    setBelowFloor({ matched: 0, floor: 0 });
    setUnmatchedRows([]);
    setErrorMessage("");
    rowsRef.current = [];
    importIdRef.current = null;
  }, []);
  const handleFile = useCallback(async (file: File, forcedSource?: ImportSource) => {
    setPhase("parsing");
    const result = await parseRatingsCsv(file, forcedSource);
    if (result.status === "error") {
      setErrorMessage(result.message);
      setPhase("error");
      return;
    }
    rowsRef.current = result.rows;
    setSource(result.source);
    setSkipped(result.skipped);
    setPhase("ready");
  }, []);
  const runImport = useCallback(async () => {
    if (!source) return;
    const rows = rowsRef.current;
    setPhase("processing");
    setProgress(0);
    setCounts({ matched: 0, unmatched: 0 });
    if (!importIdRef.current) {
      const created = await createImport({ source, totalRows: rows.length });
      if (created.status === "error") {
        setErrorMessage(created.message);
        setPhase("error");
        return;
      }
      importIdRef.current = created.importId;
    }
    const importId = importIdRef.current;
    const chunkCount = Math.ceil(rows.length / CHUNK_SIZE);
    for (let i = 0; i < chunkCount; i++) {
      const chunk = rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const res = await processImportChunk({ importId, rows: chunk, chunkIndex: i });
      if (res.status === "failed") {
        setErrorMessage(res.error);
        setPhase("error");
        return;
      }
      setCounts(res.counts);
      setProgress(Math.round(((i + 1) / chunkCount) * 100));
    }
    const final = await finalizeImport(importId);
    if (final.status === "failed") {
      setErrorMessage(final.error);
      setPhase("error");
      return;
    }
    const status = await getImportStatus(importId);
    if (status) setUnmatchedRows(status.unmatchedRows);
    if (final.status === "below-floor") {
      setBelowFloor({ matched: final.matched, floor: final.floor });
      setPhase("below-floor");
      return;
    }
    setPhase("done");
  }, [source]);
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );
  const onFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleFile(file);
      event.target.value = "";
    },
    [handleFile],
  );
  if (phase === "idle" || phase === "parsing") {
    return (
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center transition-colors ${
          dragging ? "border-accent bg-surface-2" : "border-border bg-surface-1 hover:bg-surface-2"
        }`}
      >
        <Upload className="size-8 text-text-muted" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-sans font-medium text-text">
            {phase === "parsing" ? "Reading your file..." : "Drop your ratings.csv here"}
          </p>
          <p className="font-sans text-sm text-text-secondary">
            or click to choose a file. Letterboxd and IMDb exports are supported.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={onFileChange}
          disabled={phase === "parsing"}
        />
      </label>
    );
  }
  if (phase === "ready" && source) {
    const otherSource: ImportSource = source === "letterboxd" ? "imdb" : "letterboxd";
    return (
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 size-5 text-accent" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-sans font-medium text-text">
                {SOURCE_LABEL[source]} export detected
              </p>
              <p className="font-sans text-sm text-text-secondary">
                {rowsRef.current.length} rated {rowsRef.current.length === 1 ? "movie" : "movies"}{" "}
                ready to import
                {skipped > 0 ? `, ${skipped} skipped (not a rated movie)` : ""}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void runImport()}>Start import</Button>
            <Button variant="ghost" onClick={reset}>
              Choose a different file
            </Button>
          </div>
          <p className="font-sans text-xs text-text-muted">
            Not {SOURCE_LABEL[source]}? Re-upload and we will read it as {SOURCE_LABEL[otherSource]}
            .
          </p>
        </CardContent>
      </Card>
    );
  }
  if (phase === "processing") {
    return (
      <Card>
        <CardContent className="space-y-4">
          <p className="font-sans font-medium text-text">Building your taste profile...</p>
          <Progress value={progress} aria-label="Import progress" />
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{counts.matched} matched</Badge>
            {counts.unmatched > 0 ? (
              <Badge variant="warning">{counts.unmatched} unmatched</Badge>
            ) : null}
            {skipped > 0 ? <Badge variant="neutral">{skipped} skipped</Badge> : null}
          </div>
          <p className="font-sans text-xs text-text-muted">
            Keep this tab open. We match each film to a real movie and learn its feel; this can take
            a moment for a large history.
          </p>
        </CardContent>
      </Card>
    );
  }
  if (phase === "done") {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
              <p className="font-serif text-2xl font-semibold text-text">Your profile is ready</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{counts.matched} matched</Badge>
              {counts.unmatched > 0 ? (
                <Badge variant="warning">{counts.unmatched} unmatched</Badge>
              ) : null}
              {skipped > 0 ? <Badge variant="neutral">{skipped} skipped</Badge> : null}
            </div>
            <Button asChild>
              <Link href="/">
                See your recommendations
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <UnmatchedPanel rows={unmatchedRows} />
      </div>
    );
  }
  if (phase === "below-floor") {
    return (
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="size-6 text-warning" aria-hidden="true" />
            <p className="font-serif text-2xl font-semibold text-text">Almost there</p>
          </div>
          <p className="font-sans text-text-secondary">
            We matched {belowFloor.matched} of your ratings to real movies. We need at least{" "}
            {belowFloor.floor} to build a taste profile you can trust. Your ratings are saved, so
            another import or a quick onboarding will get you over the line.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={reset}>
              Import another file
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Back home</Link>
            </Button>
          </div>
          <UnmatchedPanel rows={unmatchedRows} />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="size-6 text-danger" aria-hidden="true" />
          <p className="font-serif text-2xl font-semibold text-text">Import interrupted</p>
        </div>
        <p className="font-sans text-text-secondary">{errorMessage}</p>
        <div className="flex flex-wrap gap-3">
          {importIdRef.current && rowsRef.current.length > 0 ? (
            <Button
              onClick={() => {
                setErrorMessage("");
                void runImport();
              }}
            >
              <RotateCcw aria-hidden="true" />
              Resume import
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              toastError("Import cancelled");
              reset();
            }}
          >
            Start over
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
function UnmatchedPanel({ rows }: { rows: UnmatchedRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-3">
        <p className="font-sans font-medium text-text">Not matched ({rows.length})</p>
        <p className="font-sans text-sm text-text-secondary">
          We could not find these in our movie database, so they did not shape your profile. Nothing
          was dropped silently.
        </p>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={`${row.title}-${row.year ?? "?"}`}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="font-sans text-sm text-text">
                {row.title}
                {row.year ? <span className="text-text-muted"> ({row.year})</span> : null}
              </span>
              <span className="font-sans text-xs text-text-muted">your rating {row.raw_value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
