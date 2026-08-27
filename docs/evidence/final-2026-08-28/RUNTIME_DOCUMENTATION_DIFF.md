# Frontière runtime / documentation finale

Runtime promu : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`

Preview source : `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`

Production issue de la promotion : `dpl_147u62uYJuUU8x7hmioCsME3MJRF`

Le commit final est créé après la promotion. Sa différence avec le runtime doit rester limitée à :

```text
README.md
docs/**
```

Contrôle terminal :

```powershell
$runtime = '8e91ed0c66765d5cab3bb8a8364cea04eaeda2af'
$unexpected = git diff --name-only "$runtime..HEAD" |
  Where-Object { $_ -ne 'README.md' -and $_ -notlike 'docs/*' }
if ($unexpected) { throw "Application diff detected: $unexpected" }
git diff --stat "$runtime..HEAD"
```

Attendu : aucun changement dans `src/`, `tests/`, `tools/`, les contrats runtime, `package.json`, le lockfile ou la configuration applicative.
