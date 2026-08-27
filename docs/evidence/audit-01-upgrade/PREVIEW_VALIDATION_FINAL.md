# Preview finale — validation gratuite

Date : 2026-08-28  
Commit déployé : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`  
Deployment ID : `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`  
URL : <https://genial-deep-research-2vqm7di0u-el-grande-xue.vercel.app>

## Provenance du paquet

Le déploiement a été créé depuis un worktree détaché propre au commit ci-dessus. Le manifeste `vercel deploy --dry --json` contient `60` fichiers pour `7 317 065` octets et aucun des chemins interdits (`AUDIT_01.md`, `PLAN_ACTION_01.md`, `epreuve-deep-research.md`, `test-results/`).

Métadonnées Vercel observées :

```text
gitCommitSha=8e91ed0c66765d5cab3bb8a8364cea04eaeda2af
runtimeCommit=8e91ed0c66765d5cab3bb8a8364cea04eaeda2af
releaseGate=audit-01-final
gitDirty=<absent>
state=READY
target=preview
```

## Vérification HTTP distante

Commande :

```powershell
pwsh -NoProfile -File tools/verify-release-deployment.ps1 `
  -BaseUrl https://genial-deep-research-2vqm7di0u-el-grande-xue.vercel.app
```

Sortie brute :

```text
{"base_url":"https://genial-deep-research-2vqm7di0u-el-grande-xue.vercel.app","root_status":200,"health_status":200,"research_get_status":405,"guard_cases":5,"disclosure_paths":7,"assets_checked":10,"root_latency_ms":530.72,"health_latency_ms":749.81}
RELEASE_DEPLOYMENT_VERIFY_OK: public, guarded, non-disclosing, bundle clean
```

Les cinq gardes testées à distance donnent les statuts attendus : origine étrangère `403`, type MIME incorrect `415`, JSON invalide `400`, champ inconnu `400`, corps trop grand `413`. Les erreurs et la santé portent `no-store`. Les sept chemins de divulgation répondent `404`.

## Parcours navigateur distants

Commande :

```powershell
$env:PLAYWRIGHT_BASE_URL='https://genial-deep-research-2vqm7di0u-el-grande-xue.vercel.app'
corepack pnpm exec playwright test --reporter=line
```

Sortie brute terminale :

```text
Running 8 tests using 1 worker
8 passed (19.7s)
```

Les huit scénarios sont déterministes et interceptent l'API payante : complet, partiel à 390 px, ambiguïté et préremplissage, silence distinct d'une panne, SSE fragmenté, annulation, masque client d'un dossier résolu avec deux candidats et route 404. Cette validation n'a effectué aucun appel OpenAI.

