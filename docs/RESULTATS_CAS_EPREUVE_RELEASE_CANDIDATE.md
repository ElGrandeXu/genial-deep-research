# Résultats des cas d’épreuve

État : exécutions réelles en Production le 27 août 2026, sans résultat figé ni injection de dossier. Les JSON liés contiennent le flux public terminal et le reçu expurgé ; les captures proviennent de l’interface qui a déclenché chaque recherche sur <https://genial-deep-research.vercel.app>.

## Validation Preview

Le commit runtime `c2cd173f0c3379d87b9d38910bf0270c64286b99` a été déployé en Preview sous l’identifiant Vercel `dpl_BmkDix79LoCAQ88AZprU5NWNbLvd`. `/` et `/api/health` ont répondu 200. Une vraie recherche OpenAI a terminé en dossier limité honnête : identité résolue, 1 fait, 1 page, `16 086 ms`, `0,02479644 $`. La sortie ne satisfaisait pas les seuils de complétude et l’interface l’a correctement indiqué.

- [Capture Preview](captures/release/preview-success-final-desktop.png)
- [Reçu Preview expurgé](evidence/release/preview-success-final-desktop.json)

Cette Preview a ensuite été promue par Vercel. Le déploiement Production `dpl_AnDDXuGmCsQBnbyFTfbd866WDipD` conserve dans ses métadonnées `originalDeploymentId=dpl_BmkDix79LoCAQ88AZprU5NWNbLvd` et le même commit source. Les variables sensibles sont reliées à l’environnement Production pendant la promotion.

## 1. Succès — entreprise documentée

Entrée exacte :

```text
Type : Entreprise
Nom : OpenAI
Contexte : Entreprise IA, San Francisco, site officiel openai.com
```

- comportement : identité résolue, dossier `complete_within_scope` ;
- résultat : 6 faits, 3 pages source distinctes ;
- durée : `16 460 ms` ;
- usage : 1 appel fournisseur, 1 recherche, 1 inspection, 7 récupérations de page ;
- coût estimé : `0,02500484 $` ;
- sources retenues : [About | OpenAI](https://openai.com/about/), [Our structure | OpenAI](https://openai.com/our-structure/) et [OpenAI appoints Dali Rajic as Chief Revenue Officer](https://openai.com/index/dali-rajic-chief-revenue-officer/).

Les faits vérifiés couvrent la nature de l’entreprise, son objectif déclaré, sa fondation, sa structure Foundation/Group, l’audience annoncée de ses produits et la nomination d’un Chief Revenue Officer. Chaque texte affiché est l’extrait exact retrouvé sur l’une des trois pages.

La phrase « OpenAI was founded in 2015 as a nonprofit. » porte la période 2015 et l’état `historical`, au lieu d’être présentée comme un signal actuel.

- [Capture Production desktop](captures/release/production-success-desktop.png)
- [Reçu et dossier Production expurgés](evidence/release/production-success-desktop.json)

Une exécution staging antérieure de la même entrée à 390 px avait déjà produit 3 faits, 2 pages et le même marquage historique. Elle reste conservée pour la preuve responsive : [capture mobile](captures/release/staged-success-mobile.png) et [reçu](evidence/release/staged-success-mobile.json).

## 2. HOMONYME — refus de fusion

Entrée exacte :

```text
Type : Personne
Nom : Thomas Martin
Contexte : [vide]
```

- comportement : `needs_clarification`, identité `ambiguous` ;
- résultat : aucun fait attribué à une identité sélectionnée ; trois candidats distincts sont présentés ;
- candidats : Thomas Byam Martin (1773–1854), amiral britannique ; Thomas Martin (1783–1834), mystique français ; Thomas Henri Martin (1813–1884), historien helléniste français ;
- page de désambiguïsation : [Thomas Martin (homonymie) — Wikipédia](https://fr.wikipedia.org/wiki/Thomas_Martin_(homonymie)) ;
- durée : `14 321 ms` ;
- usage : 1 appel fournisseur, 1 recherche, 2 inspections, 3 vérifications de page ;
- coût estimé : `0,03446444 $`.

L’interface demande un indice distinctif — ville, secteur, employeur, pays ou site officiel — et ne produit pas un dossier confiant. Les trois extraits proviennent de la même page : ils suffisent à démontrer l’ambiguïté, pas à documenter chaque personne.

- [Capture Production desktop](captures/release/production-homonym-desktop.png)
- [Reçu et dossier Production expurgés](evidence/release/production-homonym-desktop.json)

## 3. SILENCE — preuves publiques insuffisantes

Entrée exacte :

```text
Type : Entreprise
Nom : Société Azur Pamplemousse 9137
Contexte : Nom fourni sans pays, ville ni site officiel
```

- comportement : `insufficient_evidence`, identité `not_found_within_scope` ;
- résultat : 0 fait, 0 source, aucune fiche vide présentée comme succès ;
- durée : `8 874 ms` ;
- usage : 1 appel fournisseur, 1 recherche, 0 inspection, 0 récupération de page ;
- coût estimé : `0,01205174 $`.

Le libellé limite explicitement la conclusion au périmètre Web consulté et invite à ajouter pays, ville ou site officiel. Il ne prétend pas que l’entreprise n’existe pas.

- [Capture Production mobile](captures/release/production-silence-mobile.png)
- [Reçu et dossier Production expurgés](evidence/release/production-silence-mobile.json)

## Inspection visuelle

Les captures finales ont été prises aux dimensions exactes 1 440 px et 390 px. Les trois parcours présentent une largeur document égale à la largeur client : aucun débordement horizontal, carte vide, chevauchement du panneau d’attente ou texte coupé. Les liens sont visibles, les faits et extraits adjacents, les candidats séparés et le silence non trompeur. Le résultat reçoit le focus après terminaison et l’annulation reste accessible pendant l’attente.

## Cas non retenus

- CONFLIT : regroupement, affichage des versions et absence de vainqueur silencieux sont implémentés et couverts par tests, mais aucun conflit live assez propre n’a été forcé.
- FILIALE : non exécuté ; risque de détourner le temps de la boucle centrale et de la qualité des preuves.
- MARQUE : non exécuté ; la frontière personne/entreprise et l’homonymie apportent une démonstration d’identité plus nette.
- PÉREMPTION : traitée dans le succès Production, sans constituer un quatrième scénario indépendant.

## Coût des validations finales

Le total des trois cas Production est `0,07152102 $`. Avec le dossier Preview, la boucle finale Preview → Production coûte `0,09631746 $`. Chaque fiche reste sous `0,10 $`. La borne prudente de toute la mission, essais rejetés inclus, est détaillée dans la [note d’arbitrage](NOTE_ARBITRAGE_RELEASE_CANDIDATE.md#coûts-mesurés).
