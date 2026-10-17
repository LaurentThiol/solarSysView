# Journal de suivi

À la fin d’une tâche qui ouvre une pull request, dépose un brouillon dans le journal des modifications (Système / Journal), sauf si la PR ne change rien de visible.

## Quand écrire une fiche

Écris une fiche si le comportement visible change (écran, calcul, menu, aide).

N’écris pas de fiche pour un bump de dépendances, un formatage, ou un commit qui ne touche que le journal. Dans le corps de la PR, écris alors exactement :

```
Journal : inchangé
```

## Comment l’écrire

En session interactive, montre le brouillon et attends la confirmation avant de créer le fichier.

Le numéro de PR n’existe pas encore au moment du commit. Nomme le fichier d’après la branche :

`docs/journal/inbox/<slug-de-branche>.json`

`<slug-de-branche>` est la branche en minuscules, sans le préfixe `cursor/`, avec des tirets à la place des caractères hors `a-z`, `0-9`. N’écrase pas un fichier déjà présent pour cette branche.

Exemple :

```json
{
  "slug": "journal-suivi",
  "happened_on": "2026-10-17",
  "area": "Évolution",
  "title": "Annuel : segments verts",
  "body": "Trois à six phrases : ce qui change pour qui lit l’écran, et ce qui reste identique.",
  "pr_number": null,
  "pr_url": null
}
```

Champs requis : `slug`, `happened_on` (AAAA-MM-JJ), `area` (le libellé du menu, ou Socle), `title`, `body`. `pr_number` et `pr_url` restent vides tant que la PR n’est pas ouverte. Si tu connais l’URL ensuite, complète ce même fichier. `prs` est facultatif ; chaque point a `number`, `title`, `merged_on` et `url`. Un point sans date est refusé.

Dans le corps de la PR, recopie le brouillon sous le titre `Journal`.

La page lit Neon. `./launch` importe les fichiers une fois : un slug déjà présent n’est pas réécrit, pour garder les corrections faites dans l’interface.

## Commentaire automatique

[`.github/workflows/journal.yml`](.github/workflows/journal.yml) commente un brouillon une seule fois, à l’ouverture, à la remise en revue, ou à une poussée. Ça inclut une PR encore en draft. Le commentaire porte la marque `synchro-journal-draft`. S’il est déjà là, l’action s’arrête.

Elle ne commente pas non plus quand le corps contient déjà `Journal : inchangé`, une section Journal rédigée (plus que le modèle vide), ou un fichier `docs/journal/inbox/<slug>.json`. Dependabot est ignoré. Un diff limité aux tests, au formatage, aux dépendances ou au journal seul reçoit `Journal : inchangé`.

Le déclencheur Cursor « Pull request opened » ne voit pas une PR en draft : cet événement est « Draft opened ». Un réglage qui n’a que « Pull request opened » reste donc muet sur les PR des agents, et une poussée sur une PR déjà ouverte ne le réveille pas. L’action du dépôt couvre ces deux cas. Ne pas ajouter en plus une automation Cursor sur le même dépôt : elle commenterait en double. Si elle existe déjà, la désactiver.
