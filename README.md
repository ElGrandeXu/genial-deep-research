# GENIAL Deep Research

**Release candidate premium — 28 août 2026**

GENIAL Deep Research transforme un nom de personne ou d’entreprise en un dossier public court, sourcé et traçable. Le produit préfère un refus utile à une réponse vraisemblable sans preuve : une identité ambiguë demande du contexte, une recherche pauvre devient « données insuffisantes » et une panne reste distincte d’un silence documentaire.

- Production : <https://genial-deep-research.vercel.app>
- Dépôt : <https://github.com/ElGrandeXu/genial-deep-research>
- Runtime Production courant : `f53b7aed0d25e45aed26dfe96a0ed8c271365218`, promu depuis la Preview exacte `dpl_GE1Zk1cvuyYmRBuYEF4ufbFEAy4V` ([preuve Production](docs/evidence/final-2026-08-28/PRODUCTION_VALIDATION_FINAL.md))
- Runtime Production antérieur conservé pour rollback : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`

## Installer et relancer

Prérequis : Node.js `24.x`, Corepack, pnpm `11.24.0` et PowerShell 7 pour le vérificateur cumulatif.

```powershell
git clone https://github.com/ElGrandeXu/genial-deep-research.git
Set-Location genial-deep-research
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Ouvrir <http://localhost:3000>. Le build, les tests et l’accueil fonctionnent sans clé :

```powershell
corepack pnpm build
corepack pnpm start
```

Une recherche réelle nécessite une variable locale `OPENAI_API_KEY`. Copier alors `.env.example` vers `.env.local`, renseigner la valeur sans la publier, puis relancer le serveur. Aucune autre configuration n’est nécessaire pour construire, tester ou afficher l’accueil.

## Fonctionnement central

L’application est un monolithe Next.js App Router en TypeScript strict, sans base de données ni compte utilisateur.

1. Le client valide l’entrée, consomme le flux SSE et gère attente, annulation, erreur et résultat.
2. La route Node protège la frontière HTTP, applique limite de débit, concurrence et délai total.
3. OpenAI `gpt-5.6-luna` propose candidats, faits, URL et extraits via une sortie structurée et Web Search.
4. Chaque URL passe par les contrôles d’URL publique et anti-SSRF ; le serveur récupère ensuite directement la page.
5. Un extrait exact doit être retrouvé dans le HTML. Sinon, le fait est retiré.
6. Le serveur décide l’identité, le sujet, la portée, la temporalité, la qualité et la complétude.
7. JSON Schema, invariants métier — dont l’intégrité structurale des conflits détectés — et garde de coût valident le dossier avant son émission.
8. L’interface ne rend que des chaînes `Claim → Evidence → Source` intègres.

Principe : **le fournisseur propose, le serveur décide**. Voir [l’architecture détaillée](docs/ARCHITECTURE.md), le [contrat de vérité](docs/PRODUCT_TRUTH_CONTRACT.md) et le [schéma canonique](docs/contracts/research-dossier.schema.json).

## Identité, sources et refus

`resolved` exige exactement un candidat directement vérifié. Le contexte n’est retenu que s’il est lui-même démontré. Pour chaque fait, le serveur contrôle la correspondance du sujet, du type, de la portée et de l’entité sur la page ; le statut proposé par le fournisseur ne suffit jamais.

Un dossier complet comporte trois à six faits métier uniques, au moins deux catégories, deux pages et deux familles d’éditeurs. Un ou deux faits métier valides restent un résultat limité, même si leurs preuves sont intègres. Une homonymie non résolue produit une clarification ; l’absence de preuve produit un silence explicite ; une erreur technique ne produit aucun dossier partiel. Le résumé ne crée pas de nouveau fait.

Chaque fait expose son extrait exact, son titre, son éditeur ou domaine, son URL, sa date de consultation, la période du fait et sa fraîcheur. Dans cette release, un conflit quantitatif visible est limité aux niveaux de `revenue` et `workforce` et à une période annuelle unique explicitement qualifiée de civile ou fiscale : même entité, métrique, portée, base d’observation, unité, devise reconnue (`EUR`, `USD`, `GBP`, `CHF`, `CAD`, `AUD`, `JPY` ou `CNY`) et nature publiée ou estimée, deux valeurs numériques exactes et finies et deux documents source distincts. La distinction exige à la fois deux chemins de page après retrait des paramètres de requête et deux empreintes SHA-256 du texte normalisé ; deux variantes d’URL ou deux extraits du même document ne suffisent pas. Pour chaque version, le sujet attendu, la métrique, sa valeur et son unité ou sa devise doivent être reliés dans la même proposition de l’extrait ; les dimensions sont redérivées au lieu de faire confiance aux seuls champs du modèle. Année nue, approximation, intervalle, taux, variation, sous-période, base ou population d’effectif non prise en charge, périmètre de maison mère non relié à une identité résolue, autre métrique, définition de revenu non allowlistée — par exemple ARR, run-rate, operating, subscription, deferred ou segment revenue — ou devise différente restent `indetermination` ; aucune conversion de devise n’est effectuée. Les versions contestées restent hors du résumé et aucune gagnante n’est inventée.

## Pourquoi OpenAI seulement

La Production utilise OpenAI `gpt-5.6-luna` pour une verticale unique, mesurable et maîtrisée. Un [probe historique immuable](https://github.com/ElGrandeXu/genial-deep-research/blob/8e91ed0c66765d5cab3bb8a8364cea04eaeda2af/docs/evidence/M1_API_CAPABILITIES.md) a vérifié des capacités OpenAI et Gemini — sortie structurée, recherche, coût et latence — mais il ne constitue pas un benchmark métier annoté. Aucun gain de qualité produit de Gemini n’a donc été démontré sur le même jeu.

Ajouter un second fournisseur sans ce signal augmenterait la variabilité, le coût, la latence, la réconciliation et les modes de panne. Le consensus de deux modèles ne constitue pas une preuve indépendante : la frontière de confiance reste la récupération directe et la validation serveur de chaque page. Gemini demeure un candidat possible pour un benchmark futur ou un fallback calibré ; aucune supériorité universelle d’OpenAI n’est revendiquée. Un second fournisseur ne sera ajouté qu’après comparaison aveugle sur le même jeu annoté.

Références fournisseur : [modèle](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Responses API et Web Search](https://developers.openai.com/api/docs/guides/tools-web-search), [tarifs](https://developers.openai.com/api/docs/pricing).

## Clés, exposition publique et maîtrise de l’abus

- Seule `OPENAI_API_KEY` est utilisée par le runtime ; elle reste exclusivement côté serveur. Les métadonnées Vercel observées le 28 août 2026 indiquent le type `Sensitive` pour Preview et Production, sans lecture de valeur.
- Gemini est absente du runtime et des variables Vercel observées. Aucune variable fournisseur `NEXT_PUBLIC_*` n’est utilisée.
- Les secrets sont exclus de Git, du bundle client, des captures, du PDF et des logs. Aucune valeur, empreinte ou information d’identification de clé n’est publiée.
- `store: false` désactive le stockage applicatif demandé à Responses. L’application ne journalise ni ne persiste entrée, contexte, prompt, extrait ou dossier. Ce réglage n’est pas présenté comme un contrat de rétention nulle du fournisseur ; voir la [politique OpenAI sur les données API](https://developers.openai.com/api/docs/guides/your-data).
- Le WAF protège l’endpoint public avec huit requêtes par 600 secondes et par IP. L’application limite aussi les admissions et la concurrence à deux recherches simultanées.
- Chaque fiche possède un plafond interne de `0,10 USD`.
- L’authentification étant hors périmètre, ces mesures limitent l’abus sans prétendre l’éliminer. Le risque résiduel est une consommation indirecte via l’endpoint public, distincte d’une fuite de clé.
- Après l’évaluation, les clés devront être révoquées ou tournées par leur propriétaire.

Les entrées sont transmises à OpenAI et peuvent conduire à consulter des pages Web publiques. Ne pas saisir de donnée secrète ou privée.

## Cas traités et limites de couverture

Le bench live historique a exécuté une seule fois, dans l’ordre préenregistré, cinq entrées sur le runtime `8e91ed0c` :

| Cas | Résultat observé | Coût |
|---|---|---:|
| GENIAL | identité résolue, une preuve d’identité et un fait métier, résultat `partial` | `0,0141440 USD` |
| Thomas Martin | aucun fait attribué, silence sûr | `0,0455815 USD` |
| Airbus SAS | entité légale isolée, clarification conservatrice | `0,0249935 USD` |
| SILENCE | zéro fait et zéro source | `0,0111351 USD` |
| Google Ireland Limited, holdout | entité exacte isolée, clarification | `0,0246989 USD` |

Les cinq exécutions finales préenregistrées ont coûté 0,1205530 USD au total. Cette somme dépasse de 0,0005530 USD l’enveloppe interne stricte de validation fixée à 0,12 USD. Tous les coûts individuels restent inférieurs à 0,10 USD. Les appels ont été arrêtés immédiatement après le cinquième reçu et aucun résultat n’a été sélectionné a posteriori.

Un [smoke Production post-release](docs/evidence/final-2026-08-28/POST_RELEASE_LIVE_SMOKE.md) distinct a été exécuté sur `f53b7aed` : terminal serveur `completed`, coût `0,0142808 USD`, mais verdict `FAIL` faute de preuve conservée du SSE et du rendu final. Il ne valide donc pas la chaîne technique end-to-end, ne remplace pas le benchmark historique et n’en modifie ni les résultats ni le coût.

Cette enveloppe cumulée était un contrôle interne, pas une exigence du brief. Aucun reçu, coût ou résultat brut n’a été modifié. Certains cas supplémentaires n’ont pas été lancés : CONFLIT, MARQUE et PÉREMPTION ne sont pas revendiqués dans ce bench live historique.

Le cas CONFLIT est démontré séparément de manière déterministe, sans appel fournisseur et sans coût : deux chiffres d’affaires synthétiques en EUR, pour la même société, la même métrique, la même période et le même périmètre, restent liés à deux documents distincts par leur chemin et leur empreinte de contenu. Les deux versions sont visibles sur [desktop et mobile](docs/evidence/final-2026-08-28/CONFLICT_DETERMINISTIC.md). Aucun candidat live suffisamment stable n’a justifié un appel supplémentaire après le dépassement du budget préenregistré ; aucune validation live dédiée n’est revendiquée.

Autres limites : Web public seulement ; pages avec authentification, JavaScript, paywall ou format non HTML souvent écartées ; aucune archive de source ; fraîcheur parfois inconnue ; résolution conservatrice ; WAF par IP sans quota utilisateur ; aucun export, historique ou traitement asynchrone.

## Vérifier

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm verify
corepack pnpm audit --prod --audit-level high
```

`pnpm verify` est la gate publique et portable. Elle couvre la frontière du dépôt candidat, les liens locaux, la cohérence du manifeste Vercel de référence, l’intégrité des cinq reçus live historiques, les scans de secrets et leur mutation négative, le contrat et ses mutations négatives, les invariants runtime, lint, TypeScript strict, les tests unitaires et d’intégration, le build, le bundle client, onze parcours Playwright sans appel fournisseur, les seuils Lighthouse et l’audit des dépendances de production. Elle ne nécessite ni Vercel CLI, ni compte Vercel, ni liaison locale `.vercel/`.

Pour une release, exécuter ensuite le contrôle propriétaire :

```powershell
corepack pnpm verify:vercel
```

`pnpm verify:vercel` nécessite Vercel CLI et un dépôt lié. Il exécute uniquement le dry-run officiel `vercel deploy --dry --json --no-color`, sans créer de déploiement, puis vérifie le contexte réel. Ce contrôle est autoritatif pour la sémantique de `.vercelignore` ; le manifeste enregistré prouve seulement la cohérence portable du dépôt. La séquence de release obligatoire est donc `pnpm verify`, puis `pnpm verify:vercel`.

## Les quatre livrables

1. [Application Production](https://genial-deep-research.vercel.app).
2. [Dépôt source reproductible](https://github.com/ElGrandeXu/genial-deep-research), avec tests, contrat et documentation d’architecture.
3. [Note d’arbitrage finale](docs/NOTE_ARBITRAGE_FINALE.pdf), avec [source Markdown](docs/NOTE_ARBITRAGE_FINALE.md) et [version HTML](docs/NOTE_ARBITRAGE_FINALE.html).
4. [Résultats live historiques](docs/evidence/final-2026-08-28/LIVE_BENCH_FINAL.md) et [preuve CONFLIT déterministe](docs/evidence/final-2026-08-28/CONFLICT_DETERMINISTIC.md), avec [reçus](docs/evidence/final-2026-08-28/live/), [captures](docs/captures/final-2026-08-28/), [validation Production](docs/evidence/final-2026-08-28/PRODUCTION_VALIDATION_FINAL.md) et [validation WAF](docs/evidence/final-2026-08-28/WAF_VALIDATION.md).

Les protocoles préenregistrés sont conservés uniquement comme preuve d’absence de sélection a posteriori : [bench](docs/evidence/final-2026-08-28/protocol/LIVE_BENCH_PREREGISTRATION.md) et [holdout](docs/evidence/final-2026-08-28/protocol/HOLDOUT_PREREGISTRATION.md).
