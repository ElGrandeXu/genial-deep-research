# Génial Deep Research

Candidat local d’une boucle verticale de recherche sourcée. Le worktree contient un formulaire, une route OpenAI/Web Search bornée, une affirmation maximale et un reçu mesuré. Le probe réel M5 a échoué fermé pendant la validation : ce candidat n’est ni commit, ni déployé, ni validé.

## Production publique inchangée

- URL canonique : <https://genial-deep-research.vercel.app>
- santé : <https://genial-deep-research.vercel.app/api/health>
- preuve M4 : [`docs/evidence/M4_EARLY_DEPLOYMENT.md`](docs/evidence/M4_EARLY_DEPLOYMENT.md)

La Production sert toujours la baseline M4. La recherche métier publique n’est pas disponible ; G3 reste partiel et non validé.

## Prérequis

- Node.js `24.x` ; version LTS de référence : `24.20.0` ;
- Corepack ;
- pnpm `11.24.0`, résolu depuis le champ `packageManager` ;
- PowerShell 7 pour les vérificateurs historiques et contractuels.

## Installation

```powershell
corepack pnpm install --frozen-lockfile
```

Le lockfile unique est `pnpm-lock.yaml`. L’installation n’exige aucune clé API.

## Commandes

```powershell
corepack pnpm dev
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm start
corepack pnpm verify
```

`dev`, `build` et `start` désactivent la télémétrie Next.js via le lanceur local. Sans secret, la page et le formulaire fonctionnent, mais une recherche valide se termine par une erreur de configuration explicite sans appel fournisseur. Le vérificateur cumulatif exécute intégrité, secrets, contrats, tests négatifs, frontières M3/M5, lint, typecheck, tests, build, scan du bundle client et vérification HTTP publique M4.

Pour omettre exceptionnellement le build, une justification est obligatoire :

```powershell
pwsh -NoProfile -File tools/verify-project.ps1 -SkipBuild -SkipBuildReason "raison vérifiable"
```

## Variables serveur attendues

```text
OPENAI_API_KEY
```

La valeur reste absente de `.env.example`. Elle n’est ni publique ni requise au build. Aucun nom `NEXT_PUBLIC_*` fournisseur n’est autorisé. Gemini n’appartient pas au runtime M5.

## État et limites

- formulaire local pour personnes et organisations publiques ;
- `GET /api/health` retourne uniquement `{"status":"ok"}` ;
- `POST /api/research` exige JSON same-origin, borne l’entrée, diffuse cinq états réels et échoue fermé ;
- OpenAI `gpt-5.6-luna`, Responses et Web Search constituent l’unique voie locale ; un appel HTTP et un outil maximum, aucun retry automatique, `store: false` ;
- JSON Schema M2 canonique validé par Ajv et contrôlé par le vérificateur sémantique existant ;
- types TypeScript générés depuis le schéma, avec contrôle de dérive ;
- aucune variable fournisseur configurée sur Vercel ; Production M4 inchangée ;
- aucune base, authentification, persistance métier, queue, télémétrie distante ou SDK d’hébergement ;
- une seule affirmation est visée ; aucun dossier complet, HOMONYME, CONFLIT ou SILENCE complet n’est revendiqué ;
- le premier probe réel M5 a échoué à la validation après un appel OpenAI ; aucun retry, WAF, secret Production ou déploiement M5 ; G3 n’est pas validé.

Architecture et limites de déploiement : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
