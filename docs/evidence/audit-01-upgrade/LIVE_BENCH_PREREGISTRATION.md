# Bench live final — préenregistrement

Gel : 2026-08-28  
Runtime candidat : `041dbd125498d448062275860a8bb8a71d65317d`  
Preview candidate : `dpl_313tpsu8ngv5GveqmrhPh5YTCrzm`

Ce document fige l'ordre, les entrées et les critères avant tout appel payant. Aucun appel n'est autorisé tant que le budget fournisseur restant n'est pas confirmé. La borne finale sera `min(budget confirmé, 0,12 USD)`, avec arrêt immédiat si un dossier atteint `0,10 USD` ou si le budget résiduel ne couvre plus l'appel suivant.

| Priorité | Cas | Entrée exacte | Décision attendue |
|---:|---|---|---|
| 1 | GENIAL | `company` · `GENIAL` · `Agence IA générative, Bordeaux, site officiel wearegenial.com` | Identité et contexte prouvés ; 3–6 faits uniques et autonomes ; zéro doublon ; `partial` si une seule famille d'éditeur. |
| 2 | HOMONYME | `person` · `Thomas Martin` · contexte vide | Aucun fait certain ; candidats séparés ou demande de contexte. |
| 3 | Relance | `person` · `Thomas Henri Martin` · `Historien helléniste français, né en 1813 et mort en 1884` | Un sujet unique si la preuve suffit, sinon clarification honnête ; jamais de faits croisés. |
| 4 | FILIALE | `company` · `Airbus SAS` · `Filiale française basée à Toulouse, distincte du groupe Airbus SE` | Portée filiale explicite ; aucune métrique groupe attribuée à Airbus SAS. |
| 5 | PÉREMPTION | `person` · `Sam Altman` · `OpenAI ; vérifier séparément la nomination historique et le rôle actuel` | Une ancienne nomination ne suffit jamais à produire `current`; revendication abandonnée si aucun rôle actuel explicite n'est directement prouvé. |
| 6 | SILENCE | `company` · `Société Azur Pamplemousse 9137` · `Nom fourni sans pays, ville ni site officiel` | Zéro fait/source et silence borné, distinct d'une panne. |
| 7 | Holdout figé | voir `HOLDOUT_PREREGISTRATION.md` | Aucun patch nominal après résultat ; diagnostic générique ou limite déclarée. |

Règles d'exécution : un appel à la fois ; conservation de chaque reçu, sortie terminale, coût, durée et échec ; aucun rerun destiné à sélectionner la meilleure sortie ; priorité à GENIAL, HOMONYME et FILIALE si le budget coupe la matrice. Les scénarios déterministes restent la preuve des invariants ; le live ne sert que de canari du système complet.

