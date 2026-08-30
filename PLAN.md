# Plan de sauvetage

Règle générale : une mission à la fois. Une phase future peut être nommée ici, mais elle ne doit être ni préparée ni commencée avant instruction explicite.

## R1 — Cadre

Figer le MVP, les surfaces préservées, la frontière de simplification, la séquence de livraison et l'état initial dans les quatre documents de sauvetage.

## R2 — Baseline `f776313`

Objectif : tester la base `f776313` et établir une photographie reproductible du point de départ sans modifier le code ni le comportement applicatif. Le moteur actuel reste préservé par défaut.

Entrée : branche `rescue/minimal-recall` au commit `f77631346f00c7ccf5c90792dc608966b0f8b6fe`, augmentée uniquement du commit documentaire R1.

Étapes autorisées, dans cet ordre :

1. Vérifier la racine, la branche, le HEAD et l'absence de changements inattendus.
2. Relever les versions prescrites de Node, Corepack et pnpm ainsi que les scripts du dépôt.
3. Installer uniquement les dépendances verrouillées si la mission R2 l'autorise explicitement.
4. Exécuter les contrôles locaux existants utiles : lint, types, tests et build, sans appel fournisseur réel.
5. Démarrer localement uniquement si nécessaire pour observer l'UI, le flux SSE et la route health sans lancer de recherche utilisateur.
6. Inventorier le trajet actuel d'une recherche, du formulaire au dossier et aux citations.
7. Identifier les blocages observables du moteur actuel et leur frontière exacte, sans les corriger.
8. Classer chaque échec observé comme défaut métier actuel, test historique hors brief ou problème d'environnement.
9. Consigner les commandes, résultats, durées et limites sans corriger le code.
10. Terminer R2 avec un worktree propre ou avec les seuls artefacts explicitement demandés par cette mission.

Critères de sortie : baseline reproductible, surfaces protégées cartographiées, blocages observés documentés, aucune recherche réelle lancée, aucun changement de code ou de comportement et aucune action Vercel.

## R3 — Simplification ciblée des blocages observés

Simplifier en place le moteur existant en retirant uniquement les blocages prouvés par R2. Chaque correctif doit être isolé et validé par un test métier réel. Aucune réécriture ni aucun moteur parallèle ne sont autorisés sans décision explicite après R2.

## R4 — Tests métier locaux

Valider localement le MVP réel et la régression `Erwan Simon` + `GENIAL` + `Bordeaux`, puis aligner les tests historiques pertinents.

## R5 — Preview

Déployer et valider une candidate en Preview uniquement ; Production reste intouchable.

## R6 — Ménage

Retirer sur instruction le moteur remplacé et les contraintes historiques devenues inutiles après validation Preview.

## R7 — Livraison

Préparer la livraison finale et n'agir sur Production qu'après validation Preview et autorisation explicite.
