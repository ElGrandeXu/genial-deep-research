# Consignes du dépôt de sauvetage

## Mode de travail

- Travailler uniquement dans `C:\Users\maxer\Desktop\GENIAL_RESCUE`.
- Exécuter une seule mission explicitement demandée à la fois.
- Ne pas anticiper, préparer ou commencer la mission suivante.
- Vérifier branche, HEAD et statut avant et après chaque mission.
- Préserver les changements existants qui ne relèvent pas de la mission.
- Ne jamais toucher à Production avant validation explicite de la Preview candidate.

## Contrat produit

- Le MVP est une application web de recherche sur une personne ou une entreprise.
- L'entrée est un nom, avec un contexte facultatif tel que ville, secteur ou employeur.
- La sortie est un dossier court, lisible, exploitable et appuyé sur des sources.
- Toute affirmation factuelle doit rester rattachable à une source jusque dans l'UI.
- Une difficulté doit produire une clarification, un silence ou une limite explicite, jamais une invention.
- L'attente de plusieurs dizaines de secondes et le résultat sont des états UX de premier rang.
- Une URL déployée et un README suffisant pour relancer l'application font partie du MVP.

## Régression obligatoire

- Le cas `Erwan Simon` avec le contexte `GENIAL` et `Bordeaux` est obligatoire.
- Il doit exercer une recherche réelle, non préparée et non codée en dur.
- Son résultat doit respecter l'identité, la traçabilité, les citations et les refus sûrs.

## Frontières de modification

- Préserver l'UI, le protocole SSE, Vercel, les citations et la sécurité serveur.
- Le moteur de recherche actuel est préservé par défaut.
- R2 teste et observe la base `f776313` sans changer le code ni le comportement.
- R3 simplifie le moteur existant en retirant uniquement les blocages observés en R2.
- Aucune réécriture ni aucun moteur parallèle n'est autorisé sans décision explicite après R2.
- Chaque correctif doit être isolé et prouvé par un test métier réel.
- Conserver les secrets côté serveur, la validation des entrées et les protections réseau et d'abus.
- Le comportement métier réel conforme au brief prime sur les anciens tests.
- Mettre à jour ou retirer un test historique s'il impose un comportement hors brief.

## Sources historiques

- Les anciens README, contrats, tests, captures, reçus et preuves décrivent l'histoire du projet.
- Ils ne créent aucune exigence supplémentaire lorsqu'ils dépassent le brief courant.
- Les consulter comme contexte, jamais comme extension tacite du périmètre.

## Livraison

- Valider localement avant toute Preview.
- Valider la Preview avant toute action Production.
- Ne promouvoir en Production que sur instruction explicite après cette validation.
