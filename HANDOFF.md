# Handoff M5 R1 bloqué par le contrat de vérité

## Reprise sûre

- **FAIT VALIDÉ** — HEAD reste `b3a313e5c0333d62bbbd6d2c6c0206a370a15a34` ; aucun commit M5 ; worktree modifié avec candidat et preuves d’échec.
- **FAIT VALIDÉ** — Un appel OpenAI réel, Gemini 0, aucun retry ; `accepted → searching → validating → failed`.
- **DÉCISION** — Ne pas refaire d’appel réel sans nouvelle autorisation : l’échec n’était pas transitoire prouvé.
- **FAIT VALIDÉ** — Aucune règle WAF, variable Vercel ou mutation Production ; baseline M4 canonique toujours `READY`.
- **FAIT VALIDÉ** — Quatre Preview accidentelles du baseline M4 sont consignées dans la preuve M5 et n’ont pas été supprimées.
- **DÉCISION** — G0–G2 validés ; G3 partiel ; G4–G7 non terminés.
- **FAIT VALIDÉ** — R1 hors réseau : observabilité d’échec réparée, 38 tests verts, aucun appel fournisseur, accès DPAPI, déploiement ou commit.
- **FAIT VALIDÉ** — Cause exacte du premier échec toujours `UNKNOWN`; aucun timeout, statut API, défaut de citation ou rejet de schema ne lui est attribué.
- **DÉCISION** — `M5_R1_BLOCKED_TRUTH_CONTRACT` : les métadonnées disponibles ne contiennent aucun extrait du contenu source exigé par M2.

## État exact

- **FAIT VALIDÉ** — Dépôt Git indépendant initialisé à la racine de GENIAL.
- **FAIT VALIDÉ** — M0 à M2 restent valides ; M3 a établi la baseline locale et M4 son premier déploiement public.
- **FAIT VALIDÉ** — Worktree attendu propre après le commit de preuve M4, hormis `.vercel` et les deux passations présentes et ignorées.
- **FAIT VALIDÉ** — Sources intactes ; manifeste et contrôles locaux actifs ; aucun remote.
- **FAIT VALIDÉ** — Next.js App Router, TypeScript strict, runtime Node, page de baseline, santé, tests et build sans secrets sont versionnés.
- **FAIT VALIDÉ** — Contrat canonique, JSON Schema, six fixtures synthétiques, types générés, Ajv et vérificateur M2 sont cohérents.
- **FAIT VALIDÉ** — Six fixtures passent et cinq mutations négatives sont rejetées en mémoire.
- **FAIT VALIDÉ** — Vérificateur cumulatif, tests négatifs, audit de dépendances, scan du bundle client et vérification HTTP publique sont verts.
- **FAIT VALIDÉ** — `deployedCommit` `0c4278a0d93ee5b5acb6c7aa3b926003ef4fd010` ; Preview et Production `READY` ; URL canonique <https://genial-deep-research.vercel.app>.
- **FAIT VALIDÉ** — Projet Vercel `genial-deep-research`, scope `team` Hobby, aucune variable fournisseur, intégration Git ou domaine personnalisé.
- **FAIT VALIDÉ** — G0, G1 et G2 validés ; G3 partiel et non validé ; G4 à G7 non terminés.

## Inconnues

- **FAIT VALIDÉ** — Deadline contractuelle exacte non confirmée.
- **FAIT VALIDÉ** — Quotas futurs, expiration effective des accès et disponibilité ultérieure restent variables.
- **FAIT VALIDÉ** — Qualité métier, comportement réel de l’adaptateur AI SDK, limite maximale de plateforme, durée de recherche et résolution des sources ne sont pas prouvés par M4.
- **FAIT VALIDÉ** — Plan Vercel Hobby et Fluid Compute activé sont observés ; coût Vercel réel reste `UNKNOWN`.
- **FAIT VALIDÉ** — MARQUE et FILIALE non revendiqués ; accès au contenu source, résolution des redirections et qualité sur requêtes inconnues non prouvés.

## Interdictions toujours actives

- **DÉCISION** — Ne pas lire les passations obsolètes ni les utiliser comme preuve de progrès.
- **DÉCISION** — Ne pas modifier les trois sources d'autorité.
- **DÉCISION** — Ne jamais afficher, journaliser, versionner ou transporter un secret ; le magasin DPAPI reste local et non livrable.
- **DÉCISION** — Ne réaliser aucun appel fournisseur, moteur, route de recherche, fallback Gemini, donnée réelle ou nouveau déploiement sans mission ultérieure explicite.
- **DÉCISION** — Ne pas transformer les fixtures en démonstration ou sorties applicatives.
- **DÉCISION** — Ne pas présenter M4 comme validation de G3 ou de l’application contractuelle finale.

## Gate

**DÉCISION — Aucun nouveau probe réel avant une architecture fournissant un extrait source authentique avec locator, puis audit externe du candidat hors réseau.**
