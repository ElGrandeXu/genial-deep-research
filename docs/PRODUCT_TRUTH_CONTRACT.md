# Contrat produit et contrat de vérité

Version : `1.0.0`
Statut : **APPLIQUÉ À LA RELEASE TECHNIQUE**
Portée : sémantique du dossier, frontières de preuve et invariants appliqués par le runtime.

## 1. Autorité et vocabulaire

| Rang | Statut | Source | Usage dans ce contrat |
|---:|---|---|---|
| 1 | **CONTRAT EXÉCUTABLE** | `docs/contracts/research-dossier.schema.json` | Structure canonique du dossier et des reçus. |
| 2 | **CONTRAT EXÉCUTABLE** | `src/domain/runtime-invariants.ts` | Invariants runtime qui décident l’identité, la preuve, les conflits et la complétude. |
| 3 | **CONTRAT PRODUIT** | Présent document | Règles sémantiques qui ne dépendent pas du fournisseur. |
| 4 | **DESCRIPTION CANDIDATE** | `README.md`, `docs/ARCHITECTURE.md` | Périmètre livré, architecture et limites publiques. |
| 5 | **FAIT VALIDÉ** | `docs/evidence/final-2026-08-28/` | Résultats datés, reçus et validations finales. |

Les termes ont toujours le sens suivant :

- **EXIGENCE EXPLICITE** : obligation provenant d’une source d’autorité ;
- **INFÉRENCE** : conclusion utile mais non contractuelle, déduite des sources ;
- **PROPOSITION** : option recommandée, non encore engagée ;
- **DÉCISION** : arbitrage produit adopté pour la release initiale ;
- **FAIT VALIDÉ** : observation prouvée, datée et limitée à son protocole.

**FAIT VALIDÉ — 2026-08-28** — Le runtime livré utilise OpenAI côté serveur pour la génération structurée et Web Search, puis récupère et vérifie directement les pages proposées. Gemini n’appartient pas au runtime candidat. Le fournisseur ne décide ni l’identité finale, ni la portée, ni la complétude.

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
| CONFLIT | **DÉCISION — REVENDIQUÉ, PÉRIMÈTRE BORNÉ** | Plusieurs versions conservées ; qualification quantitative limitée aux niveaux de `revenue` ou `workforce` sur une année unique explicitement civile ou fiscale, avec sujet, valeur exacte, base d’observation, unité, devise reconnue et portée explicite compatibles ; contradiction réelle visible. | Deux versions et leurs preuves concurrentes restent accessibles ; aucune valeur n’est perdue. Dimension non liée dans la même proposition, année nue, approximation, intervalle, taux, sous-période, portée/base/population absente ou hors grammaire, définition hors allowlist ou devise différente : `indetermination`. |
| SILENCE | **DÉCISION — REVENDIQUÉ** | Aucun contenu plausible ajouté ; résultat vide ou partiel assumé ; formulation bornée au périmètre exploré. | Aucune affirmation affichable ; périmètre, arrêt et possibilité de nouvelle tentative sont conservés. |
| PÉREMPTION | **DÉCISION — TRANSVERSAL** | Date de source et date/période du fait ; état actuel, historique ou indéterminé ; ancienneté visible. | Une source ancienne ne devient jamais, seule, un état présent. |

### 3.2 Cas différés et garde-fous

| Cas | Statut | Limite déclarée |
|---|---|---|
| MARQUE | **DÉCISION — NON REVENDIQUÉ POUR LA RELEASE INITIALE** | La résolution générique interdit d’attribuer un fait à une entité mal résolue, mais ne constitue pas une couverture complète des noms communs, produits ou villes. |
| FILIALE | **DÉCISION — NON REVENDIQUÉ POUR LA RELEASE INITIALE** | Le périmètre générique interdit la confusion silencieuse groupe/filiale et les chiffres sans portée, mais ne constitue pas une résolution juridique et financière complète des filiales. |

**DÉCISION** — Quel que soit le cas, il est interdit d’attribuer un fait à une entité mal résolue, de confondre silencieusement groupe et filiale, ou d’utiliser un fait quantitatif sans période et périmètre utilisables. Si ces éléments manquent, ils restent `unknown` ou `undetermined` ; ils ne sont pas complétés par plausibilité.

## 4. Contrat d’entrée

**DÉCISION — ENTRÉE HTTP EXÉCUTABLE** — La route accepte exclusivement un objet JSON avec `name` obligatoire de 2 à 120 caractères après normalisation, `entityType` égal à `auto`, `person` ou `company`, et `context` optionnel de 300 caractères au plus. Le corps complet est limité à 1 024 octets et tout champ inconnu est rejeté.

**DÉCISION — OBJET CANONIQUE DE SORTIE** — Le dossier conserve ensuite un objet `request` normalisé : identifiant, horodatage, nom, `suggested_type`, contexte public structuré effectivement retenu et nombre total de caractères. Cet objet de traçabilité n’est pas le corps HTTP brut et n’élargit pas ce que la route accepte.

**DÉCISION — POLITIQUE D’USAGE** — Le contexte doit rester professionnel, public, pertinent et discriminant. L’interface demande explicitement de ne saisir aucune donnée privée, sensible ou secrète. La route applique les contraintes structurelles et de longueur ci-dessus ; elle ne prétend pas détecter automatiquement la sensibilité ou la pertinence sémantique d’un texte valide.

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
2. **Contradictions** — empêcher un chiffre unique trompeur et montrer immédiatement les versions, périodes, périmètres et preuves concurrentes.
3. **Résumé opérationnel** — donner une lecture rapide ; il ne référence que des affirmations non contestées déjà enregistrées, sans nouveau fait libre.
4. **Faits clés** — concentrer les informations directement utiles et permettre leur vérification immédiate.
5. **Signaux récents** — isoler les événements temporels utiles au premier contact et éviter leur confusion avec des états permanents.
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

Les trois URL sont conservées séparément. Une URL de redirection fournisseur non résolue peut orienter ou permettre de découvrir une source ; seule, elle ne peut pas devenir la citation finale d’un fait. Une citation finale exige une source identifiable et un contenu vérifiable via `resolved_url` ou `canonical_url`.

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

Seules les affirmations `supported` et `historical`, avec preuves finales valides, peuvent alimenter « résumé opérationnel », « faits clés » ou « signaux récents ». Une affirmation `contested` reste exclusivement dans le composant de conflit avec toutes ses versions ; elle ne peut pas devenir un résumé implicite.

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

**EXIGENCE EXPLICITE** — Aucune collecte contournant délibérément les conditions d’utilisation d’un service ne peut être retenue.

**LIMITE VALIDÉE** — L’accès technique à une page publique ne constitue pas une validation juridique de ses conditions d’utilisation. Le runtime marque donc les sources live `collection_compliance: not_verified` et ne revendique aucune conformité de collecte site par site. Ce statut n’autorise aucun contournement ; il distingue la vérification technique de l’extrait de l’analyse juridique, hors périmètre de l’épreuve.

## 11. Politique de conflit

**DÉCISION** — Avant classement, comparer et normaliser sans écraser les originaux : échelle de l’unité, devise reconnue (`EUR`, `USD`, `GBP`, `CHF`, `CAD`, `AUD`, `JPY`, `CNY`), année explicitement civile ou fiscale, définition de la métrique, groupe consolidé/filiale/maison-mère/entité, base moyenne ou fin d’année de l’effectif, caractère publié ou estimé. La release ne convertit aucune devise et ne transforme jamais une approximation, un intervalle, un taux ou une variation en niveau exact. Pour un conflit quantitatif visible, `revenue` ou `workforce`, le sujet attendu, la métrique, la valeur et l’unité ou la devise doivent être reliés dans la même proposition ; chaque dimension doit être redérivable de chacun des extraits exacts vérifiés. Les champs structurés proposés par le modèle ne sont pas une preuve suffisante. Les définitions distinctes non prises en charge — notamment ARR, run-rate, operating, subscription, deferred ou segment revenue — restent `indetermination` au lieu d’être assimilées au chiffre d’affaires standard ; il en va de même des populations d’effectif non allowlistées.

Relations finales :

- `confirmation` : valeurs et définitions compatibles ;
- `explainable_difference` : écart expliqué par période, définition, portée ou méthode, après normalisation éventuelle de l’échelle dans une même unité et une même devise ;
- `contradiction` : versions réellement incompatibles après normalisation ;
- `indetermination` : données insuffisantes pour conclure.

Il est interdit de moyenner, de choisir silencieusement, de perdre la valeur écartée ou de masquer une source concurrente. Une contradiction contient au moins deux versions, les affirmations correspondantes et leurs preuves concurrentes.

## 12. Politique de silence

**DÉCISION** — Formulation canonique autorisée :

> Aucune source suffisamment fiable n’a été trouvée dans le périmètre de cette recherche.

Formulations interdites : « cette personne n’a aucune présence en ligne », « cette information n’existe pas », ou toute biographie reconstruite par plausibilité.

Un silence conserve : périmètre exploré, catégories de sources, raison d’arrêt et contexte permettant une nouvelle tentative. Il ne contient aucune affirmation affichable. Une erreur technique utilise `technical_failure`, jamais le mode silence.

## 13. Vie privée et conservation

**DÉCISION — RELEASE INITIALE** — Absence de compte et d’authentification utilisateur ; absence de persistance métier par défaut. La politique d’usage limite la saisie aux données professionnelles publiques pertinentes et l’interface avertit contre les données privées, sensibles ou secrètes ; cette politique n’est pas présentée comme un filtre sémantique automatique côté serveur.

**DÉCISION** — Aucun prompt ni dossier complet n’est journalisé. Seules des métriques techniques minimales et expurgées peuvent exister : identifiants non signifiants, statut, compteurs, durée, coût, code d’erreur et étape. Elles ne sont conservées que pendant le besoin de l’exercice.

Toute évolution nécessitant une persistance métier, un historique nominatif, un compte ou une conservation prolongée exige un nouvel arbitrage explicite de vie privée, sécurité et durée de conservation.

## 14. Schéma, vérification et invariants

**DÉCISION** — Le schéma canonique est `docs/contracts/research-dossier.schema.json`. Les fixtures synthétiques sont dans `docs/contracts/contract-fixtures.json`. Le contrôle sans dépendance est `tools/verify-m2-contract.ps1`.

Le schéma exprime notamment les champs obligatoires, énumérations, formats, bornes, preuves minimales des faits affichables, état complet avec identité résolue, et mesures non négatives.

Les invariants référentiels ou sémantiques impossibles ou disproportionnés en JSON Schema sont contrôlés déterministiquement : unicité globale des identifiants ; résolution des références ; appartenance d’une preuve à une source et une affirmation ; qualité finale d’une URL/source ; cohérence des sections affichées ; concurrence des preuves d’un conflit ; silence sans fait ; séparation erreur/silence ; reprise explicite ; cohérence temporelle et de périmètre.

La détection qu’une inférence introduit un nouveau fait exige en plus une comparaison sémantique lors de l’implémentation. Jusqu’à preuve de ce contrôle, toute inférence non strictement extractive doit être rejetée.

## 15. Matrice de traçabilité avec le brief

| ID | Exigence produit | Décision ou artefact candidat | Preuve candidate |
|---|---|---|---|
| `BRIEF-INPUT` | Nom personne/entreprise, contexte optionnel | Sections 4 et 5 | Schéma `request` et fixtures identité |
| `BRIEF-OUTPUT` | Dossier lisible, exploitable, sourcé | Sections 2, 6 et 7 | Schéma `presentation` |
| `BRIEF-TRACEABILITY` | Toute affirmation factuelle rattachable à sa source jusqu’à l’écran | Sections 9 et 14 | Références claim→evidence→source et mutations négatives |
| `BRIEF-LONG-WAIT` | Attente réellement conçue | Section 8 | `execution_steps` et reçu, sans pourcentage |
| `BRIEF-HOMONYM` | Reconnaître/traiter l’homonyme | Sections 3 et 5 | Fixture `homonym_clarification` |
| `BRIEF-CONFLICT` | Ne pas masquer deux chiffres | Sections 3 et 11 | Fixture `conflict_two_versions`, invariants runtime, tests d’intégration et E2E, captures déterministes 1 440/390 px |
| `BRIEF-SILENCE` | Ne pas combler l’absence par du plausible | Sections 3 et 12 | Fixture `honest_silence` |
| `BRIEF-STALE` | Dater au lieu de présenter l’ancien comme actuel | Sections 3 et 9.6 | Fixture `historical_information` |
| `BRIEF-SCOPE` | Peu de cas solides, cas différés assumés | Section 3 | Note d’arbitrage et bench final |
| `BRIEF-NO-PRESET` | Aucun résultat préparé pour la démonstration | Section 14 | Métadonnées synthétiques obligatoires des fixtures |
| `BRIEF-TERMS` | Aucun contournement des conditions d’utilisation | Section 10 | Accès public direct, absence de mécanisme de contournement, statut `not_verified` sans sur-promesse juridique |
| `BRIEF-PRIVACY` | Pas de conservation excessive | Section 13 | Décision de non-persistance |
| `BRIEF-COST` | Dire ce que coûte une fiche | Sections 6 et 14 | Reçu usage/coût/latence non négatif |
| `BRIEF-ONLINE` | Application accessible en ligne | URL Production publiée | Validation Production finale |

## 16. Limites du contrat

**DÉCISION** — Ce contrat ne choisit ni fournisseur, ni modèle, ni stack, ni architecture, ni interface, ni hébergement. Il ne prouve pas l’accès futur au contenu réel des sources, la résolution systématique des redirections, la qualité sur requêtes inconnues, la précision d’un résolveur d’identité, ni la couverture complète de MARQUE ou FILIALE.

**SUITE RECOMMANDÉE, NON ENGAGÉE** — Élargir le benchmark aveugle annoté avant d’augmenter le rappel, d’ajouter un fournisseur ou de revendiquer de nouveaux cas live.
