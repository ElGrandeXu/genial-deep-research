# Smoke live Production post-release

Verdict : `POST_RELEASE_LIVE_SMOKE_FAIL`

Date UTC : `2026-08-28T16:07:01.104Z`

Production : <https://genial-deep-research.vercel.app>

Déploiement : `dpl_4AaBdE1cQhuocuGnaiDDAaYKqJpz` (`READY`)

Preview source : `dpl_GE1Zk1cvuyYmRBuYEF4ufbFEAy4V`

Runtime : `f53b7aed0d25e45aed26dfe96a0ed8c271365218`

## Exécution

Entrée exacte : `company` · `GENIAL` · `Agence IA générative, Bordeaux, site officiel wearegenial.com`.

Une soumission réelle a été effectuée depuis l’interface publique Production, à `1440 × 1000`. Le serveur a admis le POST `/api/research` (`200`), appelé OpenAI une fois, exécuté une recherche Web, vérifié cinq récupérations de source et enregistré un terminal serveur `completed` en `15 980 ms`. Reçu : [`terminal-receipt.json`](post-release-smoke/terminal-receipt.json).

Coût séparé : `0,0142808 USD`, inférieur à `0,10 USD`. Usage : `15 499` tokens. Sources serveur : `1`.

## Motif d’échec

Le collecteur Playwright n’a pas pu récupérer le corps SSE terminé après la réponse. Il s’est arrêté sans resoumission. Le dossier terminal assaini, la chronologie SSE reçue par le client, le rendu terminal, les faits affichés, l’ouverture des sources, les diagnostics console/réseau complets et le screenshot final ne sont donc pas prouvés. Le reçu serveur ne suffit pas à valider la chaîne end-to-end demandée.

Observation assainie : [`attempt-observation.json`](post-release-smoke/attempt-observation.json). Aucun log brut n’est conservé.

## Portée

- Smoke post-release distinct du benchmark historique.
- Une seule tentative sémantique ; un seul appel fournisseur ; aucun retry.
- Aucun cherry-pick.
- Résultat conservé quel qu’il soit.
- Coût séparé des `0,1205530 USD` historiques ; aucune modification des cinq cas.
- Aucune validation live de CONFLIT revendiquée.
- Aucun changement produit, runtime, UI, PDF, configuration, dépendance ou Vercel.
