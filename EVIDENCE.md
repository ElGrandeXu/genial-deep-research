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
