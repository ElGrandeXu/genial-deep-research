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

Critères de sortie : baseline reproductible, surfaces protégées cartographiées, blocages observés documentés, aucune recherche réelle hors mission explicitement autorisée, aucun changement de code ou de comportement et aucune action Vercel.

### Baseline live R2.1 — Erwan Simon

- Entrée unique : `Erwan Simon`, type `auto`, contexte exact `GENIAL, Bordeaux`.
- Résultat : `TECHNICAL_FAILURE`, identité non produite, 0 fait, 0 source et 0 domaine.
- Échec : `web_search_action_invalid`, étape `source_verification`, catégorie `source_metadata_missing`, non réessayable.
- Durée : 26 356 ms dans le reçu ; 26 372 ms muraux.
- Fournisseur : 2 appels HTTP internes dans l'unique exécution, 4 appels outil.
- Web Search : 2 recherches, 2 inspections ; 0 récupération et 0 vérification de source.
- Usage : 41 890 tokens d'entrée, 2 334 de sortie, 683 de raisonnement, 44 224 au total.
- Coût : inconnu ; le reçu d'échec expose `estimatedCostUsd: null`.
- Aucun retry manuel, aucune correction, aucun déploiement.

## R3 — Simplification ciblée des blocages observés

Baseline fonctionnelle de R3 : le commit Production `8b778b1efe82161653319d729b18c9d27a6f49f0` est fusionné sans correctif ; 725 tests, lint, typecheck et build passent localement.

Simplifier en place le moteur existant en retirant uniquement les blocages prouvés par R2. Chaque correctif doit être isolé et validé par un test métier réel. Aucune réécriture ni aucun moteur parallèle ne sont autorisés sans décision explicite après R2.

## R4 — Orchestration fournisseur bornée

Centraliser la comptabilité du provider : un appel principal, au plus un second appel exclusif de réparation ou de complément, et quatre actions Web Search maximum. Un complément échoué ou rejeté conserve désormais le dossier principal valide ; 732 tests, lint, typecheck et build passent sans appel réel.

## R5 — Admission, identité et sources

Centraliser l’admission autour des faits métier réellement affichables : un fait sourcé suffit, zéro fait devient une insuffisance publique, et les rejets d’identité ou de source restent locaux. Les minima historiques et les faits fabriqués depuis les titres sont supprimés ; 739 tests, lint, typecheck et build passent sans Web réel.

## R6 — Ménage

Retirer sur instruction le moteur remplacé et les contraintes historiques devenues inutiles après validation Preview.

## R7 — Livraison

Préparer la livraison finale et n'agir sur Production qu'après validation Preview et autorisation explicite.

## Mission finale — examen et correction

### Examen initial — 60/100

Grille issue exclusivement de `PROJECT.md` et du comportement observé :

| Exigence | Verdict initial | Preuve décisive |
|---|---|---|
| Nom de personne ou d'entreprise | PASS | Formulaire et validation serveur couvrent les deux types. |
| Contexte facultatif | PARTIAL | L'entrée est complète, mais une voie d'identité accepte un nom exact sans corroborer le contexte fourni. |
| Recherche Web réelle non préparée | PASS | Le checkpoint a exécuté la régression réelle sans branchement nominatif. |
| Attente longue compréhensible | PASS | Étapes SSE, chronomètre et annulation sont fonctionnels. |
| Dossier utile dont chaque fait est sourcé | FAIL | Un extrait fournisseur explicitement rejeté peut encore devenir un fait affiché. |
| Lien affirmation, preuve et URL jusqu'à l'écran | PARTIAL | La chaîne structurelle est solide, mais une empreinte synthétique peut remplacer une preuve relue. |
| Ambiguïté, manque, contradiction, péremption et panne signalés sûrement | FAIL | Une panne globale du vérificateur peut être absorbée comme rejet local ou silence. |
| Application en ligne et README relançable | PARTIAL | Production et README existent, mais le checkpoint n'est ni publié ni couvert par la gate portable courante. |
| Régression Erwan Simon + GENIAL + Bordeaux | PASS | Exécution locale réelle : `partial`, identité résolue, 2 faits métier, 2 sources, 27 315 ms. |

Écarts initiaux : local `b606284`, GitHub `main` `ab5b53c`, Production accessible mais sans SHA public. La branche locale et `main` divergent depuis `8b778b1`.

### Lots de correction ordonnés

1. **Vérité métier** : supprimer toute promotion factuelle d'une preuve fournisseur rejetée, faire remonter les pannes systémiques, exiger une corroboration lorsqu'un contexte significatif est fourni et réaligner la complétude sur la documentation.
2. **Livraison et UX ciblée** : remettre la gate portable au vert, corriger le smoke de taille, rendre les documents de pilotage portables, borner l'upload Vercel et corriger les défauts UX P2 sans refonte.
3. **Validation** : suite complète, lint, typecheck, build, secrets, clone propre, dry-run Vercel, Preview seulement, puis cinq cas métier uniques.
4. **Contre-examen** : regard neuf sur le commit et la Preview ; tout P0/P1 démontré sera corrigé et revérifié.

Avancement : lots 1 et 2 terminés — 741 tests, lint, typecheck et build passent. Une preuve fournisseur rejetée ne peut plus produire un fait ni résoudre une identité ; les pannes systémiques redeviennent des échecs techniques ; le contexte vérifié et les seuils de complétude sont cohérents. La gate candidat, le manifeste Vercel, le smoke de taille, la frontière d'upload et les P2 UX ciblés sont corrigés.

Validation Preview, correctif intermédiaire : le cas entreprise a observé cinq actions fournisseur malgré `max_tool_calls=4` et a été rejeté par l'ancienne borne applicative. Le plafond API reste à quatre appels ; la télémétrie serveur accepte désormais jusqu'à six actions observées sous le garde de coût. 742 tests prouvent l'admission de cinq et le rejet de sept.

Matrice finale terminée avec six soumissions réelles au total, régression initiale comprise : personne documentée → clarification sûre ; Erwan Simon contextualisé → identité résolue, 3 faits/3 sources ; entreprise → échec borné qui a déclenché le correctif de télémétrie ; personne ambiguë → silence sûr ; nom sans données → silence sûr. Aucun test inchangé n'a été répété.

Contre-examen initial : 82/100, NOT_READY sur un P1 résiduel — une page récupérée dont l'extrait est absent pouvait encore alimenter un fait `search_snippet`. Ce fallback factuel est supprimé intégralement ; un test dédié `web_search_source` + page récupérée + extrait absent prouve désormais 0 claim/evidence/source et un silence sûr. 743 tests, lint, typecheck, build et gate candidat passent avant la vérification précise.

Contre-examen final : P1 FIXED, aucun nouveau P0/P1, note indépendante 94/100, `READY_TO_SHIP`. La gate publique complète finale passe avec 743 tests et 11 parcours Playwright ; la Preview finale est publique et demeure distincte de Production.
