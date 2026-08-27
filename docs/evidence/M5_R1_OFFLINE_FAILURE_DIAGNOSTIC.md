# M5 R1 — diagnostic hors réseau

## Décision

- **FAIT VALIDÉ** — Le premier échec est intervenu pendant ou après `validating`. Cet événement n’est émis qu’après résolution de l’appel `provider.research` et adaptation du résultat fournisseur.
- **INCONNU** — La classe, le code, le statut HTTP, le message exact et la cause racine du premier échec n’ont pas été conservés.
- **DÉCISION** — L’observabilité d’échec est corrigée hors réseau. Le contrat M2 reste inchangé et échoue fermé lorsque l’extrait source manque.
- **DÉCISION** — Statut R1 : `M5_R1_BLOCKED_TRUTH_CONTRACT`. Aucun nouveau probe réel n’est justifié tant qu’une provenance d’extrait n’existe pas.

## Baseline préservée

- Racine Git : `C:\Users\maxer\Desktop\GENIAL`.
- HEAD : `b3a313e5c0333d62bbbd6d2c6c0206a370a15a34`, `docs: record early production deployment`.
- Remote : aucun. Index : vide. Worktree M5 : volontairement modifié et non commité.
- SHA-256 initial du diff textuel et binaire : `945180e11245a7d8baf93f30e9112d0cf1bf189ee42b3f5b277ccbcb36ae13a5`.
- Scans initiaux WorkingTree, Staged et Tracked : verts.

## Preuve immuable de l’essai 1

`docs/evidence/m5-attempt-001-failure.json` conserve seulement : tentative 1, `gpt-5.6-luna`, OpenAI 1, Gemini 0, retries 0, `accepted → searching → validating → failed`, aucun déploiement et l’empreinte SHA-256 de la preuve M5 originale.

Restent définitivement `UNKNOWN` : tool calls, usage, latence, coût, affirmation, source et erreur exacte. Aucun zéro ne remplace ces inconnues.

## Chemin causal

| Frontière | Synchrone | Promise | Flux | Validation / sérialisation | Effet antérieur possible |
|---|---|---|---|---|---|
| `POST /api/research` | parsing des headers, fabrique fournisseur, création du stream | lecture bornée du corps | annulation client | JSON d’entrée | aucune requête fournisseur avant acceptation |
| SSE | encodage et `enqueue` | exécution asynchrone du service | fermeture ou abandon client | `JSON.stringify` du terminal | terminal perdu dans l’ancienne voie si l’encodage levait |
| adaptateur OpenAI | chargement de clé, construction provider | `generateText` | consommation interne du provider | adaptation content/sources/usage | `APICallError`, `LoadAPIKeyError`, timeout, réseau, absence de sortie |
| génération | préparation prompt/options | réponse Responses | exécution Web Search provider | finish reason et usage | aucune donnée produit validée |
| métadonnées | lecture des formes installées | aucune | aucune | annotations, sources, tool calls, request ID | titre, offsets ou extrait absents |
| vérité | parse des deux lignes | aucune | aucune | atomicité, URL HTTPS, relation citation/source, extrait, schema M2 | rejet fermé |
| reçu | construction allowlistée | persistance injectée optionnelle | aucune | digest du request ID | repli mémoire si persistance échoue |
| terminal | sélection `completed` ou `failed` | livraison finale | client abandonné | fallback de sérialisation | exactement un terminal enregistré |
| probe | préparation locale | lecture HTTP/SSE | fin prématurée ou JSON invalide | validation puis écriture atomique | reçu minimal de secours |

Causes seulement inférées depuis le code du candidat initial : forme de sortie invalide, fait non atomique, relation citation/source insuffisante, titre absent, compteur outil différent ou rejet du schema M2. Aucune n’est attribuée au premier appel.

## Types installés inspectés

- `ai@7.0.79` exporte `APICallError`, `LoadAPIKeyError`, `NoObjectGeneratedError`, `NoOutputGeneratedError` et `RetryError`, tous avec garde statique `.isInstance()`.
- `@ai-sdk/openai@4.0.47` exporte les types Responses et normalise les annotations texte dans `providerMetadata.openai.annotations`.
- L’annotation installée `url_citation` expose `url`, `title`, `start_index` et `end_index`. Elle n’expose aucun extrait de contenu source.
- Le résultat `generateText` expose sources, tool calls, finish reason, usage, réponse et provider metadata. Les corps, headers complets, prompts, textes bruts et erreurs ne sont jamais sérialisés dans le reçu.

## Reçu d’échec

Catégories supportées : `configuration`, `authentication`, `permission`, `rate_limit`, `provider_request`, `provider_unavailable`, `network`, `timeout`, `no_output`, `structured_output_invalid`, `source_metadata_missing`, `truth_contract_rejected`, `serialization`, `internal_unknown`.

Champs conservés : identifiant de tentative, statut et étape, catégorie/code public, retryability, fournisseur/modèle, appels, statut HTTP nullable, finish reason nullable, usage nullable, compteurs outil/source nullables, durée nullable, coût nul, présence et digest tronqué du request ID, persistance et timestamp.

Champs exclus : message et stack fournisseur, cause, request body, response body, headers complets, Authorization, clé, prompt, nom, contexte, texte brut, cookie, URL signée et contenu personnel.

## Replay M1

La fixture `tests/fixtures/m1-provider-transport-replay.json` porte le marqueur `PROVIDER_TRANSPORT_REPLAY — NOT PRODUCT OUTPUT`.

Faits relus : un `web_search_call` terminé, une citation URL, 17 URLs, usage `8593/0/72/36/8665` et présence d’un identifiant conservée uniquement par digest. L’adaptateur lit la citation et les sources.

Structure non conservée par M1 : texte généré, représentation exacte flat/nested de l’annotation, titre, offsets, extrait et enveloppe exacte de provider metadata. Le replay ne constitue donc ni une sortie produit ni une réussite M5.

## Compatibilité M2

- affirmation atomique : représentable ;
- IDs source/evidence : représentables ;
- URL issue des métadonnées : représentable ;
- date inconnue et fraîcheur inconnue : représentables ;
- périmètre et silence sans preuve : représentables ;
- extrait source absent : non représentable comme preuve `supports`.

Le schema M2 exige un `evidence.excerpt` non vide pour soutenir une affirmation. Les métadonnées OpenAI installées et les preuves M1 conservées ne fournissent pas cet extrait. Réutiliser l’affirmation, le titre ou une phrase explicative comme extrait serait une invention.

Plus petit changement d’architecture requis : ajouter avant la construction M2 une collecte autorisée de contenu source ou une métadonnée fournisseur contenant un extrait source authentique, puis conserver cet extrait exact avec un locator et sa source. Sans cette provenance, l’adaptateur doit rester silencieux. Le schema M2 n’est pas modifié.
