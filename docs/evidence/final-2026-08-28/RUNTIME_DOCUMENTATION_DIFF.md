# Frontière runtime / dépôt candidat — preuve historique

Le résultat ci-dessous était exact au moment de la promotion `8e91ed0c`. Il ne décrit pas la finition premium : le nouveau diff runtime et sa reconstruction exacte sont enregistrés plus bas après validation.

Runtime Production promu : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`

Preview source : `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`

Production issue de la promotion : `dpl_147u62uYJuUU8x7hmioCsME3MJRF`

Le nettoyage du dépôt ne modifie aucun chemin runtime ou build fonctionnel. La comparaison porte exactement sur :

```text
src/**
docs/contracts/research-dossier.schema.json
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
next.config.ts
tsconfig.json
tools/run-next.mjs
```

Contrôle :

```powershell
$runtime = '8e91ed0c66765d5cab3bb8a8364cea04eaeda2af'
git diff --name-status $runtime -- src docs/contracts/research-dossier.schema.json package.json pnpm-lock.yaml pnpm-workspace.yaml next.config.ts tsconfig.json tools/run-next.mjs
```

Résultat historique :

```text
RUNTIME_DIFF = EMPTY
```

Les adaptations concernent uniquement la présentation des livrables, les preuves finales, les tests, les vérificateurs et les frontières d’exclusion du dépôt. Elles ne changent ni la route, ni le moteur de recherche, ni le contrat JSON, ni les dépendances, ni le build applicatif.

Verdict provisoire pour la vérification Vercel ultérieure : `VERIFICATION_SEULEMENT`.
