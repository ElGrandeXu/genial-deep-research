# Plan d’action détaillé — Génial Deep Research

> Plan d’exécution de bout en bout  
> Fondé sur **AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md**  
> Point de départ : tour hors ligne, workspace EGX Settings à transférer, laptop connecté par partage de connexion  
> Cible interne : release candidate et restitution dès vendredi, sous réserve d’un niveau de qualité suffisant  
> Principe directeur : une fiche partielle mais défendable vaut mieux qu’une fiche complète et fausse

---

## 0. Mode d’emploi

Ce document n’est pas une simple liste de tâches. Chaque étape contient :

- **Objectif** : pourquoi l’étape existe.
- **Actions** : ce qui doit réellement être fait.
- **Sortie attendue** : l’artefact ou l’état produit.
- **Validation** : la preuve permettant de passer à la suite.
- **Pièges** : erreurs fréquentes à éviter.
- **Condition d’arrêt** : situation qui interdit de continuer sur une base fragile.

Une étape n’est terminée que lorsque sa validation est obtenue. Une affirmation comme « cela devrait marcher » n’est pas une validation.

---

## 1. Principes non négociables

1. **EGX Settings est la méthode de travail, pas un simple dossier.**
2. **Le brief original reste immuable.**
3. **Les clés Génial ne servent pas à faire tourner Codex.**
4. **Aucun secret ne doit entrer dans Git, les captures ou les documents.**
5. **La traçabilité est conçue avant la synthèse.**
6. **L’incertitude est un résultat valide.**
7. **Le coût est mesuré dès le premier appel.**
8. **Le déploiement est testé tôt, pas à la fin.**
9. **Les cas non traités sont déclarés.**
10. **Chaque phase produit une preuve durable et un commit cohérent.**
11. **Aucune fonctionnalité supplémentaire ne passe avant les invariants de vérité.**
12. **Vendredi est une cible interne, pas une autorisation de sacrifier la fiabilité.**

---

## 2. Jalons bloquants

| Jalon | État exigé avant de continuer |
|---|---|
| G0 — Poste opérationnel | EGX copié, outils disponibles, doctrine réellement chargée |
| G1 — Mission intronisée | Brief, audit, dépôt, gouvernance, calendrier et sécurité initialisés |
| G2 — Contrat produit figé | Périmètre, cas, entrée, sortie, preuves et échecs définis |
| G3 — Boucle verticale en ligne | Une recherche réelle produit un fait sourcé visible sur une URL |
| G4 — Noyau digne de confiance | Identité, preuves, conflits et refus sont contrôlés |
| G5 — Qualité mesurée | Cas d’épreuve, requêtes inconnues, coût et latence documentés |
| G6 — Release candidate | Déploiement, README, note, captures, dépôt et sécurité validés |
| G7 — Livraison | URL, code et dossier de restitution transmis et reproductibles |

Si un jalon échoue, on corrige ou on réduit le périmètre. On ne masque pas l’échec sous une nouvelle fonctionnalité.

---

## 3. Vue générale des 52 étapes

| Étapes | Phase | Résultat |
|---:|---|---|
| 1–7 | Migration et réveil du poste | Laptop prêt avec doctrine EGX active |
| 8–13 | Intronisation de la mission | Projet isolé, gouverné et sécurisé |
| 14–16 | Accès et contrat opérationnel | Clés vérifiées, calendrier et limites connus |
| 17–23 | Contrat produit et vérité | Périmètre et comportements définis |
| 24–29 | Architecture et boucle verticale | Première version réelle déployée |
| 30–36 | Moteur de recherche défendable | Sources, affirmations et vérification contrôlées |
| 37–42 | UX, évaluation et économie | Produit utilisable et coût optimisé |
| 43–52 | Durcissement et restitution | Release démontrable, documentée et livrée |

---

# PHASE A — Migration et réveil du poste

## Étape 1 — Identifier la source canonique

### Objectif

Éviter de copier un ancien workspace EGX, une archive ou un dossier partiel.

### Actions

- retrouver le dossier **EGX_settings** actuellement utilisé sur la tour ;
- noter son chemin absolu ;
- vérifier la présence des marqueurs attendus :
  - **AGENTS.md** ;
  - **CAVEMAN.md** ;
  - **XU_CODEX-OPTIM.md** ;
  - **.agents** ;
  - **.codex** ;
  - **.opencode** si présent ;
  - **missions** ;
  - **projects** ;
  - **vault** ;
  - historique ou historiques **.git** ;
- distinguer cette source des anciens dossiers EGX, EGX_NEXT, EGX_Terminal, AGENCY ou OpenCode.

### Sortie attendue

Un chemin canonique unique, inscrit dans une courte note de migration.

### Validation

Le workspace contient les fichiers de doctrine effectivement utilisés lors des dernières missions Codex.

### Pièges

- choisir le dossier au nom le plus proche plutôt que le dossier réellement actif ;
- copier un raccourci Windows ;
- confondre un projet interne avec le workspace complet ;
- nettoyer ou déplacer des fichiers avant d’avoir une copie.

### Condition d’arrêt

Si deux dossiers semblent également canoniques, ne pas copier au hasard. Comparer les dates, le contenu des fichiers racine et les dernières missions.

---

## Étape 2 — Faire l’inventaire avant transfert

### Objectif

Pouvoir démontrer que la copie est complète et savoir ce qui a été volontairement exclu.

### Actions

- relever la taille totale et le nombre approximatif de fichiers ;
- lister les dossiers racine ;
- relever les frontières Git imbriquées ;
- repérer :
  - **node_modules** ;
  - **.venv** ;
  - **.next**, **dist**, **build** ;
  - caches ;
  - profils navigateur ;
  - gros dossiers temporaires ;
  - fichiers **.env** ;
- noter les éléments générés qui pourront être réinstallés.

### Sortie attendue

Un manifeste court : sources indispensables, dépôts imbriqués, éléments générés, secrets potentiels.

### Validation

Chaque exclusion éventuelle possède une justification et peut être recréée.

### Pièges

- exclure **.git**, **.agents** ou **.codex** parce qu’ils sont cachés ;
- confondre fichier généré et fichier de doctrine ;
- supprimer les caches avant d’avoir sécurisé une copie brute ;
- oublier qu’un dépôt imbriqué possède son propre historique.

### Condition d’arrêt

Si un dossier est inconnu et potentiellement irremplaçable, le conserver dans la copie brute.

---

## Étape 3 — Copier EGX Settings sur le support USB

### Objectif

Créer une copie transportable sans altérer la tour.

### Actions

- utiliser une clé en exFAT ou NTFS si le workspace contient de gros fichiers ;
- activer l’affichage des éléments masqués ;
- effectuer une **copie**, jamais un déplacement ;
- conserver les fichiers cachés et les historiques Git ;
- si Windows rencontre des chemins trop longs, créer une archive 7z ou utiliser un outil de copie robuste ;
- ne pas débrancher la clé avant la fin complète de l’écriture.

### Sortie attendue

Une copie complète ou une archive transportable du workspace.

### Validation

La clé contient les marqueurs vérifiés à l’étape 1 et peut ouvrir plusieurs fichiers Markdown au hasard.

### Pièges

- clé FAT32 limitée à 4 Go par fichier ;
- copie interrompue sans message évident ;
- fichiers cachés manquants ;
- archive créée à partir du mauvais dossier ;
- clé retirée pendant la mise en cache d’écriture.

### Condition d’arrêt

Une copie contenant seulement les dossiers visibles n’est pas acceptable.

---

## Étape 4 — Vérifier l’intégrité de la copie

### Objectif

Ne pas découvrir sur le laptop qu’un composant critique manque.

### Actions

- comparer taille et nombre de fichiers à l’ordre de grandeur de l’original ;
- vérifier explicitement :
  - **AGENTS.md** ;
  - **.agents/skills** ;
  - **.codex/config.toml** si présent ;
  - **missions** ;
  - **projects/internal/ai-sdk-agentops-lab** ;
  - chaque **.git** important ;
- ouvrir un fichier racine, un skill, une mission et un fichier de projet depuis la clé ;
- conserver la tour inchangée jusqu’à validation du laptop.

### Sortie attendue

Copie marquée « vérifiée » dans la note de migration.

### Validation

Les fichiers critiques sont lisibles et les dépôts présentent un historique.

### Pièges

- se fier uniquement à l’absence d’erreur Windows ;
- vérifier seulement le fichier racine ;
- écraser la seule copie en manipulant directement la clé ;
- supprimer l’original trop tôt.

### Condition d’arrêt

Si un historique Git ou un skill critique manque, refaire la copie.

---

## Étape 5 — Auditer les configurations situées hors du workspace

### Objectif

Récupérer les instructions globales sans transférer aveuglément sessions et identifiants.

### Actions

- vérifier la valeur de **CODEX_HOME** sur la tour ;
- inspecter les emplacements utilisateur :
  - **%USERPROFILE%\\.codex** ;
  - **%USERPROFILE%\\.agents\\skills** ;
- récupérer séparément, s’ils existent :
  - **AGENTS.md** ;
  - **AGENTS.override.md** ;
  - **config.toml** ;
  - profils de configuration ;
  - skills personnels ;
- noter les chemins absolus présents dans les configurations ;
- ne pas copier aveuglément authentification, sessions, caches, logs ou credentials.

### Sortie attendue

Un dossier de configuration portable contenant uniquement les éléments nécessaires.

### Validation

Chaque fichier copié a été ouvert et classé comme doctrine, configuration ou skill.

### Pièges

- recopier des sessions privées ;
- recopier un token d’authentification ;
- oublier un **CODEX_HOME** personnalisé ;
- conserver des chemins qui n’existent que sur la tour ;
- mélanger configuration machine et configuration projet.

### Condition d’arrêt

Tout fichier contenant un secret doit être isolé et ne jamais entrer dans le futur dépôt Génial.

---

## Étape 6 — Restaurer le workspace sur le laptop

### Objectif

Reconstituer un environnement aussi proche que possible de celui de la tour.

### Actions

- copier le workspace depuis la clé vers le disque du laptop ;
- utiliser si possible une arborescence similaire ;
- ne pas travailler directement depuis la clé ;
- vérifier les droits de lecture et d’écriture ;
- adapter uniquement les chemins explicitement dépendants de la tour ;
- conserver une copie de secours inchangée.

### Sortie attendue

Workspace local fonctionnel sur le laptop.

### Validation

Les fichiers peuvent être modifiés localement, les historiques Git sont visibles et aucune dépendance n’est exécutée depuis la clé.

### Pièges

- lancer Codex dans le dossier de sauvegarde ;
- modifier directement la seule copie portable ;
- casser des chemins relatifs en déplaçant des sous-dossiers ;
- placer le workspace dans un dossier synchronisé qui modifie les fichiers cachés.

### Condition d’arrêt

Si les frontières Git ne correspondent plus à l’original, corriger avant toute mission.

---

## Étape 7 — Réinstaller les outils et valider la doctrine EGX

### Objectif

Prouver que le laptop n’a pas seulement les fichiers, mais le comportement attendu.

### Actions

- vérifier ou installer :
  - Git ;
  - Node.js ;
  - le gestionnaire de paquets choisi ;
  - Codex ;
  - l’éditeur ;
- configurer l’identité Git ;
- s’authentifier proprement aux services nécessaires ;
- lancer Codex depuis la racine pertinente ;
- demander à Codex de lister :
  - instructions chargées ;
  - skills détectés ;
  - racine projet ;
  - configuration active ;
- exécuter une mission sans mutation demandant un résumé de la doctrine et des règles de token efficiency.

### Sortie attendue

Rapport de vérification du poste avec versions des outils et sources d’instructions actives.

### Validation

Codex restitue les règles centrales d’EGX et détecte les skills attendus.

### Pièges

- croire que les fichiers suffisent sans vérifier leur chargement ;
- lancer Codex dans un sous-dossier qui change la portée des instructions ;
- utiliser une version d’outil incompatible ;
- réutiliser une authentification copiée au lieu de se reconnecter ;
- commencer le projet malgré une doctrine partiellement chargée.

### Condition d’arrêt

Pas de création du projet Génial tant que G0 n’est pas validé.

### Jalon G0

**Le laptop est opérationnel et EGX Settings influence réellement Codex.**

---

# PHASE B — Intronisation de la mission

## Étape 8 — Choisir l’emplacement et la frontière Git du projet

### Objectif

Créer un projet isolé sans contaminer EGX Settings ni perdre sa doctrine.

### Actions

- inspecter les frontières Git parentes ;
- choisir entre :
  - projet interne isolé selon la convention EGX ;
  - dépôt frère de **EGX_settings** avec instructions projet dédiées ;
- s’assurer qu’un nouveau dépôt ne sera pas accidentellement absorbé par un dépôt parent ;
- définir un nom stable, par exemple **genial-deep-research** ;
- documenter ce choix.

### Sortie attendue

Répertoire projet vide avec racine Git clairement identifiée.

### Validation

La commande de statut Git exécutée dans le projet pointe vers la racine attendue et uniquement celle-ci.

### Pièges

- dépôt imbriqué involontaire ;
- travail directement dans **ai-sdk-agentops-lab** ;
- mélange des artefacts personnels et des livrables Génial ;
- nom temporaire conservé jusqu’à la livraison.

### Condition d’arrêt

Si la frontière Git est ambiguë, ne créer aucun fichier de projet avant résolution.

---

## Étape 9 — Importer les sources immuables

### Objectif

Permettre à toutes les futures sessions Codex de repartir de la même vérité.

### Actions

- placer une copie exacte de **epreuve-deep-research.md** dans un dossier source ;
- ajouter le présent audit formel ;
- ajouter ce plan d’action ;
- créer un résumé du mail sans inclure le lien secret ;
- marquer le brief original comme non modifiable ;
- distinguer clairement source, audit et décision.

### Sortie attendue

Un dossier documentaire autonome contenant les sources de mission.

### Validation

Une nouvelle session peut expliquer la mission sans accès au mail.

### Pièges

- modifier le brief original pour refléter nos choix ;
- inclure le lien Password Pusher ;
- mélanger les exigences Génial et les objectifs internes ;
- dépendre de cette conversation ChatGPT comme seule mémoire.

### Condition d’arrêt

Si le projet ne peut pas reconstruire le contexte à partir de ses fichiers, l’intronisation est incomplète.

---

## Étape 10 — Créer la capsule de mission EGX

### Objectif

Transformer le brief en mission exécutable par des sessions Codex neuves.

### Actions

- créer un dossier de mission avec :
  - **MISSION.md** ;
  - **INPUTS.md** ;
  - **ACCEPTANCE.md** ;
  - **RESULT.md** ;
  - **EVIDENCE.md** ;
  - **HANDOFF.md** ;
- inscrire dans **MISSION.md** la finalité et le périmètre ;
- inscrire dans **ACCEPTANCE.md** les jalons G0 à G7 ;
- inscrire dans **INPUTS.md** les sources autorisées ;
- imposer que chaque session laisse une passation durable.

### Sortie attendue

Mission EGX entièrement amorcée.

### Validation

Un Codex neuf peut identifier son objectif, ses limites, ses entrées et sa définition de fini sans explication orale.

### Pièges

- mission trop longue et répétitive ;
- règles dupliquées dans plusieurs fichiers et divergentes ;
- critères vagues comme « application propre » ;
- absence de preuves attendues.

### Condition d’arrêt

Tout critère d’acceptation doit pouvoir être observé ou testé.

---

## Étape 11 — Installer la gouvernance documentaire

### Objectif

Éviter que décisions, limites et preuves disparaissent pendant le rush.

### Actions

- créer :
  - **README.md** ;
  - **CONTEXT.md** ;
  - **TODO.md** ;
  - **DECISIONS.md** ;
  - **RISKS.md** ;
  - **EVALS.md** ;
  - **COSTS.md** ;
  - brouillon de note d’arbitrage ;
- attribuer un rôle précis à chaque fichier ;
- faire de **DECISIONS.md** le journal des arbitrages ;
- faire de **RISKS.md** un registre vivant ;
- éviter la redondance documentaire.

### Sortie attendue

Tableau de bord documentaire minimal.

### Validation

Chaque nouvelle décision possède un lieu unique où être inscrite.

### Pièges

- multiplier les fichiers sans règle de routage ;
- laisser **README.md** vide jusqu’à vendredi ;
- écrire la note d’arbitrage uniquement à la fin ;
- utiliser **TODO.md** comme journal historique illisible.

### Condition d’arrêt

Si une décision importante n’a aucun emplacement durable, corriger la gouvernance.

---

## Étape 12 — Initialiser Git et la protection des secrets

### Objectif

Faire de l’historique une preuve de méthode dès le premier jour.

### Actions

- initialiser le dépôt ;
- créer un fichier d’exclusion couvrant :
  - fichiers d’environnement ;
  - dépendances ;
  - builds ;
  - logs ;
  - caches ;
  - données personnelles temporaires ;
- créer un **.env.example** sans valeurs ;
- vérifier qu’aucun secret existant ne se trouve déjà dans les sources importées ;
- réaliser un premier commit atomique de bootstrap.

### Sortie attendue

Dépôt propre, historique amorcé et secrets exclus.

### Validation

Le statut Git ne montre aucun fichier sensible ou généré.

### Pièges

- écrire les clés avant de créer les exclusions ;
- committer puis supprimer un secret, alors qu’il reste dans l’historique ;
- versionner les résultats contenant des données personnelles ;
- produire un unique commit final.

### Condition d’arrêt

Si un secret entre dans Git, traiter immédiatement l’incident et considérer la clé comme compromise.

---

## Étape 13 — Figer le calendrier et les règles de décision

### Objectif

Transformer la deadline ambiguë en rythme contrôlé.

### Actions

- conserver vendredi comme cible interne ;
- réserver des blocs de travail :
  - mercredi : environnement, contrat produit, architecture, boucle verticale ;
  - jeudi : moteur, cas difficiles, interface, évaluation ;
  - vendredi : optimisation, sécurité, documentation, captures et livraison ;
- fixer une heure de gel fonctionnel ;
- interdire tout nouveau cas après le gel ;
- définir un point de décision en fin de chaque demi-journée.

### Sortie attendue

Calendrier de production avec horaires de gel et de revue.

### Validation

Chaque phase possède une fenêtre et une règle de réduction de périmètre.

### Pièges

- traiter vendredi comme le début de la documentation ;
- ajouter des fonctionnalités le vendredi après-midi ;
- compenser un retard de setup en supprimant les contrôles de vérité ;
- ne prévoir aucun buffer pour le déploiement.

### Condition d’arrêt

En cas de retard, réduire d’abord le périmètre, jamais les exigences de traçabilité ou de sécurité.

### Jalon G1 partiel

Le projet possède désormais une frontière, une mission, une mémoire, un historique et un calendrier.

---

# PHASE C — Accès aux APIs et contrat opérationnel

## Étape 14 — Récupérer les clés de manière contrôlée

### Objectif

Obtenir les secrets sans les exposer ni consommer inutilement un lien potentiellement limité.

### Actions

- ouvrir le lien secret uniquement lorsque le laptop est prêt ;
- enregistrer les clés dans un gestionnaire de mots de passe ou un emplacement local protégé ;
- créer les variables locales attendues sans les afficher dans le terminal ;
- ne jamais coller les clés dans :
  - ChatGPT ;
  - une mission Codex ;
  - Git ;
  - une capture ;
  - un document ;
- noter seulement la date de récupération et l’état de validité.

### Sortie attendue

Deux secrets disponibles localement et absents du dépôt.

### Validation

La recherche dans le dépôt ne retrouve aucune valeur de clé.

### Pièges

- multiplier les ouvertures du lien ;
- copier le lien dans la documentation ;
- utiliser une commande qui réaffiche la valeur ;
- stocker les clés dans un fichier non exclu ;
- confondre clé de développement et clé de production.

### Condition d’arrêt

Une clé exposée doit être considérée comme compromise avant de poursuivre.

---

## Étape 15 — Valider l’accès et inventorier les capacités réelles

### Objectif

Ne pas concevoir le produit à partir d’hypothèses sur les modèles ou outils disponibles.

### Actions

- consulter la documentation officielle actuelle ;
- identifier les modèles autorisés par chaque clé ;
- relever :
  - quotas ;
  - limites de débit ;
  - métadonnées d’usage ;
  - outils de recherche disponibles ;
  - contraintes de streaming ;
  - conditions de conservation ;
- effectuer un appel minimal avec chaque fournisseur ;
- enregistrer modèle, réussite, latence et usage sans enregistrer le secret ;
- ne pas lancer de benchmark coûteux.

### Sortie attendue

Une fiche de capacités OpenAI/Gemini factuelle et datée.

### Validation

Au moins un appel minimal réussit, ou un blocage précis est documenté.

### Pièges

- choisir un modèle d’après un souvenir ;
- supposer que la clé ouvre tous les modèles ;
- ignorer un plafond ;
- consommer le budget dans des essais non bornés ;
- croire qu’un accès modèle implique un accès recherche.

### Condition d’arrêt

Si aucune stratégie de collecte conforme et utilisable n’est disponible, résoudre ce problème avant l’architecture.

---

## Étape 16 — Fermer les ambiguïtés contractuelles utiles

### Objectif

Maintenir une mission livrable malgré l’attente d’une réponse d’Antonin.

### Actions

- enregistrer la réponse d’Antonin dès réception ;
- mettre à jour la deadline contractuelle ;
- vérifier la durée des clés ;
- décider comment l’application restera testable après expiration ;
- consigner les questions non résolues ;
- conserver vendredi comme cible tant qu’elle reste réaliste.

### Sortie attendue

Contrat opérationnel versionné.

### Validation

Le projet connaît sa deadline, son budget ou au minimum son plan de contingence.

### Pièges

- bloquer tout le projet en attendant une réponse ;
- confondre cible interne et engagement contractuel ;
- déployer une application condamnée à expirer avant l’évaluation ;
- poser à Antonin des questions que l’énoncé laisse volontairement libres.

### Condition d’arrêt

Un risque d’expiration empêchant toute évaluation doit être remonté avant la livraison.

### Jalon G1

**La mission est intronisée et ses ressources opérationnelles sont comprises.**

---

# PHASE D — Contrat produit et contrat de vérité

## Étape 17 — Définir l’utilisateur et le résultat métier

### Objectif

Éviter de construire une encyclopédie générique.

### Actions

- formaliser le commercial comme utilisateur principal ;
- écrire son scénario avant rendez-vous ;
- définir les décisions que le dossier doit faciliter ;
- lister les informations vraiment actionnables ;
- préciser ce qui relève d’un fait, d’un signal ou d’une piste de conversation.

### Sortie attendue

Une page de cadrage produit et un job-to-be-done.

### Validation

Chaque future rubrique peut être justifiée par un besoin du commercial.

### Pièges

- afficher tout ce qui est trouvable ;
- confondre volume et utilité ;
- générer des conseils commerciaux non sourcés comme des faits ;
- oublier la contrainte de lecture rapide.

### Condition d’arrêt

Une rubrique sans utilité explicable est retirée du périmètre.

---

## Étape 18 — Choisir les cas traités et les cas différés

### Objectif

Concentrer l’effort sur quelques comportements réellement solides.

### Actions

- retenir provisoirement :
  - homonyme ;
  - conflit ;
  - silence ;
- traiter la péremption comme propriété transversale si possible ;
- noter filiale et marque comme candidats différés ;
- définir pour chaque cas :
  - entrée ;
  - comportement attendu ;
  - comportement interdit ;
  - preuve de réussite ;
- préparer une règle de remplacement si un cas s’avère disproportionné.

### Sortie attendue

Matrice de périmètre signée dans **DECISIONS.md**.

### Validation

Trois cas possèdent des critères observables et les autres sont explicitement différés.

### Pièges

- annoncer six cas partiellement couverts ;
- choisir uniquement des cas faciles ;
- traiter la péremption uniquement comme un badge visuel ;
- modifier le périmètre chaque fois qu’une nouvelle idée apparaît.

### Condition d’arrêt

Après le gel fonctionnel, aucun nouveau cas sans retrait équivalent.

---

## Étape 19 — Définir le contrat d’entrée et de clarification

### Objectif

Empêcher qu’un nom soit traité comme une identité certaine.

### Actions

- définir les champs minimaux ;
- distinguer personne et entreprise, explicitement ou par résolution ;
- définir le contexte optionnel ;
- définir les conditions déclenchant :
  - recherche directe ;
  - présentation de plusieurs candidats ;
  - question de clarification ;
  - refus de continuer ;
- écrire des exemples valides et invalides.

### Sortie attendue

Contrat d’entrée documenté.

### Validation

Une entrée ambiguë possède un comportement prévu avant toute ligne de pipeline.

### Pièges

- demander trop d’informations dès le départ ;
- choisir arbitrairement le premier résultat ;
- laisser le modèle inventer le type d’entité sans contrôle ;
- confondre clarification et message d’erreur.

### Condition d’arrêt

Si le système ne sait pas expliquer pourquoi il a choisi une entité, le contrat est insuffisant.

---

## Étape 20 — Définir l’architecture d’information du dossier

### Objectif

Décider ce que l’utilisateur lit, dans quel ordre et pourquoi.

### Actions

- dessiner une structure de résultat :
  - identité résolue ;
  - résumé opérationnel ;
  - faits clés ;
  - signaux récents ;
  - contradictions ;
  - inconnues ;
  - sources ;
  - reçu coût/latence ;
- définir les informations prioritaires au-dessus de la ligne de flottaison ;
- séparer fait, inférence et recommandation ;
- prévoir le résultat vide et le résultat partiel.

### Sortie attendue

Wireframe textuel ou schéma de l’écran résultat.

### Validation

Chaque section possède une valeur métier et un type de données clair.

### Pièges

- commencer le design visuel avant le contrat de contenu ;
- masquer les contradictions dans un détail ;
- afficher un score de confiance sans explication ;
- noyer les sources dans un onglet inaccessible.

### Condition d’arrêt

Une information critique non vérifiable depuis l’écran doit être repositionnée ou retirée.

---

## Étape 21 — Définir le schéma affirmation-preuve

### Objectif

Préserver la traçabilité de la collecte jusqu’à l’écran.

### Actions

- définir une affirmation atomique ;
- définir les champs de preuve :
  - URL ;
  - titre ;
  - éditeur ;
  - extrait ;
  - date ;
  - date de consultation ;
  - entité ;
  - périmètre ;
  - relation avec l’affirmation ;
- définir les statuts :
  - soutenu ;
  - contesté ;
  - ambigu ;
  - périmé ;
  - non vérifié ;
- imposer que le compositeur ne reçoive que des preuves identifiées.

### Sortie attendue

Contrat de données lisible indépendamment du framework.

### Validation

Un exemple manuel complet relie une phrase affichée à un extrait exact.

### Pièges

- utiliser une bibliographie générale ;
- stocker un paragraphe contenant plusieurs faits ;
- perdre la citation lors d’une reformulation ;
- confondre URL de recherche et URL source ;
- accepter un extrait qui ne prouve pas la phrase.

### Condition d’arrêt

Pas de synthèse libre avant validation de ce contrat.

---

## Étape 22 — Définir la politique de sources, de collecte et de vie privée

### Objectif

Éviter les preuves faibles, les collectes non conformes et la conservation excessive.

### Actions

- définir une hiérarchie de sources par type de fait ;
- distinguer source primaire, source secondaire, agrégateur et snippet ;
- définir ce qui peut orienter la recherche sans constituer une preuve ;
- documenter les méthodes de collecte autorisées ;
- exclure le contournement de conditions d’utilisation ;
- décider de ne pas persister les données personnelles sauf nécessité ;
- limiter le dossier aux informations professionnelles publiques pertinentes.

### Sortie attendue

Politique source et données intégrée au projet.

### Validation

Pour chaque type de fait important, une source préférée et une source insuffisante sont identifiées.

### Pièges

- prendre le premier résultat ;
- citer un snippet ;
- scraper un service malgré ses conditions ;
- conserver des recherches nominatives dans des logs ;
- considérer une source officielle comme impartiale pour tous les sujets.

### Condition d’arrêt

Une méthode de collecte non défendable juridiquement ou éthiquement est exclue, même si elle est techniquement simple.

---

## Étape 23 — Définir les politiques d’incertitude et d’échec

### Objectif

Faire de l’échec honnête un comportement de produit, pas une exception.

### Actions

- définir :
  - absence de preuve ;
  - identité ambiguë ;
  - contradiction ;
  - information périmée ;
  - source inaccessible ;
  - quota atteint ;
  - timeout ;
- définir les formulations sûres ;
- interdire les formulations trop absolues ;
- prévoir le résultat partiel ;
- définir les cas où l’utilisateur peut enrichir le contexte.

### Sortie attendue

Catalogue des états et messages associés.

### Validation

Chaque échec critique possède un comportement visible et une sortie contrôlée.

### Pièges

- masquer un échec sous un texte générique ;
- affirmer « aucune présence en ligne » ;
- transformer un timeout en fiche vide ;
- proposer automatiquement une autre personne comme cible.

### Condition d’arrêt

Tout échec qui pourrait produire une fausse certitude doit être traité avant la boucle verticale.

### Jalon G2

**Le projet sait désormais ce qu’il doit produire, ce qu’il doit refuser et comment le prouver.**

---

# PHASE E — Architecture et boucle verticale

## Étape 24 — Réaliser un spike comparatif minimal

### Objectif

Choisir les capacités réelles sur preuves plutôt que sur préférences.

### Actions

- utiliser une requête neutre et peu coûteuse ;
- tester seulement ce qui différencie les options :
  - qualité des sources ;
  - conservation des URLs ;
  - sorties structurées ;
  - usage/tokens ;
  - latence ;
  - comportement de recherche ;
- comparer OpenAI, Gemini ou une combinaison seulement si les clés le permettent ;
- enregistrer les résultats bruts et le coût ;
- arrêter après obtention de l’information de décision.

### Sortie attendue

Mini-rapport de comparaison et recommandation.

### Validation

Le fournisseur et la stratégie de recherche sont choisis selon des critères écrits.

### Pièges

- transformer le spike en benchmark complet ;
- consommer le budget sur dix modèles ;
- choisir uniquement la meilleure prose ;
- ignorer la traçabilité ou l’usage.

### Condition d’arrêt

Si aucune option ne conserve des sources exploitables, revoir la stratégie de collecte avant le développement.

---

## Étape 25 — Écrire la décision d’architecture

### Objectif

Choisir l’architecture minimale qui satisfait le contrat.

### Actions

- sélectionner :
  - framework web ;
  - langage ;
  - couche serveur ;
  - fournisseur de recherche ;
  - fournisseur modèle ;
  - méthode de streaming ou progression ;
  - hébergement ;
  - validation structurée ;
  - tests ;
- justifier chaque dépendance ;
- refuser la base de données si elle n’apporte rien ;
- prévoir l’abstraction fournisseur uniquement si elle sert un besoin réel ;
- documenter les limites de timeout et secrets.

### Sortie attendue

Décision d’architecture versionnée.

### Validation

Chaque composant répond à une exigence et l’architecture peut être expliquée en cinq minutes.

### Pièges

- architecture multi-agent par prestige ;
- microservices ;
- base de données inutile ;
- abstraction générique avant la première boucle ;
- dépendance locale rendant le déploiement impossible ;
- choix Vercel ou autre sans vérifier les durées d’exécution.

### Condition d’arrêt

Une architecture impossible à transmettre ou déployer dans le délai est refusée.

---

## Étape 26 — Initialiser le squelette qualité

### Objectif

Créer une base compilable, testable et sûre sans générer un énorme boilerplate.

### Actions

- initialiser l’application ;
- activer le typage strict ;
- ajouter validation, lint et tests minimaux ;
- valider les variables d’environnement au démarrage ;
- créer une route de santé ;
- configurer des logs structurés et expurgés ;
- lancer les validations ;
- effectuer un commit atomique.

### Sortie attendue

Application locale vide mais saine.

### Validation

Installation, build, lint et tests initiaux réussissent.

### Pièges

- installer trop de dépendances ;
- ignorer les warnings ;
- loguer les variables d’environnement ;
- produire du code avant d’avoir un build vert ;
- laisser Codex modifier la doctrine ou le brief.

### Condition d’arrêt

Pas de fonctionnalité tant que la baseline n’est pas verte.

---

## Étape 27 — Déployer immédiatement le squelette

### Objectif

Découvrir tôt les problèmes d’hébergement, de réseau et de configuration.

### Actions

- créer le projet d’hébergement ;
- déployer une page minimale ;
- configurer uniquement des variables factices ou non sensibles ;
- tester l’URL sur téléphone et en navigation privée ;
- vérifier les logs et les durées autorisées ;
- documenter la procédure.

### Sortie attendue

Première URL publique sans fonctionnalité métier.

### Validation

L’URL fonctionne hors du laptop et la route de santé répond.

### Pièges

- attendre vendredi pour déployer ;
- confondre preview locale et URL publique ;
- injecter les vraies clés avant validation ;
- ignorer les limites de fonction.

### Condition d’arrêt

Tout hébergement incompatible avec la durée des recherches doit être remplacé ou contourné maintenant.

---

## Étape 28 — Construire la boucle verticale la plus fine

### Objectif

Prouver le flux complet avant d’élargir le moteur.

### Actions

- accepter une seule demande simple ;
- exécuter une recherche réelle ;
- récupérer une source ;
- extraire une affirmation atomique ;
- conserver son extrait et son URL ;
- afficher l’affirmation avec sa source ;
- rendre le résultat accessible sur l’URL déployée ;
- ne pas encore couvrir tous les cas.

### Sortie attendue

Une recherche réelle produit au moins un fait vérifiable à l’écran.

### Validation

Un humain ouvre la source et confirme qu’elle soutient la phrase.

### Pièges

- générer d’abord un rapport complet ;
- ajouter les citations après la synthèse ;
- utiliser un résultat codé en dur ;
- cacher les erreurs ;
- retarder le déploiement après la réussite locale.

### Condition d’arrêt

Si la phrase et la source ne correspondent pas exactement, ne pas ajouter d’autres fonctionnalités.

---

## Étape 29 — Instrumenter usage, coût et latence dès la première boucle

### Objectif

Éviter de reconstruire les coûts après coup.

### Actions

- enregistrer par étape :
  - fournisseur ;
  - modèle ;
  - appels ;
  - tokens d’entrée ;
  - tokens de sortie ;
  - tokens additionnels exposés ;
  - appels outils ;
  - durée ;
- calculer un coût avec tarif daté ;
- séparer coût réel observé et estimation ;
- relier chaque appel à une finalité fonctionnelle ;
- ne jamais enregistrer la clé ou du contenu personnel inutile.

### Sortie attendue

Premier reçu d’exécution.

### Validation

Le coût d’une recherche simple peut être expliqué et recalculé.

### Pièges

- afficher 0 € parce qu’une clé est offerte ;
- ignorer le coût de recherche ;
- arrondir trop tôt ;
- mesurer seulement la génération finale ;
- collecter des prompts complets contenant des données personnelles.

### Condition d’arrêt

Un appel non mesurable doit être documenté comme limite avant généralisation.

### Jalon G3

**Une boucle verticale réelle, sourcée, mesurée et déployée existe.**

---

# PHASE F — Construction du noyau fiable

## Étape 30 — Construire le planificateur de recherche borné

### Objectif

Empêcher les recherches infinies et rendre le coût prévisible.

### Actions

- définir un nombre maximal de requêtes ;
- définir un nombre maximal de sources ;
- définir un budget tokens et coût ;
- définir les critères d’arrêt :
  - identité suffisamment résolue ;
  - couverture minimale ;
  - preuve suffisante ;
  - budget épuisé ;
- tracer la raison de chaque itération ;
- distinguer cas simple et cas ambigu.

### Sortie attendue

Politique de recherche bornée.

### Validation

Une recherche ne peut pas boucler sans limite et expose sa raison d’arrêt.

### Pièges

- laisser le modèle décider seul de continuer ;
- lancer la même requête reformulée plusieurs fois ;
- confondre plus de sources et meilleure preuve ;
- arrêter dès la première source.

### Condition d’arrêt

Pas de boucle autonome sans budget maximal explicite.

---

## Étape 31 — Construire la résolution d’entité

### Objectif

Séparer identité probable et identité prouvée.

### Actions

- produire des candidats ;
- extraire les attributs discriminants ;
- comparer au contexte ;
- détecter les incohérences ;
- permettre :
  - choix automatique justifié ;
  - choix utilisateur ;
  - refus de choisir ;
- conserver la justification de la résolution.

### Sortie attendue

Objet d’identité résolu ou état d’ambiguïté.

### Validation

Un cas homonyme ne fusionne aucune information.

### Pièges

- score opaque ;
- seuil arbitraire non documenté ;
- premier résultat choisi par défaut ;
- contexte utilisateur ignoré ;
- deux candidats regroupés sous la même fiche.

### Condition d’arrêt

Une identité non résolue ne doit jamais accéder à la composition finale comme identité certaine.

---

## Étape 32 — Construire la collecte et la normalisation des sources

### Objectif

Créer un corpus propre, légal et traçable.

### Actions

- collecter via les méthodes validées ;
- conserver URL, titre, éditeur, date et extrait ;
- normaliser les URLs ;
- dédupliquer les sources ;
- marquer les sources inaccessibles, payantes ou ambiguës ;
- séparer snippet et contenu source ;
- limiter la quantité de texte transmise aux modèles.

### Sortie attendue

Corpus normalisé relié à l’entité recherchée.

### Validation

Chaque élément possède une provenance et aucun doublon évident ne gonfle le contexte.

### Pièges

- traiter un résultat de recherche comme preuve ;
- récupérer des pages entières inutilement ;
- perdre la date de consultation ;
- mélanger plusieurs entités dans un même corpus ;
- contourner un accès.

### Condition d’arrêt

Une source sans provenance ne passe pas à l’extraction.

---

## Étape 33 — Construire le registre d’affirmations

### Objectif

Transformer les sources en unités vérifiables sans perdre le lien original.

### Actions

- extraire des affirmations atomiques ;
- imposer une structure validée ;
- rattacher chaque affirmation à un ou plusieurs extraits ;
- conserver date, périmètre et entité ;
- distinguer fait et inférence ;
- rejeter les sorties structurellement invalides ;
- tester la résistance aux formulations trop larges.

### Sortie attendue

Registre d’affirmations avec preuves.

### Validation

Chaque affirmation du registre possède au moins une preuve réellement probante.

### Pièges

- accepter une affirmation parce que le modèle lui attribue une confiance élevée ;
- fusionner plusieurs chiffres ;
- conserver un adjectif promotionnel comme fait ;
- perdre le texte probant ;
- laisser passer une sortie partiellement invalide.

### Condition d’arrêt

Une affirmation sans preuve est supprimée, jamais complétée par plausibilité.

---

## Étape 34 — Réconcilier conflits, dates et périmètres

### Objectif

Comprendre les divergences avant de choisir ou présenter une information.

### Actions

- regrouper les affirmations comparables ;
- normaliser unité et devise ;
- identifier année et période ;
- distinguer groupe, filiale, pays et établissement ;
- distinguer publié, estimé et historique ;
- classer :
  - confirmation ;
  - différence explicable ;
  - contradiction ;
  - indétermination ;
- conserver les versions non retenues.

### Sortie attendue

Registre réconcilié avec conflits visibles.

### Validation

Deux chiffres différents ne sont pas automatiquement traités comme contradictoires ou fusionnés.

### Pièges

- prendre le chiffre le plus récent sans vérifier le périmètre ;
- moyenner ;
- convertir une devise sans dater le taux ;
- attribuer le groupe à la filiale ;
- masquer la source écartée.

### Condition d’arrêt

Un fait quantitatif sans période ou périmètre clair reste indéterminé.

---

## Étape 35 — Composer le dossier uniquement depuis les preuves

### Objectif

Empêcher la génération finale d’ajouter des faits.

### Actions

- fournir au compositeur uniquement les affirmations validées ;
- imposer les identifiants de preuve ;
- produire une structure de dossier validée ;
- distinguer faits, inférences, conflits et inconnues ;
- interdire l’ajout de chiffres ou biographies absents du registre ;
- limiter la prose décorative.

### Sortie attendue

Dossier structuré avec références internes stables.

### Validation

Chaque phrase factuelle du dossier peut être retrouvée dans le registre.

### Pièges

- renvoyer toutes les pages au modèle final ;
- laisser le modèle « améliorer » les informations ;
- générer des citations sous forme de texte libre ;
- mélanger recommandations et faits.

### Condition d’arrêt

Tout fait nouveau produit pendant la composition est supprimé ou repasse par l’étape de preuve.

---

## Étape 36 — Ajouter le vérificateur final et le mode fail-closed

### Objectif

Bloquer les sorties convaincantes mais indéfendables.

### Actions

- contrôler automatiquement :
  - présence de preuve ;
  - validité de l’identifiant source ;
  - cohérence entité ;
  - cohérence date ;
  - cohérence périmètre ;
  - contradictions non affichées ;
- supprimer ou dégrader les affirmations invalides ;
- produire un résultat partiel plutôt qu’une erreur silencieuse ;
- enregistrer la raison du retrait.

### Sortie attendue

Dossier validé ou explicitement partiel.

### Validation

L’injection volontaire d’une affirmation non sourcée provoque son rejet.

### Pièges

- utiliser le même modèle comme unique juge de sa propre sortie ;
- considérer une structure valide comme une preuve vraie ;
- transformer le contrôle en nouvel appel coûteux non borné ;
- supprimer les contradictions pour simplifier.

### Condition d’arrêt

Aucun dossier ne doit atteindre l’écran sans contrôle final.

### Jalon G4

**Le noyau protège désormais l’identité, les preuves, les conflits et le refus d’inventer.**

---

# PHASE G — UX, évaluation et token efficiency

## Étape 37 — Construire la machine d’état de l’attente

### Objectif

Rendre les dizaines de secondes compréhensibles sans fausse progression.

### Actions

- relier l’interface aux étapes réelles ;
- afficher :
  - compréhension ;
  - résolution ;
  - collecte ;
  - extraction ;
  - réconciliation ;
  - vérification ;
- prévoir durée inconnue sans pourcentage fictif ;
- conserver l’état lors d’une erreur ;
- afficher les avertissements utiles.

### Sortie attendue

Expérience d’attente pilotée par le pipeline réel.

### Validation

Chaque état visible correspond à un événement effectif.

### Pièges

- barre à 95 % bloquée ;
- messages marketing sans rapport avec le traitement ;
- trop de détails techniques ;
- progression réinitialisée lors d’une erreur.

### Condition d’arrêt

Une étape fictive est supprimée même si elle rend l’animation plus spectaculaire.

---

## Étape 38 — Construire l’interface de confiance du résultat

### Objectif

Permettre une lecture rapide et une vérification immédiate.

### Actions

- hiérarchiser l’identité et le résumé ;
- rendre chaque citation actionnable ;
- afficher date et périmètre ;
- créer des zones explicites :
  - contradictions ;
  - inconnues ;
  - limites ;
- ajouter le reçu coût/latence ;
- vérifier l’accessibilité et le responsive.

### Sortie attendue

Écran résultat complet et défendable.

### Validation

Un utilisateur peut vérifier un fait important en moins de deux interactions.

### Pièges

- cacher les sources ;
- utiliser uniquement la couleur pour les statuts ;
- afficher un score sans explication ;
- privilégier l’esthétique au détriment de la preuve ;
- présenter le coût comme un gadget.

### Condition d’arrêt

Si la source ne survit pas jusqu’à l’écran, revenir au contrat de données.

---

## Étape 39 — Traiter les erreurs, partiels, timeouts et reprises

### Objectif

Éviter qu’un incident technique produise un faux résultat métier.

### Actions

- traiter :
  - réseau interrompu ;
  - quota atteint ;
  - source inaccessible ;
  - réponse invalide ;
  - timeout ;
  - recherche vide ;
- différencier erreur technique et absence de preuve ;
- proposer une reprise bornée ;
- éviter les doubles appels lors d’un retry ;
- conserver les preuves déjà validées lorsque c’est sûr.

### Sortie attendue

Catalogue d’erreurs testé dans l’interface.

### Validation

Chaque erreur simulée produit un message précis et aucune fiche fausse.

### Pièges

- retry automatique infini ;
- double facturation ;
- perte complète d’un résultat partiel ;
- message « aucun résultat » après un timeout ;
- affichage de stack trace ou de secret.

### Condition d’arrêt

Une erreur ambiguë pouvant être interprétée comme un résultat doit être corrigée.

---

## Étape 40 — Écrire les tests des invariants fragiles

### Objectif

Protéger ce qui rend l’application digne de confiance.

### Actions

- tester :
  - impossibilité d’afficher un fait sans preuve ;
  - conservation des identifiants de source ;
  - séparation de deux homonymes ;
  - conflit non masqué ;
  - absence de contenu en cas de silence ;
  - date et périmètre ;
  - calcul du coût ;
  - absence de secret côté client ;
- privilégier des tests ciblés plutôt qu’une couverture artificielle ;
- exécuter les tests à chaque changement du pipeline.

### Sortie attendue

Suite courte de tests à forte valeur.

### Validation

Les tests échouent réellement lorsque les garanties sont volontairement cassées.

### Pièges

- tests qui vérifient seulement le rendu ;
- snapshots massifs ;
- mocks tellement parfaits qu’ils masquent les erreurs réelles ;
- objectif de pourcentage de couverture.

### Condition d’arrêt

Un invariant critique sans test doit avoir au minimum une preuve manuelle reproductible et être déclaré.

---

## Étape 41 — Exécuter le jeu d’évaluation et les requêtes inconnues

### Objectif

Démontrer que le produit n’est pas préparé pour trois captures.

### Actions

- sélectionner des exemples réels pour les cas retenus ;
- définir le comportement attendu avant exécution ;
- exécuter :
  - homonyme ;
  - conflit ;
  - silence ;
  - information périmée si disponible ;
- ajouter plusieurs requêtes non utilisées pendant le développement ;
- enregistrer résultat, coût, latence et limites ;
- ne pas corriger manuellement les données retournées.

### Sortie attendue

Rapport d’évaluation dynamique.

### Validation

Les résultats montrent succès, échecs et zones incertaines sans données figées.

### Pièges

- choisir uniquement des exemples qui réussissent ;
- ajuster le code à chaque nom particulier ;
- présenter un cas comme couvert sur une seule réussite ;
- oublier de conserver les régressions.

### Condition d’arrêt

Une sortie fausse et confiante sur une requête inconnue bloque la release.

---

## Étape 42 — Optimiser le coût sans dégrader la qualité

### Objectif

Transformer la token efficiency en preuve mesurée.

### Actions

- figer une baseline ;
- identifier les principaux postes de coût ;
- tester séparément :
  - réduction du contexte ;
  - déduplication ;
  - extraits plus courts ;
  - modèle moins coûteux pour une étape simple ;
  - code déterministe ;
  - cache licite ;
  - arrêt anticipé ;
- réexécuter les mêmes évaluations ;
- comparer qualité, coût et latence ;
- conserver les optimisations seulement si les invariants restent verts.

### Sortie attendue

Comparaison avant/après et coût par type de fiche.

### Validation

Une baisse de coût est accompagnée d’une qualité au moins équivalente sur les critères critiques.

### Pièges

- optimiser avant d’avoir une baseline ;
- annoncer un gain sur un seul cas ;
- réduire les tokens en supprimant des preuves ;
- choisir un modèle moins cher qui masque les contradictions ;
- ne mesurer que le coût final.

### Condition d’arrêt

Toute optimisation qui dégrade la traçabilité, le refus ou la résolution d’identité est rejetée.

### Jalon G5

**Le produit a été évalué sur des cas réels et sa relation coût/qualité est démontrée.**

---

# PHASE H — Durcissement, documentation et livraison

## Étape 43 — Effectuer l’audit sécurité, vie privée et conformité

### Objectif

Éliminer les risques rédhibitoires avant la release.

### Actions

- vérifier le dépôt et l’historique pour les secrets ;
- vérifier le bundle client ;
- vérifier les logs ;
- vérifier l’absence de conservation excessive ;
- vérifier les conditions d’utilisation des collecteurs ;
- vérifier que les captures ne contiennent pas de secrets ou données sensibles ;
- documenter les limites de confidentialité.

### Sortie attendue

Checklist de sécurité signée.

### Validation

Aucun secret ni donnée personnelle inutile n’est exposé.

### Pièges

- vérifier uniquement l’état courant et pas l’historique ;
- exposer une variable serveur dans le client ;
- conserver les prompts complets ;
- publier des cas portant sur une personne privée sans nécessité.

### Condition d’arrêt

Une fuite de secret ou collecte non conforme bloque immédiatement la release.

---

## Étape 44 — Durcir le déploiement

### Objectif

Garantir que l’application publique se comporte comme la version locale.

### Actions

- configurer les variables de production ;
- tester cold start et recherche longue ;
- vérifier timeouts, erreurs et retries ;
- tester depuis :
  - navigation privée ;
  - téléphone ;
  - réseau différent ;
- vérifier les URLs sources ;
- vérifier que l’application reste utilisable après plusieurs recherches ;
- tester le scénario de quota faible.

### Sortie attendue

Déploiement candidat stable.

### Validation

Une recherche inconnue complète fonctionne depuis un appareil externe.

### Pièges

- ne tester que la page d’accueil ;
- oublier une variable de production ;
- dépendre d’un cache local ;
- corriger directement en production sans commit ;
- ignorer les fonctions proches du timeout.

### Condition d’arrêt

Une URL qui fonctionne uniquement sur la machine de développement n’est pas une URL livrable.

---

## Étape 45 — Tester le README en environnement propre

### Objectif

Prouver que Génial peut relancer le projet sans Maxime.

### Actions

- compléter le README :
  - objectif ;
  - architecture ;
  - prérequis ;
  - variables ;
  - démarrage ;
  - tests ;
  - build ;
  - déploiement ;
  - périmètre ;
  - coût ;
  - limites ;
- suivre le README depuis un clone ou dossier propre ;
- corriger chaque connaissance implicite.

### Sortie attendue

README autonome.

### Validation

Le projet démarre en suivant seulement le document.

### Pièges

- commande absente ;
- variable non documentée ;
- chemin propre au laptop ;
- secret d’exemple réel ;
- dépendance globale non mentionnée.

### Condition d’arrêt

Une étape manuelle non documentée doit être supprimée ou ajoutée au README.

---

## Étape 46 — Finaliser la note d’arbitrage

### Objectif

Rendre visible le jugement, pas seulement le code.

### Actions

- condenser le journal de décisions en deux à quatre pages ;
- expliquer :
  - besoin compris ;
  - périmètre choisi ;
  - architecture retenue ;
  - modèle de vérité ;
  - cas traités ;
  - cas écartés ;
  - coûts ;
  - limites ;
  - travail avec un mois de plus ;
- inclure au moins un arbitrage coût/qualité ;
- être explicite sur les points de rupture.

### Sortie attendue

Note finale conforme à la longueur demandée.

### Validation

La note permet de comprendre pourquoi le système existe sous cette forme.

### Pièges

- résumer le README ;
- cacher les échecs ;
- dépasser quatre pages ;
- prétendre que tout est couvert ;
- utiliser du jargon sans décision.

### Condition d’arrêt

Une limite connue absente de la note doit être ajoutée avant livraison.

---

## Étape 47 — Constituer le dossier de résultats et captures

### Objectif

Apporter des preuves indépendantes de la démonstration orale.

### Actions

- sélectionner les cas réellement traités ;
- inclure pour chacun :
  - entrée ;
  - contexte ;
  - résultat ;
  - comportement attendu ;
  - métriques ;
  - captures ;
  - limites ;
- inclure au moins un échec honnête ;
- anonymiser si nécessaire ;
- vérifier que les captures correspondent à la version livrée.

### Sortie attendue

Dossier de preuves de cas.

### Validation

Chaque cas annoncé comme couvert possède une preuve visible.

### Pièges

- captures d’une ancienne version ;
- sélection uniquement de réussites parfaites ;
- cas figés dans le code ;
- données personnelles inutiles ;
- coût non relié au cas.

### Condition d’arrêt

Un cas sans preuve n’est pas annoncé comme traité.

---

## Étape 48 — Auditer l’historique Git et le dépôt

### Objectif

Faire de l’historique une démonstration de méthode.

### Actions

- vérifier la séquence des commits ;
- confirmer qu’ils sont atomiques et compréhensibles ;
- vérifier l’absence de secret dans l’historique ;
- supprimer les artefacts générés non suivis ;
- confirmer que le commit courant correspond au déploiement ;
- préparer un tag de release ;
- éviter toute reconstruction artificielle de l’historique.

### Sortie attendue

Dépôt propre et cohérent avec la note.

### Validation

Un lecteur peut suivre le chemin du bootstrap à la release.

### Pièges

- commit final géant ;
- messages « fix » sans contexte ;
- déploiement depuis un commit non livré ;
- amendements de dernière minute rendant les preuves incohérentes ;
- secrets supprimés seulement dans le dernier commit.

### Condition d’arrêt

Un secret dans l’historique nécessite rotation et nettoyage avant partage.

---

## Étape 49 — Répéter la soutenance d’une heure

### Objectif

Préparer la démonstration et les objections sans dépendre de l’improvisation.

### Actions

- préparer un déroulé :
  - 5 minutes : problème et parti pris ;
  - 10 minutes : démonstration ;
  - 10 minutes : vérité et sources ;
  - 10 minutes : cas difficiles ;
  - 5 minutes : coût et optimisation ;
  - 5 minutes : limites et suite ;
  - temps restant : questions ;
- exécuter une requête inconnue ;
- préparer les réponses aux questions de l’audit ;
- savoir montrer un échec honnête ;
- chronométrer.

### Sortie attendue

Script de démo et liste de questions-réponses.

### Validation

La présentation tient dans le temps et survit à une requête non préparée.

### Pièges

- passer vingt minutes sur l’interface ;
- cacher un échec ;
- ne pas savoir expliquer le coût ;
- improviser l’architecture ;
- lancer une requête risquée sans plan de repli.

### Condition d’arrêt

Toute question centrale sans réponse déclenche une mise à jour de la note ou du produit.

---

## Étape 50 — Geler la release candidate et effectuer la QA externe

### Objectif

Éviter qu’une modification tardive casse le livrable.

### Actions

- figer les fonctionnalités ;
- créer le tag candidat ;
- exécuter toutes les validations ;
- faire tester URL et README par un regard extérieur si possible ;
- vérifier les liens ;
- vérifier le dépôt partagé ;
- consigner les anomalies ;
- ne corriger que les défauts bloquants.

### Sortie attendue

Release candidate immuable.

### Validation

G0 à G6 sont cochés et aucune anomalie critique ne reste ouverte.

### Pièges

- « petite amélioration » après la QA ;
- modification non redéployée ;
- captures non actualisées ;
- dépôt privé inaccessible ;
- tag ne correspondant pas à l’URL.

### Condition d’arrêt

Un défaut critique de vérité, sécurité ou accès bloque l’envoi. Un détail cosmétique est documenté.

### Jalon G6

**L’application, le dépôt et la restitution forment un même état cohérent et testable.**

---

## Étape 51 — Livrer à Antonin

### Objectif

Transmettre un ensemble clair, accessible et immédiatement évaluable.

### Actions

- envoyer :
  - URL ;
  - dépôt ;
  - instructions d’accès ;
  - note d’arbitrage ;
  - résultats/captures ;
- rappeler brièvement :
  - périmètre couvert ;
  - coût observé ;
  - limites assumées ;
- ne pas sur-vendre ;
- tester chaque lien juste avant envoi ;
- conserver une copie exacte du message envoyé.

### Sortie attendue

Mail de livraison complet.

### Validation

Chaque lien fonctionne pour un destinataire extérieur et le dépôt est accessible.

### Pièges

- envoyer avant la fin du déploiement ;
- oublier une permission ;
- inclure une clé ;
- annoncer comme couverts des cas seulement esquissés ;
- écrire un long roman au lieu d’un handoff clair.

### Condition d’arrêt

Un livrable inaccessible n’est pas envoyé avec une promesse de correction ultérieure.

---

## Étape 52 — Clôturer et préparer le handoff

### Objectif

Conserver un état reproductible pour la discussion et une éventuelle reprise.

### Actions

- noter :
  - commit livré ;
  - tag ;
  - URL ;
  - date ;
  - configuration modèle sans secret ;
- sauvegarder les preuves ;
- mettre à jour **RESULT.md**, **EVIDENCE.md** et **HANDOFF.md** ;
- désactiver les expérimentations ;
- préparer une liste courte des améliorations après retour ;
- ne pas utiliser les clés au-delà du besoin.

### Sortie attendue

Projet fermé proprement et prêt pour la soutenance.

### Validation

Une nouvelle session Codex peut reprendre exactement l’état livré.

### Pièges

- continuer à modifier après livraison ;
- ne plus savoir quel commit a été évalué ;
- perdre les métriques ;
- laisser un environnement de démonstration différent du dépôt.

### Condition d’arrêt

La mission n’est clôturée que lorsque l’état livré est identifiable et reproductible.

### Jalon G7

**Le projet est livré, prouvé, documenté et transmissible.**

---

## 4. Calendrier intensif recommandé

Ce calendrier est une cible de production, pas une promesse rigide. Les horaires exacts peuvent bouger, mais l’ordre des jalons doit rester stable.

### Mercredi matin — Poste et intronisation

- étapes 1 à 16 ;
- objectif de sortie : G1 ;
- temps cible : 3 à 5 heures ;
- couper les caches et migrations inutiles avant de couper la vérification de doctrine.

### Mercredi après-midi — Contrat produit et première boucle

- étapes 17 à 29 ;
- objectif de sortie : G3 ;
- temps cible : 6 à 8 heures ;
- la journée ne se termine pas sur une maquette, mais sur une URL exécutant une boucle réelle.

### Jeudi matin — Noyau de vérité

- étapes 30 à 36 ;
- objectif de sortie : G4 ;
- temps cible : 5 à 7 heures ;
- aucune cosmétique tant que l’affirmation-source n’est pas protégée.

### Jeudi après-midi — UX et cas d’épreuve

- étapes 37 à 41 ;
- objectif : premières évaluations complètes ;
- temps cible : 5 à 7 heures ;
- geler le périmètre avant la fin de journée.

### Vendredi matin — Optimisation et durcissement

- étapes 42 à 45 ;
- objectif : G5 et déploiement robuste ;
- temps cible : 4 à 6 heures.

### Vendredi après-midi — Restitution

- étapes 46 à 52 ;
- objectif : G7 ;
- temps cible : 4 à 6 heures ;
- réserver un buffer avant l’envoi.

---

## 5. Ordre de coupe si le temps manque

### À couper en premier

1. animations et raffinements décoratifs ;
2. rubriques secondaires du dossier ;
3. comparaison visible entre fournisseurs ;
4. quatrième cas d’épreuve ;
5. cache sophistiqué ;
6. base de données ;
7. architecture multi-provider complète ;
8. visualisations secondaires.

### À ne jamais couper

1. lien affirmation-source ;
2. protection contre le mélange d’entités ;
3. mode silence/fail-closed ;
4. contradictions visibles ;
5. clés côté serveur ;
6. mesure du coût ;
7. URL réellement fonctionnelle ;
8. README autonome ;
9. note d’arbitrage ;
10. historique Git propre ;
11. cas écartés explicitement ;
12. test sur une requête inconnue.

---

## 6. Carte de commits recommandée

Les intitulés exacts peuvent varier. La logique doit rester atomique.

1. bootstrap du dépôt et documentation source ;
2. gouvernance EGX et critères d’acceptation ;
3. baseline applicative et validations ;
4. premier déploiement ;
5. boucle verticale source-affirmation-écran ;
6. instrumentation usage/coût ;
7. résolution d’identité ;
8. collecte et normalisation ;
9. registre de preuves ;
10. conflits, dates et périmètres ;
11. composition et vérificateur ;
12. UX d’attente et résultat ;
13. erreurs et résultats partiels ;
14. cas d’épreuve et tests ;
15. optimisation coût/qualité ;
16. sécurité et déploiement ;
17. README, note et preuves ;
18. release candidate.

Un commit doit correspondre à un état cohérent et validé. Il ne doit pas simuler après coup une méthode qui n’a pas existé.

---

## 7. Tableau de contrôle final

### Environnement

- [ ] la source canonique EGX est identifiée ;
- [ ] la copie USB est vérifiée ;
- [ ] les fichiers cachés et historiques Git sont présents ;
- [ ] les configurations globales utiles sont récupérées sans secrets ;
- [ ] le laptop possède les outils nécessaires ;
- [ ] Codex charge réellement la doctrine EGX.

### Mission

- [ ] le brief original est conservé intact ;
- [ ] audit et plan sont présents ;
- [ ] la mission EGX est autonome ;
- [ ] la deadline et le plan de contingence sont documentés ;
- [ ] le périmètre traité et différé est figé.

### Produit

- [ ] une personne peut être recherchée ;
- [ ] une entreprise peut être recherchée ;
- [ ] le contexte influence la résolution ;
- [ ] les ambiguïtés déclenchent un comportement sûr ;
- [ ] l’attente reflète des états réels ;
- [ ] le résultat est exploitable par un commercial.

### Vérité

- [ ] chaque fait a une source ;
- [ ] chaque source prouve réellement le fait ;
- [ ] dates et périmètres sont conservés ;
- [ ] les contradictions sont visibles ;
- [ ] le silence reste silencieux ;
- [ ] le compositeur ne crée aucun fait ;
- [ ] le vérificateur rejette les sorties invalides.

### Coût

- [ ] les appels sont comptés ;
- [ ] les tokens sont mesurés ;
- [ ] les outils de recherche sont inclus ;
- [ ] le coût par fiche est calculé ;
- [ ] simple et ambigu sont distingués ;
- [ ] une optimisation avant/après est démontrée ;
- [ ] aucune économie n’a dégradé un invariant.

### Sécurité et conformité

- [ ] aucune clé dans le dépôt ou l’historique ;
- [ ] aucune clé dans le client ;
- [ ] aucun secret dans les logs ou captures ;
- [ ] collecte conforme ;
- [ ] conservation minimale ;
- [ ] données personnelles limitées au besoin.

### Restitution

- [ ] URL testée sur réseau externe ;
- [ ] dépôt accessible ;
- [ ] README testé depuis un état propre ;
- [ ] note de deux à quatre pages ;
- [ ] captures correspondant à la release ;
- [ ] historique Git cohérent ;
- [ ] démonstration chronométrée ;
- [ ] commit et tag livrés enregistrés ;
- [ ] mail de livraison vérifié.

---

## 8. Verdict opérationnel

Le chemin critique n’est pas :

> interface → gros prompt → beau rapport.

Le chemin critique est :

> environnement fiable → contrat de vérité → boucle verticale → moteur borné → preuves → échecs sûrs → mesure → déploiement → restitution.

Le projet doit avancer par validations successives. Si le temps manque, le périmètre se réduit. Les garanties de vérité, de sécurité, de coût et de reproductibilité restent intactes.
