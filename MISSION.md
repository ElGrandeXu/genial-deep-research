# Capsule de mission — M0 à M4

## Finalité contractuelle

- **EXIGENCE EXPLICITE** — Construire, dans les missions ultérieures autorisées, une application web qui transforme le nom d'une personne ou d'une entreprise, avec contexte optionnel, en dossier lisible, exploitable et sourcé.
- **EXIGENCE EXPLICITE** — Toute affirmation factuelle doit rester rattachable à sa source jusqu'à l'écran ; l'attente et le résultat doivent être conçus ; l'application finale doit être accessible en ligne.
- **DÉCISION** — M0 n'implémente aucune partie du produit. Il établit seulement une frontière Git indépendante, une gouvernance minimale, l'intégrité des sources et la protection des secrets.

## Ordre d'autorité

1. **EXIGENCE EXPLICITE** — `epreuve-deep-research.md`, contrat original immuable.
2. **FAIT VALIDÉ** — Faits du mail d'Antonin explicitement rapportés dans `AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md`.
3. **EXIGENCE EXPLICITE** — `AUDIT_FORMEL_MISSION_GENIAL_DEEP_RESEARCH.md`.
4. **PROPOSITION** — `PLAN_ACTION_DETAILLE_GENIAL_DEEP_RESEARCH.md`, adaptable.
5. **FAIT VALIDÉ** — Constats matériels futurs produits et prouvés par Codex.

Une contradiction est résolue en faveur de la source de rang supérieur. Les statuts utilisés sont : **EXIGENCE EXPLICITE**, **INFÉRENCE**, **PROPOSITION**, **DÉCISION**, **FAIT VALIDÉ**.

## Principes non négociables

- **EXIGENCE EXPLICITE** — Brief original et deux documents d'autorité inchangés octet par octet.
- **EXIGENCE EXPLICITE** — Aucune donnée factuelle finale sans source rattachable ; aucune sortie préparée à l'avance ; aucun contournement volontaire de conditions d'utilisation ; aucune conservation excessive de données personnelles.
- **DÉCISION** — Les secrets restent hors de Git, des documents, des logs et des captures.
- **DÉCISION** — Une ancienne tentative, passation ou migration ne constitue ni une autorité ni un progrès acquis.
- **DÉCISION** — Les preuves observables précèdent toute validation de jalon.

## Périmètre strict de M0

- **DÉCISION** — Inspecter l'environnement canonique et la cible sans lire les deux passations exclues.
- **DÉCISION** — Vérifier les empreintes externes des trois sources.
- **DÉCISION** — Initialiser exclusivement la gouvernance Git locale, la capsule M0, les contrôles d'intégrité et la protection des secrets.
- **DÉCISION** — Ne choisir aucune stack, ne rien installer, ne générer aucun squelette, n'appeler aucune API OpenAI/Gemini, ne produire aucune interface, ne configurer aucun remote ou hébergement, ne commencer aucun travail produit.
- **DÉCISION** — L'ancienne phase de migration vers un laptop est obsolète, non exécutée et non comptabilisée.

## Calendrier

- **FAIT VALIDÉ** — Cible interne volontaire : vendredi 28 août 2026.
- **FAIT VALIDÉ** — La date butoir contractuelle exacte n'est pas confirmée.
- **DÉCISION** — La cible interne n'est jamais présentée comme deadline contractuelle.

## Condition de sortie

- **DÉCISION** — M0 s'arrête après un premier commit atomique validé et attend l'audit externe de Maxime/ChatGPT. G1 reste non terminé.

## Mission M2 — Figer le produit et le contrat de vérité

- **EXIGENCE EXPLICITE** — Transformer les autorités et les faits M1 en contrats produit et vérité indépendants d’une stack, structurés pour devenir types et tests, couvrant succès, ambiguïtés, conflits, silences, péremption et erreurs.
- **DÉCISION** — Revendiquer HOMONYME, CONFLIT et SILENCE ; traiter PÉREMPTION transversalement ; différer explicitement MARQUE et FILIALE.
- **DÉCISION** — Créer le document canonique, le JSON Schema, six fixtures entièrement synthétiques, le vérificateur déterministe, le journal d’arbitrage et le registre de risques.
- **DÉCISION** — Aucun appel API, accès DPAPI, choix de fournisseur/modèle/stack, squelette, interface, hébergement, déploiement, donnée réelle ou travail M3.
- **DÉCISION** — G2 n’est validable qu’après intégrité, secrets, JSON, fixtures, cinq mutations négatives, traçabilité et état Git cohérents.

## Condition de sortie M2

- **DÉCISION** — Un commit atomique contient les contrats et leurs preuves reproductibles.
- **DÉCISION** — Après validation, attendre l’audit externe de M2 avant tout travail M3.

## Mission M3 — Architecture minimale et baseline applicative

- **DÉCISION** — Choisir et documenter une architecture Next.js App Router, TypeScript strict et runtime Node, puis établir un socle local compilable, testable et compatible avec le contrat M2.
- **DÉCISION** — Préparer OpenAI `gpt-5.6-luna` via Responses/Web Search comme voie initiale future et Gemini comme comparaison ou repli différé, sans aucun appel fournisseur en M3.
- **DÉCISION** — Conserver le JSON Schema M2 canonique, dériver les types, valider avec Ajv et préserver le vérificateur déterministe.
- **DÉCISION** — Aucune base, authentification, persistance métier, recherche, formulaire fonctionnel, accès DPAPI, remote ou déploiement.
- **DÉCISION** — G3 n’est pas validé par une baseline locale.

## Condition de sortie M3

- **DÉCISION** — Architecture, dépendances, baseline, vérificateur cumulatif, build sans secrets, santé locale, audit et preuves sont réunis dans un commit atomique.
- **DÉCISION** — Après validation, attendre l’audit externe de M3 avant tout travail M4.

## Mission M4 — Déploiement Vercel précoce

- **EXIGENCE EXPLICITE** — Établir et prouver un premier déploiement Vercel public du socle M3 sans recherche métier, clé fournisseur, appel OpenAI/Gemini, intégration Git ni domaine personnalisé.
- **DÉCISION** — Déployer un commit propre d’abord en Preview puis en Production, vérifier publiquement `/`, `/api/health`, la non-divulgation et les logs, puis conserver les preuves séparément du runtime déployé.
- **DÉCISION** — Utiliser le projet dédié `genial-deep-research` dans l’unique scope `team` Hobby disponible ; ne toucher ni à la facturation ni aux protections globales.
- **DÉCISION** — La protection Vercel du seul projet M4 peut être désactivée pour satisfaire l’exigence d’accès public, conformément à la documentation de gestion par projet sur Hobby.
- **DÉCISION** — M4 ne valide pas G3 : la recherche métier, l’attente longue, la provenance réelle et le dossier contractuel restent absents.

## Condition de sortie M4

- **FAIT VALIDÉ** — Preview et Production du même `deployedCommit` en état `READY`, accessibles sans authentification, avec HTTP 200 sur `/` et `/api/health`.
- **FAIT VALIDÉ** — Aucun environnement fournisseur, appel IA, secret public, source d’autorité, passation ou chemin local divulgué.
- **DÉCISION** — G0 à G2 restent validés ; G3 reste partiel et non validé ; G4 à G7 restent non terminés.

## Mission M5 — Tranche verticale sourcée

- **EXIGENCE EXPLICITE** — Relier une entrée publique à une recherche Web OpenAI réelle, une affirmation atomique maximale, une source fournisseur directe et un reçu d’usage/coût/latence.
- **DÉCISION** — OpenAI `gpt-5.6-luna` seul ; Responses via AI SDK direct ; Web Search forcé ; un appel HTTP et un outil maximum ; aucun retry automatique ni persistance.
- **DÉCISION** — L’échec local après retour fournisseur bloque Preview M5, WAF, secret Production, Production M5 et G3.
- **FAIT VALIDÉ** — Statut de sortie : `M5_FAILED_LOCAL_LIVE` ; G0–G2 préservés ; G3 partiel ; G4–G7 non terminés.

## Mission M5 R1 — Récupération hors réseau

- **EXIGENCE EXPLICITE** — Préserver le candidat M5 non commité, rendre le prochain échec diagnostiquable et rejouer uniquement les métadonnées M1 déjà expurgées.
- **DÉCISION** — Aucun réseau, accès DPAPI, appel fournisseur, mutation Vercel, déploiement, commit, stash ou suppression.
- **FAIT VALIDÉ** — Les métadonnées installées fournissent URL, titre et offsets dans le texte généré, mais aucun extrait du contenu source exigé par M2.
- **DÉCISION** — Statut : `M5_R1_BLOCKED_TRUTH_CONTRACT`. L’observabilité est réparée ; aucun nouveau probe réel tant que la provenance d’un extrait source authentique manque.
