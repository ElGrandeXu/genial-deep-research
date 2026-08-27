# Validation Production finale

Date : 2026-08-28

Alias public : <https://genial-deep-research.vercel.app>

Production : `dpl_147u62uYJuUU8x7hmioCsME3MJRF`

Preview validée : `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`

## Provenance de promotion

```text
target=production
readyState=READY
action=promote
originalDeploymentId=dpl_313tpsu8ngv5GveqmrhPh5YTCrzm
gitCommitSha=8e91ed0c66765d5cab3bb8a8364cea04eaeda2af
runtimeCommit=8e91ed0c66765d5cab3bb8a8364cea04eaeda2af
releaseGate=audit-01-final
gitDirty=<absent>
aliases=genial-deep-research.vercel.app, genial-deep-research-el-grande-xue.vercel.app
```

Vercel a créé le déploiement Production depuis la Preview exacte et conserve `originalDeploymentId`. L’environnement sensible Production est substitué pendant la promotion ; le commit source et le runtime restent identiques.

## Digests runtime Production

| Sortie | Digest | Runtime | Timeout |
|---|---|---|---:|
| `index` | `e158375df1980d5eaa035f2b1d05da076caf23f99a2cdd74a32a9779f80bd789` | `nodejs24.x` | 300 s |
| `api/health` | `7287507d4523878ddd94817f897bede63a62ce3bf149955ef96cc440ceafce15` | `nodejs24.x` | 5 s |
| `api/research` | `0060cdb33bec59abfe903b8070bf72e6737b5dbfd76a68795de2e439099274a1` | `nodejs24.x` | 180 s |

## Santé, gardes et non-divulgation

Commande :

```powershell
pwsh -NoProfile -File tools/verify-release-deployment.ps1 `
  -BaseUrl https://genial-deep-research.vercel.app
```

Sortie :

```text
{"base_url":"https://genial-deep-research.vercel.app","root_status":200,"health_status":200,"research_get_status":405,"guard_cases":5,"disclosure_paths":7,"assets_checked":10,"root_latency_ms":649.08,"health_latency_ms":1115.3}
RELEASE_DEPLOYMENT_VERIFY_OK: public, guarded, non-disclosing, bundle clean
```

Les cinq gardes distantes couvrent origine étrangère, type MIME incorrect, JSON invalide, champ inconnu et corps trop grand. Sept chemins sensibles répondent `404`. Dix assets plus le HTML ont été scannés : aucune forme de clé, endpoint fournisseur, autorité brute, passation ou donnée statique de démonstration.

En-têtes observés : CSP restrictive, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Santé : `200 {"status":"ok"}`.

## Indexation

- `/robots.txt` : `200`, `User-Agent: *`, `Allow: /`, host Production exact ;
- HTML : `<meta name="robots" content="index, follow">` ;
- titre : `GENIAL — Recherche publique vérifiable` ;
- description présente ; aucun `noindex`.

## Parcours navigateur et responsive

```text
PLAYWRIGHT_BASE_URL=https://genial-deep-research.vercel.app
Running 8 tests using 1 worker
8 passed (21.4s)
```

Les parcours interceptent l’API payante et couvrent complet, partiel 390 px, clarification, silence/panne, SSE fragmenté, annulation, incohérence masquée et 404. Aucun appel fournisseur.

Captures Production sans recherche payante :

- [`production-home-1440.png`](../../captures/final-2026-08-28/production-home-1440.png) — `clientWidth=scrollWidth=1440` ;
- [`production-home-390.png`](../../captures/final-2026-08-28/production-home-390.png) — `clientWidth=scrollWidth=390`.

## Conclusion

Promotion, alias, santé, gardes HTTP, indexation, navigateur, responsive et non-divulgation : **PASS**.
