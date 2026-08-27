# Matrice finale G0–G12

Date : 2026-08-28

Règle : `SUCCESS` interdit si un gate échoue ou si le réaudit est inférieur à `90/100`.

| Gate | Statut | Preuve principale |
|---|---|---|
| G0 — baseline et intégrité | PASS | Sources intactes ; baseline `98e7e07`, runtime candidat `8e91ed0`, branche `fix/audit-01-truth-gates` documentés. |
| G1 — identité unique | PASS | `resolved` exige un candidat éligible unique ; tests adversariaux candidat multiple et statut fournisseur non autoritaire. |
| G2 — contexte prouvé | PASS | Signaux forts/moyens dérivés des extraits et domaines vérifiés ; Airbus/holdout restent en clarification lorsque le signal manque. |
| G3 — sujet et portée | PASS | Clé sujet, type, portée, libellé et ancre page contrôlés ; matrice filiale/groupe déterministe verte. |
| G4 — qualité et complétude | PASS | 3–6 faits métier, 2 catégories/pages/domaines et zéro manque critique exigés ; GENIAL est correctement `partial`. |
| G5 — temporalité | PASS | `current` exige une formulation explicite et une date exacte du jour ; année ou date récente seules deviennent historiques/inconnues. PÉREMPTION live non revendiquée. |
| G6 — traçabilité | PASS | Chaîne `Source → Evidence → Claim → Presentation`, vérification directe d’extrait et masque client testés. |
| G7 — GENIAL | PASS | Une exécution préenregistrée : identité résolue, deux faits non dupliqués, statut `partial`, coût `0,0141440 $`. |
| G8 — cas d’épreuve | PASS avec limites déclarées | HOMONYME et SILENCE ferment sans fait ; FILIALE ne mélange aucune métrique groupe ; PÉREMPTION, CONFLIT et MARQUE non revendiqués en live. |
| G9 — UX | PASS | 8 parcours Playwright, focus/annulation/SSE/clarification/4 terminaux ; aucun overflow 390/1440. |
| G10 — qualité technique | PASS | `corepack pnpm verify` : 478 Vitest, 8 Playwright, build, scans, audit et Lighthouse 100/100/100/100 desktop, 99/100/100/100 mobile. |
| G11 — coût et sécurité opérationnelle | **FAIL** | Chaque fiche `<0,10 $`, secret serveur et WAF actifs ; cumul final `0,1205530 $ > 0,1200000 $`. |
| G12 — restitution | PASS | Production promue, dépôt public, historique, clone propre, README, PDF 3 pages, captures et reçus versionnés. |

## Décision

```text
Réaduit : 92/100
Gates : 12 PASS, 1 FAIL
Statut final : BLOCKED — G11
Écart exact : +0,0005530 USD sur le bench final
```

Le dépassement est irréversible pour ce bench : supprimer une preuve ou arrondir le cumul constituerait une sélection a posteriori. La release technique reste publique et vérifiée, mais aucun `SUCCESS` n’est déclaré.
