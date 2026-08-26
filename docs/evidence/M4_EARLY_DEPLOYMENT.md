# M4 — Déploiement Vercel précoce

## Décision

- **EXIGENCE EXPLICITE** — Prouver un premier déploiement public du socle M3 sans recherche métier, clé fournisseur ni appel OpenAI/Gemini.
- **DÉCISION** — Statut de mission : `M4_VALIDATED`.
- **DÉCISION** — Cette validation porte sur l’infrastructure de déploiement seulement. G3 reste partiel et non validé ; G4 à G7 restent non terminés.

## Baseline et contrôles locaux

- **FAIT VALIDÉ — 2026-08-26** — HEAD initial `9f3b92834918fe8c3182d7e51d26e33752a5340a`, titre `feat: establish application architecture baseline`, worktree propre, aucun remote et racine Git exacte `C:\Users\maxer\Desktop\GENIAL`.
- **FAIT VALIDÉ** — Les vérificateurs M0, M2, M3 et cumulatif, l’installation figée, lint, typecheck, 3 tests, build et scan du bundle ont réussi sans clé fournisseur.
- **FAIT VALIDÉ** — `engines.node` vaut `24.x`, `packageManager` vaut `pnpm@11.24.0`, le lockfile unique est `pnpm-lock.yaml` et Vercel CLI n’est pas une dépendance du projet.
- **FAIT VALIDÉ** — Les deux passations sont restées ignorées, non suivies et non lues.

## Documentation et compte Vercel

- **FAIT VALIDÉ — 2026-08-26** — Documentation officielle consultée : [déploiement CLI](https://vercel.com/docs/projects/deploy-from-cli), [link](https://vercel.com/docs/cli/link), [deploy](https://vercel.com/docs/cli/deploy), [inspect](https://vercel.com/docs/cli/inspect), [Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [durée des fonctions](https://vercel.com/docs/functions/configuring-functions/duration), [build](https://vercel.com/docs/builds/build-features) et [Deployment Protection](https://vercel.com/docs/deployment-protection).
- **FAIT VALIDÉ** — Version stable exacte résolue depuis le dist-tag npm : Vercel CLI `59.6.2`, utilisée via `pnpm dlx` sans modification des dépendances applicatives.
- **FAIT VALIDÉ** — Authentification existante exploitable, sans nouveau login et sans exposition de jeton, cookie ou identifiant personnel.
- **FAIT VALIDÉ** — Un seul scope utilisable : type `team`, plan `HOBBY`. Le type de compte ne permet pas un scope personnel distinct. Aucun scope payant ou ambigu n’a été choisi.

## Projet et frontière d’upload

- **FAIT VALIDÉ** — Aucun projet homonyme n’existait dans le scope retenu ; le projet dédié `genial-deep-research` a été créé.
- **FAIT VALIDÉ** — Framework Next.js, aucune intégration Git, aucun remote, aucun domaine personnalisé, aucune modification de facturation.
- **DÉCISION** — `.vercelignore` exclut autorités, passations, gouvernance, preuves, Git, `.vercel`, hooks, tests, outils non requis, caches, logs et fichiers `.env*`.
- **DÉCISION** — Deux exceptions de build restent uploadées : `docs/contracts/research-dossier.schema.json`, importé par TypeScript, et `tools/run-next.mjs`, invoqué par `pnpm run build`.
- **FAIT VALIDÉ** — Les déploiements réussis ont téléchargé 18 fichiers. Le projet Vercel contient 0 variable d’environnement, donc 0 nom OpenAI/Gemini.
- **FAIT VALIDÉ** — Vercel Node `24.x`, pnpm `11.24.0`, lockfile figé et Next.js `16.3.3` sont observés dans l’inspection du déploiement et les logs.
- **FAIT VALIDÉ** — Fluid Compute est activé dans la configuration de ressources du projet. La limite maximale de plateforme reste `UNKNOWN`; la route de santé déployée configure `maxDuration = 5` secondes.

## Commits et déploiements

| Rôle | Commit / déploiement | État | Mesure |
|---|---|---|---:|
| Préparation | `634d963496d6492eb53fada9296e6bc4a41fec75` | commit `chore: prepare early Vercel deployment` | — |
| Première tentative | `dpl_7h1UpTiSszCX9Hn2h84wANTjCiXp` | `ERROR`, cible Production imposée au premier déploiement | 32,706 s |
| Correction frontière | `0c4278a0d93ee5b5acb6c7aa3b926003ef4fd010` | commit `fix: include contract schema in Vercel upload` ; `deployedCommit` final | — |
| Preview | `dpl_AkVQZZ2MuMKis5AcR4DtM8878dPh` | `READY`, public | 33,407 s |
| Production | `dpl_nECpH2Kw7evgBhwQpLzUhaWmYc2m` | `READY`, public | 31,142 s |

- **FAIT VALIDÉ** — La première tentative a laissé le schéma importé hors upload et le typecheck distant a échoué. Le déploiement en erreur est conservé conformément à l’interdiction de suppression automatique.
- **DÉCISION** — La frontière a été corrigée par liste explicite des documents exclus, puis le nouveau HEAD a été déployé en Preview et en Production.
- **FAIT VALIDÉ** — Vercel a classé le tout premier déploiement d’un projet neuf en Production malgré la cible Preview explicite, conformément à sa documentation. La Preview réussie a été créée à la tentative suivante avant la Production réussie.
- **FAIT VALIDÉ** — La protection standard héritée produisait un HTTP 302 vers Vercel Authentication sur la Preview. La documentation prouve que ce réglage est géré par projet sur Hobby ; seule la protection du projet M4 a été désactivée. Aucun réglage d’équipe/global ni facturation n’a été modifié.

## URLs et vérification publique

- Preview : <https://genial-deep-research-fgnjwpd6k-el-grande-xue.vercel.app>
- Production immuable : <https://genial-deep-research-9fox16480-el-grande-xue.vercel.app>
- Production canonique : <https://genial-deep-research.vercel.app>

| Contrôle public sans authentification | Résultat |
|---|---|
| HTTPS et DNS canonique | conformes |
| `GET /` | HTTP 200, `text/html; charset=utf-8`, frontière « Baseline technique » présente |
| `GET /api/health` | HTTP 200, `application/json`, corps exact `{"status":"ok"}` |
| Latence `/`, 5 mesures | médiane 49,38 ms ; min 45,81 ms ; max 647,03 ms |
| Latence `/api/health`, 5 mesures | médiane 167,03 ms ; min 145,61 ms ; max 467,19 ms |
| Assets publics | 7 contrôlés, tous HTTP 200 |
| Logs runtime Production | 12 entrées, toutes HTTP 200/info, aucun 5xx ni forme de secret |

Les neuf chemins de non-divulgation demandés ont tous retourné HTTP 404 sans redirection : `/.env`, `/.env.local`, `/.git/config`, `/SOURCE_SHA256SUMS`, les trois sources d’autorité et les deux noms de passation. Le HTML et les assets ne contiennent aucun nom ou forme de clé fournisseur, endpoint fournisseur, nom/empreinte/extrait brut d’autorité, nom de passation, chemin Windows, identifiant projet/équipe Vercel ni marqueur d’authentification. Un identifiant public de déploiement `dpl_*`, exigé comme preuve non sensible, est présent dans un bundle et accepté.

## Usage, coûts et limites

- **FAIT VALIDÉ** — Appels OpenAI : 0 ; appels Gemini : 0 ; accès DPAPI : 0 ; recherche métier : 0.
- **FAIT VALIDÉ** — Coût IA M4 : exactement `0 USD`.
- **FAIT VALIDÉ** — Plan Vercel observé : `HOBBY`. Coût Vercel réel : `UNKNOWN`, faute de preuve d’usage facturé.
- **DÉCISION** — Aucun résultat de démonstration ni capacité finale n’est revendiqué. G0 à G2 restent validés ; G3 reste partiel et non validé ; G4 à G7 restent non terminés.

Résultat machine : [`m4-early-deployment-result.json`](m4-early-deployment-result.json).
