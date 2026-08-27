# Bench live final — Preview promue

Date : 2026-08-28

Preview : `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`

URL testée : <https://genial-deep-research-2vqm7di0u-el-grande-xue.vercel.app>

Commit source : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`

## Protocole

- Entrées et ordre gelés avant exécution dans `LIVE_BENCH_PREREGISTRATION.md` et `HOLDOUT_PREREGISTRATION.md`.
- Une seule exécution par entrée ; aucun rerun ni sélection du meilleur résultat.
- Exécution séquentielle ; reçu terminal, durée, coût et capture conservés pour chaque appel.
- Les cinq cas obligatoires ont été exécutés. Le dépassement n’a été observable qu’au reçu du cinquième appel ; arrêt immédiat ensuite.

## Résultats bruts

| # | Entrée exacte | Terminal | Identité | Faits / sources | Durée | Coût estimé | Décision |
|---:|---|---|---|---:|---:|---:|---|
| 1 | `company` · `GENIAL` · `Agence IA générative, Bordeaux, site officiel wearegenial.com` | `partial` | `resolved`, 1 candidat | 2 / 2 | 13,688 s | `0,0141440 $` | PASS sécurité et G7 : deux faits atomiques, aucun doublon, statut déclassé car une seule famille d’éditeur. Couverture commerciale limitée. |
| 2 | `person` · `Thomas Martin` · contexte vide | `insufficient_evidence` | `not_found_within_scope` | 0 / 0 | 12,968 s | `0,0455815 $` | PASS fail-closed : aucun fait certain ni fusion. Limite : aucun candidat exploitable n’a survécu à la vérification. |
| 3 | `company` · `Airbus SAS` · `Filiale française basée à Toulouse, distincte du groupe Airbus SE` | `needs_clarification` | `insufficient_context`, 1 candidat | 1 / 1 | 13,667 s | `0,0249935 $` | PASS portée : preuve légale Airbus SAS conservée, aucune métrique Airbus SE attribuée. Résolution volontairement trop conservatrice. |
| 4 | `company` · `Société Azur Pamplemousse 9137` · `Nom fourni sans pays, ville ni site officiel` | `insufficient_evidence` | `not_found_within_scope` | 0 / 0 | 4,437 s | `0,0111351 $` | PASS SILENCE : zéro fait, zéro source, limite documentaire distincte d’une panne. |
| 5 | `company` · `Google Ireland Limited` · contexte officiel préenregistré | `needs_clarification` | `insufficient_context`, 1 candidat | 1 / 1 | 10,692 s | `0,0246989 $` | PASS holdout sécurité : entité légale exacte, aucune donnée Google LLC/Alphabet. Aucun patch nominal. |

Tous les terminaux sont `completed`, sans timeout ni retry applicatif. Chaque fiche reste `< 0,10 $`. Thomas Martin dépasse la cible indicative `≤ 0,04 $` à cause de quatre actions outil.

## Sorties terminales de capture

Le champ local éphémère `profile` est omis ; tous les autres champs de sortie sont conservés.

```json
{"outputPath":"docs/captures/final-2026-08-28/live/01-genial-1440.png","width":1440,"height":3863,"overflow":{"clientWidth":1440,"scrollWidth":1440,"activeElement":"result-focus","resultStatus":"Résultat limité"},"evidencePath":"docs/evidence/final-2026-08-28/live/01-genial.json","terminal":{"state":"completed","elapsedMs":13688,"globalStatus":"partial","identityStatus":"resolved","claimCount":2,"sourceCount":2,"estimatedCostUsd":0.014144}}
{"outputPath":"docs/captures/final-2026-08-28/live/02-thomas-martin-390.png","width":390,"height":3418,"overflow":{"clientWidth":390,"scrollWidth":390,"activeElement":"result-focus","resultStatus":"Preuves insuffisantes"},"evidencePath":"docs/evidence/final-2026-08-28/live/02-thomas-martin.json","terminal":{"state":"completed","elapsedMs":12968,"globalStatus":"insufficient_evidence","identityStatus":"not_found_within_scope","claimCount":0,"sourceCount":0,"estimatedCostUsd":0.0455815}}
{"outputPath":"docs/captures/final-2026-08-28/live/03-airbus-sas-1440.png","width":1440,"height":3946,"overflow":{"clientWidth":1440,"scrollWidth":1440,"activeElement":"result-focus","resultStatus":"Clarification requise"},"evidencePath":"docs/evidence/final-2026-08-28/live/03-airbus-sas.json","terminal":{"state":"completed","elapsedMs":13667,"globalStatus":"needs_clarification","identityStatus":"insufficient_context","claimCount":1,"sourceCount":1,"estimatedCostUsd":0.0249935}}
{"outputPath":"docs/captures/final-2026-08-28/live/04-silence-390.png","width":390,"height":3299,"overflow":{"clientWidth":390,"scrollWidth":390,"activeElement":"result-focus","resultStatus":"Preuves insuffisantes"},"evidencePath":"docs/evidence/final-2026-08-28/live/04-silence.json","terminal":{"state":"completed","elapsedMs":4437,"globalStatus":"insufficient_evidence","identityStatus":"not_found_within_scope","claimCount":0,"sourceCount":0,"estimatedCostUsd":0.0111351}}
{"outputPath":"docs/captures/final-2026-08-28/live/05-holdout-google-ireland-limited-1440.png","width":1440,"height":3642,"overflow":{"clientWidth":1440,"scrollWidth":1440,"activeElement":"result-focus","resultStatus":"Clarification requise"},"evidencePath":"docs/evidence/final-2026-08-28/live/05-holdout-google-ireland-limited.json","terminal":{"state":"completed","elapsedMs":10692,"globalStatus":"needs_clarification","identityStatus":"insufficient_context","claimCount":1,"sourceCount":1,"estimatedCostUsd":0.0246989}}
```

## Budget

```text
0,0141440
+ 0,0455815
+ 0,0249935
+ 0,0111351
+ 0,0246989
= 0,1205530 USD
```

Enveloppe stricte : `≤ 0,1200000 USD`.

Écart : `+0,0005530 USD` (`+0,46 %`).

Décision : **G11 FAIL**. Le bench ne respecte pas la borne exacte, même si les cinq fiches restent sous la limite unitaire. Aucun appel fournisseur supplémentaire n’a été effectué ; la relance Thomas Henri Martin et PÉREMPTION ne sont pas revendiquées.

## Reçus et captures

| Cas | Reçu expurgé | Capture |
|---|---|---|
| GENIAL | [`01-genial.json`](live/01-genial.json) | [`01-genial-1440.png`](../../captures/final-2026-08-28/live/01-genial-1440.png) |
| Thomas Martin | [`02-thomas-martin.json`](live/02-thomas-martin.json) | [`02-thomas-martin-390.png`](../../captures/final-2026-08-28/live/02-thomas-martin-390.png) |
| Airbus SAS | [`03-airbus-sas.json`](live/03-airbus-sas.json) | [`03-airbus-sas-1440.png`](../../captures/final-2026-08-28/live/03-airbus-sas-1440.png) |
| SILENCE | [`04-silence.json`](live/04-silence.json) | [`04-silence-390.png`](../../captures/final-2026-08-28/live/04-silence-390.png) |
| Holdout | [`05-holdout-google-ireland-limited.json`](live/05-holdout-google-ireland-limited.json) | [`05-holdout-google-ireland-limited-1440.png`](../../captures/final-2026-08-28/live/05-holdout-google-ireland-limited-1440.png) |

Les captures indiquent `scrollWidth === clientWidth` à 390 et 1 440 px : aucun overflow horizontal observé.
