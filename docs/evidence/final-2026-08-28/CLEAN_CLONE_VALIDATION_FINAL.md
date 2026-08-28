# Validation historique du dépôt candidat et du clone propre

Les valeurs historiques ci-dessous décrivent la branche `fix/audit-01-truth-gates` avant la finition premium. Elles sont conservées comme preuve datée ; la validation du nouveau candidat est enregistrée séparément dans ce document.

Date : 2026-08-28

Branche candidate : `fix/audit-01-truth-gates`

Runtime Production de référence : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`

## Protocole

Le commit local contenant ce document est cloné dans un répertoire temporaire créé exclusivement pour la validation. Le clone ne reçoit ni fichier d’environnement, ni clé fournisseur, ni configuration de hook, ni lien vers une archive ou un workspace externe.

Séquence rejouée :

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
```

Le vérificateur cumulatif contrôle aussi les liens Markdown, la structure du PDF, l’intégrité SHA-256 des cinq reçus live finaux, l’absence de chemin absolu, la frontière du dépôt candidat et le manifeste Vercel simulé.

## Résultats historiques

Mesure enregistrée par le commit `359f0061283524919a49610d52f82f8cac326c0a` ; elle n’est pas une description du manifeste courant.

```text
Fichiers candidats : 108
Reçus finaux : 5 hashes SHA-256 inchangés
Tests Vitest : 477 passed
Playwright : 8 passed
Lighthouse desktop : 100 / 100 / 100 / 100
Lighthouse mobile : 99 / 100 / 100 / 100
PDF : 3 pages A4
Contexte Vercel simulé : 39 fichiers, 597859 octets
Audit production : aucune vulnérabilité connue au seuil high
RUNTIME_DIFF : EMPTY
PROJECT_VERIFY_OK: build=True dependency_audit=True
```

L’accueil, le build et toutes les validations fonctionnent sans clé. Une clé OpenAI n’est requise que pour une recherche réelle, qui n’appartient pas à ce protocole. Aucun appel fournisseur ni appel réel à `/api/research` n’est effectué.

## Portabilité

- aucune dépendance à une archive externe ;
- aucune dépendance à un chemin Windows absolu ;
- aucun hook Git obligatoire ;
- aucune clé requise pour installer, construire, tester ou afficher l’accueil ;
- aucune mutation GitHub ou Vercel ;
- contexte de déploiement limité au runtime, au schéma canonique et au lanceur Next.

Verdict : **clone propre reproductible et dépôt candidat autonome**.

## Validation premium — branche candidate publique

Branche : `release/premium-polish`

Commit runtime : `f53b7aed0d25e45aed26dfe96a0ed8c271365218`

Tree : `219d288b238715c8e734359c03f534d26dc72eba`

Source : <https://github.com/ElGrandeXu/genial-deep-research.git>

Le clone a été effectué avec configuration Git globale et système neutralisée, helper d’identifiants vide, invite interactive désactivée et variables fournisseur ou registre retirées du processus. La branche publique a été clonée directement par HTTPS ; `.vercel/` était absente avant et après la gate.

```text
Installation : pnpm 11.24.0, --frozen-lockfile
Fichiers candidats : 114
Reçus live historiques : 5, intégrité inchangée
Vitest : 15 fichiers, 576 passed
Playwright : 11 passed
Build Next.js 16.3.3 : passed
Bundle client : 13 fichiers, passed
Lighthouse desktop : 100 / 100 / 100 / 100
Lighthouse mobile 390 px : 99 / 100 / 100 / 100
PDF : 3 pages A4, 98 017 octets
Manifeste portable : 40 fichiers, 651 575 octets
Audit des dépendances Production : aucune vulnérabilité connue au seuil high
PROJECT_VERIFY_OK: build=True dependency_audit=True
```

Les onze parcours interceptent `/api/research`. Aucun appel fournisseur, aucun coût et aucune lecture de secret n’ont eu lieu. Le clone et la configuration Git temporaire ont été supprimés après validation.

Verdict premium : **PASS — branche publique reproductible sans liaison Vercel**.
