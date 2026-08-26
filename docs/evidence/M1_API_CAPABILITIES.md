# M1 — Audit réel des capacités API

Date d'observation : **2026-08-26**

Statut : **M1_VALIDATED**

Jalon : **G1 reste partiel et non terminé** ; G2 à G7 restent non terminés.

## Baseline revalidée avant mutation

- Racine Git : `C:\Users\maxer\Desktop\GENIAL`.
- HEAD initial : `48fd09af8759e59be19e3d06ebe18dc4a3521a5f`.
- Worktree propre ; aucun remote.
- `SOURCE_INTEGRITY_OK: 3 files` avant mutation.
- `SECRET_SCAN_OK: mode=Tracked files=18` avant mutation.
- `M0_VERIFY_OK` avant mutation.
- Les deux passations obsolètes étaient présentes, ignorées, non suivies et n'ont pas été lues.

## Magasin local

- Magasin DPAPI : fichier présent, extérieur à GENIAL, importable par le compte Windows courant.
- Contenu structurel validé : exactement deux `PSCredential`, nommés `OPENAI_API_KEY` et `GEMINI_API_KEY`, avec `SecureString` non vide.
- États autorisés : `OPENAI_API_KEY=PRESENT`, `GEMINI_API_KEY=PRESENT`.
- Le magasin reste extérieur, non suivi et réservé au probe local. Il n'est pas une dépendance livrable ; les futurs secrets applicatifs restent un sujet serveur séparé.
- Aucune valeur, empreinte, partie de valeur ou en-tête d'authentification n'est conservé.

## Documentation officielle consultée

Constats datés du **2026-08-26** :

### OpenAI

- Inventaire : [`GET /v1/models`](https://developers.openai.com/api/reference/resources/models).
- Génération : [`POST /v1/responses`](https://developers.openai.com/api/reference/resources/responses/methods/create), avec statut applicatif et compteurs `usage` dans la réponse.
- Sorties structurées : [`text.format` avec `type=json_schema` et `strict=true`](https://developers.openai.com/api/docs/guides/structured-outputs).
- Recherche : outil [`web_search`](https://developers.openai.com/api/docs/guides/tools-web-search). Une exécution est prouvable par un item `web_search_call`; les annotations `url_citation` portent les citations et `include=["web_search_call.action.sources"]` expose les URLs consultées.
- Tarifs standard : [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna) à 0,20 USD/M token entrant et 1,20 USD/M token sortant ; [`web_search`](https://developers.openai.com/api/docs/pricing) à 10 USD/1 000 appels, plus les tokens de contexte de recherche au tarif modèle.
- Statut du modèle retenu : `gpt-5.6-luna` est catalogué **Default**, supporte Responses, Structured Outputs et Web Search, et n'est pas marqué Preview ou Deprecated dans la documentation consultée.

### Gemini

- Inventaire : [`GET /v1beta/models`](https://ai.google.dev/api/models), avec version et méthodes supportées.
- Génération : [`POST /v1beta/models/{model}:generateContent`](https://ai.google.dev/api/generate-content). La réponse peut exposer `usageMetadata`, `modelVersion` et `responseId`.
- Sorties structurées : [JSON Schema et MIME `application/json`](https://ai.google.dev/gemini-api/docs/structured-output).
- Recherche : outil [`google_search`](https://ai.google.dev/gemini-api/docs/generate-content/google-search). Une exécution est prouvable par `groundingMetadata.webSearchQueries`, `groundingChunks` et `groundingSupports`.
- Tarifs standard : [`gemini-2.5-flash-lite`](https://ai.google.dev/gemini-api/docs/pricing) à 0,10 USD/M token entrant et 0,40 USD/M token sortant. Grounding Google Search : 500 requêtes/jour gratuites sur free tier ; sur paid tier, 1 500 requêtes/jour gratuites puis 35 USD/1 000 prompts grounded. L'estimation conservatrice ne déduit aucun quota gratuit.
- Statut du modèle retenu : [`gemini-2.5-flash-lite`](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite) est **Stable** ; la [table de dépréciation](https://ai.google.dev/gemini-api/docs/deprecations) n'annonce aucune date d'arrêt. La variante `gemini-2.5-flash-lite-preview-09-2025` est arrêtée et n'a pas été appelée.
- La documentation actuelle étiquette le guide Generate Content comme « Legacy », mais l'endpoint REST reste documenté et a répondu pendant ce probe. Cela prouve l'accessibilité observée, pas un choix d'API futur.

## Inventaires réels

| Provider | Endpoint | HTTP | Latence | Modèles exposés | Modèle probe |
|---|---|---:|---:|---:|---|
| OpenAI | `GET /v1/models` | 200 | 1 485,1 ms | 132 | `gpt-5.6-luna` |
| Gemini | `GET /v1beta/models?pageSize=1000` | 200 | 233,8 ms | 50 | `gemini-2.5-flash-lite` ; version inventoriée `001` |

Inventaires complets et expurgés : [`m1-api-capabilities-result.json`](m1-api-capabilities-result.json).

Modèles pertinents réellement accessibles :

- OpenAI : `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`, ainsi que les familles GPT-5 antérieures listées dans le JSON.
- Gemini : `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.7-flash`, plus les modèles preview explicitement identifiés dans le JSON.
- Aucun modèle deep research n'a été appelé.

## Capacités observées

| Provider | Capacité | Demandé → retourné | HTTP / app | Schéma | Recherche prouvée | Citations | URLs | Usage | Latence | Coût estimé |
|---|---|---|---|---:|---:|---:|---:|---|---:|---:|
| OpenAI | Structured Outputs | `gpt-5.6-luna` → `gpt-5.6-luna` | 200 / `completed` | oui | n/a | 0 | 0 | 58 in, 21 out, 79 total | 2 965,5 ms | 0,00003680 USD |
| OpenAI | `web_search` | `gpt-5.6-luna` → `gpt-5.6-luna` | 200 / `completed` | n/a | oui : 1 `web_search_call` terminé | 1 | 17 | 8 593 in, 72 out, 8 665 total | 4 220,4 ms | 0,01180500 USD |
| Gemini | Structured Outputs | `gemini-2.5-flash-lite` → `gemini-2.5-flash-lite` | 200 / `STOP` | oui | n/a | 0 | 0 | 17 prompt, 19 out, 36 total | 1 418,1 ms | 0,00000930 USD |
| Gemini | `google_search` | `gemini-2.5-flash-lite` → `gemini-2.5-flash-lite` | 200 / `STOP` | n/a | oui : queries + chunks + support | 1 | 3 | 30 prompt, 42 out, 52 tool, 124 total | 1 867,6 ms | 0,03501980 USD |

Identifiants de réponse non sensibles :

- OpenAI Structured Outputs : `resp_0811e8a25057a93a006a8f09c8c0e487d290e3447d0a18af20`.
- OpenAI Web Search : `resp_01d8d2cb5b06e8a0006a8f09cae76087d2ba75a2d42948bde0`.
- Gemini Structured Outputs : `zwmPapzmA6WDxN8PlqjO4Q8`.
- Gemini Google Search : `0AmPauTZHNL2xN8PnOrQ2Qo`.

Preuves URL :

- Citation OpenAI directe : `https://www.toureiffel.paris/en/news/events/eiffel-tower-turns-120?utm_source=openai`.
- Domaines OpenAI : `www.toureiffel.paris`, `sete.toureiffel.paris`.
- Gemini : trois URLs de redirection grounding exploitables, domaine `vertexaisearch.cloud.google.com`, conservées intégralement dans le JSON.

Une réponse textuelle plausible n'a pas été utilisée comme preuve. La validation de recherche dépend uniquement des métadonnées fournisseur.

## Appels et coût

- Appels HTTP : **6** = 2 inventaires + 4 générations.
- Appels de génération : **4** = 2 OpenAI + 2 Gemini.
- Retry : **0**.
- Coût conservateur estimé : **0,04687090 USD**.
- Plafond théorique configuré : **0,60 USD**, inférieur au plafond contractuel de 1 USD.
- Sorties courtes ; OpenAI `reasoning.effort=none` ; Gemini 2.5 Flash-Lite avec comportement de thinking par défaut ; aucun background job, benchmark, test de charge ou raisonnement élevé.

## Décision

`M1_VALIDATED` : deux clés présentes et authentifiées ; une génération réussie chez chaque fournisseur ; deux sorties structurées validées ; deux recherches réellement exécutées avec citations, URLs et usage ; latence et coût observables ; inventaires conservés ; aucune fuite détectée.

G1 reste **partiel et non terminé** uniquement parce que la deadline contractuelle exacte demeure inconnue et que l'audit externe M1 reste le gate suivant. Aucune stack, architecture, interface ou solution d'hébergement n'a été choisie. G2 à G7 restent non terminés.

## Risques résiduels

- Quotas et disponibilité dépendent des comptes, tiers et politiques fournisseur ; l'inventaire prouve l'accès au moment du probe seulement.
- Les alias et modèles peuvent évoluer ou expirer ; revalider inventaire, prix et dépréciations avant usage produit.
- Les URLs Gemini sont des redirections de grounding Google, pas des URLs éditeur directes.
- Deadline contractuelle exacte toujours non confirmée ; cible interne inchangée : 2026-08-28.
