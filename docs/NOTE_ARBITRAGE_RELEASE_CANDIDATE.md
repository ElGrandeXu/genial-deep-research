# Note d’arbitrage — GENIAL Deep Research

**Release candidate du 27 août 2026 — entretien GENIAL**

## Décision produit

Le parti pris est simple : mieux vaut un dossier court dont chaque phrase peut être défendue qu’une synthèse ample construite sur des citations fragiles. Le produit ne cherche donc pas à « tout savoir » sur une entité. Il cherche à résoudre l’identité, trouver quelques faits commercialement utiles, puis prouver à l’écran exactement pourquoi chacun a été retenu.

Cette décision répond au risque principal de l’épreuve : présenter un texte plausible comme un résultat de recherche. Ici, la génération du fournisseur n’est qu’une proposition de pistes structurées. Une affirmation n’atteint l’écran qu’après lecture directe de la page et récupération de son extrait exact. Si cette chaîne casse, le fait disparaît et la limite devient visible.

Le résultat normal vise trois à six faits répartis entre identité, activité, rôle, géographie, chiffres et événements récents. Trois faits et deux pages vérifiées suffisent à un succès dans le périmètre. Une ou deux affirmations restent utiles, mais le statut devient limité. Zéro preuve devient un silence explicite. Cette graduation évite aussi de forcer artificiellement trois faits sur une entité peu documentée.

## Périmètre retenu

La démonstration finale couvre trois situations complémentaires : une entreprise publique bien documentée, un nom de personne homonyme sans contexte, et une société volontairement introuvable. Elle ajoute une preuve de péremption dans la variante mobile du cas principal. Ce choix montre la boucle métier, son garde-fou d’identité et son comportement sous manque d’information.

Les scénarios CONFLIT, FILIALE et MARQUE ne sont pas revendiqués comme démonstrations live. Le conflit est implémenté et testé : des valeurs incompatibles sur un même prédicat, une même période et un même périmètre sont présentées côte à côte. Il n’a pas été forcé avec un jeu de données préparé. FILIALE et MARQUE auraient surtout demandé de nouveaux cas et davantage de budget de validation sans améliorer le cœur visible avant la deadline.

Sont également hors périmètre : données privées, réseaux sociaux derrière authentification, paywalls, documents nécessitant un navigateur JavaScript, historique utilisateur, exports, surveillance continue et recherche asynchrone.

## Architecture et fournisseur

La release est un monolithe Next.js TypeScript déployé sur Vercel. Le navigateur porte le formulaire, l’attente et le rendu ; le serveur garde le secret, le fournisseur, les protections réseau, la validation et le calcul du coût. Il n’y a ni base de données ni compte.

OpenAI `gpt-5.6-luna` est l’unique fournisseur. La Responses API, la sortie structurée et Web Search donnent une boucle suffisante sans abstraction multi-fournisseur. `store: false` est fixé. Une exécution utilise un appel fournisseur, une à quatre actions Web Search et un délai de 90 secondes. La route réserve 150 secondes au traitement sous un plafond Vercel de 180 secondes.

Gemini n’a pas été ajouté : aucune valeur marginale n’a été démontrée sur les cas retenus, tandis qu’il aurait multiplié clés, contrats de provenance, tests et modes de panne. Ce choix reste réversible, mais seulement si un futur benchmark prouve un gain de rappel ou de vérification.

## Stratégie de recherche et de sources

Le modèle reçoit le nom, le type et le contexte soumis. Il doit proposer une identité, des candidats si nécessaire, trois à six affirmations candidates, les catégories manquantes et, pour chaque piste, une URL et un extrait contigu. Il peut chercher puis inspecter des pages ; le serveur contrôle le nombre et la cohérence des actions.

Les URL retournées par le fournisseur et celles de la sortie structurée servent à retrouver la page. Elles ne constituent pas une preuve. Le serveur impose `https`, exclut hôtes locaux et réseaux privés, résout le DNS, revalide les redirections, limite durée et volume, et refuse les formats hors HTML. Il extrait ensuite le texte visible et recherche littéralement l’extrait annoncé. La source finale contient titre lu, domaine, URL finale, consultation, période et localisateur. L’absence de correspondance élimine le fait.

Cette vérification directe a un coût de rappel : une page rendue uniquement par JavaScript, bloquée ou remaniée sera écartée même si la citation du moteur paraît plausible. C’est une perte volontaire de couverture au profit d’une preuve défendable.

## Résolution d’identité

Le type est explicite dans l’interface : personne, entreprise ou automatique. Le contexte facultatif est utilisé, pas seulement enregistré. Le serveur exige une convergence entre type demandé, identité proposée, contexte distinctif et preuve directe concernant l’entité.

Sans contexte suffisant, plusieurs candidats restent séparés. Le cas « Thomas Martin » présente trois personnes avec dates et rôles distincts, puis demande ville, secteur ou employeur. Il ne sélectionne aucun sujet et n’affiche aucun fait comme appartenant au nom demandé. Si une seule piste trop faible subsiste, le statut devient contexte insuffisant plutôt que résolu.

## Traçabilité jusqu’à l’écran

Le contrat organise la chaîne `Source → Evidence → Claim → Presentation`. Une affirmation visible porte les identifiants de ses preuves ; chaque preuve désigne une source et la même entité. Les invariants runtime vérifient toutes les références. Le client effectue encore un contrôle défensif avant rendu.

Visuellement, le fait et sa preuve sont adjacents. L’utilisateur voit l’extrait exact, le titre, l’éditeur ou domaine, un lien ouvrable, la date de consultation, la date de publication si disponible, la période du fait et la fraîcheur. Le texte de l’affirmation est volontairement l’extrait vérifié lui-même : il n’existe donc pas de sous-titre ou de résumé factuel libre susceptible de dériver.

Le reçu repliable complète cette trace avec modèle, actions Web, pages récupérées, jetons, durée et coût estimé. Les JSON de démonstration sont expurgés : aucune clé, aucun prompt brut, aucune IP.

## Contradictions, péremption et inconnues

Les valeurs comparables sont regroupées par prédicat, période et périmètre. Si deux valeurs normalisées divergent, toutes les versions et leurs preuves sont conservées, une carte de contradiction est visible et le dossier ne peut pas être déclaré complet. Aucun « gagnant » n’est choisi par commodité.

La fraîcheur repose uniquement sur une date factuelle explicite. Jusqu’à 548 jours, l’état est actuel ; au-delà, historique ; sans date prouvée, inconnu. Le cas mobile OpenAI montre la phrase de fondation en 2015 comme historique. Une publication récente ne rajeunit pas automatiquement un fait ancien.

Les catégories sans preuve, les sources rejetées et le contexte manquant deviennent des inconnues lisibles. Elles ne sont ni remplies par inférence ni masquées derrière un score de confiance.

## Silence et pannes

Quatre sorties restent nettement séparées : complet, limité, clarification, et données insuffisantes. Une erreur réseau, un quota, une sortie structurée invalide ou une incohérence de provenance mène à une panne technique typée. Aucun dossier incomplet n’est alors émis.

Le cas « Société Azur Pamplemousse 9137 » termine en données publiques insuffisantes, avec zéro fait et zéro source. Il explique la portée explorée et invite à préciser pays, ville ou site officiel. Cette réponse est utile sans transformer l’absence de résultat en vérité sur l’inexistence de la société.

## Expérience d’attente

Une recherche dure entre neuf et seize secondes sur les cas Production retenus, avec un essai antérieur à 32 secondes. L’attente est donc un livrable. Le panneau affiche durée écoulée et étapes réelles reçues du serveur : admission, résolution, recherche, consultation, vérification et construction. Il ne montre aucun pourcentage fictif. L’utilisateur peut annuler ; le focus revient ensuite vers le résultat ou l’erreur.

Le résultat privilégie la lecture rapide : statut global, identité, groupes de faits, preuve immédiatement sous le fait, contradictions et inconnues, puis reçu technique replié. Les interfaces 1 440 px et 390 px ont été capturées et contrôlées : pas de débordement horizontal, chevauchement, texte coupé ou dépendance au survol.

## Coûts mesurés

Le barème versionné au 27 août 2026 reprend les tarifs publics : `0,20 $/M` de jetons d’entrée, `0,02 $/M` d’entrée en cache, `1,20 $/M` de sortie, et `0,01 $` par action Web Search observée. Taxes, remises et paliers sont exclus. Le runtime bloque tout résultat estimé au-dessus de `0,10 $`.

Les validations finales coûtent `0,02479644 $` en Preview puis `0,02500484 $`, `0,03446444 $` et `0,01205174 $` en Production. La plage finale par fiche est donc `0,01205174–0,03446444 $`. Le succès principal fournit six faits sur trois pages pour `0,02500484 $`.

Le cumul connu des reçus de release avant le cycle final est `0,12403136 $`. En ajoutant un essai Production antérieur (`0,02261440 $`), les échecs dont l’usage permet un calcul conservateur, quatre actions supposées pour un échec sans comptage, la borne complète de `0,10 $` pour l’unique appel sans usage récupérable, puis les quatre validations finales (`0,09631746 $`), la borne mission finale est `0,45906226 $`. Elle est volontairement pessimiste et reste `0,04093774 $` sous le plafond de `0,50 $`. L’échec d’authentification Preview s’est arrêté avant génération et n’ajoute aucun coût fournisseur mesurable.

Références : [tarifs OpenAI](https://developers.openai.com/api/docs/pricing), [modèle](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Web Search](https://developers.openai.com/api/docs/guides/tools-web-search), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Sécurité et vie privée

La clé OpenAI est une variable Vercel sensible et n’entre jamais dans le client, les captures ou Git. Les builds et tests n’en ont pas besoin. Les scans couvrent worktree, index, fichiers suivis et bundle client.

L’application ne conserve pas de dossier et ne journalise ni nom, ni contexte, ni prompt, ni extrait. L’empreinte IP de limitation de débit est salée en mémoire. Les réponses ne sont pas mises en cache. CSP, interdiction d’embarquement, `nosniff`, politique de permissions, contrôle same-origin, JSON strict et limite de corps réduisent la surface publique.

La recherche transmet toutefois l’entrée à OpenAI et consulte des sites publics. L’interface rappelle de ne pas saisir de données privées. L’outil n’est ni un dispositif de décision automatisée ni une source unique de diligence raisonnable.

## Difficultés rencontrées

Les principaux échecs ont amélioré la frontière produit. Le premier schéma fournisseur utilisait un format URI non accepté par Structured Outputs ; le format a été simplifié côté transport puis validé strictement localement. Certaines sorties valides omettaient des champs nullables ; une récupération bornée a été ajoutée sans fabriquer de contenu. Les métadonnées de citations et les séquences multi-actions n’avaient pas toujours la même forme ; leur normalisation et leur comptabilité sont désormais testées.

Côté interface, un panneau d’attente pouvait recouvrir le résultat après terminaison et l’optimisation `content-visibility` laissait des cartes vides dans une capture longue. Les deux ont été supprimés après inspection réelle. Les tentatives échouées sont conservées comme historique, sans être présentées comme preuves finales.

La première Preview a aussi reçu le masque non lisible d’une variable Vercel sensible et a échoué en 401 avant génération. Cette preuve a été conservée. La variable Preview a ensuite été configurée depuis le magasin DPAPI local existant, sans afficher ni écrire la clé, puis une nouvelle Preview a produit un dossier réel. La commande de promotion Vercel relie cette Preview au déploiement Production par `originalDeploymentId` tout en substituant l’environnement sensible Production.

## Limites assumées

Le moteur ne garantit ni exhaustivité, ni accès à une source inaccessible, ni stabilité future d’une page. La date de publication manque souvent dans le HTML et reste alors inconnue. Une seule source peut expliquer plusieurs candidats d’homonymie ; cela suffit à refuser la fusion, pas à dresser leur biographie.

La limitation de débit est locale à une instance Vercel. Il n’y a pas de reprise après fermeture du navigateur, d’archive de page, d’export, de partage, de comparaison temporelle ou de second fournisseur. Le modèle peut encore proposer des pistes inutiles ; le vérificateur les retire, ce qui peut aboutir à un dossier limité.

## Avec un mois supplémentaire

La priorité serait un benchmark aveugle de 50 à 100 entités annotées : précision d’identité, rappel des faits, taux d’extraits retrouvés, conflits détectés, coût et latence par catégorie. Les erreurs guideraient ensuite le produit, plutôt qu’une abstraction prématurée.

Je construirais ensuite une phase de désambiguïsation interactive avec cartes candidats plus riches, une archive minimale et juridiquement cadrée des preuves, un export partageable, et une file durable pour les recherches longues. Une limitation distribuée, une observabilité sans données nominatives et des budgets par locataire rendraient l’exploitation robuste.

Enfin, Gemini ou une seconde voie OpenAI ne serait ajoutée qu’en comparaison mesurée sur les échecs du benchmark. Le fournisseur secondaire pourrait améliorer le rappel ou vérifier les contradictions, mais ne remplacerait jamais la récupération directe de l’extrait ni les invariants du dossier.
