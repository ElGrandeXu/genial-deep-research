# Contrat produit et contrat de vérité — M2

Version : `1.0.0`
Statut : **DÉCISION — FIGÉ POUR LA RELEASE INITIALE**
Portée : contrat indépendant de toute stack ; M2 ne construit aucune application.

## 1. Autorité et vocabulaire

| Rang | Statut | Source | Usage dans ce contrat |
|---:|---|---|---|
| 1 | **EXIGENCE EXPLICITE** | `epreuve-deep-research.md` | Contrat original immuable. |
| 2 | **FAIT VALIDÉ** | Faits du mail rapportés dans l’audit formel | Calendrier et clés, sans extrapolation. |
| 3 | **EXIGENCE EXPLICITE** | `AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md` | Analyse normative subordonnée au brief. |
| 4 | **PROPOSITION** | `PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md` | Méthode adaptable. |
| 5 | **FAIT VALIDÉ** | Preuves M0 et M1 | Constats matériels datés. |
| 6 | **DÉCISION** | Présent contrat, `DECISIONS.md` | Arbitrages M2 révisables uniquement explicitement. |

Les termes ont toujours le sens suivant :

- **EXIGENCE EXPLICITE** : obligation provenant d’une source d’autorité ;
- **INFÉRENCE** : conclusion utile mais non contractuelle, déduite des sources ;
- **PROPOSITION** : option recommandée, non encore engagée ;
- **DÉCISION** : arbitrage produit adopté pour la release initiale ;
- **FAIT VALIDÉ** : observation prouvée, datée et limitée à son protocole.

**FAIT VALIDÉ — 2026-08-26** — M1 a observé chez OpenAI et Gemini l’authentification, les sorties structurées, la recherche avec métadonnées, les citations, les URL, l’usage, le coût et la latence. Ces observations prouvent seulement des capacités API à cette date. Elles ne choisissent ni fournisseur, ni modèle, ni architecture.

## 2. Promesse, utilisateur et travail à accomplir

**EXIGENCE EXPLICITE** — Le produit final devra transformer le nom d’une personne ou d’une entreprise, avec contexte optionnel, en dossier lisible, exploitable et sourcé. Toute affirmation factuelle devra rester rattachable à sa source jusqu’à l’écran.

**DÉCISION** — L’utilisateur principal est un commercial préparant un premier contact, avec peu de temps et le besoin de comprendre puis de défendre chaque fait utilisé.

**DÉCISION** — Travail à accomplir : obtenir rapidement un dossier de préparation qui réduit la recherche manuelle, rend chaque fait vérifiable, expose contradictions et limites, et signale les points exigeant un jugement humain.

**DÉCISION** — Le dossier prépare une conversation. Il ne remplace ni le jugement du commercial, ni une vérification juridique, financière ou de conformité. Il ne promet ni exhaustivité du Web, ni vérité absolue, ni biographie encyclopédique.

## 3. Périmètre revendiqué

### 3.1 Cas principaux

| Cas | Statut | Comportement revendiqué | Critère observable |
|---|---|---|---|
| HOMONYME | **DÉCISION — REVENDIQUÉ** | Résolution explicite ; candidats distincts ou clarification ; aucune fusion silencieuse. | Aucun fait d’un candidat ne peut être attribué à un autre ; le choix ou le refus est expliqué. |
| CONFLIT | **DÉCISION — REVENDIQUÉ** | Plusieurs versions conservées ; période, unité et portée normalisées avant classement ; contradiction réelle visible. | Deux versions et leurs preuves concurrentes restent accessibles ; aucune valeur n’est perdue. |
| SILENCE | **DÉCISION — REVENDIQUÉ** | Aucun contenu plausible ajouté ; résultat vide ou partiel assumé ; formulation bornée au périmètre exploré. | Aucune affirmation affichable ; périmètre, arrêt et possibilité de nouvelle tentative sont conservés. |
| PÉREMPTION | **DÉCISION — TRANSVERSAL** | Date de source et date/période du fait ; état actuel, historique ou indéterminé ; ancienneté visible. | Une source ancienne ne devient jamais, seule, un état présent. |

### 3.2 Cas différés et garde-fous

| Cas | Statut | Limite déclarée |
|---|---|---|
| MARQUE | **DÉCISION — NON REVENDIQUÉ POUR LA RELEASE INITIALE** | La résolution générique interdit d’attribuer un fait à une entité mal résolue, mais ne constitue pas une couverture complète des noms communs, produits ou villes. |
| FILIALE | **DÉCISION — NON REVENDIQUÉ POUR LA RELEASE INITIALE** | Le périmètre générique interdit la confusion silencieuse groupe/filiale et les chiffres sans portée, mais ne constitue pas une résolution juridique et financière complète des filiales. |

**DÉCISION** — Quel que soit le cas, il est interdit d’attribuer un fait à une entité mal résolue, de confondre silencieusement groupe et filiale, ou d’utiliser un fait quantitatif sans période et périmètre utilisables. Si ces éléments manquent, ils restent `unknown` ou `undetermined` ; ils ne sont pas complétés par plausibilité.

## 4. Contrat d’entrée

**DÉCISION** — La demande contient :

- `name` obligatoire : texte Unicode non vide après suppression des espaces périphériques, de 1 à 200 caractères ;
- `suggested_type` obligatoire : `person`, `company` ou `unknown` ; il oriente la résolution sans la prouver ;
- contexte professionnel optionnel : `city`, `country`, `industry`, `employer`, `official_site`, `discriminating_hint` ;
- chaque champ de contexte textuel : 1 à 200 caractères, sauf `discriminating_hint` limité à 500 caractères ;
- `official_site` : URL HTTP(S) de 2 048 caractères au plus ;
- demande complète : 2 000 caractères au plus, hors identifiants et horodatages techniques.

**DÉCISION** — Le contexte doit rester professionnel, public, pertinent et discriminant. Sont refusés : données sensibles, données privées, secrets, contenu binaire, fichiers, instructions d’exécution et données sans lien avec la résolution.

**DÉCISION** — Un nom seul est une hypothèse d’identité, jamais une identité résolue.

## 5. Résolution d’identité

### 5.1 États

| État | Conditions d’entrée | Informations autorisées | Comportement utilisateur | Interdictions | Passage au dossier factuel final |
|---|---|---|---|---|---|
| `resolved` | Un seul candidat est soutenu par des attributs discriminants cohérents avec la demande ; aucun conflit d’identité bloquant ne subsiste. | Identité retenue, contexte utilisé, justification, candidats écartés et preuves associées. | Afficher clairement l’identité et la raison du choix ; permettre de revoir le contexte. | Choix sur le seul nom ; fusion ; dissimulation d’un candidat plausible. | Autorisé si tous les autres invariants de vérité passent. |
| `ambiguous` | Au moins deux candidats restent plausibles et les preuves/contexte ne permettent pas de choisir honnêtement. | Candidats séparés, attributs discriminants, preuves de rattachement, clarification utile. | Présenter les candidats ou demander une précision. | Fiche certaine ; classement arbitraire présenté comme résolution ; faits fusionnés. | Interdit jusqu’à une nouvelle demande donnant `resolved`. |
| `insufficient_context` | L’entrée est valide mais trop pauvre pour lancer ou conclure une résolution bornée sans risque de confusion. | Contexte manquant, raisons, exemples de précisions acceptables. | Demander uniquement les discriminants utiles. | Inventer un type ou une identité ; transformer la clarification en erreur technique. | Interdit jusqu’à une nouvelle demande donnant `resolved`. |
| `not_found_within_scope` | La recherche bornée n’a identifié aucun candidat suffisamment fiable dans les catégories et limites explorées. | Périmètre exploré, catégories consultées, raison d’arrêt, contexte utile à une reprise. | Produire un silence honnête et permettre une nouvelle tentative contextualisée. | Affirmer que l’entité ou l’information n’existe pas ; proposer automatiquement un homonyme. | Interdit ; aucun dossier présenté comme certain. |

**DÉCISION** — Tout état autre que `resolved` interdit une fiche présentée comme certaine. Le système peut rendre un résultat d’ambiguïté, de clarification ou de silence, explicitement typé, mais pas un dossier factuel final.

## 6. Architecture d’information du dossier

**DÉCISION** — L’ordre canonique et son utilité métier sont :

1. **Identité retenue ou ambiguïté** — éviter que le commercial prépare le mauvais interlocuteur ; exposer le contexte et la justification.
2. **Résumé opérationnel** — donner une lecture rapide ; il ne référence que des affirmations ou inférences déjà enregistrées, sans nouveau fait libre.
3. **Faits clés** — concentrer les informations directement utiles et permettre leur vérification immédiate.
4. **Signaux récents** — isoler les événements temporels utiles au premier contact et éviter leur confusion avec des états permanents.
5. **Contradictions** — empêcher un chiffre unique trompeur et montrer les versions, périmètres et preuves concurrents.
6. **Inconnues et limites** — rendre visible ce qui manque, ce qui est hors périmètre et ce qui demanderait du contexte.
7. **Sources** — permettre l’audit consolidé de l’éditeur, de la date, de l’accès et du rattachement aux faits.
8. **Reçu d’exécution** — défendre le périmètre réellement exploré, la durée, les appels, l’usage, le coût, les erreurs et les reprises.

**DÉCISION** — Les sections de présentation contiennent des références aux registres d’affirmations, d’inférences, de contradictions, d’inconnues et de sources. Aucun champ de prose libre ne peut ajouter un fait après vérification.

## 7. États globaux du dossier

| État | Définition et règles |
|---|---|
| `complete_within_scope` | Identité `resolved` ; opérations prévues terminées ; toutes les affirmations affichées sont valides ; contradictions et limites du périmètre sont visibles. « Complet » signifie uniquement complet dans le périmètre déclaré. |
| `partial` | Identité `resolved`, contenu valide disponible, mais une partie du périmètre prévu n’a pas pu être établie. Les manques et la raison d’arrêt sont visibles. |
| `needs_clarification` | Identité `ambiguous` ou `insufficient_context` ; aucun dossier certain ; les précisions utiles sont proposées. |
| `insufficient_evidence` | La collecte s’est exécutée sans panne déterminante mais n’a pas produit de preuves suffisantes. Le silence et son périmètre sont conservés. |
| `technical_failure` | Timeout, erreur fournisseur, quota, réponse invalide ou autre panne technique. L’erreur est visible, typée et distincte d’une absence de preuve. Les éléments déjà vérifiés peuvent être conservés, sans changer l’état global. |

**DÉCISION** — Un timeout, un quota, une erreur API, une réponse invalide ou une source techniquement inaccessible ne devient jamais `insufficient_evidence`.

## 8. Attente longue et reprises

**DÉCISION** — Les seules opérations présentables sont reliées à une opération réelle :

- `interpretation` ;
- `candidate_search` ;
- `identity_resolution` ;
- `collection` ;
- `extraction` ;
- `reconciliation` ;
- `verification` ;
- `composition`.

Chaque invocation possède un identifiant, un statut réel, un numéro de tentative, des horodatages ou une durée mesurée, et une erreur éventuelle. Une reprise référence l’invocation antérieure ; toute opération répétée et son motif figurent dans le reçu.

Sont interdits : pourcentage fictif, étape décorative, étape annoncée mais non exécutée, disparition silencieuse d’une erreur, et double appel invisible lors d’une reprise.

## 9. Objets du contrat de vérité

### 9.1 Source

**DÉCISION** — Une `Source` contient au minimum :

- `source_id` ;
- `provider_url`, URL retournée par le fournisseur ;
- `resolved_url`, cible obtenue après résolution ;
- `canonical_url`, URL canonique directe lorsqu’elle est disponible ;
- titre, éditeur, type de source ;
- date de publication et date de consultation ;
- méthode de collecte et statut d’accessibilité ;
- entité supposée et périmètre supposé.

Les trois URL sont conservées séparément. Une URL de redirection Gemini non résolue peut orienter ou permettre de découvrir une source ; seule, elle ne peut pas devenir la citation finale d’un fait. Une citation finale exige une source identifiable et un contenu vérifiable via `resolved_url` ou `canonical_url`.

### 9.2 Preuve

**DÉCISION** — Une `Evidence` contient au minimum :

- `evidence_id`, `source_id` et `claim_id` ;
- extrait probant ;
- emplacement ou repère dans la source ;
- entité, période et périmètre concernés ;
- relation avec l’affirmation ;
- méthode et date de vérification.

Relations autorisées : `supports`, `contradicts`, `context_only`, `entity_mismatch`, `insufficient`.

Un snippet de moteur ou une annotation fournisseur peut orienter la recherche. Il ne devient preuve finale que si le système conserve une source vérifiable, l’emplacement exact et la relation exacte à l’affirmation. Une annotation ou un snippet seul n’est jamais une preuve d’affichage.

### 9.3 Affirmation atomique

**DÉCISION** — Une `Claim` contient au minimum :

- `claim_id`, `subject_id` ;
- une formulation factuelle unique ;
- catégorie ou prédicat ;
- valeur structurée et unité éventuelles ;
- date ou période du fait ;
- périmètre organisationnel ou géographique ;
- statut temporel ;
- références de preuve ;
- état de réconciliation ;
- décision et motif de présentation ou de rejet.

Une affirmation ne regroupe jamais plusieurs faits vérifiables indépendamment. Une reformulation ne peut élargir ni l’entité, ni la période, ni le périmètre, ni la causalité soutenus par la preuve.

### 9.4 États d’affirmation

| État | Sens | Présentation autorisée |
|---|---|---|
| `supported` | Au moins une preuve finale soutient exactement l’affirmation ; aucun conflit réel non signalé. | Comme fait sourcé. |
| `contested` | Au moins deux versions incompatibles, chacune étayée, restent après normalisation. | Comme fait contesté, avec contradiction visible et versions conservées. |
| `historical` | Fait soutenu pour une période passée, non présenté comme actuel. | Comme fait historique, avec période visible. |
| `ambiguous` | Rattachement, sens, période ou périmètre insuffisamment déterminé. | Uniquement dans une zone d’ambiguïté, jamais comme fait. |
| `rejected` | Preuve absente/insuffisante, entité inadéquate, périmètre incohérent ou formulation trop large. | Jamais comme fait. Motif conservé pour l’audit. |

Seules les affirmations `supported`, `contested` et `historical`, avec preuves finales valides, peuvent alimenter « résumé opérationnel », « faits clés » ou « signaux récents ».

### 9.5 Inférence

**DÉCISION** — Une `Inference` :

- porte l’étiquette explicite `inference` ;
- référence au moins une affirmation affichable qui la fonde ;
- ne contient aucun nouveau fait, chiffre, nom, date, relation ou causalité absent des affirmations référencées ;
- possède un traitement de présentation distinct d’un fait directement sourcé.

Une synthèse libre qui ajoute des faits est interdite.

### 9.6 Temporalité

**DÉCISION** — Quatre notions restent distinctes : date de publication, date de consultation, date/période du fait, et statut `current`, `historical` ou `unknown`.

- `current` exige une qualification temporelle explicite et une preuve appropriée à un état présent ;
- `historical` exige la période passée visible ;
- `unknown` interdit toute formulation au présent lorsque la validité n’est pas établie ;
- la date de publication ne remplace jamais la date du fait ;
- une source ancienne ne devient jamais, seule, une preuve d’état présent.

### 9.7 Périmètre

**DÉCISION** — Les valeurs minimales sont `person`, `company`, `group`, `subsidiary`, `brand`, `country`, `establishment`, `undetermined`.

Le périmètre qualifie le sujet exact du fait. Un chiffre sans période et périmètre utilisables reste `undetermined`, ne peut pas être présenté comme un chiffre de l’entité demandée et ne peut pas être normalisé par supposition.

## 10. Politique de sources et collecte

**DÉCISION** — La hiérarchie dépend du type de fait ; la récence ne remplace jamais la cohérence d’identité, de définition, de période ou de périmètre.

| Type de fait | Sources capables de l’établir | Sources seulement indicatives ou insuffisantes seules |
|---|---|---|
| Identité juridique | Registre ou source institutionnelle compétente ; publication officielle portant un identifiant vérifiable. | Presse, source spécialisée, agrégateur, snippet. |
| Nomination | Registre compétent si applicable ; publication officielle de l’organisation, idéalement corroborée ; presse indépendante rapportant précisément l’événement. | Profil auto-déclaré, agrégateur, snippet ; annonce ancienne pour un rôle actuel. |
| Chiffre financier | Dépôt légal, états financiers, registre institutionnel ; publication financière officielle avec période, devise, définition et périmètre. | Presse sans document primaire, base agrégée, estimation, snippet. |
| Contexte indépendant | Presse indépendante et source spécialisée compétente, avec attribution et date. | Publication promotionnelle seule. |
| Orientation de recherche | Toutes catégories, dont agrégateur, résultat ou snippet. | Ne constitue pas en soi une preuve finale. |

Ordre de préférence général, à type de fait comparable : registre/source institutionnelle, publication officielle, presse indépendante, source spécialisée, agrégateur, snippet/résultat de recherche.

Une source officielle établit ce que l’organisation publie ; elle n’est pas automatiquement suffisante pour prouver une affirmation promotionnelle, comparative, causale ou auto-évaluative. Ces affirmations exigent une définition contrôlable et, selon leur portée, une corroboration indépendante.

**EXIGENCE EXPLICITE** — Aucune collecte contournant délibérément les conditions d’utilisation d’un service ne peut être retenue. Une méthode dont la conformité n’est pas établie ne produit pas de preuve finale.

## 11. Politique de conflit

**DÉCISION** — Avant classement, comparer et normaliser sans écraser les originaux : unité, devise et date du taux éventuel, période, date de clôture, définition de la métrique, groupe/filiale/autre portée, caractère publié ou estimé.

Relations finales :

- `confirmation` : valeurs et définitions compatibles ;
- `explainable_difference` : écart expliqué par période, unité, devise, définition, portée ou méthode ;
- `contradiction` : versions réellement incompatibles après normalisation ;
- `indetermination` : données insuffisantes pour conclure.

Il est interdit de moyenner, de choisir silencieusement, de perdre la valeur écartée ou de masquer une source concurrente. Une contradiction contient au moins deux versions, les affirmations correspondantes et leurs preuves concurrentes.

## 12. Politique de silence

**DÉCISION** — Formulation canonique autorisée :

> Aucune source suffisamment fiable n’a été trouvée dans le périmètre de cette recherche.

Formulations interdites : « cette personne n’a aucune présence en ligne », « cette information n’existe pas », ou toute biographie reconstruite par plausibilité.

Un silence conserve : périmètre exploré, catégories de sources, raison d’arrêt et contexte permettant une nouvelle tentative. Il ne contient aucune affirmation affichable. Une erreur technique utilise `technical_failure`, jamais le mode silence.

## 13. Vie privée et conservation

**DÉCISION — RELEASE INITIALE** — Absence de compte et d’authentification utilisateur ; absence de persistance métier par défaut ; seules les données professionnelles publiques pertinentes sont admises ; données sensibles et privées interdites.

**DÉCISION** — Aucun prompt ni dossier complet n’est journalisé. Seules des métriques techniques minimales et expurgées peuvent exister : identifiants non signifiants, statut, compteurs, durée, coût, code d’erreur et étape. Elles ne sont conservées que pendant le besoin de l’exercice.

Toute évolution nécessitant une persistance métier, un historique nominatif, un compte ou une conservation prolongée exige un nouvel arbitrage explicite de vie privée, sécurité et durée de conservation.

## 14. Schéma, vérification et invariants

**DÉCISION** — Le schéma canonique est `docs/contracts/research-dossier.schema.json`. Les fixtures synthétiques sont dans `docs/contracts/contract-fixtures.json`. Le contrôle sans dépendance est `tools/verify-m2-contract.ps1`.

Le schéma exprime notamment les champs obligatoires, énumérations, formats, bornes, preuves minimales des faits affichables, état complet avec identité résolue, et mesures non négatives.

Les invariants référentiels ou sémantiques impossibles ou disproportionnés en JSON Schema sont contrôlés déterministiquement : unicité globale des identifiants ; résolution des références ; appartenance d’une preuve à une source et une affirmation ; qualité finale d’une URL/source ; cohérence des sections affichées ; concurrence des preuves d’un conflit ; silence sans fait ; séparation erreur/silence ; reprise explicite ; cohérence temporelle et de périmètre.

La détection qu’une inférence introduit un nouveau fait exige en plus une comparaison sémantique lors de l’implémentation. Jusqu’à preuve de ce contrôle, toute inférence non strictement extractive doit être rejetée.

## 15. Matrice de traçabilité avec le brief

| ID | Exigence du brief | Décision/artefact M2 | Preuve M2 |
|---|---|---|---|
| `BRIEF-INPUT` | Nom personne/entreprise, contexte optionnel | Sections 4 et 5 | Schéma `request` et fixtures identité |
| `BRIEF-OUTPUT` | Dossier lisible, exploitable, sourcé | Sections 2, 6 et 7 | Schéma `presentation` |
| `BRIEF-TRACEABILITY` | Toute affirmation factuelle rattachable à sa source jusqu’à l’écran | Sections 9 et 14 | Références claim→evidence→source et mutations négatives |
| `BRIEF-LONG-WAIT` | Attente réellement conçue | Section 8 | `execution_steps` et reçu, sans pourcentage |
| `BRIEF-HOMONYM` | Reconnaître/traiter l’homonyme | Sections 3 et 5 | Fixture `homonym_clarification` |
| `BRIEF-CONFLICT` | Ne pas masquer deux chiffres | Sections 3 et 11 | Fixture `conflict_two_versions` |
| `BRIEF-SILENCE` | Ne pas combler l’absence par du plausible | Sections 3 et 12 | Fixture `honest_silence` |
| `BRIEF-STALE` | Dater au lieu de présenter l’ancien comme actuel | Sections 3 et 9.6 | Fixture `historical_information` |
| `BRIEF-SCOPE` | Peu de cas solides, cas différés assumés | Section 3 | `DECISIONS.md` |
| `BRIEF-NO-PRESET` | Aucun résultat préparé pour la démonstration | Section 14 | Métadonnées synthétiques obligatoires des fixtures |
| `BRIEF-TERMS` | Aucun contournement des conditions d’utilisation | Section 10 | Champ de conformité et vérification finale |
| `BRIEF-PRIVACY` | Pas de conservation excessive | Section 13 | Décision de non-persistance |
| `BRIEF-COST` | Dire ce que coûte une fiche | Sections 6 et 14 | Reçu usage/coût/latence non négatif |
| `BRIEF-ONLINE` | Application accessible en ligne | Hors M2 ; exigence conservée | G3–G7 non terminés, aucune implémentation |

## 16. Limites du contrat

**DÉCISION** — Ce contrat ne choisit ni fournisseur, ni modèle, ni stack, ni architecture, ni interface, ni hébergement. Il ne prouve pas l’accès futur au contenu réel des sources, la résolution systématique des redirections, la qualité sur requêtes inconnues, la précision d’un résolveur d’identité, ni la couverture complète de MARQUE ou FILIALE.

**PROPOSITION — M3 OU ULTÉRIEUR, NON ENGAGÉE** — Transformer le schéma en types, appliquer le vérificateur à chaque frontière du pipeline, puis éprouver le comportement sur requêtes non préparées avant toute revendication produit.
