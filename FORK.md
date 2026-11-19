# Fork `JamesDAdams/dsh-skill-mcp-panel`

Ce fork reprend `Fishquito7/dsh-skill-mcp-panel` et y **intègre** deux plugins qui
vivaient séparément :

| Origine | Ce qui est repris | Emplacement |
| --- | --- | --- |
| `JamesDAdams/dsh-mcp-companion` | serveurs MCP montés par un autre plugin (`wincu`, pont de ressources), interrupteurs persistants, pastilles de tokens sur les pages MCP et Skills, **bouton MCP dans la rangée de la nouvelle conversation** (MCP par conversation), onglets **Tools** et **System prompt**, gestion des agents/presets | `vendor/dsh-mcp-companion/` |
| `JamesDAdams/dsh-token-estimator` | pastille de coût de la prochaine requête dans le compositeur et panneau de détail (system prompt / skills / outils / MCP / messages) | `vendor/dsh-token-estimator/` |

Résultat : **un seul paquet** fournit le panneau Skill/MCP complet, le chip MCP
au-dessus du chat et l'estimation de tokens. Les trois plugins séparés ne sont
plus nécessaires et ne doivent plus être installés en même temps.

## Architecture

DSH monte **un plugin Host par ligne de Loader** et **un module client par
paquet** (`exports["./client"]`, dont l'id doit être le nom du paquet). Les trois
moitiés sont donc composées à l'intérieur du paquet :

```
lib/entry.js          entrée du paquet (package.json "exports"["."]) :
                      monte les trois moitiés Host (panneau, companion, estimator)
lib/client.merged.js  bundle navigateur généré : le client du panneau, puis les
                      deux clients vendorisés démarrés depuis son apply
vendor/…              code des deux plugins d'origine, copié tel quel
scripts/merge-client.mjs  génère lib/client.merged.js après tsc
```

- **Host** : `lib/entry.js` importe `lib/index.js` (panneau),
  `vendor/dsh-mcp-companion/index.js` et `vendor/dsh-token-estimator/index.js`,
  exporte l'union de leurs `inject` et appelle chaque `apply(ctx)` dans l'ordre.
  Une moitié en échec est journalisée sans empêcher les autres de démarrer.
- **Client** : `lib/client.merged.js` est produit à partir de `lib/client.js`
  (sortie de `tsc`) et des deux `vendor/*/client.js`. Leur corps de `factory` est
  extrait, puis un unique plugin est retourné : `inject` = union des trois, et
  `apply(ctx)` appelle le panneau puis les deux décorateurs.
- Aucun `cordis.patch.yml` du profil n'est modifié : le fork reste **un** bundle,
  donc **une** ligne `dsh-skill-mcp-panel`.

## Construire

```sh
pnpm install          # une fois
pnpm run build        # tsc + strip-client-export + merge-client
pnpm pack --pack-destination dist
```

`pnpm run build` régénère `lib/client.merged.js` : ne l'éditez pas à la main.

## Installer

```sh
dsh plugin --profile desktop add file:/chemin/absolu/dist/dsh-skill-mcp-panel-2.4.0.tgz
```

ou, une fois le fork poussé et un Release publié :

```sh
dsh plugin --profile desktop add github:JamesDAdams/dsh-skill-mcp-panel
```

Retirez d'abord les anciens bundles pour éviter un doublon de chip MCP et de
routes Host :

```sh
dsh plugin --profile desktop remove dsh-mcp-companion
dsh plugin --profile desktop remove @local/token-estimator
dsh plugin --profile desktop remove dsh-skill-mcp-panel
```

## Mettre à jour le code vendorisé

Les deux dossiers `vendor/` sont des copies de travail des dépôts d'origine.
Après une modification là-bas :

```sh
cp ../dsh-mcp-companion/{index.js,filter.js,client.js} vendor/dsh-mcp-companion/
cp ../dsh-token-estimator/{index.js,client.js} vendor/dsh-token-estimator/
pnpm run build
```

`test/test-merged-client.mjs` vérifie que le bundle fusionné enregistre bien le
module du paquet, injecte les trois moitiés et enregistre la ligne du panneau,
le chip MCP et la pastille de tokens en un seul `apply`.

## Mise à jour automatique

`src/version.ts` pointe désormais sur **ce fork** (`JamesDAdams/...`) et ne
retombe plus sur le registre npm : le paquet npm `dsh-skill-mcp-panel` est la
version amont, et l'installer remplacerait ce fork en perdant les deux moitiés
intégrées. Le bouton « vérifier les mises à jour » ne proposera donc que les
Releases de ce dépôt.

## Limites connues

- Le companion décore la page du panneau via le DOM (onglets Tools / System
  prompt, pastilles) : il s'appuie sur `[data-tab="skills"|"mcp"]`, `[role="tablist"]`
  et les classes `MCP_card` / `MCP_cards`. Si le panneau change ce contrat, les
  onglets disparaissent sans casser la page.
- Désactiver un serveur MCP masque ses outils, mais n'arrête pas son processus.
- L'estimation de tokens est mesurée quand la conversation a déjà envoyé une
  requête, assemblée sinon — le panneau indique toujours lequel des deux cas
  s'applique.

## Désactiver les skills fournies par DeepSeek

Le panneau ne peut pas renommer un fichier fourni par le paquet de l'application
(`dsh-doc`, `office`, `office-docx`, `office-pptx`, `office-xlsx`). Pour ces
lignes, le switch du panneau n'agit donc pas sur le disque : le host installe un
filtre sur le service `skills` du harnais.

- `skills.list` / `skills.snapshot` masquent les noms désactivés (donc le
  catalogue envoyé au modèle, le menu `/` et l'outil `skill`) ;
- `skills.get` renvoie `undefined` pour ces noms ;
- le panneau lit avec `includeDisabled: true`, ce qui lui permet de continuer à
  afficher la ligne et son switch.

L'état vit dans `$DSH_HOME/dsh-skill-mcp-panel/disabled-skills.json` et vaut pour
toutes les conversations. Le filtre est retiré proprement quand le plugin
s'arrête. Fonctionne aussi pour les skills fournies par un preset (comme
`dsh-doc`) : c'est une décision du registre, pas une modification de fichier.
