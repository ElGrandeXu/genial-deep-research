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

## D-M3-001 — Stack applicative minimale

- **Statut** : accepté pour la baseline M3.
- **Décision** : Next.js `16.3.3` App Router, React `19.2.8`, TypeScript strict, composants serveur par défaut et CSS natif.
- **Justification** : une frontière navigateur/serveur et un seul déploiement suffisent au chemin vertical prévu.
- **Conséquence** : aucun frontend/backend séparé, bibliothèque UI ou framework CSS.
- **Déclencheur de révision** : besoin démontré de traitements indépendants du cycle HTTP ou d’un client non Web.

## D-M3-002 — Runtime et gestionnaire

- **Statut** : accepté.
- **Décision** : Node.js `24.x` LTS, référence `24.20.0`, et pnpm `11.24.0` via Corepack avec lockfile unique.
- **Justification** : Node 24 est compatible avec Next.js et AI SDK et reste la version LTS proposée par Vercel au 26 août 2026.
- **Conséquence** : Node Current `26.8.0` n’est pas ciblé ; les versions exactes des packages sont verrouillées.
- **Déclencheur de révision** : changement du support Vercel ou fin de maintenance Node 24.

## D-M3-003 — Dépendances IA directes

- **Statut** : accepté.
- **Décision** : AI SDK Core `7.0.79`, `@ai-sdk/openai` `4.0.47` et `@ai-sdk/google` `4.0.51`, sans AI Gateway.
- **Justification** : streaming, structured outputs, sources et provider metadata sont documentés par les packages directs sans troisième clé.
- **Conséquence** : aucune abstraction multi-provider générique ; les métadonnées devront être vérifiées avant G3.
- **Déclencheur de révision** : perte de provenance ou incompatibilité réelle avec le modèle choisi.

## D-M3-004 — Fournisseur primaire initial

- **Statut** : accepté, réversible et non validé sur la qualité métier.
- **Décision** : future première voie OpenAI `gpt-5.6-luna`, Responses API, Web Search et `store: false` ; Gemini reste comparaison ou repli différé.
- **Justification** : M1 a observé côté OpenAI des URLs directes, un coût inférieur et une latence acceptable, avec Structured Outputs et Web Search.
- **Conséquence** : aucune citation libre ; sources et métadonnées structurées doivent survivre à la normalisation. Aucun appel n’est implémenté en M3.
- **Déclencheur de révision** : évaluation métier, coût, latence, disponibilité ou provenance défavorables.

## D-M3-005 — Contrat canonique et types

- **Statut** : accepté.
- **Décision** : le JSON Schema M2 reste canonique ; Ajv réalise la validation runtime ; les types TypeScript sont générés et contrôlés contre ce fichier ; le vérificateur M2 garde les invariants sémantiques.
- **Justification** : éviter une définition TypeScript ou Zod divergente.
- **Conséquence** : Zod n’est présent que comme peer AI SDK et ne décrit pas le dossier.
- **Déclencheur de révision** : changement explicite et versionné du contrat M2.

## D-M3-006 — État lié à la requête

- **Statut** : accepté pour la release initiale.
- **Décision** : aucune base, authentification ou persistance métier ; une recherche à la fois ; état en mémoire limité à la requête.
- **Justification** : minimisation, délai et absence de besoin démontré d’historique.
- **Conséquence** : aucune reprise durable après rupture de connexion ou arrêt d’instance.
- **Déclencheur de révision** : besoin prouvé de reprise, partage, historique ou durée excédant le cycle HTTP.

## D-M3-007 — Streaming et bornes

- **Statut** : accepté comme architecture future, non implémentée.
- **Décision** : flux HTTP `text/event-stream` par POST/fetch, événements associés aux étapes M2 réelles, timeout initial `240 s`, huit appels fournisseur maximum et une reprise maximum par opération.
- **Justification** : rendre l’attente observable sans pourcentage fictif ni queue prématurée.
- **Conséquence** : résultat partiel seulement après validation ; aucune boucle de retry infinie.
- **Déclencheur de révision** : mesures dépassant régulièrement les bornes ou besoin de reprise durable.

## D-M3-008 — Cible Vercel

- **Statut** : compatibilité théorique seulement.
- **Décision** : Vercel comme cible initiale, runtime Node, future route de recherche plafonnée à `300 s` sous réserve du plan et de Fluid Compute.
- **Justification** : déploiement Next.js direct et streaming Node documenté.
- **Conséquence** : aucun projet, compte, remote ou déploiement n’est créé en M3.
- **Déclencheur de révision** : plan réel incompatible, limite insuffisante ou interruption de flux mesurée.

## D-M3-009 — Vérificateurs historiques et courants

- **Statut** : accepté.
- **Décision** : `verify-m0.ps1` vérifie l’arbre exact du commit M0 historique ; `verify-foundation.ps1` porte les invariants durables courants ; `verify-project.ps1` orchestre les contrôles cumulatifs.
- **Justification** : l’ancienne allowlist comparait le projet courant à l’inventaire M0 et rejetait mécaniquement chaque artefact légitime ultérieur.
- **Conséquence** : l’état historique à 18 fichiers reste prouvable sans interdire de nouveaux fichiers ni exiger l’absence de remote pour toujours. L’absence actuelle de remote reste une validation Git M3 distincte.
- **Déclencheur de révision** : ajout d’un invariant durable ou d’un nouveau gate contractuel, jamais simple croissance d’inventaire.

## D-M4-001 — Scope et projet Vercel

- **Statut** : accepté.
- **Décision** : utiliser l’unique scope `team` du plan Hobby et créer `genial-deep-research` sans intégration Git, remote ni domaine personnalisé.
- **Justification** : le type de compte ne permet pas de scope personnel distinct ; l’unique équipe Hobby élimine l’ambiguïté et n’engage aucun plan payant.
- **Conséquence** : aucun identifiant personnel ou interne n’est conservé dans les preuves, hors URLs et identifiants publics de déploiement requis.
- **Déclencheur de révision** : transfert de propriété, ajout d’une équipe ou besoin contractuel de facturation.

## D-M4-002 — Frontière d’upload explicite

- **Statut** : accepté après correction mesurée.
- **Décision** : exclure les fichiers locaux par chemins explicites et conserver le JSON Schema importé ainsi que `tools/run-next.mjs`.
- **Justification** : la première frontière à négations a exclu le schéma et fait échouer le typecheck distant ; la liste explicite produit un build vert avec 18 fichiers téléchargés.
- **Conséquence** : autorités, passations, gouvernance, preuves, tests, Git, `.vercel`, hooks et `.env*` restent hors upload.
- **Déclencheur de révision** : nouvel import de build hors frontière ou changement des règles `.vercelignore`.

## D-M4-003 — Accès public du projet

- **Statut** : accepté pour M4.
- **Décision** : désactiver Vercel Authentication uniquement sur le projet dédié, sans modifier la politique d’équipe/global.
- **Justification** : la Preview retournait 302 ; la documentation Vercel confirme une gestion par projet et l’autorise sur Hobby.
- **Conséquence** : Preview, URL immuable et alias canonique sont publics ; les tests n’utilisent aucun bypass ou cookie.
- **Déclencheur de révision** : ajout de données, de recherche métier ou d’authentification applicative ; réévaluer alors la protection.

## D-M4-004 — Coûts et limites observables

- **Statut** : accepté.
- **Décision** : conserver coût IA à 0 USD, coût Vercel à `UNKNOWN`, Fluid Compute à `true` selon la configuration de ressources du projet et limite maximale de plateforme à `UNKNOWN`.
- **Justification** : aucun appel fournisseur n’existe ; le plan est prouvé mais l’usage facturé et la limite effective ne le sont pas.
- **Conséquence** : aucune revendication de gratuité Vercel ni de compatibilité avec une future recherche longue.
- **Déclencheur de révision** : première facture, métrique d’usage ou route métier longue mesurée.

## D-M5-001 — Frontière fournisseur unique

- **Statut** : accepté pour le candidat local M5.
- **Décision** : OpenAI `gpt-5.6-luna`, Responses via provider AI SDK direct, Web Search forcé, `store: false`, parallélisme désactivé, un appel HTTP et un outil maximum, aucun retry automatique ; dépendance Gemini retirée du runtime.
- **Conséquence** : aucune seconde architecture fournisseur ni fallback.

## D-M5-002 — Arrêt au gate local

- **Statut** : appliqué.
- **Contexte** : le probe réel a atteint `validating` puis `failed`; aucune erreur transitoire fournisseur n’est prouvée.
- **Décision** : aucun retry manuel, commit applicatif, WAF, secret Production ou déploiement M5.
- **Conséquence** : `M5_FAILED_LOCAL_LIVE`, G3 reste partiel ; reprise uniquement après nouvelle autorisation et correction de la preuve d’échec.

## D-M5-R1-001 — Contrat de vérité prioritaire

- **Statut** : bloqué hors réseau.
- **Contexte** : AI SDK `7.0.79` et OpenAI provider `4.0.47` exposent citation URL, titre et offsets dans le texte généré, sans extrait du contenu source ; M1 n’a pas conservé cet extrait.
- **Décision** : ne pas fabriquer l’extrait, ne pas réutiliser l’affirmation, ne pas affaiblir M2 et échouer fermé avec `source_metadata_missing`.
- **Conséquence** : `M5_R1_BLOCKED_TRUTH_CONTRACT`; un prochain probe réel n’est pas autorisé par R1.
- **Déclencheur de révision** : architecture fournissant un extrait source authentique et un locator par collecte autorisée ou métadonnée fournisseur prouvée.
