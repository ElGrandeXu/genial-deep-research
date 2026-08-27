# GENIAL — instructions projet

Avant tout travail, lire et appliquer la doctrine canonique externe :
`C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\AGENTS.md` et les instructions auxquelles elle renvoie.

Lire ensuite `MISSION.md`, `INPUTS.md`, `ACCEPTANCE.md` et `HANDOFF.md`.
Les trois sources enregistrées dans `SOURCE_SHA256SUMS` sont immuables ; exécuter
`pwsh -NoProfile -File tools/verify-source-integrity.ps1` avant toute validation.
Ne jamais exposer de secret ni avancer au-delà de la mission explicitement autorisée.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
