# Épreuve technique — Un moteur de recherche approfondie sur les personnes et les entreprises

À partir d'un nom, votre application produit un dossier lisible et sourcé sur une personne ou une entreprise. Le sujet est ouvert. Ce qui nous intéresse n'est pas que vous branchiez une API de recherche, c'est la façon dont vous traitez ce qui rend l'exercice difficile.

| | |
|---|---|
| **Durée** | Une semaine |
| **Technologies** | Libres |
| **Modèles** | Clés fournies |
| **Restitution** | App en ligne, code, note |

---

## 01. Le contexte

### Le problème que ça résout

Avant un premier contact, un commercial passe une demi-journée à comprendre une entreprise qu'il ne connaît pas et à qualifier la personne qu'il va appeler. Il ouvre quinze onglets, recoupe des chiffres qui ne concordent pas, tombe sur un homonyme, et finit avec une fiche qu'il ne peut pas défendre parce qu'il ne sait plus d'où vient quoi.

L'automatisation naïve de cette tâche donne un résultat pire que le travail manuel : un texte fluide, plausible, truffé de chiffres inventés, invérifiable. Un utilisateur contredit une fois en rendez-vous n'ouvre plus jamais l'outil. C'est ce piège que l'exercice met au centre.

---

## 02. Le sujet

### Ce que vous construisez

Une application web qui part d'un nom de personne ou d'entreprise, éventuellement accompagné d'un élément de contexte comme une ville, un secteur ou un employeur, et qui rend un résultat exploitable appuyé sur des sources.

**La forme est la vôtre** : un champ de recherche qui rend une fiche, une conversation où l'on affine et l'on creuse, un tableau de bord, autre chose encore. Le contenu du résultat aussi. Nous n'imposons ni rubriques ni gabarit : choisir ce qu'un utilisateur a besoin de lire, sous quelle forme et dans quel ordre, fait partie de l'exercice. Défendez votre choix dans la note.

**Trois exigences**

- **Traçabilité.** Toute affirmation factuelle est rattachable à sa source, et ce lien survit jusqu'à l'écran.
- **Interface.** Une recherche prend des dizaines de secondes. L'attente et le résultat doivent être un vrai travail de conception, pas un écran de secours.
- **En ligne.** L'application est déployée et accessible par une URL. Si vous n'y arrivez pas, dites pourquoi.

**Laissé libre**

- Langage, framework, hébergement, base de données.
- Fournisseurs de recherche et stratégie de collecte.
- Forme de l'application, structure du résultat, parti pris d'interface.
- Périmètre : trois choses solides valent mieux que dix esquissées.

---

## 03. Le jeu d'épreuve

### Six cas qui cassent les maquettes

Six situations tirées de problèmes réels de production. **Nous n'attendons pas que votre application les couvre toutes**, et une semaine ne suffit pas pour cela. Nous attendons qu'elle sache reconnaître qu'elle est en difficulté et le dise, plutôt que de produire une fiche confiante et fausse. Traitez ceux que vous jugez les plus importants, et dites lesquels vous laissez de côté.

**HOMONYME — Deux personnes, un seul nom**
Les sources mélangent deux biographies. Demandez-vous une précision, produisez-vous deux fiches, ou fusionnez-vous silencieusement deux vies en une ?

**MARQUE — L'entreprise porte le nom d'un mot courant**
Une PME s'appelle comme un produit grand public ou une ville. Les premiers résultats n'ont rien à voir avec elle.

**FILIALE — La filiale française d'un groupe international**
On demande l'entité française, le web renvoie les chiffres consolidés du groupe. C'est le cas où une réponse fausse est la plus convaincante.

**CONFLIT — Deux sources, deux chiffres d'affaires**
Trancher, présenter les deux, hiérarchiser par type de source : toutes ces réponses se défendent. Ne pas détecter la contradiction ne se défend pas.

**SILENCE — La personne n'a aucune présence en ligne**
Fiche vide et assumée, ou trous comblés avec du plausible ? Le cas le plus discriminant de l'épreuve.

**PÉREMPTION — L'information la mieux référencée est périmée**
Le dirigeant en tête de résultats est parti il y a deux ans. Dater une affirmation plutôt que la donner pour un état présent.

---

## 04. Cadre

### Moyens et limites

**Ce que nous fournissons**

Une clé Gemini et une clé OpenAI plafonnée, pour la durée de l'exercice. Tout autre fournisseur reste possible, à votre charge. Dites-nous ce que coûte une fiche.

**Hors périmètre**

- Comptes, authentification, multi-utilisateur.
- Performance à grande échelle. Une fiche à la fois suffit.
- Couverture de tests, sauf là où elle protège quelque chose de fragile.

**Ce qui n'est pas acceptable**

- Une donnée affirmée sans source rattachable.
- Un jeu de résultats figé, préparé à l'avance pour la démonstration.
- Une collecte qui contourne délibérément les conditions d'utilisation d'un service.
- Des données personnelles conservées au delà de ce que l'exercice exige.

---

## 05. Restitution

### Ce que vous nous remettez

1. **L'URL de l'application déployée.** Et de quoi la relancer nous-mêmes : un README qui suffit à démarrer sans vous.
2. **Le code, dans un dépôt git avec son historique.** Les commits intermédiaires nous intéressent autant que l'état final.
3. **Une note d'arbitrage, deux à quatre pages.** Vos décisions, ce que vous avez laissé de côté, où votre système se casse, ce que vous feriez avec un mois de plus. Cette note pèse autant que le code.
4. **Vos résultats sur les cas d'épreuve traités.** Sous la forme qui vous convient, captures comprises. Un cas écarté franchement ne vous pénalise pas.

Nous en discutons ensuite pendant une heure.

---

Les questions sur l'énoncé sont bienvenues et ne comptent pas contre vous. Poser la bonne question sur un sujet ambigu fait partie de l'exercice.
