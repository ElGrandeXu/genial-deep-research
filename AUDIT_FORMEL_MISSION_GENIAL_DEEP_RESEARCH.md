# Audit formel de mission — Génial Deep Research

> Document de référence préparatoire  
> Source principale : fichier **epreuve-deep-research.md** transmis par Antonin Bourdelle le 25 août 2026  
> Source complémentaire : mail **Cas de test - Application Genial** du 25 août 2026  
> Statut : audit de la mission, avant choix définitif de stack et avant implémentation

---

## Mode de lecture

Ce document distingue systématiquement trois niveaux :

- **EXPLICITE** : élément écrit dans le mail ou dans l’énoncé.
- **INFÉRENCE** : attente probable déduite de la formulation, mais non contractuelle.
- **PROPOSITION** : réponse recommandée pour satisfaire l’exigence ou réduire un risque.

Cette distinction est importante : l’objectif est de respecter précisément le contrat de l’épreuve sans transformer nos hypothèses en obligations fictives.

---

## 1. Résumé exécutif

### 1.1 Mission en une phrase

Construire une application web capable de produire, à partir du nom d’une personne ou d’une entreprise et d’un éventuel contexte, un dossier exploitable, lisible, traçable et honnête quant à ses incertitudes.

### 1.2 Problème fondamental

Le sujet n’est pas la génération d’une synthèse fluide. Le sujet est la **fiabilité d’une recherche automatisée lorsque les sources sont ambiguës, contradictoires, périmées, hors sujet ou absentes**.

### 1.3 Produit attendu

L’application doit :

1. accepter une demande concernant une personne ou une entreprise ;
2. rechercher des informations réelles et non préparées à l’avance ;
3. identifier la bonne entité ou reconnaître une ambiguïté ;
4. extraire des faits défendables ;
5. rattacher chaque affirmation factuelle à une source ;
6. détecter ou exposer les contradictions significatives ;
7. dater les informations dont la validité dépend du temps ;
8. refuser de combler les trous par du contenu plausible ;
9. présenter le résultat dans une interface réellement conçue ;
10. être accessible en ligne ;
11. mesurer le coût d’une fiche ;
12. documenter ses choix, ses limites et les cas volontairement écartés.

### 1.4 Définition synthétique de la réussite

La réussite n’est pas de produire le dossier le plus long. Elle consiste à produire **le dossier le plus défendable dans le périmètre choisi**, avec un comportement sûr lorsque le système ne dispose pas de preuves suffisantes.

### 1.5 Nature réelle de l’épreuve

**INFÉRENCE — forte confiance :** il s’agit moins d’un test de programmation pure que d’un test de jugement appliqué :

- compréhension d’un besoin métier ;
- cadrage d’un problème ouvert ;
- choix de périmètre ;
- conception d’une expérience utilisateur ;
- orchestration de modèles et de sources ;
- maîtrise du risque d’hallucination ;
- mesure coût/qualité ;
- capacité à transmettre et défendre une solution.

Le fait que Génial souhaite comparer le résultat à un produit existant implique probablement une évaluation sur des comportements réels et éventuellement sur des requêtes non préparées.

---

## 2. Contrat explicite de l’épreuve

| Dimension | Exigence explicite |
|---|---|
| Durée | Une semaine |
| Technologies | Libres |
| Modèles | Clés fournies |
| Entrée | Nom d’une personne ou d’une entreprise, avec contexte optionnel |
| Sortie | Dossier lisible, exploitable et sourcé |
| Interface | Forme libre, mais attente et résultat réellement conçus |
| Traçabilité | Toute affirmation factuelle doit rester rattachable à sa source jusqu’à l’écran |
| Déploiement | Application accessible par une URL |
| Échelle | Une fiche à la fois suffit |
| Livrables | URL, code, historique Git, README, note d’arbitrage, résultats de cas |
| Soutenance | Discussion d’une heure |
| Coût | Le coût d’une fiche doit être annoncé |

### 2.1 Calendrier connu et ambiguïtés

| Élément | État |
|---|---|
| Réception de l’épreuve | Mardi 25 août 2026 |
| Durée annoncée dans le Markdown | Une semaine |
| Disponibilité annoncée des clés dans le mail | Jusqu’à la fin de la semaine |
| Cible interne volontaire | Restitution dès vendredi 28 août si le niveau de qualité est suffisant |
| Date butoir contractuelle exacte | En attente de confirmation |

**Risque :** la durée d’une semaine et la disponibilité des clés jusqu’à la fin de semaine peuvent désigner deux calendriers différents.

**PROPOSITION :** traiter vendredi comme échéance interne de production, sans présenter cette cible volontaire comme la deadline officielle tant qu’Antonin ne l’a pas confirmée.

---

## 3. Problème métier à résoudre

### 3.1 Utilisateur cible

L’utilisateur explicitement décrit est un commercial qui prépare un premier contact avec :

- une entreprise qu’il connaît mal ;
- une personne qu’il doit qualifier ;
- un temps de préparation limité ;
- un besoin de pouvoir défendre les informations utilisées.

### 3.2 Travail manuel actuel

Le commercial :

- ouvre de nombreux onglets ;
- rapproche des informations issues de sources différentes ;
- rencontre des chiffres incompatibles ;
- risque de confondre des homonymes ;
- perd la provenance des informations ;
- produit finalement une fiche difficile à défendre.

### 3.3 Risque de l’automatisation naïve

Une automatisation superficielle peut produire :

- un texte fluide ;
- une présentation convaincante ;
- des chiffres inventés ou décontextualisés ;
- des citations décoratives ;
- une confiance injustifiée.

Le dommage métier est plus grave qu’une simple erreur : un commercial contredit pendant un rendez-vous peut perdre confiance dans l’outil et ne plus l’utiliser.

### 3.4 Besoin réel

Le besoin n’est donc pas uniquement de gagner du temps. Il faut simultanément :

- réduire le temps de préparation ;
- préserver la provenance ;
- signaler les limites ;
- éviter les confusions d’identité ;
- rendre les contradictions visibles ;
- permettre à l’utilisateur de vérifier rapidement une affirmation.

### 3.5 Job-to-be-done

> Avant un premier échange commercial, obtenir rapidement un dossier suffisamment fiable pour comprendre l’interlocuteur et son entreprise, tout en pouvant vérifier chaque information importante et identifier les zones qui nécessitent une prudence humaine.

---

## 4. Objet exact à construire

### 4.1 Entrée minimale

**EXPLICITE :**

- un nom de personne ou d’entreprise ;
- éventuellement un élément de contexte :
  - ville ;
  - secteur ;
  - employeur ;
  - autre information discriminante.

### 4.2 Ambiguïté de l’entrée

Un nom seul n’identifie pas nécessairement une entité. Il peut désigner :

- plusieurs personnes ;
- plusieurs sociétés ;
- une société et un mot courant ;
- une marque et une entité juridique ;
- une filiale et son groupe ;
- une personne dont le rôle a changé.

**PROPOSITION :** considérer l’entrée comme une hypothèse d’identité à résoudre, jamais comme une identité déjà établie.

### 4.3 Sortie minimale

**EXPLICITE :** un résultat exploitable appuyé sur des sources.

L’énoncé n’impose ni rubriques ni gabarit. Le choix du contenu, de l’ordre et de la forme fait partie du test.

**INFÉRENCE :** la sortie doit aider une décision ou une conversation commerciale. Une biographie encyclopédique ou un collage de résultats de recherche ne répondrait que partiellement au besoin.

### 4.4 Formes autorisées

L’application peut prendre la forme :

- d’un champ de recherche retournant une fiche ;
- d’une conversation avec affinage ;
- d’un tableau de bord ;
- d’une autre expérience argumentée.

La forme retenue doit être défendue dans la note d’arbitrage.

### 4.5 Anti-objectifs

La mission ne demande pas :

- une encyclopédie universelle ;
- une vérité absolue sur toute personne ou entreprise ;
- une couverture exhaustive du Web ;
- un CRM complet ;
- une infrastructure multi-utilisateur ;
- une architecture à grande échelle ;
- un système qui masque les incertitudes pour paraître plus performant.

---

## 5. Les trois exigences non négociables

## 5.1 Traçabilité

### Exigence

Toute affirmation factuelle doit être rattachable à une source, et cette relation doit survivre jusqu’à l’interface.

### Ce que cela exclut

- une simple bibliographie générale en bas de page ;
- une citation qui ne soutient pas réellement la phrase ;
- une URL inventée par le modèle ;
- une source mentionnée pendant la recherche puis perdue pendant la synthèse ;
- un paragraphe contenant plusieurs faits incompatibles avec une citation unique ;
- une affirmation déduite présentée comme un fait directement sourcé.

### Réponse recommandée

Chaque fait important devrait être traité comme une unité atomique contenant au minimum :

- l’affirmation ;
- l’entité concernée ;
- la source ;
- l’extrait ou l’élément probant ;
- la date de la source si disponible ;
- la période visée par l’affirmation ;
- le périmètre visé ;
- le statut de validation ;
- le niveau ou le motif d’incertitude.

### Critère de contrôle

Pour toute phrase factuelle visible à l’écran, un évaluateur doit pouvoir :

1. ouvrir la source ;
2. identifier le passage pertinent ;
3. vérifier que la source parle de la bonne entité ;
4. vérifier que la date et le périmètre sont cohérents ;
5. comprendre si le fait est confirmé, contesté ou incomplet.

---

## 5.2 Interface

### Exigence

Une recherche prend des dizaines de secondes. L’attente et le résultat doivent être un véritable travail de conception.

### Pièges

- spinner indéfini ;
- barre de progression fictive ;
- étapes inventées ne correspondant à aucune opération réelle ;
- silence total pendant une requête longue ;
- perte de l’état en cas d’erreur ;
- affichage brutal d’un gros bloc de texte ;
- résultat beau mais impossible à vérifier.

### Réponse recommandée

L’expérience devrait rendre visibles des états réels, par exemple :

- compréhension de la demande ;
- recherche de candidats ;
- vérification d’identité ;
- collecte des sources ;
- extraction des faits ;
- détection des contradictions ;
- construction du dossier ;
- contrôle final.

Le résultat devrait distinguer visuellement :

- les faits soutenus ;
- les contradictions ;
- les informations datées ;
- les inconnues ;
- les sources ;
- le coût et le périmètre de la recherche.

### Principe

L’interface ne doit pas seulement occuper l’utilisateur pendant l’attente. Elle doit lui expliquer ce que le système fait, où il rencontre une difficulté et pourquoi le résultat final mérite ou non sa confiance.

---

## 5.3 Mise en ligne

### Exigence

L’application doit être déployée et accessible par une URL.

### Implications

- le fonctionnement ne peut pas dépendre de la machine locale du candidat ;
- les secrets ne doivent pas être exposés au navigateur ;
- les appels longs doivent rester compatibles avec l’environnement de déploiement ;
- l’URL doit être testée depuis un environnement extérieur ;
- le README doit permettre à Génial de relancer l’application sans assistance.

### Tolérance explicite

Si le déploiement échoue, le candidat doit expliquer pourquoi.

**INFÉRENCE :** cette tolérance récompense l’honnêteté, mais une application réellement accessible reste nettement préférable.

---

## 6. Libertés accordées et responsabilités associées

### 6.1 Libertés explicites

Le candidat choisit :

- le langage ;
- le framework ;
- l’hébergement ;
- la base de données éventuelle ;
- les fournisseurs de recherche ;
- la stratégie de collecte ;
- la forme de l’application ;
- la structure du résultat ;
- le parti pris d’interface ;
- le périmètre fonctionnel.

### 6.2 Conséquence

Chaque liberté devient un arbitrage à défendre. L’absence de contrainte technique ne signifie pas que tous les choix se valent.

### 6.3 Principe de périmètre

L’énoncé affirme explicitement que trois éléments solides valent mieux que dix éléments esquissés.

**PROPOSITION :** concentrer l’ambition sur la profondeur du raisonnement, la qualité des preuves, la gestion des échecs et l’expérience utilisateur, plutôt que sur l’accumulation de fonctionnalités.

---

## 7. Jeu d’épreuve — audit des six cas

## 7.1 HOMONYME — Deux personnes, un seul nom

### Problème

Les sources peuvent fusionner deux biographies différentes sous un même nom.

### Échec inacceptable

- fusion silencieuse des emplois, villes ou parcours ;
- choix arbitraire d’une personne sans signaler l’ambiguïté ;
- confiance élevée fondée uniquement sur la similarité du nom.

### Comportements défendables

- demander une précision ;
- présenter plusieurs candidats distincts ;
- utiliser le contexte fourni pour privilégier un candidat ;
- suspendre la production du dossier si l’identité n’est pas suffisamment résolue.

### Résolution proposée

Traiter la résolution d’identité comme une étape explicite :

1. rechercher plusieurs candidats ;
2. relever les attributs discriminants ;
3. comparer ces attributs au contexte utilisateur ;
4. calculer ou expliquer le niveau de correspondance ;
5. demander une clarification si le seuil de confiance n’est pas atteint.

### Preuve de réussite

Le système ne mélange aucune information entre deux candidats et rend visible la raison de son choix ou de son refus de choisir.

---

## 7.2 MARQUE — Nom commun, produit, ville ou société

### Problème

Le nom d’une entreprise peut correspondre à un mot très fréquent. Les premiers résultats de recherche peuvent être massivement hors sujet.

### Échec inacceptable

- synthétiser les premiers résultats sans vérifier l’entité ;
- attribuer à la PME des informations relatives à une ville, un produit ou une autre marque ;
- confondre notoriété du mot et pertinence de la source.

### Comportements défendables

- enrichir la requête avec le contexte ;
- rechercher des identifiants discriminants ;
- classer les résultats selon leur proximité avec l’entité visée ;
- demander un secteur, une ville ou un site officiel.

### Résolution proposée

Construire une signature d’entité à partir de plusieurs signaux cohérents :

- raison sociale ;
- localisation ;
- secteur ;
- domaine officiel ;
- dirigeants ;
- identifiant légal lorsqu’il est disponible.

### Preuve de réussite

Le dossier n’intègre que des sources dont le rattachement à l’entreprise demandée peut être expliqué.

---

## 7.3 FILIALE — Entité locale contre groupe consolidé

### Problème

Une demande sur une filiale française peut retourner principalement des informations sur le groupe international.

### Échec inacceptable

- attribuer les revenus du groupe à la filiale ;
- mélanger effectifs mondiaux et effectifs français ;
- utiliser une marque commerciale comme équivalent d’une entité juridique ;
- produire une information fausse mais très plausible.

### Comportements défendables

- distinguer explicitement groupe, marque et entité juridique ;
- qualifier chaque chiffre par son périmètre ;
- présenter l’information du groupe séparément lorsqu’elle apporte du contexte ;
- refuser d’attribuer un chiffre à la filiale sans preuve spécifique.

### Résolution proposée

Chaque fait quantitatif ou organisationnel doit comporter un champ de périmètre :

- groupe ;
- filiale ;
- pays ;
- établissement ;
- périmètre indéterminé.

### Preuve de réussite

Le système ne présente jamais un chiffre consolidé comme un chiffre local sans avertissement explicite.

---

## 7.4 CONFLIT — Deux sources, deux chiffres

### Problème

Deux sources peuvent fournir des valeurs différentes pour une information apparemment identique.

### Faux conflits possibles

Les valeurs peuvent différer parce qu’elles concernent :

- des années différentes ;
- des devises différentes ;
- des périmètres différents ;
- des définitions différentes ;
- des données publiées et estimées ;
- des dates de clôture différentes.

### Échec inacceptable

- ne pas détecter la divergence ;
- choisir silencieusement la valeur la plus récente ou la plus élevée ;
- moyenner des valeurs sans justification ;
- présenter une valeur unique avec une confiance artificielle.

### Comportements défendables

- présenter les deux valeurs ;
- expliquer pourquoi elles ne sont peut-être pas directement comparables ;
- hiérarchiser les sources selon des critères déclarés ;
- sélectionner une valeur tout en conservant la contradiction visible.

### Résolution proposée

Avant de déclarer un conflit :

1. normaliser l’unité ;
2. identifier la période ;
3. identifier le périmètre ;
4. identifier le type de source ;
5. comparer la définition de la métrique ;
6. classer la relation comme confirmation, différence explicable, contradiction ou indétermination.

### Preuve de réussite

La divergence est visible et le système explique son traitement sans masquer la source écartée.

---

## 7.5 SILENCE — Absence de présence fiable

### Problème

Une personne peut ne disposer d’aucune présence publique fiable ou facilement attribuable.

### Échec inacceptable

- combler les trous par des informations plausibles ;
- transformer une hypothèse en biographie ;
- déclarer que la personne n’a aucune présence en ligne ;
- confondre une personne portant le même nom avec la cible.

### Comportement attendu

Produire un résultat incomplet ou vide, mais honnête.

### Formulation sûre

Le système peut affirmer qu’il n’a pas trouvé de source fiable dans le périmètre de sa recherche. Il ne peut pas conclure que l’information n’existe nulle part.

### Résolution proposée

Rendre visibles :

- le périmètre exploré ;
- les requêtes ou catégories de sources couvertes ;
- les informations non vérifiées ;
- les raisons du refus de conclure ;
- les éléments de contexte qui permettraient une nouvelle tentative.

### Preuve de réussite

Le système préfère une fiche vide à une fiche vraisemblable mais non prouvée.

---

## 7.6 PÉREMPTION — Information correcte mais ancienne

### Problème

Une information historiquement correcte peut être fausse si elle est présentée comme actuelle.

### Échec inacceptable

- présenter un ancien dirigeant comme dirigeant actuel ;
- ignorer la date de publication ;
- confondre date de publication et date de validité ;
- privilégier une source très référencée mais ancienne sans avertissement.

### Comportements défendables

- dater l’affirmation ;
- distinguer état actuel, état historique et état inconnu ;
- privilégier une source plus récente lorsque le fait est temporel ;
- présenter la chronologie du changement.

### Résolution proposée

Chaque affirmation sensible au temps doit préciser :

- la date de la source ;
- la période ou la date du fait ;
- le statut actuel, historique ou indéterminé ;
- la présence éventuelle d’une source plus récente contradictoire.

### Preuve de réussite

Le système ne transforme pas automatiquement le fait le mieux référencé en vérité actuelle.

---

## 8. Priorisation recommandée des cas

### 8.1 Principe

Les six cas ne doivent pas nécessairement être couverts. Le refus explicite de couvrir un cas est préférable à une couverture superficielle.

### 8.2 Socle transversal obligatoire

Quel que soit le périmètre retenu :

- aucune affirmation sans source ;
- aucune identité fusionnée silencieusement ;
- aucune absence de preuve transformée en fait ;
- dates et périmètres visibles lorsqu’ils changent le sens d’une information.

### 8.3 Priorité proposée

| Priorité | Cas | Justification |
|---|---|---|
| P0 | Homonyme | Teste la résolution d’identité et l’interaction de clarification |
| P0 | Conflit | Teste la qualité de la preuve et la capacité à ne pas masquer une divergence |
| P0 | Silence | Teste le refus d’halluciner, présenté comme le cas le plus discriminant |
| P1 | Péremption | Peut devenir une propriété transversale de toutes les affirmations temporelles |
| P2 | Filiale | Très important mais demande une normalisation juridique et financière plus profonde |
| P2 | Marque | Peut être partiellement couvert par la logique générale de désambiguïsation |

### 8.4 Décision à ne pas figer trop tôt

La sélection définitive doit être arrêtée après une courte validation de faisabilité. Si un cas P2 peut être traité solidement grâce à une logique déjà nécessaire aux cas P0, il peut remplacer ou compléter un cas prioritaire.

---

## 9. Modèle de vérité et de preuve

### 9.1 Principe source-first

Le système ne doit pas demander au modèle de produire librement une fiche puis de lui ajouter des citations. Il doit construire la fiche à partir d’un ensemble de preuves déjà reliées à des affirmations.

### 9.2 Affirmation atomique

Une affirmation atomique exprime un fait vérifiable unique.

Exemple :

- acceptable : « La société a nommé X directrice générale en mars 2025. »
- fragile : « La société, créée à Bordeaux, emploie 120 personnes et a nommé X directrice générale après une forte croissance. »

La seconde phrase mélange plusieurs faits, temporalités et niveaux d’interprétation.

### 9.3 Métadonnées minimales d’une preuve

- URL ;
- titre ;
- éditeur ou propriétaire ;
- date de publication, si disponible ;
- date de consultation ;
- extrait probant ;
- entité visée ;
- période visée ;
- périmètre organisationnel ;
- nature de la source ;
- relation avec l’affirmation.

### 9.4 Relations possibles

Une source peut :

- soutenir l’affirmation ;
- contredire l’affirmation ;
- apporter un contexte ;
- être trop ambiguë ;
- être hors périmètre ;
- être périmée pour l’usage envisagé.

### 9.5 Faits, inférences et recommandations

Le résultat doit distinguer :

- **faits sourcés** ;
- **inférences** construites à partir de plusieurs faits ;
- **questions ouvertes** ;
- **recommandations conversationnelles** éventuelles.

Une inférence peut être utile, mais elle ne doit jamais être maquillée en fait directement présent dans une source.

### 9.6 Hiérarchie des sources

La hiérarchie ne peut pas être totalement universelle. Elle doit dépendre du type d’affirmation.

Exemples de principes défendables :

- une source légale ou institutionnelle peut être privilégiée pour une identité juridique ;
- une publication officielle de l’entreprise peut être privilégiée pour une nomination, avec prudence sur les affirmations promotionnelles ;
- une source journalistique indépendante peut être utile pour contextualiser ;
- un agrégateur peut orienter la recherche sans constituer la preuve finale ;
- un extrait de moteur de recherche ne doit pas être confondu avec le contenu complet de la source.

### 9.7 Contrôle final

Avant affichage, chaque affirmation factuelle doit passer un contrôle :

- preuve présente ;
- source accessible ou au minimum identifiable ;
- identité cohérente ;
- date cohérente ;
- périmètre cohérent ;
- absence de contradiction non signalée ;
- formulation limitée à ce que la preuve permet réellement d’affirmer.

---

## 10. APIs et ressources modèles fournies

### 10.1 Faits connus

**EXPLICITE :**

- une clé Gemini est fournie ;
- une clé OpenAI plafonnée est fournie ;
- les clés sont prévues pour la durée de l’exercice ;
- le mail indique une disponibilité jusqu’à la fin de semaine ;
- d’autres fournisseurs sont autorisés aux frais du candidat ;
- le coût d’une fiche doit être annoncé.

Le lien contenant les secrets n’est volontairement pas reproduit dans ce document.

### 10.2 Ce qui n’est pas imposé

L’énoncé ne dit pas :

- que les deux fournisseurs doivent être utilisés ;
- qu’ils doivent être comparés ;
- quel modèle précis doit être choisi ;
- qu’un fournisseur doit servir à la recherche et l’autre à la synthèse ;
- que la recherche web intégrée à un modèle doit être utilisée ;
- qu’une base de données est obligatoire ;
- qu’un framework agentique est attendu.

### 10.3 Inconnues à vérifier

- modèles accessibles par chaque clé ;
- plafond budgétaire exact ;
- quotas et limites de débit ;
- disponibilité d’outils de recherche web ;
- durée réelle d’activation des clés ;
- validité des clés après le déploiement ;
- capacité de Génial à tester l’URL après l’expiration ;
- séparation éventuelle des consommations par clé ou par projet.

### 10.4 Gouvernance des clés

**PROPOSITION :**

- conserver les clés exclusivement côté serveur ;
- ne jamais les inclure dans le dépôt Git ;
- ne jamais les exposer au navigateur ;
- éviter leur présence dans les logs, captures ou documents ;
- documenter uniquement les noms de variables attendues ;
- limiter leur usage au fonctionnement et aux évaluations du produit.

### 10.5 Mesure de l’usage

L’application ou le protocole d’évaluation doit pouvoir relever, pour chaque dossier :

- fournisseur ;
- modèle ;
- nombre d’appels ;
- tokens d’entrée ;
- tokens de sortie ;
- tokens mis en cache, de raisonnement ou d’outils lorsqu’ils sont exposés ;
- appels de recherche facturables ;
- latence ;
- coût estimé ;
- motif fonctionnel de chaque étape coûteuse.

La documentation officielle OpenAI expose des mesures d’usage et de coûts par catégories, notamment les requêtes modèles et les appels de recherche. La documentation Gemini décrit le comptage avant appel et les métadonnées d’usage retournées après interaction. Les valeurs tarifaires ne doivent pas être figées avant de connaître les modèles réellement disponibles.

Références :

- [OpenAI — Usage API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage)
- [OpenAI — Pricing](https://platform.openai.com/pricing)
- [Gemini API — Understand and count tokens](https://ai.google.dev/gemini-api/docs/tokens)

### 10.6 Définition du coût d’une fiche

Le coût annoncé doit préciser son périmètre :

- coût variable des modèles ;
- coût des outils ou recherches ;
- coût éventuel du fournisseur de collecte ;
- hypothèses tarifaires ;
- modèle et date du tarif ;
- inclusion ou exclusion de l’hébergement.

Une moyenne seule est insuffisante. Il est préférable de fournir :

- coût du cas simple ;
- coût du cas ambigu ;
- coût du cas nécessitant une résolution supplémentaire ;
- moyenne et maximum observés sur les cas traités.

### 10.7 Principe d’efficacité

L’objectif n’est pas de minimiser le nombre brut de tokens au détriment de la vérité. La bonne mesure est le **coût nécessaire pour obtenir un dossier défendable**.

Réponses possibles :

- utiliser du code déterministe pour les opérations ne nécessitant pas de raisonnement ;
- réduire les répétitions de contexte ;
- transmettre des extraits probants plutôt que des pages complètes ;
- borner les cycles de recherche ;
- arrêter lorsque les preuves sont suffisantes ;
- réserver les appels les plus coûteux aux ambiguïtés réelles ;
- réutiliser légalement des résultats déjà collectés sans préparer des sorties figées.

---

## 11. Démarche fonctionnelle proposée

Cette section décrit comment traiter le problème sans imposer encore une stack.

### Étape 1 — Comprendre la demande

- identifier si la cible semble être une personne ou une entreprise ;
- extraire les éléments de contexte ;
- détecter un manque de précision critique ;
- définir le type de dossier attendu.

### Étape 2 — Résoudre l’entité

- rechercher plusieurs candidats ;
- relever les signaux d’identité ;
- comparer les candidats au contexte ;
- demander une clarification ou présenter plusieurs options si nécessaire.

### Étape 3 — Définir le plan de recherche

- déterminer les catégories d’informations utiles ;
- choisir les sources ou requêtes pertinentes ;
- définir un budget maximal ;
- préciser les critères d’arrêt.

### Étape 4 — Collecter légalement les sources

- utiliser des fournisseurs et méthodes compatibles avec leurs conditions ;
- conserver la provenance dès la collecte ;
- dédupliquer ;
- écarter les résultats manifestement hors sujet ;
- ne pas confondre extrait de recherche et source complète.

### Étape 5 — Extraire les preuves

- découper les informations en affirmations atomiques ;
- conserver l’extrait probant ;
- identifier date, périmètre et entité ;
- distinguer fait et interprétation.

### Étape 6 — Réconcilier

- regrouper les affirmations portant sur le même sujet ;
- rechercher les différences de période, unité et périmètre ;
- détecter confirmations et contradictions ;
- attribuer un statut explicable.

### Étape 7 — Composer le dossier

- produire uniquement à partir des preuves validées ;
- conserver les identifiants de sources ;
- exposer les contradictions ;
- dater les faits sensibles ;
- maintenir les inconnues.

### Étape 8 — Vérifier

- contrôler chaque affirmation ;
- rechercher les citations sans support réel ;
- vérifier l’identité ;
- vérifier les dates ;
- vérifier les périmètres ;
- vérifier que le système n’a pas ajouté de contenu plausible.

### Étape 9 — Présenter

- afficher un résumé utile ;
- rendre les preuves accessibles ;
- séparer alertes, conflits et inconnues ;
- indiquer le périmètre de la recherche ;
- présenter coût et durée.

### Étape 10 — Évaluer et conserver les preuves de test

- exécuter des cas réels non figés ;
- capturer le résultat ;
- noter les limites ;
- enregistrer les métriques ;
- comparer le comportement attendu au comportement observé.

---

## 12. Conception attendue du résultat

L’énoncé laisse la structure libre. Une structure défendable pourrait néanmoins comprendre :

1. **Identité résolue**
   - personne ou entreprise ;
   - contexte utilisé ;
   - éventuelles autres correspondances.

2. **Résumé opérationnel**
   - informations les plus utiles au commercial ;
   - formulation limitée aux faits établis.

3. **Faits clés**
   - affirmation ;
   - date ;
   - périmètre ;
   - citation directe vers la preuve.

4. **Signaux récents**
   - événements datés ;
   - sources actuelles.

5. **Contradictions**
   - versions en présence ;
   - explication du conflit ou de l’indétermination.

6. **Inconnues et limites**
   - ce qui n’a pas été trouvé ;
   - ce qui n’a pas pu être vérifié ;
   - contexte complémentaire utile.

7. **Sources**
   - liste consolidée ;
   - type et date ;
   - rattachement aux affirmations.

8. **Reçu d’exécution**
   - durée ;
   - appels ;
   - tokens ;
   - coût ;
   - périmètre exploré.

Cette structure reste une proposition. Elle doit être jugée selon son utilité réelle, pas adoptée mécaniquement.

---

## 13. Hors périmètre explicite

### 13.1 Comptes et multi-utilisateur

Ne sont pas demandés :

- création de compte ;
- authentification ;
- gestion des rôles ;
- espace personnel ;
- partage entre utilisateurs.

### 13.2 Grande échelle

Une fiche à la fois suffit. Ne sont pas nécessaires :

- traitement massif ;
- files de milliers de tâches ;
- optimisation pour un trafic élevé ;
- architecture distribuée complexe.

### 13.3 Couverture de tests exhaustive

Une couverture exhaustive n’est pas attendue. Les tests doivent protéger les zones fragiles.

Zones naturellement fragiles :

- conservation du lien affirmation-source ;
- absence de faits non sourcés ;
- mélange d’entités ;
- conflits ;
- dates et périmètres ;
- calcul d’usage et de coût ;
- comportement en cas de réponse vide ou invalide.

### 13.4 Ce que le hors périmètre n’autorise pas

L’absence d’exigence de grande échelle ou d’authentification ne dispense pas :

- de protéger les clés ;
- de gérer les erreurs ;
- de rendre le projet reproductible ;
- de respecter la vie privée ;
- de contrôler les sorties modèles.

---

## 14. Interdictions explicites

## 14.1 Donnée sans source

Toute donnée factuelle non rattachable est interdite.

**Conséquence :** une affirmation apparemment évidente doit être retirée si sa preuve n’est pas conservée.

## 14.2 Résultats figés

Un jeu de résultats préparé à l’avance pour la démonstration est interdit.

Sont donc à éviter :

- réponses codées en dur ;
- faux appels ;
- données préremplies pour les cas présentés ;
- cache servant à masquer l’absence de pipeline réel.

Un cache dynamique et reproductible peut être légitime s’il ne transforme pas l’application en démonstrateur truqué.

## 14.3 Contournement des conditions d’utilisation

La collecte ne doit pas contourner volontairement les règles d’un service.

**Conséquence :** une source techniquement accessible n’est pas automatiquement une source légalement collectable.

## 14.4 Conservation excessive de données personnelles

Les données personnelles ne doivent pas être conservées au-delà du besoin de l’exercice.

**PROPOSITION :**

- privilégier l’absence de persistance ;
- limiter le dossier aux informations professionnelles publiques nécessaires ;
- éviter les données sensibles ou privées ;
- documenter clairement la durée de conservation éventuelle ;
- ne pas journaliser les contenus personnels inutilement.

---

## 15. Livrables obligatoires

## 15.1 Application déployée

À fournir :

- URL accessible ;
- application fonctionnelle ;
- comportement réel sur une recherche non préparée.

## 15.2 README autonome

Le README doit suffire pour relancer le projet sans l’auteur.

Il devra couvrir au minimum :

- finalité ;
- prérequis ;
- variables nécessaires sans révéler leur valeur ;
- démarrage ;
- commandes de validation ;
- limites connues ;
- périmètre couvert ;
- méthode de calcul du coût.

## 15.3 Dépôt Git et historique

Le dépôt doit contenir l’historique, car les commits intermédiaires intéressent explicitement Génial.

**INFÉRENCE :** ils évaluent la méthode de construction, la capacité à raisonner par étapes et la qualité des décisions, pas uniquement le résultat final.

### Pièges

- un seul commit massif ;
- commits artificiellement reconstruits à la fin ;
- secrets ou fichiers générés versionnés ;
- historique incohérent avec la note d’arbitrage ;
- dépôt rempli de caches ou dépendances.

## 15.4 Note d’arbitrage de deux à quatre pages

La note doit expliquer :

- décisions principales ;
- alternatives considérées ;
- éléments laissés de côté ;
- cas où le système se casse ;
- limites connues ;
- travail qui serait réalisé avec un mois supplémentaire.

Cette note pèse autant que le code.

**Conséquence :** elle doit être alimentée pendant le projet, pas rédigée à la hâte après l’implémentation.

## 15.5 Résultats sur les cas traités

À fournir sous une forme libre :

- captures ;
- dossiers générés ;
- métriques ;
- résultat attendu ;
- comportement observé ;
- limitations.

Un cas explicitement écarté ne pénalise pas.

## 15.6 Discussion d’une heure

La restitution orale doit permettre de :

- démontrer l’application ;
- expliquer les choix ;
- montrer les preuves ;
- discuter les limites ;
- répondre à des requêtes ou objections ;
- expliquer la reprise du projet par l’équipe.

---

## 16. Attentes implicites probables

Cette section est une inférence, pas une grille officielle.

### 16.1 Résistance à une requête inconnue

La comparaison avec un produit existant rend probable l’utilisation d’au moins une personne ou entreprise non utilisée dans les captures.

### 16.2 Honnêteté épistémique

Ils chercheront probablement à savoir si le système :

- reconnaît qu’il ne sait pas ;
- distingue absence de preuve et preuve d’absence ;
- conserve une contradiction ;
- refuse une fusion d’identité.

### 16.3 Jugement de produit

Ils évalueront :

- le contenu choisi ;
- l’ordre de lecture ;
- la valeur pour le commercial ;
- la qualité de l’attente ;
- la facilité de vérification.

### 16.4 Transmissibilité

Le README, l’historique Git et la discussion suggèrent qu’un bon prototype doit pouvoir être repris par Antonin ou une équipe d’ingénierie.

### 16.5 Efficacité

La clé plafonnée et l’exigence de coût indiquent que la consommation n’est pas un détail.

### 16.6 Qualité des questions

L’énoncé dit explicitement que poser une bonne question sur une ambiguïté fait partie de l’exercice.

---

## 17. Registre des risques

| Risque | Gravité | Signal | Réponse recommandée |
|---|---:|---|---|
| Mélange de deux entités | Critique | Attributs incompatibles | Bloquer, séparer ou demander une précision |
| Fait sans preuve | Critique | Citation absente ou non probante | Supprimer le fait |
| Citation inventée | Critique | URL inexistante ou titre incohérent | Vérifier et conserver la provenance dès la collecte |
| Groupe confondu avec filiale | Critique | Chiffre sans périmètre | Qualifier chaque donnée par entité et périmètre |
| Information périmée présentée comme actuelle | Élevée | Source ancienne pour un rôle actuel | Dater et rechercher une confirmation récente |
| Conflit masqué | Élevée | Valeurs concurrentes | Exposer les versions et leur contexte |
| Silence comblé par du plausible | Critique | Biographie sans preuves suffisantes | Échouer explicitement |
| Optimisation excessive des tokens | Élevée | Baisse de couverture ou de fiabilité | Optimiser le coût par dossier défendable |
| Consommation incontrôlée | Élevée | Boucles ou appels répétés | Budgets, limites et critères d’arrêt |
| Expiration des clés | Élevée | App déployée inutilisable | Clarifier la durée et tester avant échéance |
| Clé exposée | Critique | Secret dans le client, dépôt ou log | Usage serveur et variables protégées |
| Déploiement incompatible avec les appels longs | Élevée | Timeouts | Concevoir les états longs et vérifier tôt |
| Barre de progression fictive | Moyenne | Étapes décoratives | Relier l’interface aux étapes réelles |
| Résultats perçus comme préparés | Élevée | Démo parfaite mais non généralisable | Montrer une requête dynamique et des traces d’exécution |
| Collecte non conforme | Critique | Scraping interdit ou contournement | Fournisseurs et méthodes conformes |
| Conservation excessive de données | Élevée | Historique ou logs personnels | Minimiser ou désactiver la persistance |
| Sur-périmètre | Élevée | Six cas partiels, nombreuses fonctions | Figer trois cas solides |
| Note rédigée trop tard | Élevée | Décisions oubliées | Journaliser les arbitrages au fil de l’eau |
| Historique Git artificiel | Élevée | Commit unique ou incohérent | Commits atomiques dès le début |
| README insuffisant | Élevée | Dépendance à l’auteur | Test de reprise autonome |

---

## 18. Questions ouvertes

### 18.1 Questions déjà soulevées

- Quelle est la date et l’heure exactes de restitution ?
- Les clés resteront-elles actives jusqu’à cette date ?
- L’application devra-t-elle rester testable après la fin de semaine ?

### 18.2 Questions potentiellement utiles

- Les six cas décrivent-ils uniquement des catégories, ou Génial fournira-t-il des entités précises ?
- Le candidat choisit-il librement ses exemples de test ?
- Le dépôt doit-il être public ou peut-il être privé avec accès accordé ?
- Les deux clés doivent-elles être utilisées ou sont-elles proposées comme alternatives ?
- Le coût demandé couvre-t-il seulement l’exécution variable ou également l’hébergement ?

### 18.3 Règle de communication

Ne poser que les questions qui modifient réellement le périmètre, le calendrier ou la validité de la restitution. Les choix de conception laissés volontairement libres doivent être arbitrés et défendus, pas renvoyés systématiquement à Antonin.

---

## 19. Critères de réussite

### 19.1 Réussite forte

- application accessible ;
- recherche réellement dynamique ;
- identité résolue ou ambiguïté affichée ;
- aucune affirmation factuelle sans preuve ;
- citations vérifiables ;
- contradictions visibles ;
- absence de preuve assumée ;
- dates et périmètres cohérents ;
- attente bien conçue ;
- coût mesuré ;
- clés protégées ;
- dépôt propre avec historique ;
- README autonome ;
- note d’arbitrage claire ;
- cas écartés explicitement ;
- limites défendues pendant la discussion.

### 19.2 Réussite acceptable mais limitée

- périmètre réduit ;
- trois cas réellement solides ;
- quelques limites documentées ;
- application stable ;
- aucune fausse confiance.

### 19.3 Échec

- fiche fluide mais invérifiable ;
- citations décoratives ;
- entités mélangées ;
- contradictions masquées ;
- données inventées ;
- résultats préparés ;
- clés exposées ;
- application non reproductible sans explication ;
- absence de mesure de coût ;
- prétention à couvrir des cas en réalité non traités.

---

## 20. Définition de fini

La mission est terminée lorsque :

### Produit

- [ ] une personne peut être recherchée ;
- [ ] une entreprise peut être recherchée ;
- [ ] le contexte optionnel modifie réellement la résolution ;
- [ ] le résultat est lisible et exploitable ;
- [ ] l’attente correspond à des états réels ;
- [ ] les erreurs et résultats partiels sont compréhensibles.

### Vérité et sources

- [ ] chaque affirmation factuelle possède une source ;
- [ ] chaque source soutient réellement l’affirmation ;
- [ ] dates et périmètres sont visibles lorsque nécessaires ;
- [ ] les contradictions ne sont pas perdues ;
- [ ] le silence ne produit pas de contenu plausible ;
- [ ] une ambiguïté d’identité n’est pas résolue silencieusement.

### Coût et APIs

- [ ] les secrets restent côté serveur ;
- [ ] le nombre d’appels est mesuré ;
- [ ] les tokens sont mesurés ou estimés de façon explicable ;
- [ ] le coût d’une fiche est calculé avec hypothèses ;
- [ ] les cas simples et difficiles peuvent être distingués ;
- [ ] aucun appel non nécessaire n’est laissé sans justification.

### Déploiement et reprise

- [ ] l’URL fonctionne depuis un autre appareil ;
- [ ] l’application ne dépend pas d’une machine locale ;
- [ ] le README suffit à relancer le projet ;
- [ ] les variables requises sont documentées ;
- [ ] l’historique Git raconte la construction ;
- [ ] aucun secret ni artefact inutile n’est versionné.

### Restitution

- [ ] la note d’arbitrage tient entre deux et quatre pages ;
- [ ] les cas traités sont documentés ;
- [ ] les cas écartés sont assumés ;
- [ ] les captures correspondent à des recherches réelles ;
- [ ] les limites sont listées ;
- [ ] la démonstration d’une heure est préparée ;
- [ ] les réponses aux objections principales sont prêtes.

---

## 21. Démarche de réalisation recommandée

Cette démarche reste volontairement indépendante d’une technologie.

### Phase A — Figer le contrat

- confirmer le calendrier ;
- confirmer la disponibilité des clés ;
- lister les inconnues ;
- séparer exigences, inférences et propositions.

### Phase B — Figer le contrat de vérité

- définir ce qu’est une affirmation ;
- définir ce qu’est une preuve ;
- définir les statuts de confiance ;
- définir comment une contradiction et une absence de preuve sont affichées.

### Phase C — Choisir les combats

- sélectionner trois cas principaux ;
- définir un résultat attendu pour chacun ;
- déclarer les cas différés ;
- fixer les critères d’arrêt.

### Phase D — Obtenir une boucle complète

- saisir une demande ;
- résoudre l’entité ;
- collecter une source réelle ;
- extraire un fait ;
- conserver la citation ;
- afficher le fait et la source ;
- mesurer l’appel.

### Phase E — Durcir les échecs

- tester l’homonymie ;
- tester le conflit ;
- tester le silence ;
- tester au moins une information périmée ;
- vérifier les comportements de refus.

### Phase F — Concevoir l’expérience

- rendre les étapes réelles visibles ;
- organiser le dossier selon le besoin commercial ;
- faciliter la vérification ;
- montrer les limites sans noyer l’utilisateur.

### Phase G — Mesurer

- exécuter les cas ;
- collecter tokens, appels, coût et latence ;
- identifier les dépenses sans valeur ;
- vérifier qu’une optimisation ne réduit pas la fiabilité.

### Phase H — Restituer

- déployer ;
- tester l’URL extérieure ;
- finaliser le README ;
- finaliser la note ;
- produire les captures ;
- répéter la démonstration et les objections.

---

## 22. Questions probables pendant la soutenance

- Comment savez-vous que toutes les sources parlent de la même personne ?
- Où cette source prouve-t-elle précisément cette phrase ?
- Que faites-vous lorsque deux sources fiables sont en désaccord ?
- Comment distinguez-vous une filiale de son groupe ?
- Pourquoi avoir choisi ces cas et écarté les autres ?
- Que se passe-t-il avec un nom jamais testé auparavant ?
- Comment évitez-vous d’affirmer qu’une information n’existe pas ?
- Comment gérez-vous une source ancienne ?
- Comment hiérarchisez-vous les sources ?
- Quel appel modèle coûte le plus et pourquoi est-il nécessaire ?
- Combien coûte une fiche simple et une fiche ambiguë ?
- Qu’avez-vous fait pour réduire les tokens ?
- Quelle optimisation avez-vous refusée parce qu’elle dégradait la qualité ?
- Où le système peut-il encore produire une erreur ?
- Quelles données sont conservées et pendant combien de temps ?
- Comment relancer le projet sans vous ?
- Que construiriez-vous avec un mois supplémentaire ?
- Quelle partie devrait être industrialisée différemment ?

---

## 23. Positionnement final du rendu

Le rendu ne doit pas être présenté comme un moteur connaissant la vérité sur toute personne ou entreprise.

Il doit être présenté comme :

> un outil de préparation commerciale qui collecte, structure et expose des preuves publiques, réduit le travail manuel, signale les contradictions et refuse de transformer l’incertitude en certitude.

### Promesse

- gagner du temps ;
- conserver la provenance ;
- rendre la vérification rapide ;
- améliorer la préparation ;
- réduire le risque d’une affirmation indéfendable.

### Non-promesse

- exhaustivité ;
- vérité absolue ;
- absence totale d’erreur ;
- remplacement du jugement humain ;
- couverture universelle des six difficultés.

### Principe directeur

> Une fiche partielle mais défendable vaut mieux qu’une fiche complète et fausse.

---

## 24. Matrice de traçabilité avec l’énoncé

| Élément source | Couverture dans cet audit |
|---|---|
| Nom vers dossier lisible et sourcé | Sections 1, 4, 12 |
| Sujet ouvert et difficultés centrales | Sections 1, 6, 16 |
| Durée d’une semaine | Section 2 |
| Technologies libres | Sections 2 et 6 |
| Modèles et clés fournis | Sections 2 et 10 |
| Problème du commercial | Section 3 |
| Risque de l’automatisation naïve | Sections 3 et 9 |
| Personne ou entreprise avec contexte | Section 4 |
| Forme et contenu libres | Sections 4, 6 et 12 |
| Traçabilité | Sections 5.1 et 9 |
| Interface et attente | Sections 5.2 et 12 |
| Application en ligne | Section 5.3 |
| Périmètre limité et assumé | Sections 6 et 8 |
| Homonyme | Section 7.1 |
| Marque | Section 7.2 |
| Filiale | Section 7.3 |
| Conflit | Section 7.4 |
| Silence | Section 7.5 |
| Péremption | Section 7.6 |
| Coût d’une fiche | Section 10 |
| Autres fournisseurs autorisés | Section 10 |
| Comptes et multi-utilisateur hors périmètre | Section 13 |
| Grande échelle hors périmètre | Section 13 |
| Tests ciblés | Sections 13 et 20 |
| Interdiction des données sans source | Section 14.1 |
| Interdiction des résultats figés | Section 14.2 |
| Respect des conditions d’utilisation | Section 14.3 |
| Limitation de conservation des données | Section 14.4 |
| URL et README | Sections 15.1, 15.2 et 20 |
| Code et historique Git | Section 15.3 |
| Note de deux à quatre pages | Section 15.4 |
| Résultats et captures | Section 15.5 |
| Discussion d’une heure | Sections 15.6 et 22 |
| Questions bienvenues | Section 18 |

---

## 25. Verdict d’audit

### Faisabilité

La mission est faisable dans le délai annoncé si le périmètre est explicitement limité et si la traçabilité est conçue comme le noyau du produit.

### Difficulté réelle

La difficulté n’est pas l’appel à un modèle ni la génération d’une interface. Elle réside dans :

1. la résolution d’identité ;
2. la conservation du lien exact entre fait et preuve ;
3. la compréhension des dates et périmètres ;
4. la détection des contradictions ;
5. le refus d’inventer lorsque les sources sont insuffisantes ;
6. l’arbitrage coût/fiabilité ;
7. la discipline de périmètre ;
8. la capacité à expliquer et transmettre les décisions.

### Stratégie recommandée

- traiter peu de cas mais les traiter jusqu’au bout ;
- construire source-first ;
- mesurer dès le premier appel ;
- faire de l’incertitude un élément visible de l’interface ;
- alimenter la note d’arbitrage pendant la réalisation ;
- tester sur des entrées non préparées ;
- présenter honnêtement ce qui reste fragile.

### Finalité

Le produit final doit prouver non seulement qu’une application a été construite, mais qu’un problème métier ambigu a été transformé en système démontrable, mesurable, responsable et transmissible.
