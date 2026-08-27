import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".vercel/**",
    "coverage/**",
    "next-env.d.ts",
    "src/domain/research-dossier.generated.ts",
  ]),
]);
