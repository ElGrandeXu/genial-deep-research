# M5-R2B — chaîne source hors réseau

## Décision

- **DÉCISION** — Statut : `M5_R2B_OFFLINE_READY`.
- **EXIGENCE EXPLICITE** — M5-R2B prépare une unique tentative live ultérieure ; elle ne valide ni M5 ni G3.
- **FAIT VALIDÉ** — Aucun appel OpenAI, Gemini, DNS réel, récupération source réelle, requête localhost, registre npm, DPAPI ou Vercel n’est autorisé dans cette mission.

## Baseline reçue avant mutation

- **FAIT VALIDÉ** — Racine Git : `C:\Users\maxer\Desktop\GENIAL` ; HEAD `b3a313e5c0333d62bbbd6d2c6c0206a370a15a34` ; aucun remote ; index vide.
- **FAIT VALIDÉ** — 20 fichiers suivis modifiés et 19 fichiers non suivis.
- **FAIT VALIDÉ** — Diff suivi complet `git diff --full-index --binary` : `4a1683dfd52f16480f636dfffabf09a290b047a7df5458c37a8421e9a3a364a9`.
- **FAIT VALIDÉ** — Manifeste non suivi, lignes `chemin<TAB>octets<TAB>sha256<LF>` : `47f6d0ebd032ace3ec44d6b9cf25811512687e812ced51860b5e03bf3c6743a0`.
- **FAIT VALIDÉ** — `package.json` `61320378476359df831a6b46571f56a6cd727205ada88b1538f5fc75406e5ddf` ; `pnpm-lock.yaml` `eafc98b59f3ee2b62865fbf2665bec9c264d7b7c89a443eb272c1368add82731`.
- **FAIT VALIDÉ** — Les trois sources d’autorité sont intactes ; les preuves M5 immuables portent respectivement `50c3148…`, `75786bbc…` et `7f4ef1c9…` ; `parse5: "8.0.1"` est direct et runtime ; le vérificateur M5-R2A est vert.
- **FAIT VALIDÉ** — Le schema M2 est inchangé, SHA-256 `1d90f2e7fda8d9893f48ad047cee402e45d54c8647c9376d08c6ea59774dc3d3`.

## Métadonnées fournisseur

- **FAIT VALIDÉ** — Les types publics installés exposent `OpenaiResponsesTextProviderMetadata.openai.itemId` et `annotations`, dont `url_citation` avec `start_index`, `end_index`, `url` et `title`. Les sources AI SDK exposent `id`, `url` et titre optionnel.
- **DÉCISION** — Seule cette enveloppe publique OpenAI Responses est acceptée. Les formes brutes, inconnues, sans `itemId`, sans offsets entiers, ou portant une annotation non prise en charge sont fermées.
- **DÉCISION** — La représentation interne conserve fournisseur, type `url_citation`, source ID éventuel, URL, titre, plage dans le texte généré, item ID et tool-call ID non sensible éventuel.
- **DÉCISION** — Une source générale ne prouve rien seule. Une citation unique doit couvrir exactement la plage de l’affirmation structurée. Les offsets ne décrivent jamais la page source.
- **FAIT VALIDÉ** — Le replay M1 conservé ne contient ni texte généré ni offsets ni enveloppe ; il reste une preuve historique insuffisante, jamais un produit.
- **DÉCISION** — Le titre absent est rejeté : le schema M2 exige un titre non vide et M5-R2B n’en invente pas.

## URL, DNS et transport

- **DÉCISION** — URL initiale : citation fournisseur obligatoire ; HTTPS ; port 443 ; hostname DNS public ; aucun credential, IP littérale, nom local/interne, suffixe réservé, fragment, paramètre signé ou secret.
- **DÉCISION** — `utm_*`, `gclid` et `fbclid` sont retirés avant comparaison, récupération et persistance. Tous les autres paramètres non secrets et leur ordre sont conservés. Le nombre retiré est mesuré ; aucune autre transformation de requête n’est tentée.
- **DÉCISION** — Toutes les réponses DNS sont classées. Une seule adresse interdite rejette la source. L’adresse publique choisie est déterministe, puis injectée dans `lookup`; hostname, Host et TLS `servername` restent ceux de l’URL.
- **DÉCISION** — Transport Node public `node:https` : TLS normal, aucun module interne, redirections manuelles, deux maximum, trois requêtes HTTPS maximum, revalidation complète à chaque cible, aucun retry.
- **DÉCISION** — Timeout source total 20 s ; 512 KiB lus maximum ; arrêt au dépassement ; `Accept-Encoding: identity` ; aucun Cookie, Authorization ou Referer ; User-Agent `GENIAL-SourceVerifier/1.0`.
- **DÉCISION** — Types acceptés : HTML, XHTML et texte brut. Charset absent signifie UTF-8 ; seuls UTF-8/UTF8 et US-ASCII sont acceptés. Tout autre type, charset, statut non réussi, corps vide ou dépassement échoue fermé.
- **LIMITE** — Le pinning réduit les risques de DNS rebinding et de résolution implicite ; il ne prétend pas supprimer tout risque SSRF, notamment les changements réseau hors du contrôle du processus.

## Extraction, extrait et locator

- **FAIT VALIDÉ** — HTML/XHTML construit par l’import public `parse5`, puis parcouru depuis `body`. Entités décodées ; limites de blocs déterministes.
- **DÉCISION** — `head`, script, style, noscript, template, `hidden`, `aria-hidden=true`, input hidden et trois déclarations inline directement cachées sont exclus.
- **DÉCISION** — Le style inline est seulement découpé en déclarations ; aucune interprétation CSS n’est revendiquée.
- **DÉCISION** — Normalisation commune : NFKC, espaces Unicode cohérents, suites réduites, blocs nettoyés, ponctuation et ordre conservés.
- **LIMITE** — parse5 ne calcule ni CSS externe, layout, JavaScript, shadow DOM, accessibilité complète ni visibilité réelle de navigateur.
- **DÉCISION** — Extrait normalisé : 1–500 caractères. Prefix/suffix candidats : 16 caractères maximum. Zéro occurrence échoue ; plusieurs occurrences exigent les deux contextes exacts et une occurrence unique.
- **DÉCISION** — Le locator contient exact, prefix, suffix, index d’occurrence, URL finale, URL de citation sûre, timestamp injecté, SHA-256 du texte visible, Content-Type, octets et redirections. Aucun corps complet n’en sort.

## Intégration M2 et production

- **FAIT VALIDÉ** — Chemin câblé : `accepted → searching → source_verifying → validating → completed`, sinon un seul `failed` terminal.
- **DÉCISION** — Le dossier M2 n’est construit qu’après citation liée, URL concordante, DNS public, récupération, extraction, correspondance exacte et locator.
- **FAIT VALIDÉ** — `evidence.excerpt` reçoit exclusivement l’extrait vérifié ; `evidence.locator` conserve le locator sérialisé sans modifier le schema.
- **DÉCISION** — La page complète reste locale à la pile de validation en mémoire. Logs, reçus et SSE n’exposent que dossier validé, extrait borné, locator et métriques allowlistées.
- **DÉCISION** — Les 14 catégories R1 restent inchangées ; 17 codes source distincts sont portés par `publicCode` avec reçu expurgé.
- **INFÉRENCE** — Citation couvrante + extrait authentique retrouvé établissent provenance et présence exacte. Elles ne constituent pas une preuve automatique indépendante de l’entaillement sémantique ; l’audit live humain reste requis.

## Validation

- **VALIDATION SYNTHÉTIQUE** — 80 contrôles numérotés couvrent métadonnées 10, URL/DNS 15, transport 18, parsing 11, extrait/locator 10 et pipeline 16.
- **VALIDATION SYNTHÉTIQUE** — Fixtures et doubles uniquement ; garde globale de `fetch`, compteurs DNS Node et HTTPS Node à zéro.
- **FAIT VALIDÉ** — Suite complète : 118/118 tests, 5 fichiers ; lint, typecheck strict, build sans clé et bundle client verts.
- **FAIT VALIDÉ** — Installation figée hors ligne, M0, M2, M3, M4 sur preuves, M5/R1, M5-R2A, M5-R2B, vérificateur cumulatif et tests négatifs verts.
- **FAIT VALIDÉ** — Scans WorkingTree, Staged et Tracked verts ; aucune invocation Node DNS/HTTPS réelle dans les tests ; aucun accès réseau observé.
- **FAIT VALIDÉ** — État final : HEAD inchangé, aucun remote, index vide, 20 fichiers suivis modifiés, 30 non suivis ; diff suivi `a04688294f050e7a8b84d3e640507ea625da32e3da90414495e7414f3f3f8461`.
- **FAIT VALIDÉ** — État final détaillé dans `m5-r2b-offline-source-pipeline-result.json`.
- **VALIDATION RÉELLE ABSENTE** — Aucun appel fournisseur, DNS public, téléchargement de page, navigateur, déploiement, WAF ou environnement n’a été observé.
