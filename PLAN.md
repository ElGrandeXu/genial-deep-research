# Plan de sauvetage

Règle générale : une mission à la fois. Une phase future peut être nommée ici, mais elle ne doit être ni préparée ni commencée avant instruction explicite.

## R1 — Cadre

Figer le MVP, les surfaces préservées, la frontière de simplification, la séquence de livraison et l'état initial dans les quatre documents de sauvetage.

## R2 — Baseline `f776313`

Objectif : établir une photographie reproductible du point de départ sans modifier le comportement applicatif.

Entrée : branche `rescue/minimal-recall` au commit `f77631346f00c7ccf5c90792dc608966b0f8b6fe`, augmentée uniquement du commit documentaire R1.

Étapes autorisées, dans cet ordre :

1. Vérifier la racine, la branche, le HEAD et l'absence de changements inattendus.
2. Relever les versions prescrites de Node, Corepack et pnpm ainsi que les scripts du dépôt.
3. Installer uniquement les dépendances verrouillées si la mission R2 l'autorise explicitement.
4. Exécuter les contrôles locaux existants utiles : lint, types, tests et build, sans appel fournisseur réel.
5. Démarrer localement uniquement si nécessaire pour observer l'UI, le flux SSE et la route health sans lancer de recherche utilisateur.
6. Inventorier le trajet actuel d'une recherche, du formulaire au dossier et aux citations.
7. Localiser la frontière exacte du moteur qui pourra être remplacé sans modifier UI, SSE, Vercel, citations ou sécurité serveur.
8. Classer chaque échec observé comme défaut métier actuel, test historique hors brief ou problème d'environnement.
9. Consigner les commandes, résultats, durées et limites sans corriger le code.
10. Terminer R2 avec un worktree propre ou avec les seuls artefacts explicitement demandés par cette mission.

Critères de sortie : baseline reproductible, surfaces protégées cartographiées, frontière du moteur identifiée, aucune recherche réelle lancée, aucun changement de comportement et aucune action Vercel.

## R3 — Moteur minimal parallèle

Construire sur instruction un moteur minimal derrière une frontière parallèle, sans basculer prématurément le produit.

## R4 — Tests métier locaux

Valider localement le MVP réel et la régression `Erwan Simon` + `GENIAL` + `Bordeaux`, puis aligner les tests historiques pertinents.

## R5 — Preview

Déployer et valider une candidate en Preview uniquement ; Production reste intouchable.

## R6 — Ménage

Retirer sur instruction le moteur remplacé et les contraintes historiques devenues inutiles après validation Preview.

## R7 — Livraison

Préparer la livraison finale et n'agir sur Production qu'après validation Preview et autorisation explicite.
