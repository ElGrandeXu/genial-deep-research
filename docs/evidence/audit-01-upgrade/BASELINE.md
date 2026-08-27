# Baseline immuable — audit 01 upgrade

Date : 2026-08-27 22:31 CEST  
Branche de départ : `main`  
Commit : `98e7e07` (`docs(release): record production validation`)  
URL Production : <https://genial-deep-research.vercel.app>  
Score audité : **82/100**

## État initial

`git status --short` avant branche et avant patch :

```text
?? AUDIT_01.md
?? PLAN_ACTION_01.md
```

Ces deux fichiers de mission appartenaient déjà au worktree. Ils sont préservés sans modification.

## Mesures gratuites

| Contrôle | Résultat |
|---|---|
| Intégrité des trois sources | `SOURCE_INTEGRITY_OK: 3 files` |
| `corepack pnpm verify` | PASS, 7 fichiers / 395 tests, build Next.js 16.3.3 vert |
| Audit production | `No known vulnerabilities found` |
| Bundle client | `CLIENT_BUNDLE_OK: files=11` |
| Scans de secrets | Tracked, WorkingTree et Staged verts ; probe négatif vert |

Sortie brute : [`baseline/verify.txt`](baseline/verify.txt).

## Baseline produit mesurée par AUDIT_01

| Cas | Durée | Coût | Statut / résultat |
|---|---:|---:|---|
| GENIAL + contexte officiel | 15,3 s | 0,02509516 USD | `complete_within_scope`, 5 faits, 2 pages, 1 domaine ; doublons/fragments faibles |
| Thomas Martin + contexte précis | 31,4 s | inclus dans 0,08659768 USD | `not_found_within_scope`, 0 fait |
| Airbus SAS distinct d’Airbus SE | 14,3 s | inclus dans 0,08659768 USD | dossier ponctuellement correct, 7 faits |

Coût cumulé des trois contrôles additionnels de l’audit : `0,08659768 USD`.

Lighthouse Production accueil : Performance 100, Accessibilité 100, SEO 100, Bonnes pratiques 96 ; FCP/LCP ~0,8 s ; CLS 0.

## Défauts P0 conservés

- identité finale encore autorisée par l’avis fournisseur ;
- faits liés au type, pas obligatoirement au candidat ;
- contexte et portée non démontrés côté serveur ;
- complétude calculée avant qualité/déduplication ;
- récence confondue avec actualité ;
- résumé non rendu, progression et timestamps inexacts ;
- aucun test navigateur ;
- note sans PDF vérifié ;
- aucun remote Git configuré.

## Budget live

Aucun appel fournisseur effectué pendant P0. Le solde exact de la clé plafonnée n’est pas établi par les contrôles gratuits ; aucun benchmark live ne sera lancé avant passage des gates gratuits et confirmation vérifiable de l’enveloppe restante.
