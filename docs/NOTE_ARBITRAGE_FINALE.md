# Note d’arbitrage finale — GENIAL Deep Research

Date : 28 août 2026

Production : <https://genial-deep-research.vercel.app>

Dépôt : <https://github.com/ElGrandeXu/genial-deep-research>

**Release technique finalisée — limite budgétaire interne déclarée**

## 1. Décision produit

L’utilisateur commercial a besoin d’un dossier court qu’il peut défendre, pas d’une synthèse vraisemblable. La release accepte donc de perdre du rappel : une identité non démontrée demande du contexte ; un fait dont l’extrait n’est pas retrouvé disparaît ; une recherche pauvre produit un silence borné ; une panne ne devient jamais un dossier partiel.

Le résultat conserve quatre états lisibles : complet dans le périmètre, partiel, clarification et données publiques insuffisantes. Chaque affirmation visible garde sa preuve adjacente, sa source ouvrable, sa période et sa fraîcheur. Le résumé reste extractif : il sélectionne des faits déjà reliés à leurs preuves, sans ajouter une reformulation factuelle libre.

## 2. Architecture de vérité

Principe : **le fournisseur propose, le serveur décide**.

OpenAI `gpt-5.6-luna` propose des candidats, faits, URL et extraits via Responses API, sortie structurée et Web Search. Le serveur récupère directement chaque URL après contrôles anti-SSRF, DNS, redirections, durée, taille et type HTML ; l’extrait doit être retrouvé littéralement.

La promotion suit `Source → Evidence → Claim → Presentation`. Candidat unique, contexte prouvé, sujet, type, portée, qualité, temporalité et complétude sont recalculés côté serveur. JSON Schema, invariants runtime et contrôle client ferment la chaîne. Le monolithe Next.js n’utilise ni base de données, ni compte, ni persistance de dossier.

Gemini est absente du runtime candidat : aucun gain mesuré ne justifie une seconde clé, un second contrat et de nouveaux modes de panne.

## 3. Identité, contexte, portée et complétude

`resolved` implique exactement un candidat directement vérifié. Le contexte n’est retenu que s’il correspond à un domaine officiel, un identifiant légal, un employeur, ou à deux signaux vérifiés parmi ville, pays, secteur et année. Pour un fait, l’égalité de type ne suffit pas : sujet, portée — personne, société, groupe, filiale ou marque —, libellé et présence de l’entité sur la page doivent converger.

Un dossier complet exige trois à six faits métier uniques, deux catégories, deux pages et deux familles d’éditeurs, sans contradiction, violation de portée ni manque critique. GENIAL n’obtient que deux faits d’une même famille : son statut final est donc correctement `partial`.

Une année ou une date récente ne produit jamais seule `current`. Ce statut exige une formulation actuelle explicite et une date exacte correspondant à l’observation.

## 4. Couverture réellement démontrée

Le bench final a exécuté une fois, dans l’ordre préenregistré, cinq cas sur la Preview ensuite promue :

- GENIAL : identité résolue, deux faits, deux pages, statut `partial`, `0,0141440 USD` ;
- Thomas Martin : aucun fait attribué, silence sûr, `0,0455815 USD` ;
- Airbus SAS : preuve de l’entité légale, aucune métrique Airbus SE, clarification conservatrice, `0,0249935 USD` ;
- SILENCE : zéro fait et zéro source, `0,0111351 USD` ;
- holdout Google Ireland Limited : entité exacte isolée, aucune donnée Google LLC ou Alphabet, clarification, `0,0246989 USD`.

Une seule exécution a été effectuée par cas ; aucun rerun et aucune sélection du meilleur résultat. Le holdout n’a déclenché aucun patch nominal. La résolution Airbus et holdout est plus prudente qu’utile : c’est une limite de rappel assumée, pas une réussite maquillée.

MARQUE, CONFLIT et PÉREMPTION ne sont pas revendiqués en live final. Certains cas supplémentaires n’ont pas été lancés.

## 5. UX, coût et protection des clés

Le flux SSE expose admission, résolution ou recherche, vérification des pages, construction et contrôle final, sans pourcentage fictif. L’utilisateur peut annuler ; le focus rejoint le résultat ou l’erreur. Huit parcours navigateur couvrent complet, partiel, clarification, silence, panne, SSE fragmenté, annulation et incohérence masquée. Aucun overflow n’est observé à 390 ou 1 440 px. Les rapports Lighthouse finaux atteignent 100/100/100/100 sur desktop et 99/100/100/100 sur mobile.

Les cinq exécutions finales préenregistrées ont coûté 0,1205530 USD au total. Cette somme dépasse de 0,0005530 USD l’enveloppe interne stricte de validation fixée à 0,12 USD. Tous les coûts individuels restent inférieurs à 0,10 USD. Les appels ont été arrêtés immédiatement après le cinquième reçu et aucun résultat n’a été sélectionné a posteriori.

Cette enveloppe cumulée était un contrôle interne, pas une exigence du brief. Aucun reçu, coût ou résultat brut n’a été modifié. La release technique et les livrables sont finalisés avec cette limite déclarée.

Seule la clé OpenAI est utilisée par le runtime. Elle reste exclusivement serveur et est configurée comme variable Vercel `Sensitive` en Preview et Production. Gemini est absente ; aucune variable fournisseur `NEXT_PUBLIC_*` n’est utilisée. Les secrets sont exclus de Git, du bundle client, des captures, du PDF et des logs. `store: false` est imposé côté fournisseur et l’application ne journalise ni ne persiste entrée, contexte, prompt, extrait ou dossier.

Le WAF protège `/api/research` avec huit requêtes par 600 secondes et par IP. L’application borne aussi les admissions et la concurrence à deux recherches simultanées ; chaque fiche possède un plafond interne inférieur à `0,10 USD`. L’authentification étant hors périmètre, ces protections limitent l’abus sans prétendre l’éliminer. Les clés devront être révoquées ou tournées par leur propriétaire après l’évaluation.

## 6. Limites et suite

Le moteur ne garantit ni exhaustivité, ni accès aux pages avec JavaScript, authentification ou paywall, ni stabilité future d’une source. Il ne crée pas d’archive. La date de publication manque souvent. Une IP partagée peut subir le WAF. Il n’existe ni export, file durable, historique, second fournisseur ni reprise après fermeture du navigateur.

Avec un mois, la priorité serait un benchmark aveugle annoté de 50 à 100 entités : précision d’identité, rappel des faits, taux d’extraits retrouvés, portée, coût et latence. Les erreurs décideraient ensuite d’une clarification interactive, d’une archive juridiquement cadrée, d’un export et d’une file durable. Un second fournisseur ne serait ajouté qu’après un gain mesuré et ne remplacerait ni la récupération directe ni les invariants serveur.

Preuves : [bench final](evidence/final-2026-08-28/LIVE_BENCH_FINAL.md), [validation Production](evidence/final-2026-08-28/PRODUCTION_VALIDATION_FINAL.md), [WAF](evidence/final-2026-08-28/WAF_VALIDATION.md), [validation du dépôt candidat](evidence/final-2026-08-28/CLEAN_CLONE_VALIDATION_FINAL.md).
