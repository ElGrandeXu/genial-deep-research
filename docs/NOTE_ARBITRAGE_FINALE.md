# Note d’arbitrage finale — GENIAL Deep Research

Date : 28 août 2026

Production : <https://genial-deep-research.vercel.app>

Dépôt : <https://github.com/ElGrandeXu/genial-deep-research>

## 1. Décision produit

L’utilisateur commercial a besoin d’un dossier court qu’il peut défendre, pas d’une synthèse vraisemblable. La release accepte donc de perdre du rappel : une identité non démontrée demande du contexte ; un fait dont l’extrait n’est pas retrouvé disparaît ; une recherche pauvre produit un silence borné ; une panne ne devient jamais un dossier partiel.

Le résultat conserve quatre états lisibles : complet dans le périmètre, partiel, clarification et données publiques insuffisantes. Chaque affirmation visible garde sa preuve adjacente, sa source ouvrable, sa période et sa fraîcheur. Le résumé reste extractif : il sélectionne des faits déjà validés, sans nouvelle reformulation factuelle libre.

## 2. Architecture de vérité

Principe : **le fournisseur propose, le serveur décide**.

OpenAI `gpt-5.6-luna` propose des candidats, faits, URL et extraits via Responses API, sortie structurée et Web Search. Le serveur ne fait confiance ni au statut d’identité ni aux relations proposées. Il récupère directement chaque URL après contrôles anti-SSRF, DNS, redirections, durée, taille et type HTML ; l’extrait doit être retrouvé littéralement.

La promotion suit ensuite `Source → Evidence → Claim → Presentation`. Le serveur exige une clé sujet, un type et une portée compatibles, une ancre de page, un fait atomique et non dupliqué, puis recalcule temporalité et complétude. Schéma JSON, invariants runtime et contrôle client ferment la chaîne. Aucun dossier, compte ou historique n’est persisté.

## 3. Identité, contexte, portée et complétude

`resolved` implique exactement un candidat directement vérifié. Le contexte n’est retenu que s’il correspond à un domaine officiel, un identifiant légal, un employeur, ou à deux signaux vérifiés parmi ville, pays, secteur et année. Pour un fait, l’égalité de type ne suffit plus : sujet, portée, libellé et présence de l’entité sur la page doivent converger.

Un dossier complet exige trois à six faits métier uniques, deux catégories, deux pages et deux familles d’éditeurs, sans contradiction, violation de portée ni manque critique. GENIAL n’obtient que deux faits d’une même famille : son statut final est donc correctement `partial`.

La temporalité est prudente : une année ou une date récente ne produit jamais seule `current`. Ce statut exige une formulation actuelle explicite et une date exacte correspondant à l’observation. CONFLIT et PÉREMPTION restent testés au niveau déterministe, mais ne sont pas revendiqués en live final.

## 4. Couverture réellement démontrée

Le bench final a exécuté une fois, dans l’ordre préenregistré, cinq cas sur la Preview ensuite promue :

- GENIAL : identité résolue, deux faits, deux pages, statut `partial`, `0,0141440 $` ;
- Thomas Martin : aucun fait attribué, silence sûr, `0,0455815 $` ;
- Airbus SAS : preuve de l’entité légale, aucune métrique Airbus SE, clarification conservatrice, `0,0249935 $` ;
- SILENCE : zéro fait et zéro source, `0,0111351 $` ;
- holdout Google Ireland Limited : entité exacte isolée, aucune donnée Google LLC ou Alphabet, clarification, `0,0246989 $`.

Le holdout n’a déclenché aucun patch nominal. MARQUE, CONFLIT et PÉREMPTION ne sont pas présentés comme succès live. La résolution Airbus et holdout est plus prudente qu’utile : c’est une limite de rappel assumée, pas une réussite maquillée.

## 5. UX, coût et sécurité

Le flux SSE expose admission, résolution/recherche, vérification des pages, construction et contrôle final. Aucun pourcentage fictif. L’utilisateur peut annuler ; le focus rejoint le résultat ou l’erreur. Huit parcours navigateur couvrent complet, partiel, clarification, silence, panne, SSE fragmenté, annulation et incohérence masquée. À 390 et 1 440 px, aucun overflow n’est observé. Lighthouse atteint 100/100/100/100 sur desktop et 99/100/100/100 sur mobile.

Chaque fiche reste sous `0,10 $`. Le cumul exact du bench est toutefois `0,1205530 $`, soit `0,0005530 $` au-dessus de l’enveloppe interne stricte de `0,12 $`. Aucun appel supplémentaire n’a été lancé. Le réaudit atteint `92/100`, mais le gate G11 échoue : statut final **BLOCKED**, jamais `SUCCESS`.

La clé OpenAI reste côté serveur et `store: false` est fixé. Les entrées ne sont pas journalisées. Un WAF Vercel distribué limite `/api/research` à huit requêtes par 600 secondes et par IP ; une garde locale borne aussi admissions et concurrence. Cette protection ne remplace ni authentification ni quota par utilisateur.

## 6. Limites et suite

Le moteur ne garantit ni exhaustivité, ni accès aux pages avec JavaScript, authentification ou paywall, ni stabilité future d’une source. Il ne crée pas d’archive. La date de publication manque souvent. Une IP partagée peut subir le WAF. Il n’existe ni export, file durable, historique, second fournisseur ni reprise après fermeture du navigateur.

Avec un mois, la priorité serait un benchmark aveugle annoté de 50 à 100 entités : précision d’identité, rappel des faits, taux d’extraits retrouvés, portée, coût et latence. Les erreurs décideraient ensuite d’une clarification interactive, d’une archive juridiquement cadrée, d’un export et d’une file durable. Gemini ou une seconde voie OpenAI ne serait ajouté qu’après un gain mesuré ; aucun fournisseur secondaire ne remplacerait la récupération directe ni les invariants serveur.

Preuves : [bench final](evidence/final-2026-08-28/LIVE_BENCH_FINAL.md), [validation Production](evidence/final-2026-08-28/PRODUCTION_VALIDATION_FINAL.md), [WAF](evidence/final-2026-08-28/WAF_VALIDATION.md), [gates](evidence/final-2026-08-28/GATE_MATRIX_G0_G12.md).
