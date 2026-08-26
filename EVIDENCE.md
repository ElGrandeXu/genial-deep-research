# Preuves M0

## Instructions EGX applicables

| Chemin absolu | Portée | Rôle et applicabilité |
|---|---|---|
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\AGENTS.md` | Projet/session depuis EGX_settings | Direction du cockpit, routage, garde-fous et recours à la documentation officielle ; chargé par Codex depuis la racine reconnue. |
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\CAVEMAN.md` | Doctrine racine référencée | Travail silencieux, efficacité de lecture, Conventional Commits, précision et préservation des données. |
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\.egx-settings-root` | Marqueur de racine | Reconnu par `project_root_markers` utilisateur ; fixe la racine hors Git du cockpit. |
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\.codex\config.toml` | Configuration projet | Limite documentaire, politique locale et fonctionnalités observées ; pertinente pour le comportement de la session. |
| `C:\Users\maxer\.codex\config.toml` | Configuration utilisateur | Définit notamment `project_root_markers`, dont `.egx-settings-root` ; seule la clé pertinente a été inspectée, sans lire de secret. |
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\projects\internal\egx-control\README.md` | Chantier de contrôle | Point d'entrée actif ; impose baseline, test réel et critère de validation. |
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\projects\internal\egx-control\CONTEXT.md` | Contexte du cockpit | Sépare cockpit de preuve et cible ; exige gain concret et prouvé. |
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\projects\internal\egx-control\TODO.md` | Priorités actives | Interdit les chantiers cosmétiques et exige revalidation après changement de doctrine/racine. |
| `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings\.agents\skills\execution-optimale\SKILL.md` | Skill activé pour M0 | Plan mesuré, exécution réelle, comparaison à la baseline et validation par artefacts. |
| `C:\Users\maxer\.codex\skills\.system\openai-docs\SKILL.md` | Skill activé pour l'arbitrage Codex | Consultation de la documentation officielle avant conclusion sur `AGENTS.md` et la découverte de racine. |

- **FAIT VALIDÉ** — Aucun `AGENTS.override.md` applicable et aucun `AGENTS.md` global n'ont été trouvés.
- **FAIT VALIDÉ** — La documentation officielle consultée confirme la chaîne globale puis projet, la recherche depuis la racine vers le répertoire courant et la priorité des instructions proches : `https://learn.chatgpt.com/docs/agent-configuration/agents-md`.
- **FAIT VALIDÉ** — `codex debug prompt-input "M0 instruction proof"` a retourné l'instruction EGX_settings dans l'entrée modèle ; contrôle réalisé sans appel API.
- **FAIT VALIDÉ** — `codex debug prompt-input "M0 GENIAL instruction proof"`, lancé depuis GENIAL, a chargé `AGENTS.md` projet et son pointeur absolu vers la doctrine canonique ; les futures sessions disposent ainsi d'un overlay effectif sans copie doctrinale.
- **FAIT VALIDÉ** — `PROGRESS.md` et `XU_CODEX-OPTIM.md` se déclarent archives non actives ; ils ne pilotent pas M0.

## Méthode EGX retenue

- **DÉCISION** — Hiérarchie : lois supérieures et mission M0, instructions projet chargées, sources de mission selon leur rang, faits mesurés.
- **DÉCISION** — Une mission bornée possède objectif, entrées, acceptation, résultat, preuves et handoff.
- **DÉCISION** — Baseline puis mutation minimale puis revalidation ; aucune intention ne vaut preuve.
- **DÉCISION** — Changements utilisateur préservés ; aucune suppression, déplacement, réinitialisation ou normalisation silencieuse.
- **DÉCISION** — Frontières causales : EGX_settings reste cockpit inchangé ; GENIAL seul est muté ; les trois sources restent immuables ; les passations restent exclues.
- **DÉCISION** — Gouvernance documentaire sans duplication : autorité dans les sources, décisions M0 dans la capsule, contrôles dans `tools/`.
- **DÉCISION** — Git atomique, Conventional Commit, index inspecté, identité locale existante requise, aucun remote.
- **DÉCISION** — Secrets jamais lus ni affichés ; exclusions, scan expurgé et hook versionné actifs avant le premier `git add`.
- **DÉCISION** — Handoff exact, limites explicites, attente d'audit avant toute suite.
- **DÉCISION** — Token efficiency : contexte minimal, inspections groupées, aucune lecture des passations, aucune exploration générale du Web.

## Baseline et frontière

- **FAIT VALIDÉ** — Répertoire de lancement : `C:\Users\maxer\Desktop\WORKSPACES\EGX_settings`.
- **FAIT VALIDÉ** — Shell : PowerShell 7.6.5 (`C:\Program Files\PowerShell\7\pwsh.exe`) ; Git 2.54.0.windows.1 ; Codex CLI 0.147.0 ; Windows NT 10.0.26200.0.
- **FAIT VALIDÉ** — EGX_settings n'est pas lui-même un dépôt Git ; douze dépôts imbriqués ont été inventoriés, sans lien de parenté avec GENIAL.
- **FAIT VALIDÉ** — Avant M0, GENIAL ne possédait ni `.git`, ni dépôt parent, ni dépôt imbriqué.
- **FAIT VALIDÉ** — Inventaire initial exact : cinq fichiers, soit les trois sources et les deux passations nommées dans `INPUTS.md` ; aucun élément caché supplémentaire.
- **FAIT VALIDÉ** — Aucun fichier de GENIAL n'était suivi par un dépôt parent.

## Intégrité

| Moment | Brief | Audit | Plan |
|---|---|---|---|
| Avant toute mutation | `4bc823833f1c943059c5a9746837dcc75592b31b5ca130143b583323336388e1` | `691622c46b7df65bda9649bf6aae64f4b764e0bc5c17f2d44cd77505beba0e17` | `c67b75a058c579cca766c4c3d6cf65b700104d9956b7d01f586506547757270b` |
| Après création de la gouvernance, avant commit | `4bc823833f1c943059c5a9746837dcc75592b31b5ca130143b583323336388e1` | `691622c46b7df65bda9649bf6aae64f4b764e0bc5c17f2d44cd77505beba0e17` | `c67b75a058c579cca766c4c3d6cf65b700104d9956b7d01f586506547757270b` |

- **DÉCISION** — Le contrôle post-commit est exécuté après création du commit et rapporté dans l'output M0 externe, car un commit ne peut contenir son propre contrôle postérieur.

## Contrôles reproductibles

- `pwsh -NoProfile -File tools/verify-source-integrity.ps1`
- `pwsh -NoProfile -File tools/scan-secrets.ps1 -Mode Staged`
- `pwsh -NoProfile -File tools/scan-secrets.ps1 -Mode Tracked`
- `pwsh -NoProfile -File tools/scan-secrets.ps1 -Mode WorkingTree`
- `pwsh -NoProfile -File tools/verify-m0.ps1`
- `git check-attr text -- epreuve-deep-research.md AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md`
- `git status --short --ignored`
- `git remote -v`
- `git rev-parse --show-toplevel`

Les sorties de scan indiquent uniquement le chemin, le numéro de ligne et l'identifiant de règle ; jamais la chaîne détectée.

## Résultats avant commit

- **FAIT VALIDÉ** — `SOURCE_INTEGRITY_OK: 3 files`.
- **FAIT VALIDÉ** — `SECRET_SCAN_OK: mode=Staged files=18`.
- **FAIT VALIDÉ** — `M0_VERIFY_OK` pour racine, inventaire, intégrité, attributs, exclusions, secrets, remotes, hooks, identité et jalons.
- **FAIT VALIDÉ** — Dix-huit chemins staged, exactement ceux de l'allowlist M0 ; aucun code applicatif ou manifeste de dépendances.
- **FAIT VALIDÉ** — Attribut `text` non défini pour chacune des trois sources ; blob Git indexé identique aux octets du worktree.
- **FAIT VALIDÉ** — Aucun diff worktree/index sur les sources ; aucun remote ; identité Git disponible sans modification de configuration globale.
- **FAIT VALIDÉ** — Les deux passations sont présentes avec statut Git ignoré et absentes de l'index.

## Preuves M1 — 2026-08-26

- **FAIT VALIDÉ** — Baseline M1 : racine exacte, HEAD `48fd09af8759e59be19e3d06ebe18dc4a3521a5f`, worktree propre, contrôles M0 réussis, trois sources intactes, aucun remote, passations obsolètes ignorées et non lues.
- **FAIT VALIDÉ** — Magasin externe validé sans exposition : `OPENAI_API_KEY=PRESENT`, `GEMINI_API_KEY=PRESENT`.
- **FAIT VALIDÉ** — Probe reproductible : `tools/probes/m1-api-capabilities.ps1`.
- **FAIT VALIDÉ** — Rapport humain : `docs/evidence/M1_API_CAPABILITIES.md`.
- **FAIT VALIDÉ** — Inventaires et résultats machine expurgés : `docs/evidence/m1-api-capabilities-result.json`.
- **FAIT VALIDÉ** — Appels : deux inventaires et quatre générations, aucun retry ; coût conservateur estimé à 0,04687090 USD.
- **FAIT VALIDÉ** — OpenAI et Gemini : authentification, génération, sortie structurée, recherche effective, citations, URLs, usage et latence observés.
- **DÉCISION** — Les sorties textuelles des modèles ne sont pas conservées ; seule la preuve autorisée est enregistrée.

## Preuves M2 — 2026-08-26

### Baseline avant mutation

- **FAIT VALIDÉ** — Racine `C:\Users\maxer\Desktop\GENIAL` ; HEAD `dfb2734c84ef36d07d3817cdb7173778c6bad286` ; titre `test: audit provided API capabilities` ; worktree propre ; aucun remote.
- **FAIT VALIDÉ** — Empreintes recalculées : brief `4bc823833f1c943059c5a9746837dcc75592b31b5ca130143b583323336388e1`, audit `691622c46b7df65bda9649bf6aae64f4b764e0bc5c17f2d44cd77505beba0e17`, plan `c67b75a058c579cca766c4c3d6cf65b700104d9956b7d01f586506547757270b` ; `SOURCE_INTEGRITY_OK: 3 files`.
- **FAIT VALIDÉ** — `SECRET_SCAN_OK: mode=Tracked files=21`.
- **FAIT VALIDÉ** — Deux passations présentes, ignorées, non suivies et non lues.
- **FAIT VALIDÉ** — Aucun chemin ressemblant à un magasin DPAPI n’est suivi ; la preuve M1 conserve seulement `external_dpapi`. M2 n’a pas accédé au magasin.
- **FAIT VALIDÉ — DIVERGENCE EXPLIQUÉE** — Le contrôle M0 initial a rejeté uniquement les trois chemins M1 absents de son allowlist exacte : rapport M1, JSON M1 et probe M1. La racine, les sources, attributs, exclusions, secrets, remotes, hooks, identité et G0 restaient conformes.
- **DÉCISION** — `verify-m0.ps1` vérifie désormais la présence du socle M0 au lieu d’interdire les artefacts des missions ultérieures ; aucune protection d’intégrité, d’exclusion, de secrets ou de remote n’a été retirée.

### Contrats et tests

- **FAIT VALIDÉ** — `docs/PRODUCT_TRUTH_CONTRACT.md` contient le contrat produit, le contrat de vérité et 14 relations de traçabilité explicites au brief.
- **FAIT VALIDÉ** — Le JSON Schema et les fixtures sont syntaxiquement valides ; chaque dossier synthétique passe le schéma.
- **FAIT VALIDÉ** — Six scénarios acceptés : affirmation soutenue, homonyme, conflit, silence, historique et erreur technique.
- **FAIT VALIDÉ** — Cinq mutations en mémoire rejetées pour la raison attendue : preuve supprimée, identité ambiguë complète, silence avec fait, conflit aplati, fait actuel sans qualification temporelle.
- **FAIT VALIDÉ** — Sortie reproductible : `M2_VERIFY_OK: fixtures=6 negative_mutations=5`.
- **FAIT VALIDÉ** — Scan avant staging : `SECRET_SCAN_OK: mode=WorkingTree files=27`.
- **FAIT VALIDÉ** — Scan de l’index : `SECRET_SCAN_OK: mode=Staged files=14`.
- **FAIT VALIDÉ** — Les fixtures portent `synthetic_contract_fixture=true`, `not_demo_data=true`, `not_application_output=true`, utilisent uniquement des noms synthétiques et des domaines réservés `.invalid`.
- **FAIT VALIDÉ** — Le contrat ne contient aucun choix de fournisseur, modèle, stack, architecture, interface ou hébergement ; aucune API n’a été appelée et aucune donnée réelle n’a été collectée.

### Jalons

- **DÉCISION** — G1 est validé selon son critère existant : mission intronisée, ressources comprises et plan de contingence suffisant ; la deadline contractuelle exacte reste explicitement inconnue.
- **FAIT VALIDÉ** — G2 est validé : périmètre, entrée, sortie, vérité, sources, conflits, silence, péremption, erreurs, fixtures et vérificateur sont cohérents avec le brief.
- **DÉCISION** — G3 à G7 restent non terminés.
