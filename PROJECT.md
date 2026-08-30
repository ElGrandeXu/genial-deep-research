# GENIAL — contrat du sauvetage minimal

## Cible produit

GENIAL est une application web qui transforme le nom d'une personne ou d'une entreprise, éventuellement accompagné d'un contexte, en un dossier public court, lisible et sourcé.

Le produit aide à préparer un premier contact sans fusionner des homonymes, inventer des faits ou masquer l'incertitude. Trois éléments solides valent mieux que dix éléments fragiles.

## MVP exact

1. Accepter un nom de personne ou d'entreprise.
2. Accepter facultativement un contexte comme une ville, un secteur ou un employeur.
3. Lancer une recherche Web réelle, sans résultats préparés pour la démonstration.
4. Présenter une attente de plusieurs dizaines de secondes de façon compréhensible.
5. Produire un dossier utile dont chaque affirmation factuelle est liée à une source consultable.
6. Faire survivre le lien entre affirmation, preuve et URL jusqu'à l'écran.
7. Signaler clairement l'ambiguïté, le manque de données, la contradiction, la péremption ou l'échec technique lorsque le système ne peut pas conclure sûrement.
8. Être accessible en ligne et documenté par un README suffisant pour être relancé.

Le MVP n'impose ni rubriques fixes, ni couverture des six cas d'épreuve, ni exhaustivité. Il doit reconnaître ses limites au lieu de produire une réponse confiante et fausse.

## Régression métier obligatoire

Entrée de référence :

- personne : `Erwan Simon` ;
- contexte : `GENIAL` et `Bordeaux`.

Ce cas doit traverser le vrai moteur de recherche. Aucun fixture, résultat figé, branchement nominatif ou contenu codé en dur n'est acceptable. Le résultat doit attribuer les faits à la bonne personne ou refuser proprement de conclure, avec des citations visibles et vérifiables.

## Surfaces à préserver

- **UI** : formulaire, attente, annulation, erreurs, limites et dossier restent utilisables.
- **SSE** : le contrat de streaming entre serveur et client reste compatible.
- **Vercel** : l'application reste construisible et exploitable dans son hébergement actuel.
- **Citations** : chaque fait affiché conserve sa preuve et son URL publique.
- **Sécurité serveur** : secrets non exposés, entrées validées, URL contrôlées, protections SSRF et abus conservées.

## Zone remplaçable

Le moteur de recherche et sa stratégie interne de collecte, sélection et synthèse constituent la seule zone fonctionnelle à simplifier. La simplification doit réduire la complexité tout en conservant le contrat du MVP et les surfaces ci-dessus.

## Priorité des exigences

1. Brief de l'épreuve et instructions explicites de la mission courante.
2. Comportement métier réel observé sur le MVP et la régression obligatoire.
3. Contrats nécessaires aux surfaces préservées.
4. Tests et documentation historiques.

Un ancien test qui contredit le brief ne définit pas le produit : il doit être réévalué. Les anciens README, contrats, tests, preuves, captures et reçus restent des archives utiles, mais ne deviennent pas des exigences s'ils dépassent le brief.

## Hors périmètre du MVP

- Comptes, authentification et multi-utilisateur.
- Performance à grande échelle ou traitement de plusieurs fiches en parallèle.
- Couverture exhaustive des cas d'épreuve.
- Conservation de données personnelles au-delà du besoin immédiat.
- Contournement des conditions d'utilisation d'un service.

## Chemin de livraison

Une candidate doit d'abord satisfaire les contrôles métier locaux, notamment `Erwan Simon` + `GENIAL` + `Bordeaux`. Elle est ensuite déployée en Preview et validée sur cette URL. Production reste intouchable jusqu'à validation explicite de la Preview et instruction de promotion.
