# Acceptation M0 à M4

## Critères observables

- [x] **FAIT VALIDÉ** — Répertoire courant, shell, versions utiles et racines Git observés.
- [x] **FAIT VALIDÉ** — Doctrine EGX applicable identifiée par chemins et chargement effectif vérifié localement.
- [x] **FAIT VALIDÉ** — Inventaire initial de GENIAL limité aux trois sources et deux passations exclues.
- [x] **FAIT VALIDÉ** — Trois SHA-256 conformes aux valeurs externes avant toute mutation.
- [x] **FAIT VALIDÉ** — Frontière Git indépendante : racine exacte GENIAL, aucun parent Git, aucun remote.
- [x] **FAIT VALIDÉ** — Six fichiers de capsule présents et lisibles.
- [x] **FAIT VALIDÉ** — Sources protégées contre la normalisation et contrôlées octet par octet.
- [x] **FAIT VALIDÉ** — Passations exclues, présentes localement, ignorées et non suivies.
- [x] **FAIT VALIDÉ** — Contrôle de secrets versionné, actif avant le premier ajout Git et expurgé.
- [x] **FAIT VALIDÉ** — Aucun code applicatif, dépendance, stack, interface, API, remote ou déploiement.
- [x] **FAIT VALIDÉ** — Premier commit atomique soumis aux contrôles versionnés.

## Jalons G0 à G7

- [x] **G0 — Poste opérationnel.** **FAIT VALIDÉ** — Session lancée depuis le workspace canonique ; racine EGX Settings résolue par marqueur ; doctrine chargée prouvée par `codex debug prompt-input` ; PowerShell, Git et Codex disponibles. L'ancienne migration laptop est obsolète et n'a pas été exécutée.
- [x] **G1 — Mission intronisée.** **FAIT VALIDÉ** — M0 et M1 sont validés, M1 a été audité extérieurement, les ressources API et clés étaient opérationnelles le 26 août 2026, et la contingence calendrier traite vendredi 28 août comme échéance opérationnelle la plus contraignante sans la présenter comme deadline contractuelle. Aucune réponse d’Antonin ne bloque la suite autorisée.
- [x] **G2 — Contrat produit figé.** **FAIT VALIDÉ** — Périmètre, entrée, sortie, affirmation-preuve, sources, conflits, silence, péremption et erreurs sont figés ; schéma, six fixtures et vérificateur avec cinq mutations négatives sont verts.
- [ ] **G3 — Boucle verticale en ligne.** **FAIT VALIDÉ — PARTIEL, NON VALIDÉ** : socle M3 public sur Vercel, mais aucune recherche métier, attente longue, provenance réelle ni dossier contractuel.
- [ ] **G4 — Noyau digne de confiance.** **FAIT VALIDÉ — NON COMMENCÉ**.
- [ ] **G5 — Qualité mesurée.** **FAIT VALIDÉ — NON COMMENCÉ**.
- [ ] **G6 — Release candidate.** **FAIT VALIDÉ — NON COMMENCÉ**.
- [ ] **G7 — Livraison.** **FAIT VALIDÉ — NON COMMENCÉ**.

Une case vide ne peut être cochée que par une mission ultérieure explicitement autorisée et munie de preuves observables.

## Critères observables M1

- [x] **FAIT VALIDÉ** — Baseline exacte revalidée avant mutation ; M0, intégrité, secrets, exclusions et absence de remote conformes.
- [x] **FAIT VALIDÉ** — Deux entrées DPAPI présentes et structurellement valides sans exposition de valeur.
- [x] **FAIT VALIDÉ** — Deux inventaires authentifiés conservés : 132 modèles OpenAI, 50 modèles Gemini.
- [x] **FAIT VALIDÉ** — Une génération structurée et une recherche réussies chez chaque fournisseur.
- [x] **FAIT VALIDÉ** — Recherche prouvée par métadonnées fournisseur, citations et URLs ; aucune plausibilité textuelle utilisée comme preuve.
- [x] **FAIT VALIDÉ** — Quatre appels de génération, aucun retry, coût conservateur estimé à 0,04687090 USD.
- [x] **FAIT VALIDÉ** — Aucun secret, header d'authentification, choix de stack, architecture, interface ou hébergement conservé.

## Critères observables M2

- [x] **FAIT VALIDÉ** — Baseline exacte confirmée ; la divergence du contrôle M0 était limitée à son allowlist M0 figée, devenue obsolète avec les trois artefacts M1 suivis, puis corrigée sans relâcher les invariants M0.
- [x] **FAIT VALIDÉ** — Contrat produit et vérité canonique indépendant d’une stack, avec statuts d’autorité explicites et matrice de traçabilité au brief.
- [x] **FAIT VALIDÉ** — HOMONYME, CONFLIT et SILENCE revendiqués ; PÉREMPTION transversale ; MARQUE et FILIALE non revendiqués.
- [x] **FAIT VALIDÉ** — JSON Schema valide couvrant demande, identité, sources, preuves, affirmations, inférences, contradictions, inconnues, exécution, reçu et état global.
- [x] **FAIT VALIDÉ** — Six fixtures exclusivement synthétiques portent les trois marqueurs anti-démo obligatoires.
- [x] **FAIT VALIDÉ** — Vérificateur sans dépendance accepte les six fixtures et rejette cinq mutations négatives en mémoire.
- [x] **FAIT VALIDÉ** — Vie privée figée : aucun compte, aucune persistance métier, données professionnelles publiques seulement, métriques minimales expurgées.
- [x] **FAIT VALIDÉ** — Aucun appel API, accès DPAPI, choix de fournisseur/modèle/stack, squelette, interface, hébergement, déploiement, donnée réelle ou travail M3.

## Critères observables M3

- [x] **FAIT VALIDÉ** — Baseline exacte, sources, secrets, M2, fixtures synthétiques, magasin externe et absence de remote confirmés avant mutation.
- [x] **FAIT VALIDÉ** — Versions stables et contraintes vérifiées depuis les documentations primaires et dist-tags npm du 26 août 2026.
- [x] **FAIT VALIDÉ** — Architecture minimale documentée avec frontières, provenance, fail-closed, streaming, secrets, déploiement et alternatives.
- [x] **FAIT VALIDÉ** — Next.js App Router, runtime Node, TypeScript strict, page de baseline et route de santé sans appel externe.
- [x] **FAIT VALIDÉ** — pnpm et lockfile uniques ; installation figée reproductible sans clé.
- [x] **FAIT VALIDÉ** — JSON Schema M2 canonique validé par Ajv ; types générés et dérive contrôlée ; invariants M2 inchangés.
- [x] **FAIT VALIDÉ** — Six fixtures acceptées dans leurs états attendus et cinq mutations négatives rejetées.
- [x] **FAIT VALIDÉ** — Vérificateurs séparés entre historique M0, invariants durables et état cumulatif courant.
- [x] **FAIT VALIDÉ** — Tests négatifs reproductibles : source modifiée, secret injecté, fixture invalide et fait sans preuve rejetés.
- [x] **FAIT VALIDÉ** — Lint, typecheck, Vitest et build de production verts sans clé.
- [x] **FAIT VALIDÉ** — Route de santé production testée localement ; réponse limitée à `{"status":"ok"}`.
- [x] **FAIT VALIDÉ** — Bundle client exempt de noms/formes de clés et endpoints fournisseur.
- [x] **FAIT VALIDÉ** — Audit complet et runtime : aucune vulnérabilité connue.
- [x] **FAIT VALIDÉ** — Aucun appel OpenAI/Gemini, accès DPAPI, recherche métier, donnée réelle, formulaire fonctionnel, remote ou déploiement.
- [x] **DÉCISION** — G0 à G2 préservés ; G3 non validé ; G4 à G7 non terminés.

## Critères observables M4

- [x] **FAIT VALIDÉ** — Baseline exacte, sources, passations, secrets, M0/M2/M3/cumulatif, install figée, lint, typecheck, tests, build, absence de remote et worktree propre confirmés avant déploiement.
- [x] **FAIT VALIDÉ** — Vercel CLI stable `59.6.2`, authentification existante, unique scope `team` Hobby et projet dédié sans intégration Git ni domaine personnalisé.
- [x] **FAIT VALIDÉ** — `.vercel` ignoré et non suivi ; frontière d’upload minimale avec schéma réellement importé et lanceur de build conservés.
- [x] **FAIT VALIDÉ** — Preview `READY`, HTTP 200 public sur `/` et `/api/health`, puis Production du même `deployedCommit` `READY`.
- [x] **FAIT VALIDÉ** — Node `24.x`, pnpm `11.24.0`, lockfile figé, Next `16.3.3`, builds de 33,407 s et 31,142 s.
- [x] **FAIT VALIDÉ** — Neuf chemins sensibles retournent 404 sans redirection ; HTML et assets exempts de clés, endpoints fournisseur, passations, autorités brutes, chemins Windows et identifiants Vercel sensibles.
- [x] **FAIT VALIDÉ** — Projet sans variable d’environnement ; appels OpenAI 0, Gemini 0, coût IA 0 USD, coût Vercel `UNKNOWN`.
- [x] **FAIT VALIDÉ** — Sources intactes, passations ignorées/non suivies/non lues, worktree final propre, aucun remote et vérificateur cumulatif incluant M4 vert.
- [x] **DÉCISION** — M4 valide l’infrastructure précoce seulement ; G3 reste partiel et non validé.
