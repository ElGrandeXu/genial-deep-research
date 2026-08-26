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
