# Validation Preview et Production

Date : 27 août 2026.

## Artefact source

- commit runtime : `c2cd173f0c3379d87b9d38910bf0270c64286b99` ;
- branche : `main` ;
- worktree propre avant déploiement ;
- build local et vérificateur cumulatif verts avant Preview.

## Preview

- URL : <https://genial-deep-research-7rz6z1gol-el-grande-xue.vercel.app> ;
- identifiant : `dpl_BmkDix79LoCAQ88AZprU5NWNbLvd` ;
- cible inspectée : `preview` ;
- état : `READY` ;
- runtime : Node.js 24 ;
- `/` : HTTP 200 ;
- `/api/health` : HTTP 200, `status=ok` ;
- CSP et `X-Content-Type-Options` présents ;
- dossier réel : `partial`, identité OpenAI résolue, 1 fait, 1 source, `16 086 ms`, `0,02479644 $` ;
- inspection visuelle : 1 440 px, aucune largeur excédentaire, preuve et source visibles.

Preuves : [capture](../../captures/release/preview-success-final-desktop.png) et [flux terminal expurgé](preview-success-final-desktop.json).

## Promotion

Commande Vercel : [promotion documentée](https://vercel.com/docs/deployments/promoting-a-deployment) de la Preview ci-dessus. Vercel crée une enveloppe de déploiement Production afin d’y relier les variables sensibles Production, sans changement de commit source.

- identifiant Production : `dpl_AnDDXuGmCsQBnbyFTfbd866WDipD` ;
- cible : `production` ;
- état : `READY` ;
- métadonnée `action` : `promote` ;
- métadonnée `originalDeploymentId` : `dpl_BmkDix79LoCAQ88AZprU5NWNbLvd` ;
- commit Vercel : `c2cd173f0c3379d87b9d38910bf0270c64286b99` ;
- alias canonique : <https://genial-deep-research.vercel.app>.

## Smokes Production

- `/` : HTTP 200, nouvelle interface « Un dossier. Des preuves. » ;
- `/api/health` : HTTP 200, `status=ok` ;
- `/api/research` : trois terminaux métier réels validés ;
- succès : 6 faits, 3 pages, `16 460 ms`, `0,02500484 $` ;
- homonyme : clarification, 3 candidats, `14 321 ms`, `0,03446444 $` ;
- silence : 0 fait, 0 source, `8 874 ms`, `0,01205174 $` ;
- desktop 1 440 px et mobile 390 px : aucune largeur excédentaire ;
- aucun secret ou chemin interne dans les réponses et artefacts publics contrôlés.

Preuves finales :

- [succès desktop](../../captures/release/production-success-desktop.png) — [JSON](production-success-desktop.json) ;
- [homonyme desktop](../../captures/release/production-homonym-desktop.png) — [JSON](production-homonym-desktop.json) ;
- [silence mobile](../../captures/release/production-silence-mobile.png) — [JSON](production-silence-mobile.json).
