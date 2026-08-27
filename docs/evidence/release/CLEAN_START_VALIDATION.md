# Validation depuis un clone propre

- Date : 27 août 2026
- Commit vérifié : `2ebcd946b4f842c1acc0f55dc050de3065eeb420`
- Clone local neuf : `C:\Users\maxer\AppData\Local\Temp\GENIAL-clean-start-20260827-205557`
- Origine : clone Git local avec `--no-local`, sans `node_modules`, `.next` ou fichier d’environnement hérité

Commandes et résultats :

| Contrôle | Résultat |
|---|---|
| `corepack pnpm install --frozen-lockfile` | OK, 396 paquets depuis le lockfile |
| `corepack pnpm lint` | OK, zéro avertissement |
| `corepack pnpm typecheck` | OK, contrat généré aligné et TypeScript strict |
| `corepack pnpm test` | OK, 7 fichiers et 395 tests |
| `corepack pnpm build` | OK, build Next.js 16.3.3 |
| `corepack pnpm start` | OK, processus de production local démarré sans clé |
| `GET /api/health` | HTTP 200, `status=ok` |
| `GET /` | HTTP 200 |

Le processus local a été arrêté immédiatement après les smokes. Aucun secret n’a été copié dans le clone.

Une première répétition a révélé que les reçus historiques mélangeaient volontairement fins de ligne LF et CRLF. Les attributs Git ont été précisés sans modifier leurs octets suivis ; le clone ci-dessus est la répétition verte après correction.
