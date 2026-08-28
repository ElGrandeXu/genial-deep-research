# GENIAL Deep Research

**Release technique finalisée — limite budgétaire interne déclarée**

GENIAL Deep Research transforme un nom de personne ou d’entreprise en un dossier public court, sourcé et traçable. Le produit préfère un refus utile à une réponse vraisemblable sans preuve : une identité ambiguë demande du contexte, une recherche pauvre devient « données insuffisantes » et une panne reste distincte d’un silence documentaire.

- Production : <https://genial-deep-research.vercel.app>
- Dépôt : <https://github.com/ElGrandeXu/genial-deep-research>
- Runtime Production : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`

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
7. JSON Schema, invariants métier et garde de coût valident le dossier avant son émission.
8. L’interface ne rend que des chaînes `Claim → Evidence → Source` intègres.

Principe : **le fournisseur propose, le serveur décide**. Voir [l’architecture détaillée](docs/ARCHITECTURE.md), le [contrat de vérité](docs/PRODUCT_TRUTH_CONTRACT.md) et le [schéma canonique](docs/contracts/research-dossier.schema.json).

## Identité, sources et refus

`resolved` exige exactement un candidat directement vérifié. Le contexte n’est retenu que s’il est lui-même démontré. Pour chaque fait, le serveur contrôle la correspondance du sujet, du type, de la portée et de l’entité sur la page ; le statut proposé par le fournisseur ne suffit jamais.

Un dossier complet comporte trois à six faits métier uniques, au moins deux catégories, deux pages et deux familles d’éditeurs. Une ou deux preuves valides produisent un résultat limité. Une homonymie non résolue produit une clarification ; l’absence de preuve produit un silence explicite ; une erreur technique ne produit aucun dossier partiel. Le résumé ne crée pas de nouveau fait.

Chaque fait expose son extrait exact, son titre, son éditeur ou domaine, son URL, sa date de consultation, la période du fait et sa fraîcheur. Les contradictions et inconnues restent visibles.

## Clés, exposition publique et maîtrise de l’abus

- Seule la clé OpenAI est utilisée par le runtime ; elle reste exclusivement côté serveur et est configurée comme variable Vercel `Sensitive` en Preview et Production.
- Gemini est absente du runtime livré et aucune variable fournisseur `NEXT_PUBLIC_*` n’est utilisée.
- Les secrets sont exclus de Git, du bundle client, des captures, du PDF et des logs. Aucune valeur, empreinte ou information d’identification de clé n’est publiée.
- `store: false` est imposé côté fournisseur. L’application ne journalise ni ne persiste entrée, contexte, prompt, extrait ou dossier.
- Le WAF protège l’endpoint public avec huit requêtes par 600 secondes et par IP. L’application limite aussi les admissions et la concurrence à deux recherches simultanées.
- Chaque fiche possède un plafond interne inférieur à `0,10 USD`.
- L’authentification étant hors périmètre, ces mesures limitent l’abus sans prétendre l’éliminer.
- Après l’évaluation, les clés devront être révoquées ou tournées par leur propriétaire.

Les entrées sont transmises à OpenAI et peuvent conduire à consulter des pages Web publiques. Ne pas saisir de donnée secrète ou privée.

## Cas traités et limites de couverture

Le bench final a exécuté une seule fois, dans l’ordre préenregistré, cinq entrées :

| Cas | Résultat observé | Coût |
|---|---|---:|
| GENIAL | identité résolue, deux faits, résultat `partial` | `0,0141440 USD` |
| Thomas Martin | aucun fait attribué, silence sûr | `0,0455815 USD` |
| Airbus SAS | entité légale isolée, clarification conservatrice | `0,0249935 USD` |
| SILENCE | zéro fait et zéro source | `0,0111351 USD` |
| Google Ireland Limited, holdout | entité exacte isolée, clarification | `0,0246989 USD` |

Les cinq exécutions finales préenregistrées ont coûté 0,1205530 USD au total. Cette somme dépasse de 0,0005530 USD l’enveloppe interne stricte de validation fixée à 0,12 USD. Tous les coûts individuels restent inférieurs à 0,10 USD. Les appels ont été arrêtés immédiatement après le cinquième reçu et aucun résultat n’a été sélectionné a posteriori.

Cette enveloppe cumulée était un contrôle interne, pas une exigence du brief. Aucun reçu, coût ou résultat brut n’a été modifié. Certains cas supplémentaires n’ont pas été lancés : CONFLIT, MARQUE et PÉREMPTION ne sont pas revendiqués en live final. La release technique et les livrables sont finalisés avec cette limite déclarée.

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

`pnpm verify` couvre la frontière du dépôt candidat, les liens locaux, le contexte Vercel simulé, l’intégrité des cinq reçus finaux, les scans de secrets et leur mutation négative, le contrat et ses mutations négatives, les invariants runtime, lint, TypeScript strict, les tests unitaires et d’intégration, le build, le bundle client, huit parcours Playwright sans appel fournisseur, les seuils Lighthouse et l’audit des dépendances de production.

## Les quatre livrables

1. [Application Production](https://genial-deep-research.vercel.app).
2. [Dépôt source reproductible](https://github.com/ElGrandeXu/genial-deep-research), avec tests, contrat et documentation d’architecture.
3. [Note d’arbitrage finale](docs/NOTE_ARBITRAGE_FINALE.pdf), avec [source Markdown](docs/NOTE_ARBITRAGE_FINALE.md) et [version HTML](docs/NOTE_ARBITRAGE_FINALE.html).
4. [Résultats finaux des cas d’épreuve](docs/evidence/final-2026-08-28/LIVE_BENCH_FINAL.md), avec [reçus](docs/evidence/final-2026-08-28/live/), [captures](docs/captures/final-2026-08-28/), [validation Production](docs/evidence/final-2026-08-28/PRODUCTION_VALIDATION_FINAL.md) et [validation WAF](docs/evidence/final-2026-08-28/WAF_VALIDATION.md).

Les protocoles préenregistrés sont conservés uniquement comme preuve d’absence de sélection a posteriori : [bench](docs/evidence/final-2026-08-28/protocol/LIVE_BENCH_PREREGISTRATION.md) et [holdout](docs/evidence/final-2026-08-28/protocol/HOLDOUT_PREREGISTRATION.md).
