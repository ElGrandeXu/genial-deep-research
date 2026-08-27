# Registre de risques M2

Registre concentré sur les risques restant après M1 et le gel contractuel. L’audit formel reste la source détaillée.

| ID | Risque | État / signal | Réponse M2 | Risque résiduel / déclencheur |
|---|---|---|---|---|
| R-M2-001 | Redirections Gemini | M1 a conservé des URL `vertexaisearch.cloud.google.com`, pas les URL éditeur directes. | Séparer `provider_url`, `resolved_url`, `canonical_url` ; interdire une redirection non résolue comme seule citation finale. | Résolution impossible, chaîne instable ou destination non conforme → source non finale. |
| R-M2-002 | Accès au contenu réel des sources | Une annotation ou un snippet peut exister sans contenu source effectivement lisible. | Exiger extrait, repère, source accessible, URL directe et méthode de vérification finale. | Paywall, robots, contenu dynamique ou retrait → preuve rejetée ou marquée inaccessible. |
| R-M2-003 | Confusion groupe/filiale | Un chiffre consolidé peut paraître applicable à une entité locale. | Périmètre obligatoire ; chiffre sans portée utilisable interdit ; versions non fusionnées. | FILIALE reste non revendiqué ; une évaluation juridique/financière dédiée sera nécessaire. |
| R-M2-004 | Sources anciennes | Un fait historiquement juste peut être présenté comme actuel. | Dates source/consultation/fait séparées ; statuts `current`, `historical`, `unknown`. | Règles de fraîcheur propres à chaque prédicat encore à mesurer. |
| R-M2-005 | Timeout | Appels longs ou limites d’hébergement inconnues. | `technical_failure` distinct du silence ; étape échouée, durée et code conservés ; aucune disparition d’erreur. | Politique de timeout/reprise et compatibilité hébergeur non choisies. |
| R-M2-006 | Expiration des clés | Clés fonctionnelles observées seulement le 26 août 2026 ; durée future non garantie. | Aucun fournisseur choisi ; reçu et erreur de quota/authentification futurs obligatoires ; revalidation avant engagement. | Application future inutilisable après expiration ; plan serveur à décider. |
| R-M2-007 | Coûts de recherche variables | M1 montre des schémas tarifaires et coûts différents ; grounding et volume source varient. | Reçu coût/usage/latence non négatif avec statut et hypothèses ; aucune estimation cachée. | Coût par dossier simple/ambigu non mesuré sur produit réel. |
| R-M2-008 | Deadline contractuelle inconnue | Une semaine dans le brief, clés jusqu’à fin de semaine, date exacte non confirmée. | Vendredi 28 août 2026 traité comme échéance opérationnelle la plus contraignante, jamais contractuelle. | Changement tardif d’Antonin ; réviser dès réception d’une date officielle. |
| R-M2-009 | Résultats de requêtes non préparées | M1 teste des capacités API, pas la qualité du futur dossier sur entrées inconnues. | Fixtures marquées synthétiques, non démo et non sorties ; aucune revendication de performance produit. | Évaluation hors distribution obligatoire avant G5. |
| R-M2-010 | Source officielle promotionnelle | Une organisation peut publier une affirmation intéressée ou non définie. | Hiérarchie dépendante du fait ; corroboration indépendante pour promotion, comparaison et causalité. | Seuil de corroboration par prédicat à définir et mesurer. |
| R-M2-011 | Inférence créant un fait | Une reformulation peut ajouter causalité, chiffre, date ou portée. | Inférence étiquetée, fondée sur claims, apparence distincte ; composition libre interdite. | Contrôle sémantique non réalisable complètement en JSON Schema ; rejet par défaut jusqu’à preuve. |
| R-M2-012 | MARQUE et FILIALE différés | Les garde-fous génériques peuvent être pris à tort pour une couverture complète. | Statut non revendiqué répété dans contrat et décisions. | Communication produit future doit rester exacte ; tests dédiés avant revendication. |

## Risques d’architecture M3

| ID | Risque | État / signal M3 | Réponse retenue | Blocker / déclencheur |
|---|---|---|---|---|
| R-M3-001 | Perte de provider metadata dans AI SDK | Les docs exposent `sources` et `providerMetadata`, mais ne prouvent pas que tous les détails bruts requis par M2 survivent à chaque appel. | Conserver sources et métadonnées en mémoire de requête, normaliser explicitement, échouer fermé ; REST direct reste le repli. | Métadonnée nécessaire inaccessible lors de la boucle verticale → bloquer G3 ou remplacer l’adaptateur. |
| R-M3-002 | Compatibilité `gpt-5.6-luna` / `@ai-sdk/openai` | Le modèle est stable et supporte Responses, streaming, Structured Outputs et Web Search ; la fabrique accepte l’identifiant au typecheck. Aucun appel M3 ne prouve le comportement réel. | Appel contrôlé M4 obligatoire avant chemin critique. | Erreur de modèle, outil, `store: false`, source ou schéma → remplacement/version adaptée avant G3. |
| R-M3-003 | Limites du plan Vercel | Plan et Fluid Compute inconnus. Limites documentées très différentes selon activation et plan. | Timeout applicatif 240 s, cible de fonction 300 s, compatibilité seulement théorique. | Maximum réel inférieur ou durée mesurée supérieure → queue/backend long ou autre hébergeur à arbitrer. |
| R-M3-004 | Durée d’une recherche | M1 ne mesure que des probes courts, pas une boucle métier. | Huit appels maximum, une reprise par opération, flux réel, résultat partiel et arrêt typé. | Dépassements réguliers, déconnexions ou besoin de reprise durable. |
| R-M3-005 | Build sans secrets | Les SDK peuvent lire leurs variables par défaut si une fabrique est créée trop tôt. | Fabriques serveur paresseuses, aucun import client, aucune route de recherche, build et tests sans clé. | Toute exigence de clé au build ou présence dans `.next/static` bloque la livraison. |
| R-M3-006 | Dérive schéma / types | Un type manuel peut diverger du JSON Schema. | Type généré depuis le fichier canonique et comparaison exacte avant typecheck ; invariants sémantiques M2 séparés. | Écart de génération ou validation divergente bloque le vérificateur cumulatif. |
| R-M3-007 | Dépendances vulnérables | Surface Next/AI SDK/validation et chaîne de développement nouvelles. | Versions exactes, lockfile, audit complet et runtime, approbation de build limitée à `unrs-resolver`. | Vulnérabilité runtime haute ou critique → remplacer ou bloquer ; aucune correction majeure automatique. |
| R-M3-008 | Fuite dans le bundle client | Import accidentel d’un SDK ou d’une variable serveur depuis un composant client. | Composants serveur par défaut, module `server-only`, aucun `NEXT_PUBLIC_*`, scan de `.next/static`. | Nom, forme de clé ou endpoint fournisseur dans le bundle → build rejeté. |
| R-M3-009 | Compatibilité outillage | ESLint 10 et TypeScript 7 sont les dist-tags courants mais les plugins Next observés bornent ESLint à 9 et TypeScript à `<6.1`. | ESLint `9.39.5` et TypeScript `6.0.3`, dernières versions cohérentes avec les peer ranges ; peer check vert. | Mettre à niveau dès compatibilité stable sans overrides. |
| R-M3-010 | Redirections Gemini finales | Le provider et Google exposent grounding et citations, mais M1 a observé des redirections Google. | Gemini hors chemin critique ; redirection non résolue jamais citation finale. | Absence d’URL directe vérifiable → source rejetée, pas de fallback final. |

## Risques de déploiement M4

| ID | Risque | État / signal M4 | Réponse retenue | Risque résiduel / déclencheur |
|---|---|---|---|---|
| R-M4-001 | Coût Vercel réel | Plan Hobby prouvé, mais aucune preuve de valorisation de l’usage. | Coût Vercel conservé à `UNKNOWN`; aucun domaine ou option payante. | Vérifier usage/facturation avant toute charge durable. |
| R-M4-002 | Protection publique désactivée | Le projet dédié est public pour satisfaire M4. | Projet sans donnée, recherche, clé ni résultat ; modification limitée au projet, jamais à l’équipe. | Réactiver ou remplacer par auth applicative avant toute donnée sensible. |
| R-M4-003 | Dérive de frontière d’upload | Une première règle a exclu le schéma requis. | Liste explicite, build distant, 18 fichiers observés, tests de non-divulgation et vérificateur public. | Nouvel import hors frontière → build bloqué jusqu’à correction et redéploiement. |
| R-M4-004 | Déploiement en erreur conservé | Premier déploiement classé Production et terminé `ERROR`. | Aucun nettoyage automatique ; état, cause et URL consignés. | Bruit opérationnel seulement ; suppression future exige accord explicite. |
| R-M4-005 | Capacité longue non prouvée | Fluid Compute est activé, mais limite de plateforme et recherche réelle non testées. | `maxDuration=5` uniquement sur santé ; aucune conclusion sur la future route métier. | Mesurer plan, durée et streaming avant toute revendication G3. |

## Risques M5 observés

| ID | Risque | Signal M5 | Réponse | Risque résiduel / déclencheur |
|---|---|---|---|---|
| R-M5-001 | Sortie fournisseur rejetée après Web Search | Probe réel : `validating → failed`; cause précise non sérialisée. | Échec fermé, aucun fait affiché, aucun retry non autorisé, aucun passage en Production. | Corriger d’abord le probe pour conserver tout reçu d’échec, puis obtenir une nouvelle autorisation d’appel réel. |
| R-M5-002 | Preuve M2 incomplète sans extrait source | AI SDK conserve annotation, titre, URL et offsets du texte généré, mais pas un extrait du contenu source ; M1 n’en a pas conservé. | Échec fermé `source_metadata_missing` ; aucune affirmation, titre ou phrase explicative utilisée comme faux extrait ; schema M2 inchangé. | Blocker R1 : ajouter une collecte autorisée d’extrait source avec locator avant tout nouveau probe. |
| R-M5-003 | Mutation Vercel involontaire par CLI | Quatre Preview du baseline M4 créées pendant une commande d’inspection mal formée. | Production et configuration inchangées ; incident conservé ; aucun nettoyage sans accord. | Employer uniquement `npx --package=vercel@59.6.2 vercel ...` et vérifier `--version` avant toute commande. |
