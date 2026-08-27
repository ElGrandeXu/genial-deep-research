# M5 — Boucle verticale sourcée

## Décision

- **FAIT VALIDÉ** — Statut : `M5_FAILED_LOCAL_LIVE`.
- **DÉCISION** — G0–G2 restent validés ; G3 reste partiel ; G4–G7 restent non terminés.
- **DÉCISION** — Aucun déploiement M5, règle WAF, secret Production ou second appel payant après l’échec local.

## Baseline

- **FAIT VALIDÉ** — Racine : `C:\Users\maxer\Desktop\GENIAL`.
- **FAIT VALIDÉ** — HEAD initial : `b3a313e5c0333d62bbbd6d2c6c0206a370a15a34`, titre `docs: record early production deployment`.
- **FAIT VALIDÉ** — Worktree initial propre ; aucun remote ; sources intactes ; passations obsolètes présentes, ignorées, non suivies et non lues.
- **FAIT VALIDÉ** — Installation figée, M0, M2, M3, vérificateur cumulatif, lint, typecheck strict, tests, build sans secret, scans secrets et bundle client verts.
- **FAIT VALIDÉ** — Production M4 `READY` : <https://genial-deep-research-9fox16480-el-grande-xue.vercel.app>, alias <https://genial-deep-research.vercel.app>, `/` et `/api/health` HTTP 200 ; page identifiée comme baseline technique.
- **FAIT VALIDÉ** — Variables Vercel avant et après l’arrêt : aucune en Production, Preview ou Development. Aucune variable OpenAI ou Gemini.
- **FAIT VALIDÉ** — WAF avant et après l’arrêt : aucune règle, aucun draft.

## Implémentation locale non commitée

- **DÉCISION** — OpenAI seul ; modèle `gpt-5.6-luna` ; Responses via `@ai-sdk/openai` direct ; Web Search forcé ; `store: false` ; appels outils parallèles désactivés ; `maxToolCalls: 1` ; `maxRetries: 0` ; timeout 120 s.
- **DÉCISION** — `POST /api/research`, JSON et same-origin obligatoires, corps 1 024 octets maximum, nom 2–120 caractères, contexte 300 maximum, champs supplémentaires refusés avant fournisseur.
- **DÉCISION** — SSE réel : `accepted`, `searching`, `validating`, `completed` ou `failed` ; aucun pourcentage.
- **DÉCISION** — Une phrase atomique maximale, une annotation URL fournisseur couvrante, une source HTTPS unique, validation Ajv du JSON Schema M2, échec fermé.
- **DÉCISION** — Reçu expurgé : identifiant aléatoire, fournisseur, modèle, finalité, appels, outils, usage, durées, coût daté et limites ; aucun nom, contexte, prompt ou réponse brute dans les logs.
- **FAIT VALIDÉ** — Tests hors réseau : 16/16, dont succès sourcé, citation absente, URL textuelle seule, fait multiple, rejet M2, clé absente, timeout, bornes d’entrée, champ supplémentaire, logs expurgés, coût/usage, progression et zéro appel avant frontière.

## Probe réel

- **FAIT VALIDÉ** — Entrée : `Airbus SE` avec le contexte M5 prescrit.
- **FAIT VALIDÉ** — Magasin DPAPI extérieur validé ; déchiffrement dans le processus probe borné ; clé injectée seulement dans le processus applicatif enfant ; aucune valeur affichée, journalisée ou écrite.
- **FAIT VALIDÉ** — Événements observés : `accepted → searching → validating → failed`.
- **FAIT VALIDÉ** — Un appel HTTP OpenAI payant ; Gemini 0 ; aucun retry.
- **INFÉRENCE** — Le fournisseur a terminé sa réponse, car `validating` n’est émis qu’après retour de l’adaptateur. L’échec est donc local à la validation, pas une erreur transitoire fournisseur prouvée.
- **FAIT VALIDÉ** — La première version du probe arrêtait avant de sérialiser l’événement `failed`. Code exact, tool calls, tokens, latence, coût, affirmation et source n’ont pas été conservés et restent `UNKNOWN`.
- **DÉCISION** — Aucun second appel : le budget n’autorise un retry manuel qu’après erreur transitoire prouvée.
- **DÉCISION** — Aucun verdict humain de soutien ni capture : aucune source ni affirmation n’a franchi la validation.

## Incident de contrôle Vercel

- **FAIT VALIDÉ** — Une invocation `npx` mal formée pendant l’inspection a créé quatre Preview `READY` du baseline M4 inchangé :
  - <https://genial-deep-research-8y1r9e3lo-el-grande-xue.vercel.app>
  - <https://genial-deep-research-jaad04s5u-el-grande-xue.vercel.app>
  - <https://genial-deep-research-reg3lch6l-el-grande-xue.vercel.app>
  - <https://genial-deep-research-dlnkfm915-el-grande-xue.vercel.app>
- **FAIT VALIDÉ** — Production, alias canonique, variables et WAF n’ont pas changé.
- **DÉCISION** — Aucun nettoyage : supprimer ces déploiements exige un accord explicite.

## État Git et gates non franchis

- **FAIT VALIDÉ** — `deployedCommit` : non attribué ; commits M5 créés : 0 ; HEAD reste `b3a313e5c0333d62bbbd6d2c6c0206a370a15a34`.
- **FAIT VALIDÉ** — Code M5 et preuves restent dans un worktree modifié, non commités et non déployés.
- **DÉCISION** — Gates non tentés après l’échec : Preview M5, WAF 429, règle finale 3/10 min, clé Production, Production M5, interface publique réelle, source publique, logs Production et captures.
