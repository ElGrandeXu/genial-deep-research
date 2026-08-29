# Diagnostic assaini — hotfix de rappel

Date : 28 août 2026

## Baseline observée

- GitHub `main` et `release/premium-polish` : `3df92c233ff40dcd2ccd165305568cd3d8d7d818`.
- Production : `dpl_4AaBdE1cQhuocuGnaiDDAaYKqJpz`, runtime `f53b7aed0d25e45aed26dfe96a0ed8c271365218`.
- Le runtime était un ancêtre direct de cinq commits et le diff applicatif avec `main` était vide.
- Worktree et index initiaux propres.

## Reproduction contrôlée avant correction

Entrée publique : `Personne` — `Erwan Simon` — contexte `Bordeaux, IA, Cibler`.

Le diagnostic Preview a terminé en 14 376 ms avec `identity=not_found_within_scope`, zéro fait, zéro source, quatre preuves annoncées comme écartées et un coût estimé de `0,02476142 USD`. Un appel fournisseur, une recherche Web et une inspection Web ont été comptés ; quatre pages ont été récupérées et six extraits contrôlés.

| Objet proposé | URL | Contrôle serveur | Résultat |
|---|---|---|---|
| identité | `https://www.tourismelab.fr/partenaire/cibler/` | récupération directe | `source_http_error` : HTTP 403 |
| rôle | même page | échec de récupération mémorisé | rejet |
| géographie | même page | échec de récupération mémorisé | rejet |
| activité | `https://erwansimon.ai/` | correspondance de l’extrait | `source_excerpt_missing` |
| rôle | `https://www.wearegenial.com/a-propos` | extrait retrouvé | vérifié |
| activité | `https://www.francenum.gouv.fr/activateurs/genial` | extrait retrouvé | vérifié |

La vérification concurrente préservait bien les deux faits valides. Le dossier devenait néanmoins vide parce que la résolution d’identité ne consommait que la preuve dédiée du candidat. Son échec rendait l’identité absente, puis empêchait l’attribution et l’affichage des faits déjà vérifiés. Une seconde frontière réduisait le rappel : la recherche d’extrait ne tolérait que quelques signes typographiques et rejetait les différences de blocs HTML, d’espaces et de casse observées sur une page Webflow.

Deux appels fournisseur ont été consommés avant correction : une tentative Production dont le corps terminal n’a pas pu être capturé par le navigateur, puis cette reproduction instrumentée. Aucun appel n’a été parallélisé.

## Vérification directe des pages après correction

Les composants de transport du runtime, exécutés localement avec leurs contrôles DNS/anti-SSRF, l’extraction HTML et le nouveau localisateur, ont relu séquentiellement trois pages publiques sans fournisseur. Chaque extrait mécanique a été remappé vers une tranche source exacte et unique.

| URL | Mode | Octets | Redirections | SHA-256 de la tranche exacte |
|---|---|---:|---:|---|
| `https://www.wearegenial.com/a-propos` | `mechanical_equivalence` | 138 204 | 0 | `ec7de22a7a233b761f78f27870bf25dc37c6ec66a1d74b4bd11601e4ad6b7620` |
| `https://erwansimon.ai/` | `mechanical_equivalence` | 30 139 | 0 | `23228a7df0c6e4609095770ee9019725a942c774a8c3600287d2432c3c79a306` |
| `https://www.francenum.gouv.fr/activateurs/genial` | `mechanical_equivalence` | 68 125 | 0 | `4e980d2e25aa8fb5e463c95805e0138f54adfc86a2f5acd790452c04129bce94` |

Les fichiers temporaires de diagnostic et l’instrumentation ont été retirés. Aucun secret, corps fournisseur, prompt, valeur de clé ou dossier brut n’est conservé.
