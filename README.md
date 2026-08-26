# Génial Deep Research

Socle technique public d’une future application de recherche sourcée. Le dépôt contient une application Next.js minimale, un endpoint de santé et l’intégration testable du contrat M2. Il ne contient encore ni formulaire fonctionnel, ni moteur de recherche, ni appel fournisseur, ni résultat de démonstration.

## Déploiement public précoce

- URL canonique : <https://genial-deep-research.vercel.app>
- santé : <https://genial-deep-research.vercel.app/api/health>
- preuve M4 : [`docs/evidence/M4_EARLY_DEPLOYMENT.md`](docs/evidence/M4_EARLY_DEPLOYMENT.md)

Ce déploiement valide uniquement le socle technique. La recherche métier et la capacité contractuelle finale ne sont pas disponibles ; G3 reste partiel et non validé.

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

`dev`, `build` et `start` désactivent la télémétrie Next.js via le lanceur local. Le vérificateur cumulatif exécute intégrité, secrets, contrats, tests négatifs, lint, typecheck, tests, build, scan du bundle client et vérification HTTP publique M4.

Pour omettre exceptionnellement le build, une justification est obligatoire :

```powershell
pwsh -NoProfile -File tools/verify-project.ps1 -SkipBuild -SkipBuildReason "raison vérifiable"
```

## Variables serveur attendues

```text
OPENAI_API_KEY
GEMINI_API_KEY
```

Les valeurs restent absentes de `.env.example`. Elles ne sont ni publiques ni requises au build. Leur validation n’intervient que lorsqu’un fournisseur serveur est explicitement instancié. Aucun nom `NEXT_PUBLIC_*` fournisseur n’est autorisé.

## État et limites

- page statique de baseline, sans interaction métier ;
- `GET /api/health` retourne uniquement `{"status":"ok"}` ;
- JSON Schema M2 canonique validé par Ajv et contrôlé par le vérificateur sémantique existant ;
- types TypeScript générés depuis le schéma, avec contrôle de dérive ;
- configuration fournisseur serveur préparée, jamais invoquée en M3 ;
- aucune variable fournisseur configurée sur Vercel et aucun appel IA pendant M4 ;
- aucune base, authentification, persistance métier, queue, télémétrie distante ou SDK d’hébergement ;
- aucune recherche métier n’existe encore ; G3 n’est pas validé.

Architecture et limites de déploiement : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
