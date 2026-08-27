# Validation WAF Vercel

Date d’activation : 2026-08-28 00:39:32 CEST

Projet : `prj_WhQhuNflBd3Ot33gZBqAYud1Yns9`

Configuration active : `waf_N4JEwHRCDYRS`, version `1`

Règle : `rule_research_api_8_req_10_min_ip_Hlc4Sd`

## Configuration active

```json
{
  "name": "Research API — 8 req / 10 min / IP",
  "active": true,
  "condition": { "type": "path", "op": "eq", "value": "/api/research" },
  "action": "rate_limit",
  "rateLimit": {
    "algo": "fixed_window",
    "window": 600,
    "limit": 8,
    "keys": ["ip"],
    "action": "deny"
  }
}
```

La règle est attachée au projet, donc commune aux domaines Preview et Production. Elle matche le chemin exact indépendamment de la méthode HTTP. Elle complète la garde mémoire par instance et la limite de concurrence applicative.

## Déclenchement sans coût fournisseur

Neuf `POST /api/research` invalides, `Content-Type: text/plain`, ont été envoyés depuis la même IP :

| Requête | Statut | Traitement observable |
|---:|---:|---|
| 1–8 | `415` | rejet applicatif `content_type_required`, `Cache-Control: no-store` |
| 9 | `403` | blocage edge, `X-Vercel-Mitigated: deny`, corps `Forbidden` |

Les huit premières requêtes sont rejetées pendant le parsing HTTP, avant création du fournisseur. La neuvième est arrêtée par le WAF avant la fonction. Elles ne déclenchent donc aucun appel OpenAI.

## Portée et limite

- Protection distribuée par IP sur l’ensemble du projet.
- Fenêtre fixe : le compteur ne lisse pas les rafales à la frontière de deux fenêtres.
- L’action `deny` produit ici `403`, pas `429`, et aucun `Retry-After` ; l’interface ne doit donc pas dépendre d’un code spécifique du WAF.
- Une IP partagée peut limiter plusieurs utilisateurs légitimes.
- La règle ne constitue ni authentification, ni quota par compte, ni contrôle de budget fournisseur.

Références officielles : [configuration des règles WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration), [ajout d’une limite de débit](https://vercel.com/kb/guide/add-rate-limiting-vercel), [disponibilité Hobby](https://vercel.com/changelog/rate-limiting-now-available-on-hobby-with-higher-included-usage-on-pro).
