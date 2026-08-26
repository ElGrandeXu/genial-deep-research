import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(toolsDirectory);
const schemaPath = join(
  repositoryRoot,
  "docs",
  "contracts",
  "research-dossier.schema.json",
);
const outputPath = join(
  repositoryRoot,
  "src",
  "domain",
  "research-dossier.generated.ts",
);
const mode = process.argv[2];

if (mode !== "--write" && mode !== "--check") {
  throw new Error("Usage: node tools/contract-types.mjs <--write|--check>");
}

const bannerComment = `/*
 * Fichier généré depuis docs/contracts/research-dossier.schema.json.
 * Ne pas modifier directement : le JSON Schema M2 reste canonique.
 */`;
const generated = (
  await compileFromFile(schemaPath, {
    bannerComment,
    cwd: repositoryRoot,
    style: {
      singleQuote: false,
    },
  })
).replaceAll("\r\n", "\n");

if (mode === "--write") {
  await writeFile(outputPath, generated, "utf8");
  process.stdout.write("CONTRACT_TYPES_WRITTEN\n");
} else {
  let existing;
  try {
    existing = (await readFile(outputPath, "utf8")).replaceAll("\r\n", "\n");
  } catch {
    throw new Error("CONTRACT_TYPES_OUT_OF_DATE: generated file is missing");
  }
  if (existing !== generated) {
    throw new Error("CONTRACT_TYPES_OUT_OF_DATE: run pnpm contract:types");
  }
  process.stdout.write("CONTRACT_TYPES_OK\n");
}
