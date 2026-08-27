# Résultat M0

- **FAIT VALIDÉ** — GENIAL est une frontière Git locale indépendante dont la racine est exactement `C:\Users\maxer\Desktop\GENIAL`.
- **FAIT VALIDÉ** — Les trois sources d'autorité correspondent aux empreintes externes et restent inchangées.
- **FAIT VALIDÉ** — Les deux passations obsolètes restent présentes localement, ignorées, non lues et non suivies.
- **FAIT VALIDÉ** — La capsule M0, les protections Git, les contrôles reproductibles et l'overlay d'instructions projet sont versionnés.
- **FAIT VALIDÉ** — G0 est validé ; G1 est partiel et non terminé ; G2 à G7 ne sont pas commencés.
- **FAIT VALIDÉ** — Aucun résultat produit, choix de stack, dépendance, appel API, interface, hébergement, remote ou déploiement n'existe.
- **DÉCISION** — Le hash du commit M0 est obtenu sans ambiguïté par `git rev-parse HEAD` ; le document inclus dans ce commit ne tente pas de contenir son propre identifiant.

## Résultat M1 — 2026-08-26

- **FAIT VALIDÉ** — Statut `M1_VALIDATED`.
- **FAIT VALIDÉ** — Les clés OpenAI et Gemini sont présentes et authentifiées sans valeur exposée.
- **FAIT VALIDÉ** — Inventaires réels : 132 modèles OpenAI et 50 modèles Gemini.
- **FAIT VALIDÉ** — `gpt-5.6-luna` et `gemini-2.5-flash-lite` ont chacun réussi une sortie structurée validée et une recherche réellement exécutée avec citations, URLs et usage.
- **FAIT VALIDÉ** — Six appels HTTP, dont quatre générations, aucun retry ; coût conservateur estimé : 0,04687090 USD.
- **FAIT VALIDÉ** — Preuves : `docs/evidence/M1_API_CAPABILITIES.md` et `docs/evidence/m1-api-capabilities-result.json`.
- **DÉCISION** — G1 reste partiel et non terminé ; G2 à G7 restent non terminés.
- **DÉCISION** — Aucune stack, architecture, interface ou solution d'hébergement n'a été choisie.

## Résultat M2 — 2026-08-26

- **FAIT VALIDÉ** — Statut `M2_VALIDATED`.
- **FAIT VALIDÉ** — `docs/PRODUCT_TRUTH_CONTRACT.md` fige utilisateur, entrée, identité, sortie, états, attente, vérité, sources, conflits, silence, temporalité, périmètre et vie privée.
- **FAIT VALIDÉ** — `docs/contracts/research-dossier.schema.json` et `docs/contracts/contract-fixtures.json` matérialisent le contrat sans stack ni données réelles.
- **FAIT VALIDÉ** — `tools/verify-m2-contract.ps1` accepte six fixtures et rejette cinq mutations négatives temporaires en mémoire.
- **DÉCISION** — G1 et G2 sont validés ; G3 à G7 restent non terminés.
- **DÉCISION** — Aucun fournisseur, modèle, stack, architecture, interface ou hébergement n’est choisi ; aucun appel API ou accès DPAPI n’a eu lieu.

## Résultat M3 — 2026-08-26

- **FAIT VALIDÉ** — Statut `M3_VALIDATED` sous réserve de l’audit externe demandé avant M4.
- **FAIT VALIDÉ** — `docs/ARCHITECTURE.md` formalise Next.js App Router, runtime Node, AI SDK direct, OpenAI primaire initial, Gemini différé, contrat canonique, streaming et cible Vercel.
- **FAIT VALIDÉ** — Baseline locale compilable : page explicitement technique, santé non sensible, TypeScript strict, lint, tests et build sans secrets.
- **FAIT VALIDÉ** — Les six fixtures M2 passent Ajv et le vérificateur sémantique ; types dérivés sans seconde définition canonique.
- **FAIT VALIDÉ** — Vérificateur cumulatif et tests négatifs protègent sources, secrets, fixtures et faits sans preuve.
- **FAIT VALIDÉ** — Aucun appel fournisseur, accès DPAPI, recherche métier, donnée réelle, formulaire fonctionnel, remote ou déploiement.
- **DÉCISION** — G0 à G2 restent validés ; G3 n’est pas validé ; G4 à G7 restent non terminés.

## Résultat M4 — 2026-08-26

- **FAIT VALIDÉ** — Statut `M4_VALIDATED` pour l’infrastructure de déploiement précoce.
- **FAIT VALIDÉ** — Projet Vercel dédié `genial-deep-research`, scope `team` Hobby, aucune intégration Git, variable fournisseur ou facturation modifiée.
- **FAIT VALIDÉ** — `deployedCommit` `0c4278a0d93ee5b5acb6c7aa3b926003ef4fd010` déployé en Preview puis Production `READY`.
- **FAIT VALIDÉ** — Production canonique publique : <https://genial-deep-research.vercel.app> ; `/` et `/api/health` retournent HTTP 200 sans authentification.
- **FAIT VALIDÉ** — Neuf chemins sensibles retournent 404 sans redirection ; bundles et logs ne contiennent aucune forme de clé ou donnée d’autorité brute.
- **FAIT VALIDÉ** — Appels OpenAI 0, appels Gemini 0, coût IA 0 USD, coût Vercel `UNKNOWN`.
- **DÉCISION** — G0 à G2 restent validés ; G3 reste partiel et non validé ; G4 à G7 restent non terminés.

## Résultat M5 — 2026-08-26

- **FAIT VALIDÉ** — Statut `M5_FAILED_LOCAL_LIVE`.
- **FAIT VALIDÉ** — Candidat local OpenAI-only implémenté et 16 tests hors réseau verts ; aucun commit M5 créé.
- **FAIT VALIDÉ** — Le probe réel a produit `accepted → searching → validating → failed` après un appel HTTP OpenAI ; Gemini 0 ; aucun retry.
- **FAIT VALIDÉ** — La première version du probe n’a pas sérialisé le reçu d’échec ; cause exacte, usage, coût, affirmation et source restent inconnus.
- **DÉCISION** — Aucun second appel, WAF, secret Production ou déploiement M5 ; Production M4 inchangée.
- **DÉCISION** — G0 à G2 restent validés ; G3 reste partiel ; G4 à G7 restent non terminés.

## Résultat M5 R1 — 2026-08-26

- **FAIT VALIDÉ** — Statut `M5_R1_BLOCKED_TRUTH_CONTRACT`.
- **FAIT VALIDÉ** — La cause racine du premier appel reste inconnue ; seule sa position pendant ou après `validating` est prouvée.
- **FAIT VALIDÉ** — Reçu d’échec expurgé, terminal unique, fallback de sérialisation, repli mémoire et écriture atomique du probe sont couverts hors réseau.
- **FAIT VALIDÉ** — Replay M1 lisible par l’adaptateur, mais incomplet pour M2 : aucun extrait source, titre ou offsets conservés.
- **FAIT VALIDÉ** — 38 tests verts ; OpenAI 0, Gemini 0, DPAPI 0, déploiement 0, commit 0 pendant R1.
- **DÉCISION** — Aucun probe réel : ajouter une provenance d’extrait source authentique avant toute nouvelle tentative.
