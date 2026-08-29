# Arbitrage du hotfix rappel/traçabilité

Date : 28 août 2026

Cette note amende, pour le runtime courant, les sections 2 et 3 de la note d’arbitrage initiale. Les formulations antérieures imposant toujours un extrait littéral et une preuve d’identité dédiée restent des preuves historiques de la baseline, mais ne décrivent plus le comportement livré.

## Problème de classe

Deux faux négatifs pouvaient vider un dossier pourtant partiellement prouvable : une page dédiée à l’identité pouvait être inaccessible au serveur alors que plusieurs faits du même candidat étaient directement vérifiés ailleurs ; un extrait pouvait aussi être rejeté pour de seules différences de casse, d’espaces, de blocs HTML ou de typographie.

Le silence reste obligatoire quand aucune preuve attribuable ne survit. Il n’est pas légitime lorsque des pages consultables contiennent réellement le nom, le contexte et le fait, mais qu’une contrainte mécanique plus stricte que le contrat les élimine.

## Décision

1. La recherche d’extrait reste littérale en premier choix. Une seconde passe n’accepte qu’une projection mécanique définie et une occurrence unique. Le texte publié dans le dossier est toujours la tranche exacte relue dans la page.
2. Une preuve d’identité dédiée inaccessible ou insuffisante pour établir le contexte n’annule plus automatiquement les faits vérifiés d’une personne. Le candidat doit néanmoins avoir été proposé ; le nom demandé doit être exactement son nom complet ; clé sujet, type et portée doivent converger ; chaque fait doit déjà satisfaire attribution et qualité ; chaque extrait doit contenir le nom complet ; deux familles d’éditeurs, deux empreintes documentaires et deux empreintes lexicales d’extraits distinctes sont exigées. Un même indice significatif du contexte doit être explicitement relié au sujet dans au moins deux preuves indépendantes. Il faut en plus soit un second indice significatif distinct relié au sujet dans l’une de ces mêmes preuves, soit une troisième preuve de rôle explicite et indépendante qui partage avec une preuve contextuelle un unique ancrage d’organisation : mêmes termes distinctifs dans les deux titres réellement lus et dans les deux URL finales. Le texte global de page, un titre générique ou une URL seule ne suffit pas. Les preuves principale et corroborantes sont toutes reliées à l’affirmation d’identité ; seuls les faits ayant constitué cet ensemble de résolution peuvent être affichés dans cette voie. Cette voie ne s’applique pas aux entreprises.
3. Un rôle compact de type « nom + fonction » n’est admis que sur une page d’équipe, de direction ou de gouvernance qualifiée, pour la personne et la portée exactes, avec une fonction appartenant à une liste fermée.
4. Une preuve rejetée reste comptée et visible comme manque, sans supprimer les preuves valides indépendantes.

## Invariants maintenus

- aucun candidat créé à partir de faits seuls ;
- aucune résolution sur le seul nom ;
- homonymes compatibles conservés comme ambigus ou insuffisamment attribués ;
- URL non reliée, page inaccessible, extrait absent, contradictoire ou paraphrasé toujours rejeté ;
- aucun snippet de moteur utilisé comme preuve finale ;
- aucun fait sans `Claim → Evidence → Source` affiché ou résumé ;
- anti-SSRF, WAF, concurrence, coût, absence de persistance et fournisseur inchangés.

## Portée

Le correctif est générique : aucune personne, organisation ou domaine n’est privilégié. Il augmente le rappel uniquement quand le contenu exact de pages publiques vérifiées permet encore de reconstruire une chaîne d’attribution complète. Les pages futures peuvent changer ou devenir inaccessibles ; ce risque ne justifie ni une archive implicite ni un assouplissement sémantique.

Preuve de causalité et validation directe des pages : [diagnostic assaini](evidence/hotfix-2026-08-28/DIAGNOSTIC.md).
