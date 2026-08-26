# Journal d’arbitrage

Les décisions ci-dessous sont subordonnées au brief, à l’audit formel et aux faits validés. Elles figent M2 sans choisir de stack, de fournisseur ou d’architecture technique.

## D-M2-001 — Cas revendiqués

- **Statut** : accepté pour la release initiale.
- **Contexte** : six cas sont proposés ; le brief privilégie peu de cas solides.
- **Options considérées** : couvrir les six ; choisir les plus simples ; traiter trois cas discriminants.
- **Décision** : revendiquer HOMONYME, CONFLIT et SILENCE.
- **Justification** : ils testent respectivement identité, réconciliation et refus d’inventer, avec le meilleur rapport valeur/risque/délai.
- **Conséquence** : chacun possède états, invariants, fixture et contrôle négatif ; aucune revendication sur les six cas.
- **Déclencheur de révision** : preuve mesurée qu’un cas revendiqué ne peut pas être traité solidement, avec retrait équivalent avant extension.

## D-M2-002 — Péremption transversale

- **Statut** : accepté pour la release initiale.
- **Contexte** : une information ancienne peut être vraie historiquement et fausse au présent.
- **Options considérées** : cas isolé ; badge de récence ; propriété de chaque affirmation.
- **Décision** : traiter PÉREMPTION comme propriété transversale avec date de publication, consultation, fait et statut temporel.
- **Justification** : la temporalité change le sens de nombreux faits, pas seulement d’un scénario.
- **Conséquence** : une source ancienne ne suffit jamais à établir un état actuel ; les faits historiques restent affichables comme historiques.
- **Déclencheur de révision** : aucun ; seules les règles par catégorie de fait pourront être précisées.

## D-M2-003 — MARQUE et FILIALE différés

- **Statut** : accepté pour la release initiale.
- **Contexte** : ces cas demandent une résolution lexicale, juridique et financière plus profonde.
- **Options considérées** : couverture partielle revendiquée ; couverture complète immédiate ; report explicite avec garde-fous génériques.
- **Décision** : déclarer MARQUE et FILIALE non revendiqués.
- **Justification** : éviter une couverture superficielle et une fausse confiance.
- **Conséquence** : les invariants génériques interdisent tout de même entité mal résolue, confusion groupe/filiale et chiffre sans périmètre ; ils ne valent pas couverture complète.
- **Déclencheur de révision** : évaluation dédiée sur cas inconnus et preuve de résolution robuste.

## D-M2-004 — Construction source-first

- **Statut** : accepté.
- **Contexte** : une fiche libre puis décorée de citations perd le lien exact fait-preuve.
- **Options considérées** : synthèse-first ; bibliographie globale ; registre atomique source-first.
- **Décision** : construire toute présentation depuis les registres Source → Evidence → Claim, puis Inference explicitement dérivée.
- **Justification** : la traçabilité doit survivre jusqu’à l’écran et être vérifiable par affirmation.
- **Conséquence** : aucune affirmation factuelle affichable sans preuve finale et source rattachable.
- **Déclencheur de révision** : aucun ; invariant contractuel.

## D-M2-005 — Absence de persistance métier

- **Statut** : accepté pour la release initiale.
- **Contexte** : aucun compte n’est demandé et les recherches peuvent contenir des données professionnelles nominatives.
- **Options considérées** : historique complet ; cache métier ; aucune persistance par défaut.
- **Décision** : aucun compte, aucune persistance métier, aucun prompt/dossier complet en log ; métriques techniques minimales et expurgées seulement pendant le besoin de l’exercice.
- **Justification** : minimisation, sécurité et périmètre.
- **Conséquence** : toute persistance future exige un nouvel arbitrage explicite.
- **Déclencheur de révision** : besoin produit démontré nécessitant historique, reprise durable ou partage.

## D-M2-006 — Fournisseurs non choisis

- **Statut** : ouvert ; aucun choix.
- **Contexte** : M1 a observé des capacités OpenAI et Gemini le 26 août 2026.
- **Options considérées** : OpenAI ; Gemini ; combinaison ; autre fournisseur conforme.
- **Décision** : ne choisir aucun fournisseur, modèle ou stratégie d’orchestration en M2.
- **Justification** : les probes M1 prouvent un accès daté, pas la qualité produit, la résolution des sources ni l’adéquation architecturale.
- **Conséquence** : le contrat reste indépendant des APIs et les risques des deux familles restent ouverts.
- **Déclencheur de révision** : mission d’architecture autorisée avec évaluation coût/qualité/latence et accès réel aux sources.

## D-M2-007 — Aucune synthèse libre ajoutant des faits

- **Statut** : accepté.
- **Contexte** : la prose peut introduire silencieusement chiffres, dates, causalités ou identités absents des preuves.
- **Options considérées** : génération libre contrôlée a posteriori ; gabarits de prose ; composition par références vérifiées.
- **Décision** : le résumé et les sections métier référencent uniquement claims et inférences enregistrés ; une inférence ne crée aucun fait.
- **Justification** : fail-closed et auditabilité.
- **Conséquence** : toute production sémantique non strictement extractive est rejetée tant qu’un contrôle dédié n’est pas prouvé.
- **Déclencheur de révision** : vérificateur sémantique mesuré sur un jeu indépendant, sans régression de traçabilité.

## D-M2-008 — Architecture d’information

- **Statut** : accepté pour la release initiale.
- **Contexte** : le commercial doit lire vite tout en vérifiant les faits et limites.
- **Options considérées** : texte continu ; bibliographie finale ; huit sections orientées décision.
- **Décision** : identité/ambiguïté, résumé opérationnel, faits clés, signaux récents, contradictions, inconnues/limites, sources, reçu d’exécution.
- **Justification** : ordre allant du risque d’identité à l’action, puis aux objections et à l’audit.
- **Conséquence** : chaque section possède des références structurées ; contradictions et limites ne sont pas reléguées.
- **Déclencheur de révision** : test utilisateur montrant un ordre moins efficace sans perte de vérifiabilité.

## D-M2-009 — G1 et deadline

- **Statut** : G1 validé ; deadline contractuelle toujours inconnue.
- **Contexte** : M0 et M1 sont validés, M1 a été audité extérieurement, les clés fonctionnaient le 26 août, la cible interne est le vendredi 28 août, et la date contractuelle exacte n’est pas confirmée.
- **Options considérées** : bloquer tout progrès sur Antonin ; présenter vendredi comme contractuel ; traiter vendredi comme échéance opérationnelle la plus contraignante.
- **Décision** : aucune dépendance bloquante à une réponse d’Antonin ; vendredi reste la cible opérationnelle, jamais une deadline contractuelle affirmée.
- **Justification** : la définition existante de G1 accepte la connaissance de la deadline **ou au minimum** un plan de contingence ; elle n’exige pas une date contractuelle confirmée.
- **Conséquence** : G1 est validé sans réécriture rétroactive de son critère ; le risque calendrier reste ouvert.
- **Déclencheur de révision** : communication contractuelle d’Antonin.

## D-M2-010 — Contrat d’erreur

- **Statut** : accepté.
- **Contexte** : une panne technique et une recherche réussie sans preuve n’ont pas le même sens.
- **Options considérées** : fiche vide générique ; état partiel unique ; états distincts.
- **Décision** : séparer `insufficient_evidence` de `technical_failure` ; rendre erreurs, tentatives et reprises visibles dans le reçu.
- **Justification** : empêcher un timeout de devenir une conclusion factuelle sur le Web.
- **Conséquence** : le vérificateur rejette silence technique, erreur disparue et reprise non rattachée.
- **Déclencheur de révision** : aucun ; invariant de vérité opérationnelle.
