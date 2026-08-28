# CONFLIT — preuve déterministe de bout en bout

Date : 2026-08-28
Nature : **scénario de test déterministe, données synthétiques, aucun appel fournisseur**
Coût fournisseur : **0 USD**

Cette preuve ne constitue pas un résultat live. Les domaines `.invalid`, les noms et les chiffres sont volontairement synthétiques ; aucune donnée fournisseur n’est figée dans le runtime applicatif.

## Cas contrôlé

| Dimension | Version A | Version B | Contrôle |
|---|---|---|---|
| Entité | Entreprise Synthétique Borée | Entreprise Synthétique Borée | identique |
| Métrique | chiffre d’affaires publié | chiffre d’affaires publié | identique |
| Période | exercice 2025 | exercice 2025 | identique |
| Périmètre | société Borée | société Borée | identique |
| Unité / devise | million / EUR | million / EUR | identique |
| Nature | publiée | publiée | identique |
| Valeur | 10 | 12 | incompatible |
| Page | rapport synthétique officiel | analyse synthétique spécialisée | distincte |

Décision attendue : `contradiction`, deux versions conservées avec leur affirmation, leur extrait exact et leur page ; aucune valeur gagnante ; aucune version contestée dans la lecture rapide ou les faits ordinaires.

## Chaîne automatique

- `tests/numeric-normalization.test.ts` exige dans une même proposition le sujet attendu, la métrique allowlistée (`revenue` ou `workforce`), sa valeur exacte et son unité ou sa devise reconnue, puis redérive année explicitement civile ou fiscale, portée, base d’observation et nature. Sujet différent, segment, valeur ou devise prise ailleurs, année nue, TTM/LTM, approximation, intervalle, taux, variation, sous-période, nombre ambigu ou tronqué, population/base d’effectif ou définition de revenu hors grammaire et métadonnée mensongère restent `indetermination`.
- `tests/research.test.ts` exerce l’orchestrateur complet : qualification, deux claims `contested`, deux sources, deux valeurs, exclusion du résumé et invariants runtime ; un faux conflit déclaré par métadonnées ou par deux variantes de requête du même document est rejeté.
- `tests/runtime-invariants.test.ts` mute séparément nature, valeur finie, métrique extraite, version, prédicat, période, portée, portée source, unité/devise, qualification de preuve, accessibilité de page, chemins distincts, empreintes distinctes et résumé ; chaque disparition ou divergence échoue fermée. Les tests de normalisation rejettent aussi un périmètre de maison mère non lié à l’entité résolue.
- `tests/research-ui.test.ts` masque le dossier si une version, sa source, sa portée, sa métrique extraite, sa valeur numérique ou sa preuve qualifiante disparaît.
- `tests/e2e/research.spec.ts` injecte le dossier par interception locale de `/api/research` et vérifie, séparément à 1 440 puis 390 px, les deux valeurs, les deux liens, la période, le périmètre, la décision de sécurité, l’absence de fait ordinaire et l’absence d’overflow.

## Captures étiquetées

- [Desktop 1 440 px — scénario déterministe](../../captures/final-2026-08-28/deterministic/conflict-1440.png) — SHA-256 `395FAB40F31840BFE84B6022A24810E8FADDD8D363BBEA42903F544448127AC1`
- [Mobile 390 px — scénario déterministe](../../captures/final-2026-08-28/deterministic/conflict-390.png) — SHA-256 `1EAFB5601DA9435F9C003C2FA174A9AF6B7BE9F2FD2BDF0748ABFF90102B39D9`

L’étiquette « Scénario de test déterministe : données synthétiques, aucun appel fournisseur et aucun coût » est visible dans chaque capture.

## Portée live

Aucun candidat live CONFLIT suffisamment stable n’a été retenu. Le budget du bench préenregistré avait déjà dépassé son plafond de `0,0005530 USD` ; effectuer des essais successifs aurait ajouté du coût et un risque de sélection a posteriori sans meilleure preuve méthodologique. Aucun appel CONFLIT live n’a donc été effectué et aucune validation live dédiée n’est revendiquée.
