import { readFile } from "node:fs/promises";

const REPORTS = [
  "docs/evidence/final-2026-08-28/lighthouse/desktop.report.json",
  "docs/evidence/final-2026-08-28/lighthouse/mobile-390.report.json",
];

const THRESHOLDS = {
  performance: 0.95,
  accessibility: 1,
  "best-practices": 1,
  seo: 0.95,
};

for (const path of REPORTS) {
  const report = JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
  if (report.runtimeError) {
    throw new Error(`${path}: runtimeError=${JSON.stringify(report.runtimeError)}`);
  }

  const scores = {};
  for (const [category, threshold] of Object.entries(THRESHOLDS)) {
    const score = report.categories?.[category]?.score;
    if (typeof score !== "number" || score < threshold) {
      throw new Error(`${path}: ${category}=${score ?? "missing"} < ${threshold}`);
    }
    scores[category] = Math.round(score * 100);
  }

  console.log(
    `LIGHTHOUSE_OK: ${path} ` +
      Object.entries(scores)
        .map(([category, score]) => `${category}=${score}`)
        .join(" "),
  );
}
