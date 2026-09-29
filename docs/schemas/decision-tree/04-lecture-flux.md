# Lecture — flux

- Module : `/brain/decision-tree`
- Niveau : flux
- Révision : 1
- Code : `synchro/decision_tree/reading.py`, `jobs.py`, `src/lib/brain/decision-tree.ts`

`read_flux` est la fonction. Elle ne s’arrête pas à l’arbre ajusté : le rapport n’existe qu’après le nul, le dessin et l’enregistrement. Le détail du tableau est dans [Tableau](05-tableau-flux.md). Le détail d’un ajustement est dans [Recherche](06-recherche-flux.md). La sortie est dans [Sortie](07-sortie-flux.md).

```mermaid
sequenceDiagram
  actor Chercheur
  participant Labo
  participant Proxy as Proxy Next
  participant API as API Python
  participant Job
  participant Lecture as read_flux

  Chercheur->>Labo: Lire le flux
  Labo->>Proxy: POST question, ère, jour
  Proxy->>API: Propage le corps
  API->>Job: start_job
  alt une lecture tourne déjà
    Job-->>Labo: 409
  else libre
    Job-->>Labo: id, étape tableau
    Job->>Lecture: thread
    loop toutes les 700 ms
      Labo->>API: GET jobs/id
      API-->>Labo: étape, k sur N
    end
    Lecture-->>Job: rapport
    Job-->>Labo: fait, résultat
  end
```

Échap ou **Annuler** envoie DELETE. Le thread lit le drapeau à chaque étape. Le statut devient annulé. Rien n’est écrit sous `.brain/decision-tree/`.

```mermaid
flowchart TD
  entree["read_flux<br/>tirages déjà filtrés"] --> tickTableau["étape tableau"]
  tickTableau --> flux{"shape ou series"}
  flux -->|oui| modesFlux["coupe et fenêtres<br/>learned ou fixed"]
  flux -->|boules ou figures| modesFixes["coupe et fenêtres<br/>forcées à fixed"]
  modesFlux --> build
  modesFixes --> build
  build["tableau<br/>build_question"] --> critere{"critère"}
  critere -->|gini ou entropie| un["ce critère seul"]
  critere -->|non précisé| deux["gini et entropie"]
  un --> nPerm
  deux --> nPerm
  nPerm{"N"} -->|boules, vide| n49["49"]
  nPerm -->|autre, vide| n99["99"]
  nPerm -->|donné| nDonne["N demandé"]
  n49 --> preuve
  n99 --> preuve
  nDonne --> preuve
  preuve["prove<br/>recherche puis remaniements"] --> colonnes{"fenêtres apprises"}
  colonnes -->|oui| restreint["noms et dernier état<br/>restreints aux colonnes gardées"]
  colonnes -->|non| complet["toutes les colonnes du tableau"]
  restreint --> feuilles
  complet --> feuilles
  feuilles["export_rules<br/>dump_tree"] --> phrase["phrase, coupe, fenêtres"]
  phrase --> tickDessin["étape dessin"]
  tickDessin --> slug["slug horodaté<br/>dossier créé"]
  slug --> dessin["render_trees"]
  dessin --> porte{"p au plus 0,05"}
  porte -->|oui| reconnu["verdict flux"]
  porte -->|non| aucun["verdict aucun"]
  reconnu --> cas
  aucun --> cas
  cas["scores boules<br/>cas du dernier état"] --> rapport["brouillons<br/>règles chartistes<br/>suggestions"]
  rapport --> sauve["save_reading"]
  sauve --> rendu["rapport renvoyé<br/>étape fait"]
```

Les quatre étapes réelles de la barre sont `tableau`, `recherche`, `remaniements` (k/N), `dessin`. `recherche` et `remaniements` sont émises par `prove`. Le contrôle ne choisit ni la fenêtre, ni la coupe, ni la profondeur, ni le critère.

Graine 0 par défaut. Le nul tire avec la graine plus un. L’ère et le jour sont recopiés sur le rapport. Ils ne réentrent pas dans l’arbre.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Flux de `read_flux`, de la tâche au rapport sauvé. |
