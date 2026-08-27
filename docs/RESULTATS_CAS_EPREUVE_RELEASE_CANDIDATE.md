# Résultats des cas d’épreuve

État : exécutions réelles du candidat staging du 27 août 2026, sans résultat figé ni injection de dossier. Les JSON liés contiennent le flux public terminal et le reçu expurgé ; les captures proviennent de l’interface qui a déclenché chaque recherche.

## 1. Succès — entreprise documentée

Entrée exacte :

```text
Type : Entreprise
Nom : OpenAI
Contexte : Entreprise IA, San Francisco, site officiel openai.com
```

### Desktop

- comportement : identité résolue, dossier `complete_within_scope` ;
- résultat : 5 faits, 2 pages source distinctes, 1 preuve rejetée rendue visible ;
- durée : `12 483 ms` ;
- usage : 1 appel fournisseur, 1 recherche, 1 inspection, 7 récupérations de page ;
- coût estimé : `0,02470444 $` ;
- sources retenues : [About | OpenAI](https://openai.com/about/) et [Scaling AI for everyone | OpenAI](https://openai.com/index/scaling-ai-for-everyone/).

Les faits vérifiés couvrent la nature de l’entreprise, sa mission, sa structure Foundation/Group, une annonce d’investissement et un partenariat avec Amazon. Chaque texte affiché est l’extrait exact retrouvé sur l’une des deux pages.

- [Capture desktop](captures/release/staged-success-desktop.png)
- [Reçu et dossier expurgés](evidence/release/staged-success-desktop.json)

### Mobile et péremption

La même entrée à 390 px a produit un autre dossier réel : 3 faits, 2 pages, `9 793 ms`, `0,01296104 $`. La source supplémentaire est [Our structure | OpenAI](https://openai.com/our-structure/). La phrase « OpenAI was founded in 2015 as a nonprofit. » porte la période 2015 et l’état `historical`, au lieu d’être présentée comme un signal actuel.

- [Capture mobile](captures/release/staged-success-mobile.png)
- [Reçu et dossier expurgés](evidence/release/staged-success-mobile.json)

## 2. HOMONYME — refus de fusion

Entrée exacte :

```text
Type : Personne
Nom : Thomas Martin
Contexte : [vide]
```

- comportement : `needs_clarification`, identité `ambiguous` ;
- résultat : aucun fait attribué à une identité sélectionnée ; trois candidats distincts sont présentés ;
- candidats : Thomas Martin (1783–1834), mystique français ; Thomas Henri Martin (1813–1884), historien helléniste français ; Thomas S. Martin (1847–1919), sénateur américain ;
- source de désambiguïsation : [Thomas Martin (homonymie) — Wikipédia](https://fr.wikipedia.org/wiki/Thomas_Martin_(homonymie)) ;
- durée : `12 498 ms` ;
- usage : 1 appel fournisseur, 1 recherche, 2 inspections ;
- coût estimé : `0,03583244 $`.

L’interface demande un indice distinctif — ville, secteur, employeur ou autre contexte — et ne produit pas un dossier confiant. Les trois extraits proviennent de la même page : ils suffisent à démontrer l’ambiguïté, pas à documenter chaque personne.

- [Capture desktop](captures/release/staged-homonym-desktop.png)
- [Reçu et dossier expurgés](evidence/release/staged-homonym-desktop.json)

## 3. SILENCE — preuves publiques insuffisantes

Entrée exacte :

```text
Type : Entreprise
Nom : Société Azur Pamplemousse 9137
Contexte : Nom fourni sans pays, ville ni site officiel
```

- comportement : `insufficient_evidence`, identité `not_found_within_scope` ;
- résultat : 0 fait, 0 source, aucune fiche vide présentée comme succès ;
- durée : `5 249 ms` ;
- usage : 1 appel fournisseur, 1 recherche, 0 inspection ;
- coût estimé : `0,01208396 $`.

Le libellé limite explicitement la conclusion au périmètre Web consulté et invite à ajouter pays, ville ou site officiel. Il ne prétend pas que l’entreprise n’existe pas.

- [Capture mobile](captures/release/staged-silence-mobile.png)
- [Reçu et dossier expurgés](evidence/release/staged-silence-mobile.json)

## Inspection visuelle

Les captures ont été prises aux dimensions exactes 1 440 px et 390 px avec le candidat réellement déployé. Contrôles : largeur document égale à la largeur client, aucun débordement horizontal, aucune carte vide, aucun chevauchement du panneau d’attente, liens visibles et hiérarchie lisible. Le parcours est utilisable au clavier ; le résultat reçoit le focus après terminaison et l’annulation reste accessible pendant l’attente.

## Cas non retenus

- CONFLIT : regroupement, affichage des versions et absence de vainqueur silencieux sont implémentés et couverts par tests, mais aucun conflit live assez propre n’a été forcé.
- FILIALE : non exécuté ; risque de détourner le temps de la boucle centrale et de la qualité des preuves.
- MARQUE : non exécuté ; la frontière personne/entreprise et l’homonymie apportent une démonstration d’identité plus nette.
- PÉREMPTION : traitée dans le succès mobile, sans constituer un quatrième scénario indépendant.

## Coût des cas retenus

Le total des quatre exécutions ci-dessus est `0,08558188 $`. Chaque fiche reste sous `0,10 $`. Le coût cumulé de mission et sa borne prudente incluant les essais rejetés sont détaillés dans la [note d’arbitrage](NOTE_ARBITRAGE_RELEASE_CANDIDATE.md#coûts-mesurés).
