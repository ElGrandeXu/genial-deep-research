# Dépôt public et clean-start

Date : 2026-08-28

Remote : <https://github.com/ElGrandeXu/genial-deep-research>

## Accès public

Le contrôle sans authentification retourne :

```json
{"full_name":"ElGrandeXu/genial-deep-research","private":false,"visibility":"public","default_branch":"main","html_url":"https://github.com/ElGrandeXu/genial-deep-research"}
```

`git -c credential.helper= ls-remote` accède au dépôt sans jeton. Les branches `main` et `fix/audit-01-truth-gates` doivent résoudre vers le même commit final ; la branche locale conservée reste `fix/audit-01-truth-gates`.

## Échec conservé

Premier clone anonyme : installation figée réussie, puis `corepack pnpm verify` rouge avant les suites :

```text
verify-foundation.ps1:63
You cannot call a method on a null-valued expression.
```

Cause générique : `core.hooksPath` est une configuration Git locale et ne voyage pas avec un clone. Le README ne réactivait pas les hooks versionnés avant le gate.

## Correction documentaire

Le clean-start documente désormais, avant l’installation :

```powershell
git config core.hooksPath .githooks
```

Aucune logique applicative ni aucun vérificateur n’a été relâché. Après activation explicite des hooks, le clone propre passe :

```text
SOURCE_INTEGRITY_OK: 3 files
Tests: 478 passed
Playwright: 8 passed
Lighthouse desktop: 100 / 100 / 100 / 100
Lighthouse mobile: 99 / 100 / 100 / 100
No known vulnerabilities found
PROJECT_VERIFY_OK: build=True dependency_audit=True
```

La validation finale rejoue la séquence complète du README sur `main` depuis un nouveau répertoire temporaire, sans clé fournisseur.
