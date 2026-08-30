# GENIAL Deep Research

GENIAL Deep Research permet à un commercial de saisir une personne ou une entreprise, d'ajouter éventuellement du contexte et de recevoir un dossier public utile, lisible et sourcé.

## Accès rapide

- [Application Production](https://genial-deep-research.vercel.app)
- [Dépôt GitHub](https://github.com/ElGrandeXu/genial-deep-research)

![Accueil de GENIAL Deep Research sur desktop](docs/captures/final-2026-08-28/production-home-1440.png)

## Ce que fait l'application

- Recherche une personne ou une entreprise à partir de son nom.
- Utilise un contexte facultatif pour mieux distinguer l'identité recherchée.
- Effectue une recherche Web réelle et restitue un dossier synthétique avec faits, preuves et URL.
- Présente honnêtement les ambiguïtés, les données insuffisantes et les erreurs techniques.
- Rend l'attente compréhensible grâce à des étapes réelles affichées dans l'interface.

## Fonctionnement

1. Le formulaire valide le type d'entité, le nom et le contexte facultatif.
2. Le serveur lance la recherche avec Vercel AI SDK et OpenAI Responses API avec Web Search.
3. Les pages publiques sont relues côté serveur pour vérifier les sources, les extraits et leur attribution.
4. Les étapes puis le dossier sont transmis progressivement à l'interface via SSE.

## Stack

- Next.js 16, React 19 et TypeScript
- Vercel AI SDK 7 et `@ai-sdk/openai`
- OpenAI Responses API avec Web Search
- Zod et Ajv pour les contrats de données
- Vitest, Playwright et Vercel

## Lancement local

Prérequis : Node.js `24.x`, Corepack et pnpm `11.24.0`.

```powershell
git clone https://github.com/ElGrandeXu/genial-deep-research.git
Set-Location genial-deep-research
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

L'application est disponible sur <http://localhost:3000>. `OPENAI_API_KEY` n'est nécessaire dans `.env.local` que pour lancer une recherche réelle.

La vérification complète du projet ne réalise aucun appel fournisseur :

```powershell
pnpm verify
```

## Choix et limites

- La recherche porte uniquement sur des sources publiques accessibles.
- Le produit ne comporte ni compte, ni historique, ni base de données métier.
- Les résultats sont bornés au périmètre exploré et ne sont pas exhaustifs.
- Une clarification est demandée lorsque l'identité reste ambiguë.
- Les secrets restent exclusivement côté serveur et ne sont jamais exposés au navigateur.

## Livrables et documentation

- [Application](https://genial-deep-research.vercel.app)
- [Dépôt reproductible](https://github.com/ElGrandeXu/genial-deep-research)
- [Note d'arbitrage](docs/NOTE_ARBITRAGE_FINALE.pdf)
- [Résultats](docs/evidence/final-2026-08-28/LIVE_BENCH_FINAL.md) et [captures](docs/captures/final-2026-08-28/production-home-1440.png)
- [Architecture détaillée](docs/ARCHITECTURE.md)
- [Contrat de vérité](docs/PRODUCT_TRUTH_CONTRACT.md)
