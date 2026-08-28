# Frontière runtime / dépôt candidat — historique et finition premium

Le résultat ci-dessous était exact au moment de la promotion `8e91ed0c`. Il ne décrit pas la finition premium ; la nouvelle frontière runtime et sa reconstruction exacte sont enregistrées ensuite.

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

Verdict historique avant la vérification Vercel ultérieure : `VERIFICATION_SEULEMENT`.

## Finition premium — runtime déployé

Runtime candidat et Production : `f53b7aed0d25e45aed26dfe96a0ed8c271365218`

Tree : `219d288b238715c8e734359c03f534d26dc72eba`

Base Production précédente : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`

Diff runtime exact depuis la base Production précédente :

```text
M package.json
M src/app/research-form.tsx
M src/app/styles.css
A src/domain/conflict-comparison.ts
M src/domain/runtime-invariants.ts
M src/server/ai/providers.ts
M src/server/research/numeric-normalization.ts
M src/server/research/service.ts
```

`package.json` ajoute uniquement la gate propriétaire `verify:vercel`, déjà présente au HEAD initial de cette mission. Les sept chemins `src/**` portent la finition UI, le terminal annulation/erreur et le durcissement CONFLIT ; aucune dépendance ni lockfile ne change.

Le dry-run officiel Vercel a produit 44 entrées dont 40 fichiers réguliers, `framework=nextjs` et 651 575 octets utiles. Le manifeste enregistré ne conserve que les 40 fichiers réguliers, des chemins `/` relatifs et aucune racine locale. Une reconstruction temporaire de ces 40 fichiers, après suppression des noms de variables fournisseur du processus, a réussi l’installation figée hors ligne et le build Production exact. Le temporaire a été supprimé.

Verdict premium : `DEPLOIEMENT_REQUIS_ET_RECONSTRUIT`.
