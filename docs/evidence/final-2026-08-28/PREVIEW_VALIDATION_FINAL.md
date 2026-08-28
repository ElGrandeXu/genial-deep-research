# Preview — historique et finition premium

La première partie décrit le déploiement antérieur à la finition premium. Les observations restent historiques et ne sont pas réécrites ; la nouvelle Preview est enregistrée ensuite.

Date : 2026-08-28  
Commit déployé : `8e91ed0c66765d5cab3bb8a8364cea04eaeda2af`  
Deployment ID : `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`  
URL : <https://genial-deep-research-2vqm7di0u-el-grande-xue.vercel.app>

## Provenance du paquet

Le déploiement a été créé depuis un worktree détaché propre au commit ci-dessus. Le manifeste `vercel deploy --dry --json` contient `60` fichiers pour `7 317 065` octets et aucun document de pilotage, audit local, résultat de test ou fichier d’environnement.

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

## Preview premium

Date : 2026-08-28

Commit et runtime : `f53b7aed0d25e45aed26dfe96a0ed8c271365218`

Tree : `219d288b238715c8e734359c03f534d26dc72eba`

Deployment ID : `dpl_GE1Zk1cvuyYmRBuYEF4ufbFEAy4V`

URL : <https://genial-deep-research-q7gi9huqu-el-grande-xue.vercel.app>

État : `READY`, contexte `preview`

Métadonnées observées par l’API Vercel, sans secret :

```text
gitCommitSha=f53b7aed0d25e45aed26dfe96a0ed8c271365218
gitCommitRef=release/premium-polish
runtimeCommit=f53b7aed0d25e45aed26dfe96a0ed8c271365218
releaseGate=mission-final-premium
actor=codex
```

Le dry-run officiel précédent et le build distant portent le même contexte : Next.js, 40 fichiers réguliers, 651 575 octets ; 44 entrées Vercel avec les quatre répertoires. Le build distant a téléchargé 44 entrées, installé pnpm 11.24.0 et terminé les sept pages sans erreur.

Validation HTTP distante :

```text
{"base_url":"https://genial-deep-research-q7gi9huqu-el-grande-xue.vercel.app","root_status":200,"health_status":200,"research_get_status":405,"guard_cases":5,"disclosure_paths":8,"assets_checked":10,"root_latency_ms":538.23,"health_latency_ms":454.35}
RELEASE_DEPLOYMENT_VERIFY_OK: public, guarded, non-disclosing, bundle clean
```

Les cinq POST sont arrêtés par les gardes applicatives avant fournisseur : `403`, `415`, `400`, `400`, `413`. Les onze parcours Playwright distants passent en 13,1 s avec interception de `/api/research`, dont CONFLIT desktop/mobile, 390/768/1 440 px, clavier, mouvement réduit, erreur et annulation. Aucun appel fournisseur ; coût `0 USD`.

Les visites d’accueil 1 440 et 390 px répondent `200`, sans overflow. La Preview injecte un script de feedback `vercel.live` que la CSP applicative bloque ; c’est l’unique erreur console/requête observée, extérieure au bundle et absente en Production. La CSP n’a pas été relâchée.

Métadonnées d’environnement : `OPENAI_API_KEY`, type `Sensitive`, portée Preview, valeur `Hidden` ; aucune variable Gemini ni fournisseur `NEXT_PUBLIC_*`. Le WAF observé reste activé sur `/api/research`, 8 requêtes / 600 s / IP, sans brouillon ni mutation.

Verdict Preview premium : **PASS — autorisée à la promotion exacte**.
