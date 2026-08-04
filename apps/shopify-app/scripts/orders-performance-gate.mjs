import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ORDERS_PERFORMANCE_SLOS = {
  bulkCompletionMs: { maximumP95Ms: 1_000, minimumSamples: 20 },
  coldFirstRowBackendMs: { maximumP95Ms: 700, minimumSamples: 100 },
  coldFirstUsableMs: { maximumP95Ms: 1_500, minimumSamples: 100 },
  exactFacetsMs: { maximumP95Ms: 700, minimumSamples: 30 },
  mapProjectionMs: { maximumP95Ms: 800, minimumSamples: 30 },
  snapshotCreateMs: { maximumP95Ms: 1_000, minimumSamples: 20 },
  warmLoaderMs: { maximumP95Ms: 1_200, minimumSamples: 100 },
  warmPageTransitionAppMs: { maximumP95Ms: 400, minimumSamples: 100 },
  warmPageTransitionBackendMs: { maximumP95Ms: 250, minimumSamples: 100 },
};

export const ORDERS_FLAG_MATRIX = [
  { compactMap: true, pagination: true, selectionSnapshots: true },
  { compactMap: false, pagination: true, selectionSnapshots: true },
  { compactMap: true, pagination: true, selectionSnapshots: false },
  { compactMap: false, pagination: true, selectionSnapshots: false },
  { compactMap: true, pagination: false, selectionSnapshots: true },
  { compactMap: false, pagination: false, selectionSnapshots: true },
  { compactMap: true, pagination: false, selectionSnapshots: false },
  { compactMap: false, pagination: false, selectionSnapshots: false },
];

export function percentile(values, quantile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(quantile) || quantile <= 0 || quantile > 1) {
    throw new RangeError("quantile must be greater than zero and at most one");
  }

  const sortedValues = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .toSorted((left, right) => left - right);
  if (sortedValues.length !== values.length) return null;

  return sortedValues[Math.ceil(sortedValues.length * quantile) - 1];
}

function evaluateCohort(samples, slo) {
  const normalizedSamples = Array.isArray(samples) ? samples : [];
  const durationSamples = normalizedSamples.filter(
    (sample) => Number.isFinite(sample) && sample >= 0,
  );
  const failedSampleCount = normalizedSamples.length - durationSamples.length;
  const p95Ms = failedSampleCount === 0 ? percentile(durationSamples, 0.95) : null;
  const reasons = [];

  if (normalizedSamples.length < slo.minimumSamples) {
    reasons.push("insufficient_samples");
  } else if (p95Ms === null) {
    reasons.push("p95_unavailable_due_to_failed_sample");
  } else if (p95Ms > slo.maximumP95Ms) {
    reasons.push("p95_exceeds_slo");
  }

  return {
    failedSampleCount,
    maximumP95Ms: slo.maximumP95Ms,
    minimumSamples: slo.minimumSamples,
    p95Ms,
    reasons,
    sampleCount: normalizedSamples.length,
    pass: reasons.length === 0,
  };
}

function flagCaseKey(value) {
  return [value?.pagination, value?.selectionSnapshots, value?.compactMap]
    .map((flag) => flag === true ? "1" : flag === false ? "0" : "?")
    .join("");
}

function expectedFlagState(input) {
  return {
    autoSyncOrdersOnLoad: false,
    canonicalFirst: true,
    compactMap: input.pagination && input.compactMap,
    mountSync: false,
    pagination: input.pagination,
    selectionSnapshots: input.pagination && input.selectionSnapshots,
    shopifyFullScan: false,
  };
}

function matchesFlagState(observed, expected) {
  return Object.entries(expected).every(([key, value]) => observed?.[key] === value);
}

export function evaluateOrdersFlagMatrix(input) {
  const suppliedCases = Array.isArray(input?.cases) ? input.cases : [];
  const suppliedByKey = new Map(
    suppliedCases.map((entry) => [flagCaseKey(entry), entry]),
  );
  const cases = ORDERS_FLAG_MATRIX.map((flags) => {
    const key = flagCaseKey(flags);
    const supplied = suppliedByKey.get(key);
    const pass = Boolean(supplied) && matchesFlagState(
      supplied.observed,
      expectedFlagState(flags),
    );
    return { key, pass, reasons: pass ? [] : [supplied ? "unexpected_effective_flags" : "missing_case"] };
  });
  const hasExactlyEightUniqueCases = suppliedCases.length === 8 && suppliedByKey.size === 8;
  const rollbackExpected = expectedFlagState({
    compactMap: false,
    pagination: false,
    selectionSnapshots: false,
  });
  const rollbackPass = matchesFlagState(input?.rollback?.observed, rollbackExpected) &&
    input?.rollback?.canonicalSource === "canonical_unpaged";
  const reasons = [];

  if (!hasExactlyEightUniqueCases) reasons.push("flag_matrix_must_have_eight_unique_cases");
  if (!rollbackPass) reasons.push("unsafe_canonical_rollback");

  return {
    pass: reasons.length === 0 && cases.every((entry) => entry.pass),
    reasons,
    rollback: { pass: rollbackPass },
    cases,
  };
}

export function evaluateOrdersPerformance(input) {
  const cohorts = Object.fromEntries(
    Object.entries(ORDERS_PERFORMANCE_SLOS).map(([name, slo]) => [
      name,
      evaluateCohort(input?.cohorts?.[name], slo),
    ]),
  );

  const flagMatrix = evaluateOrdersFlagMatrix(input?.flagMatrix);

  return {
    schemaVersion: 1,
    pass: Object.values(cohorts).every((cohort) => cohort.pass) && flagMatrix.pass,
    cohorts,
    flagMatrix,
  };
}

async function main() {
  const inputPath = resolve(
    process.argv[2] ?? ".omx/perf/orders-performance-cohorts.json",
  );
  const outputPath = resolve(
    process.argv[3] ?? ".omx/perf/orders-performance-gate.json",
  );
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const report = evaluateOrdersPerformance(input);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (!report.pass) {
    throw new Error(`Orders performance gate failed; report: ${outputPath}`);
  }

  console.log(`Orders performance gate passed; report: ${outputPath}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
