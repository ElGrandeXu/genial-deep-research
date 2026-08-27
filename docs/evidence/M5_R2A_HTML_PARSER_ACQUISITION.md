# M5-R2A — acquisition du parseur HTML

## Décision

- **DÉCISION** — Statut : `M5_R2A_PARSER_READY`.
- **FAIT VALIDÉ** — `parse5@8.0.1` est une dépendance runtime directe, exacte et verrouillée avec `entities@8.0.0` comme unique dépendance runtime transitive.
- **DÉCISION** — Cette acquisition ne reprend pas M5-R2 : aucun extracteur, transport source, contrôle SSRF, locator ou adaptateur M2 n'est implémenté.

## Baseline avant mutation

- Racine : `C:\Users\maxer\Desktop\GENIAL`.
- HEAD : `b3a313e5c0333d62bbbd6d2c6c0206a370a15a34`.
- Remote : aucun. Index : vide. Fichiers suivis modifiés : 20. Fichiers non suivis : 16.
- Diff complet SHA-256 : `793ef526d38d117a807ccb801efed860b7ae7a287d8374e5893162fe03976b87`.
- Manifeste non suivi SHA-256 : `ce42cfb7ef114e5623709d2de5554bb5661f59232c107fe3ebb4690f7ac2a584`.
- `package.json` : `da7546ea96934076cf487f07f3dec6ca6c86884f6214796b76ad1333df63f104`.
- `pnpm-lock.yaml` : `7630de46e2a3715d4afa32aa7789a162904c046ddf98a974b07383cc4be75c61`.
- Copie de retour M5-R2A extérieure au dépôt : `C:\Users\maxer\AppData\Local\Temp\GENIAL-M5-R2A-dd246a53d7f14bcfb1ef050091014a2a`.

## Métadonnées officielles avant installation

Registre effectif et forcé : `https://registry.npmjs.org/`.

| Paquet | Version | Licence | Dépréciation | Engines | Dépendances runtime | Tarball | Intégrité publiée |
|---|---:|---|---|---|---|---|---|
| `parse5` | `8.0.1` | MIT | champ absent, paquet non marqué déprécié | champ absent | `entities: ^8.0.0` | `https://registry.npmjs.org/parse5/-/parse5-8.0.1.tgz` | `sha512-z1e/HMG90obSGeidlli3hj7cbocou0/wa5HacvI3ASx34PecNjNQeaHNo5WIZpWofN9kgkqV1q5YvXe3F0FoPw==` |
| `entities` | `8.0.0` | BSD-2-Clause | champ absent, paquet non marqué déprécié | Node `>=20.19.0` | aucune | `https://registry.npmjs.org/entities/-/entities-8.0.0.tgz` | `sha512-zwfzJecQ/Uej6tusMqwAqU/6KL2XaB2VZ2Jg54Je6ahNBGNH6Ek6g3jjNCF0fG9EWQKGZNddNjU5F1ZQn/sBnA==` |

- Le repository GitHub rapporté par les métadonnées n'a pas été contacté.
- `parse5` ne déclare aucun script. `entities` déclare `prepublishOnly`, mais aucun `preinstall`, `install` ou `postinstall`.
- MIT et BSD-2-Clause sont des licences permissives compatibles avec l'usage runtime du projet.
- `parse5` ne publie pas de contrainte `engines`; l'import réel sous Node `24.14.1` et les types publics constituent la validation de compatibilité. La contrainte de `entities` est satisfaite.

## Réseau autorisé et mesuré

Seul `registry.npmjs.org` a été ciblé. Les nombres de requêtes HTTP et octets réseau transférés ne sont pas exposés par pnpm : `UNKNOWN`.

| Opération | Durée | Mesure observable |
|---|---:|---|
| métadonnées `parse5@8.0.1` | 757 ms | sortie CLI 416 octets UTF-8 |
| métadonnées `entities@8.0.0` | 707 ms | sortie CLI 1 136 octets UTF-8 |
| installation exacte | 10 447 ms | 2 paquets téléchargés, 2 ajoutés |
| audit production avant | 843 ms | 0 vulnérabilité |
| audit production après | 824 ms | 0 vulnérabilité |

Commandes réseau : deux `pnpm view` bornés, `pnpm add parse5@8.0.1 --save-exact --ignore-scripts --registry=https://registry.npmjs.org/`, puis deux `pnpm audit --prod --json --registry=https://registry.npmjs.org/`. `pnpm config get registry` était une lecture locale préalable.

## Delta M5-R2A

- `package.json` : une ligne, `"parse5": "8.0.1"`, dans `dependencies`.
- `pnpm-lock.yaml` : 16 lignes ajoutées — importer exact, entrées package et snapshots de `parse5@8.0.1` et `entities@8.0.0`.
- Aucune version existante modifiée, remplacée ou mise à niveau.
- `tools/verify-project.ps1` : ajout du vérificateur M5-R2A au contrôle cumulatif.
- `tools/verify-m5-r2a-parser.ps1` : contrôle hors réseau du manifeste, du lockfile, des licences, des scripts, du runtime et des types publics.
- Hashes finaux : `package.json` `61320378476359df831a6b46571f56a6cd727205ada88b1538f5fc75406e5ddf`; `pnpm-lock.yaml` `eafc98b59f3ee2b62865fbf2665bec9c264d7b7c89a443eb272c1368add82731`.
- Diff complet final SHA-256 : `4a1683dfd52f16480f636dfffabf09a290b047a7df5458c37a8421e9a3a364a9`.

## Validation

- **FAIT VALIDÉ** — Le lockfile reprend exactement les deux intégrités publiées; `pnpm store status` rapporte un store intact.
- **FAIT VALIDÉ** — Import public `parse5`, document, `title`, `body` et texte `Texte & entité` vérifiés sur une chaîne synthétique.
- **FAIT VALIDÉ** — Compilation en mémoire avec `parse` et `DefaultTreeAdapterMap` depuis l'API publique : 0 diagnostic TypeScript.
- **FAIT VALIDÉ** — Installation figée hors ligne avec scripts ignorés, lint, typecheck strict, 38 tests et build sans clé réussis.
- **FAIT VALIDÉ** — Audit production avant/après : 0 vulnérabilité à chaque fois; aucune vulnérabilité nouvelle.
- **FAIT VALIDÉ** — L'installation a répété l'avertissement de dépréciation préexistant de `eslint@9.39.5`, dépendance de développement inchangée. Ce n'est ni une vulnérabilité d'audit ni un ajout imputable à parse5.
- **FAIT VALIDÉ** — Aucun appel OpenAI/Gemini, source métier, Vercel, DPAPI, GitHub ou autre domaine.

## Limites

- L'intégrité d'archive est vérifiée par pnpm contre le SRI publié et répliquée dans le lockfile; aucune archive n'est conservée dans Git.
- Le nombre de requêtes HTTP et le volume réseau exact restent `UNKNOWN`.
- parse5 construit un arbre HTML; il ne reproduit ni CSS, layout, JavaScript, accessibilité ni visibilité navigateur.
- M5-R2, M5 et G3 restent non validés.
