# Consignes

Écris en français clair : phrases courtes, mots courants, une idée à la fois.

Ajoute un schéma quand il rend une idée plus lisible (flux, écran, dépendances). Mermaid suffit pour un enchaînement ou un arbre.

Quand tu ne sais pas, dis-le, ou pose la question.

# Journal de suivi

À la fin d’une tâche qui ouvre une pull request, dépose un brouillon dans le journal des modifications (Système / Journal), sauf si la PR ne change rien de visible.

## Quand écrire une fiche

Écris une fiche si le comportement visible change (écran, calcul, menu, aide).

N’écris pas de fiche pour un bump de dépendances, un formatage, ou un commit qui ne touche que le journal. Dans le corps de la PR, écris alors exactement :

```
Journal : inchangé
```

## Comment l’écrire

Écris le fichier dans le même changement que la PR, sans attendre une confirmation. La page Journal sert à corriger le texte ensuite.

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

## Ce qui part tout seul

Le déclencheur du tableau de bord Cursor « Pull request opened » ne voit pas une PR en draft : cet événement est « Draft opened ». Un réglage qui n’a que « Pull request opened » reste muet sur les PR des agents, et une poussée sur une PR déjà ouverte ne le réveille pas. Aucune automation de ce dépôt n’a tourné. Ce déclencheur ne remplit pas le journal.

Deux chemins le font, sans ce tableau de bord :

1. L’agent lit ce fichier et dépose `docs/journal/inbox/<slug>.json` avant d’ouvrir la PR.
2. [`.github/workflows/journal.yml`](.github/workflows/journal.yml) part à l’ouverture, à la remise en revue et à chaque poussée, y compris sur un draft. Si le fichier d’inbox manque, elle le commit sur la branche. Elle commente une seule fois, avec la marque `synchro-journal-draft`.

Elle ne commente pas quand cette marque est déjà là, quand le corps contient `Journal : inchangé`, une section Journal rédigée (plus que le modèle vide), ou quand le fichier d’inbox existe. Elle ne crée pas de fiche dans ces cas non plus, sauf le fichier manquant alors que la section est déjà rédigée : le fichier part, le commentaire non. Dependabot est ignoré. Un diff limité aux tests, au formatage, aux dépendances ou au journal seul reçoit `Journal : inchangé`.

Ne pas ajouter une automation Cursor en plus : elle commenterait en double. Si elle existe et ne réagit qu’à « Pull request opened », elle ne voit pas les drafts.
