# Entrées M0 et M1

## Registre d'autorité

| Rang | Statut | Rôle | Chemin relatif | Taille brute | SHA-256 | Mutabilité |
|---:|---|---|---|---:|---|---|
| 1 | **EXIGENCE EXPLICITE** | Contrat original | `epreuve-deep-research.md` | 5 853 octets | `4bc823833f1c943059c5a9746837dcc75592b31b5ca130143b583323336388e1` | Immuable |
| 2–3 | **FAIT VALIDÉ / EXIGENCE EXPLICITE** | Faits du mail rapportés, puis audit formel | `AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md` | 50 081 octets | `691622c46b7df65bda9649bf6aae64f4b764e0bc5c17f2d44cd77505beba0e17` | Immuable |
| 4 | **PROPOSITION** | Plan adaptable | `PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md` | 65 212 octets | `c67b75a058c579cca766c4c3d6cf65b700104d9956b7d01f586506547757270b` | Immuable comme entrée ; décisions futures séparées |

- **FAIT VALIDÉ** — Empreintes brutes conformes aux trois valeurs externes avant initialisation Git.
- **DÉCISION** — `SOURCE_SHA256SUMS` est le manifeste versionné ; `tools/verify-source-integrity.ps1` recalcule les octets et échoue sur toute divergence.
- **DÉCISION** — `.gitattributes` désactive la normalisation Git du texte pour ces trois chemins.

## Entrées explicitement exclues

Statut commun : `OBSOLETE — EXCLUDED FROM AUTHORITY, HISTORY AND PROGRESS EVIDENCE`.

- `PASSATION_CHATGPT_GENIAL_2026-08-26.md`
- `PASSATION_MIGRATION_TOUR_GENIAL_2026-08-26.md`

- **FAIT VALIDÉ** — Seuls leurs noms et métadonnées de fichier ont été inspectés ; leur contenu n'a pas été lu.
- **DÉCISION** — Ils restent présents localement, ignorés, non suivis et hors du premier commit.

## Entrées locales M1 non livrables

- **FAIT VALIDÉ — 2026-08-26** — Le magasin DPAPI externe contient exactement deux `PSCredential` nommés `OPENAI_API_KEY` et `GEMINI_API_KEY`, avec `SecureString` non vide.
- **DÉCISION** — Seuls les états `PRESENT` sont conservés. Le magasin, ses valeurs et leurs caractéristiques restent hors de GENIAL, de Git, des logs et des artefacts.
- **DÉCISION** — Ce magasin sert exclusivement aux probes locaux M1 ; il ne préjuge pas du mécanisme de secrets serveur de la future application.

## Sources documentaires M1

- **FAIT VALIDÉ — 2026-08-26** — Documentation API consultée uniquement sur `developers.openai.com`, `platform.openai.com` et `ai.google.dev`.
- **FAIT VALIDÉ** — URLs exactes, tarifs et statuts documentés dans `docs/evidence/M1_API_CAPABILITIES.md` ; inventaires et résultats expurgés dans `docs/evidence/m1-api-capabilities-result.json`.
