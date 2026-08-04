import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  ORDERS_FLAG_MATRIX,
  ORDERS_PERFORMANCE_SLOS,
  evaluateOrdersFlagMatrix,
  evaluateOrdersPerformance,
  percentile,
} from "../scripts/orders-performance-gate.mjs";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const gateScriptPath = join(root, "scripts/orders-performance-gate.mjs");

function passingCohorts() {
  return Object.fromEntries(
    Object.entries(ORDERS_PERFORMANCE_SLOS).map(([name, slo]) => [
      name,
      Array.from({ length: slo.minimumSamples }, () => slo.maximumP95Ms),
    ]),
  );
}

function observedFlagState(flags) {
  return {
    autoSyncOrdersOnLoad: false,
    canonicalFirst: true,
    compactMap: flags.pagination && flags.compactMap,
    mountSync: false,
    pagination: flags.pagination,
    selectionSnapshots: flags.pagination && flags.selectionSnapshots,
    shopifyFullScan: false,
  };
}

function passingFlagMatrix() {
  return {
    cases: ORDERS_FLAG_MATRIX.map((flags) => ({
      ...flags,
      observed: observedFlagState(flags),
    })),
    rollback: {
      canonicalSource: "canonical_unpaged",
      observed: observedFlagState({
        compactMap: false,
        pagination: false,
        selectionSnapshots: false,
      }),
    },
  };
}

function passingInput() {
  return { cohorts: passingCohorts(), flagMatrix: passingFlagMatrix() };
}

test("Orders performance gate exposes the approved release cohorts", () => {
  assert.equal(packageJson.scripts["perf:orders:gate"], "node scripts/orders-performance-gate.mjs");
  assert.deepEqual(ORDERS_PERFORMANCE_SLOS, {
    bulkCompletionMs: { maximumP95Ms: 1_000, minimumSamples: 20 },
    coldFirstRowBackendMs: { maximumP95Ms: 700, minimumSamples: 100 },
    coldFirstUsableMs: { maximumP95Ms: 1_500, minimumSamples: 100 },
    exactFacetsMs: { maximumP95Ms: 700, minimumSamples: 30 },
    mapProjectionMs: { maximumP95Ms: 800, minimumSamples: 30 },
    snapshotCreateMs: { maximumP95Ms: 1_000, minimumSamples: 20 },
    warmLoaderMs: { maximumP95Ms: 1_200, minimumSamples: 100 },
    warmPageTransitionAppMs: { maximumP95Ms: 400, minimumSamples: 100 },
    warmPageTransitionBackendMs: { maximumP95Ms: 250, minimumSamples: 100 },
  });
});

test("Orders performance gate uses nearest-rank p95 and keeps failed samples in the denominator", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 5);

  const cohorts = passingCohorts();
  cohorts.warmPageTransitionBackendMs[94] = null;

  const report = evaluateOrdersPerformance({ cohorts, flagMatrix: passingFlagMatrix() });
  assert.equal(report.pass, false);
  assert.equal(report.cohorts.warmPageTransitionBackendMs.sampleCount, 100);
  assert.equal(report.cohorts.warmPageTransitionBackendMs.failedSampleCount, 1);
  assert.equal(report.cohorts.warmPageTransitionBackendMs.p95Ms, null);
  assert.deepEqual(report.cohorts.warmPageTransitionBackendMs.reasons, ["p95_unavailable_due_to_failed_sample"]);
});

test("Orders performance gate rejects undersized or slow cohorts and passes complete cohorts", () => {
  const passingReport = evaluateOrdersPerformance(passingInput());
  assert.equal(passingReport.pass, true);

  const slowCohorts = passingCohorts();
  slowCohorts.coldFirstUsableMs.fill(1_501);
  slowCohorts.mapProjectionMs.pop();

  const failingReport = evaluateOrdersPerformance({
    cohorts: slowCohorts,
    flagMatrix: passingFlagMatrix(),
  });
  assert.equal(failingReport.pass, false);
  assert.deepEqual(failingReport.cohorts.coldFirstUsableMs.reasons, ["p95_exceeds_slo"]);
  assert.deepEqual(failingReport.cohorts.mapProjectionMs.reasons, ["insufficient_samples"]);
});

test("perf:orders:gate exits non-zero on a failed artifact and writes a redacted report", () => {
  const directory = mkdtempSync(join(tmpdir(), "orders-performance-gate-"));
  const inputPath = join(directory, "input.json");
  const outputPath = join(directory, "report.json");
  const cohorts = passingCohorts();
  cohorts.snapshotCreateMs[0] = { failed: true, error: "customer@example.com" };
  writeFileSync(inputPath, JSON.stringify({ cohorts, flagMatrix: passingFlagMatrix() }), "utf8");

  const result = spawnSync(
    process.execPath,
    [gateScriptPath, inputPath, outputPath],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Orders performance gate failed/);
  const reportSource = readFileSync(outputPath, "utf8");
  assert.doesNotMatch(reportSource, /customer@example\.com/);
  assert.equal(JSON.parse(reportSource).cohorts.snapshotCreateMs.failedSampleCount, 1);
});

test("Orders flag gate evaluates every P/S/M case with canonical-first on and mount sync off", () => {
  assert.equal(ORDERS_FLAG_MATRIX.length, 8);
  assert.deepEqual(
    ORDERS_FLAG_MATRIX.map(({ pagination, selectionSnapshots, compactMap }) =>
      `${Number(pagination)}${Number(selectionSnapshots)}${Number(compactMap)}`),
    ["111", "110", "101", "100", "011", "010", "001", "000"],
  );

  const report = evaluateOrdersFlagMatrix(passingFlagMatrix());
  assert.equal(report.pass, true);
  assert.equal(report.cases.length, 8);
  assert.equal(report.cases.every((entry) => entry.pass), true);
});

test("Orders flag gate blocks unsafe C/A rollback and effective S/M without pagination", () => {
  const flagMatrix = passingFlagMatrix();
  flagMatrix.cases.find((entry) => entry.pagination === false && entry.compactMap === true)
    .observed.compactMap = true;
  flagMatrix.rollback.observed.canonicalFirst = false;
  flagMatrix.rollback.observed.autoSyncOrdersOnLoad = true;

  const report = evaluateOrdersFlagMatrix(flagMatrix);
  assert.equal(report.pass, false);
  assert.deepEqual(report.reasons, ["unsafe_canonical_rollback"]);
  assert.deepEqual(
    report.cases.find((entry) => entry.key === "011").reasons,
    ["unexpected_effective_flags"],
  );
});
