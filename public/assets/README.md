# Arte e áudio próprios

O jogo funciona sem nenhum arquivo aqui: toda a arte do protótipo é gerada por código.
Quando houver arte desenhada à mão, coloque-a nesta pasta.

## Atlas de texturas

Exporte do TexturePacker (ou free-tex-packer) no formato **JSON Hash**, com os **mesmos nomes de quadro**
que a arte procedural usa:

| Atlas | Quadros |
|---|---|
| `tiles` | `<tile>:<variante>` — ex.: `grass:0` … `grass:3`, `path:2`; água animada: `water:<variante>:<quadro>` (2 variantes × 4 quadros) |
| `objects` | `<objeto>:<variante>` — ex.: `oak:0`, `oak:1`, `oak:2`, `house_blue:0`, `fence_x:0` (lista em `src/data/worldDefs.json`; variantes em `src/render/registerArt.ts`) |
| `pois` | `chest_closed`, `chest_open`, `waystone_off`, `waystone_on`, `herb`, `altar`, `altar_dim`, `cargo`, `mark_quest`, `mark_turnin` |

Tiles têm 32×16 px (losango). Para objetos, defina o **pivô** de cada quadro no ponto que encosta no chão
(centro da base). Depois aponte os atlas no manifesto do mundo (`tools/generate-world.mjs`, campo `art`):

```js
art: { tiles: 'assets/atlases/tiles', objects: 'assets/atlases/objects', pois: 'assets/atlases/pois' }
```

Rode `npm run world` e publique. Atlas que não forem indicados continuam procedurais, então dá para trocar um
de cada vez.

## Personagens

Os personagens são compostos por camadas em `src/render/characterArt.ts`. Para trocar por sprites próprios,
mantenha a mesma ideia: uma folha por camada (corpo, pernas, peitoral, cabeça…) com quadros alinhados no mesmo
pivô, em todas as direções e animações.

## Áudio

Os efeitos atuais são sintetizados (`src/systems/sfx.ts`). Arquivos em `assets/audio/` podem ser carregados
com `this.load.audio()` na `BootScene`.
