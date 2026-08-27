# GENIAL Deep Research

GENIAL Deep Research transforme un nom de personne ou d’entreprise en un dossier public compact, vérifié et traçable. Le produit privilégie un refus utile à une réponse confiante sans preuve : une identité ambiguë demande du contexte, une recherche pauvre devient un état « données insuffisantes », et une panne technique reste distincte d’un silence documentaire.

Production : <https://genial-deep-research.vercel.app>

Dépôt public : <https://github.com/ElGrandeXu/genial-deep-research>

Runtime Production : commit `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`, promu depuis la Preview `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`.

## Ce que montre le dossier

- une résolution dérivée par le serveur : exactement un candidat directement vérifié et un contexte démontré par les preuves ;
- trois à six faits métier uniques pour un dossier complet, avec au moins deux catégories, deux pages et deux familles d’éditeurs ;
- un état limité lorsque seules une ou deux preuves valides subsistent ;
- pour chaque fait : extrait exact, titre, éditeur ou domaine, URL ouvrable, consultation, période du fait et fraîcheur ;
- les contradictions et inconnues sans arbitrage silencieux ;
- un reçu d’exécution avec durée, recherches, inspections, pages consultées, jetons et coût estimé.

Le statut proposé par le fournisseur ne suffit jamais à résoudre l’identité. Le résumé ne crée aucun nouveau fait : il sélectionne des affirmations déjà reliées à leurs preuves.

## Prérequis

- Node.js `24.x` ;
- Corepack ;
- pnpm `11.24.0`, fixé par `packageManager` ;
- PowerShell 7 pour le vérificateur cumulatif.

## Installation et configuration

```powershell
git clone https://github.com/ElGrandeXu/genial-deep-research.git
Set-Location genial-deep-research
git config core.hooksPath .githooks
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
```

Renseigner ensuite `OPENAI_API_KEY` dans `.env.local`. Cette variable est lue uniquement côté serveur. Le build, les tests et la page d’accueil fonctionnent sans clé ; une recherche réelle exige une clé OpenAI valide.

```text
OPENAI_API_KEY=
```

Aucune variable fournisseur `NEXT_PUBLIC_*` n’est utilisée. Gemini n’appartient pas au runtime livré.

## Développement

```powershell
corepack pnpm dev
```

Ouvrir <http://localhost:3000>. Le formulaire accepte :

- un type explicite — personne, entreprise — ou une résolution automatique ;
- un nom ;
- un contexte facultatif mais réellement injecté dans la résolution : ville, secteur, employeur, pays ou site officiel.

## Vérification

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm verify
corepack pnpm audit --prod --audit-level high
```

`pnpm verify` cumule l’intégrité des autorités et preuves historiques, les scans de secrets, les contrats, les mutations négatives, les invariants runtime, le lint, le typecheck strict, 478 tests Vitest, le build, le scan du bundle client, huit parcours Playwright, Lighthouse et l’audit des dépendances de production.

## Exécution de production locale

```powershell
corepack pnpm build
corepack pnpm start
```

Le serveur écoute par défaut sur <http://localhost:3000>. Vérifications minimales :

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-WebRequest http://localhost:3000
```

La route métier est un `POST /api/research` JSON same-origin. Elle répond en `text/event-stream` afin d’émettre les étapes réelles de la recherche puis un unique résultat terminal.

## Architecture

L’application est un monolithe Next.js App Router en TypeScript strict :

1. le composant client valide l’entrée, consomme le flux SSE et gère attente, annulation, erreurs et résultat ;
2. la route Node protège la frontière HTTP, applique limite de débit et concurrence, puis impose un délai total ;
3. OpenAI `gpt-5.6-luna` propose candidats, faits, URL et extraits via une génération structurée avec Web Search, `store: false` et un à quatre actes bornés ;
4. le serveur décide : candidat unique, contexte prouvé, sujet, portée, qualité, temporalité et complétude ;
5. chaque URL proposée passe par les contrôles d’URL publique et anti-SSRF, puis la page est récupérée directement ;
6. l’extrait exact doit être retrouvé dans le contenu HTML ; sinon le fait est supprimé ;
7. le dossier est validé par JSON Schema, invariants métier et garde de coût avant émission ;
8. l’interface refuse de rendre un fait dont les liens `Claim → Evidence → Source` ne sont pas intègres.

Principe : **le fournisseur propose, le serveur décide**.

Le chemin critique est sans base de données, sans compte et sans persistance de dossier. L’état de limitation de débit reste en mémoire du processus. Voir [l’architecture détaillée](docs/ARCHITECTURE.md).

## Sécurité et vie privée

- clé OpenAI exclusivement serveur et absente du bundle client ;
- `store: false` côté Responses API ;
- aucune journalisation du nom, du contexte, du prompt, des extraits ou des dossiers ;
- IP transformée en condensat avec sel éphémère pour la seule limitation de débit ;
- origine identique, JSON strict, corps limité à 1 024 octets et en-têtes de sécurité ;
- WAF Vercel distribué sur `/api/research` : fenêtre fixe de huit requêtes par 600 secondes et par IP, puis blocage à l’edge ;
- garde locale de huit admissions par dix minutes et deux recherches simultanées par instance ;
- URL `https` publique uniquement, résolution DNS contrôlée, redirections revalidées, deux redirections et 512 Kio maximum ;
- aucun dossier partiel émis après une erreur technique.

Les entrées sont néanmoins transmises à OpenAI et peuvent conduire à consulter des pages Web publiques. Il ne faut pas saisir de donnée secrète ou privée.

## Bench live final et coût

Le reçu applique le barème public daté du 27 août 2026 : entrée `0,20 $/M`, entrée en cache `0,02 $/M`, sortie `1,20 $/M`, et `0,01 $` par action Web Search observée. Taxes, remises et paliers éventuels sont exclus.

Cinq entrées préenregistrées ont été exécutées une seule fois sur la Preview ensuite promue : GENIAL, Thomas Martin, Airbus SAS, SILENCE et le holdout Google Ireland Limited. Les fiches coûtent entre `0,0111351 $` et `0,0455815 $`, toutes sous la limite unitaire de `0,10 $`.

Le cumul exact est `0,1205530 $`, soit `0,0005530 $` au-dessus de l’enveloppe interne stricte de `0,12 $`. Aucun appel supplémentaire — relance Thomas Henri Martin ou PÉREMPTION — n’a donc été lancé. Le gate final de budget reste explicitement en échec malgré un réaudit à `92/100`.

## Limites assumées

- recherche limitée au Web public accessible au moment de l’exécution ;
- pages nécessitant authentification, JavaScript, paywall ou format non HTML souvent écartées ;
- absence d’archive : une source peut changer après sa consultation ;
- fraîcheur inconnue si l’extrait ne contient pas une date factuelle explicite ;
- résolution probabiliste en amont, mais promotion à l’écran seulement après preuves directes ;
- résolution volontairement conservatrice : Airbus SAS et le holdout restent en clarification malgré une preuve d’identité exacte ;
- limite WAF distribuée par IP, sans authentification ni quota par utilisateur ;
- aucun export PDF, historique utilisateur ou travail asynchrone ;
- PÉREMPTION, CONFLIT et MARQUE non revendiqués en live final.

## Livrables

- [Note d’arbitrage finale — PDF](docs/NOTE_ARBITRAGE_FINALE.pdf)
- [Source accessible de la note](docs/NOTE_ARBITRAGE_FINALE.md)
- [Bench live final et reçus](docs/evidence/final-2026-08-28/LIVE_BENCH_FINAL.md)
- [Validation Production](docs/evidence/final-2026-08-28/PRODUCTION_VALIDATION_FINAL.md)
- [Validation du dépôt public et du clean-start](docs/evidence/final-2026-08-28/CLEAN_CLONE_VALIDATION_FINAL.md)
- [Contrôle WAF](docs/evidence/final-2026-08-28/WAF_VALIDATION.md)
- [Matrice G0–G12](docs/evidence/final-2026-08-28/GATE_MATRIX_G0_G12.md)
- [Réaduit final 20/20/20/20/20](docs/evidence/final-2026-08-28/REAUDIT_FINAL.md)
- [Contrat de vérité produit](docs/PRODUCT_TRUTH_CONTRACT.md)
- [Schéma canonique du dossier](docs/contracts/research-dossier.schema.json)
- [Captures finales 390/1440](docs/captures/final-2026-08-28/)
