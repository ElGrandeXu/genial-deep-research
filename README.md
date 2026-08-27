# GENIAL Deep Research

GENIAL Deep Research transforme un nom de personne ou d’entreprise en un dossier public compact, vérifié et traçable. Le produit privilégie un refus utile à une réponse confiante sans preuve : une identité ambiguë demande du contexte, une recherche pauvre devient un état « données insuffisantes », et une panne technique reste distincte d’un silence documentaire.

Production : <https://genial-deep-research.vercel.app>

## Ce que montre le dossier

- une résolution explicite de l’identité à partir du type et du contexte fournis ;
- trois à six faits utiles quand au moins trois peuvent être prouvés ;
- un état limité lorsque seules une ou deux preuves valides subsistent ;
- pour chaque fait : extrait exact, titre, éditeur ou domaine, URL ouvrable, consultation, période du fait et fraîcheur ;
- les contradictions et inconnues sans arbitrage silencieux ;
- un reçu d’exécution avec durée, recherches, inspections, pages consultées, jetons et coût estimé.

Le résumé ne crée aucun nouveau fait : il pointe vers des affirmations déjà reliées à leurs preuves.

## Prérequis

- Node.js `24.x` ;
- Corepack ;
- pnpm `11.24.0`, fixé par `packageManager` ;
- PowerShell 7 pour le vérificateur cumulatif.

## Installation et configuration

```powershell
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

`pnpm verify` cumule l’intégrité des autorités et preuves historiques, les scans de secrets, les contrats, les mutations négatives, les invariants runtime, le lint, le typecheck strict, la suite Vitest, le build et le scan du bundle client.

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
3. OpenAI `gpt-5.6-luna` exécute une génération structurée avec Web Search, `store: false` et un à quatre actes de recherche bornés ;
4. chaque URL proposée passe par les contrôles d’URL publique et anti-SSRF, puis la page est récupérée directement ;
5. l’extrait exact doit être retrouvé dans le contenu HTML ; sinon le fait est supprimé ;
6. le dossier est validé par JSON Schema, invariants métier et garde de coût avant émission ;
7. l’interface refuse de rendre un fait dont les liens `Claim → Evidence → Source` ne sont pas intègres.

Le chemin critique est sans base de données, sans compte et sans persistance de dossier. L’état de limitation de débit reste en mémoire du processus. Voir [l’architecture détaillée](docs/ARCHITECTURE.md).

## Sécurité et vie privée

- clé OpenAI exclusivement serveur et absente du bundle client ;
- `store: false` côté Responses API ;
- aucune journalisation du nom, du contexte, du prompt, des extraits ou des dossiers ;
- IP transformée en condensat avec sel éphémère pour la seule limitation de débit ;
- origine identique, JSON strict, corps limité à 1 024 octets et en-têtes de sécurité ;
- huit admissions par dix minutes et par empreinte IP, deux recherches simultanées par instance ;
- URL `https` publique uniquement, résolution DNS contrôlée, redirections revalidées, deux redirections et 512 Kio maximum ;
- aucun dossier partiel émis après une erreur technique.

Les entrées sont néanmoins transmises à OpenAI et peuvent conduire à consulter des pages Web publiques. Il ne faut pas saisir de donnée secrète ou privée.

## Coût observé

Le reçu applique le barème public daté du 27 août 2026 : entrée `0,20 $/M`, entrée en cache `0,02 $/M`, sortie `1,20 $/M`, et `0,01 $` par action Web Search observée. Taxes, remises et paliers éventuels sont exclus.

Sur les quatre exécutions de démonstration retenues, une fiche coûte entre `0,01208396 $` et `0,03583244 $`. Le succès desktop principal coûte `0,02470444 $` pour cinq faits et deux pages directement vérifiées. Le runtime rejette un résultat estimé au-dessus de `0,10 $`.

## Limites assumées

- recherche limitée au Web public accessible au moment de l’exécution ;
- pages nécessitant authentification, JavaScript, paywall ou format non HTML souvent écartées ;
- absence d’archive : une source peut changer après sa consultation ;
- fraîcheur inconnue si l’extrait ne contient pas une date factuelle explicite ;
- résolution probabiliste en amont, mais promotion à l’écran seulement après preuves directes ;
- limitation en mémoire non distribuée ;
- aucun export PDF, historique utilisateur ou travail asynchrone ;
- support des contradictions couvert par le contrat et les tests, sans cas CONFLIT live retenu pour la démonstration finale.

## Livrables

- [Note d’arbitrage de la release candidate](docs/NOTE_ARBITRAGE_RELEASE_CANDIDATE.md)
- [Résultats des cas d’épreuve](docs/RESULTATS_CAS_EPREUVE_RELEASE_CANDIDATE.md)
- [Contrat de vérité produit](docs/PRODUCT_TRUTH_CONTRACT.md)
- [Schéma canonique du dossier](docs/contracts/research-dossier.schema.json)
- [Captures de la release](docs/captures/release/)
- [Reçus expurgés de la release](docs/evidence/release/)
