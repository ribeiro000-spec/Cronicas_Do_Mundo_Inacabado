# Arquitetura

## Visão geral

```
            ┌──────────────┐  eventos (bus)   ┌──────────────────────┐
  toque ──▶ │  ui/ (DOM)   │ ◀──────────────▶ │  game.ts (núcleo)    │
  teclado   │ HUD, menus,  │   chama métodos  │ estado + regras      │
            │ controles    │ ───────────────▶ │ (systems/*)          │
            └──────┬───────┘                  └─────────┬────────────┘
                   │ core/input.ts                      │ SceneApi
                   ▼                                    ▼
            ┌──────────────────────────────────────────────────────────┐
            │ scenes/WorldScene.ts (Phaser)                            │
            │  ChunkManager ─ CollisionGrid ─ entities/* ─ render/*    │
            └──────────────────────────┬───────────────────────────────┘
                                       │ fetch sob demanda
                          public/data/world/chunks/*.json
```

- **Estado e regras não dependem do Phaser.** `src/systems/*` são funções sobre `GameState`
  (atributos, inventário, XP, missões, save). Dá para testar sem navegador e, no futuro, rodar num servidor
  autoritativo para multiplayer.
- **A interface é DOM puro** por cima do canvas: texto nítido em qualquer densidade de tela, alvos de toque
  grandes, rolagem nativa e acessibilidade. Ela nunca altera o estado direto — chama métodos de `game`.
- **A cena** só cuida do que é visual e de tempo real: movimento, colisão, IA, projéteis, efeitos.

## Mundo e carregamento dinâmico

- Coordenadas do mundo em **tiles** (números contínuos). A projeção isométrica 2:1 está em `core/iso.ts`.
- O mundo é dividido em **chunks de 16×16**. `ChunkManager` mantém carregados o chunk atual e os vizinhos
  (`ENGINE.chunkRadius`), pré-carrega na direção do movimento e descarrega o que passou de
  `ENGINE.unloadRadius`.
- Cada chunk vira **um Blitter** (o chão inteiro numa única chamada de desenho) e imagens de objetos ordenadas
  por profundidade (`depth = (x + y) * 8`).
- A **grade de colisão** cobre o mundo todo; tiles de chunks ainda não carregados contam como sólidos.
- Inimigos nascem quando o chunk carrega e somem quando ele descarrega; grupos derrotados só voltam depois de
  `BALANCE.respawnSeconds`. Longe do jogador, a IA ociosa roda poucas vezes por segundo.
- **Estado persistente fica no save**, nunca no chunk: baús abertos, chefes derrotados, ervas colhidas,
  pedras-guia ativadas e névoa do mapa.

### Formato do chunk

```json
{
  "cx": 6, "cy": 6,
  "g": "<base64 de 256 bytes: id do tile de chão>",
  "o": [[idDoObjeto, xLocal, yLocal], ...],
  "s": [{ "id": "6_6_0", "e": "lobo", "x": 101.5, "y": 98.5, "n": 3, "lv": 2 }]
}
```

Ids de tiles e objetos (com tamanho e se são sólidos) ficam em `src/data/worldDefs.json`, compartilhado entre
o jogo e o gerador. Um conversor de mapas do Tiled só precisa escrever esse mesmo formato.

## Arte procedural em alta definição

Toda a arte é desenhada em **2×** (`render/art/`, `ART = 2`) e exibida com `ART_SCALE = 0.5`, então a
lógica do mundo (tiles de 32×16) não muda. As técnicas: rampas de cor com variação de matiz, pontilhado
(Bayer), luz esférica, contorno seletivo e ruído periódico por tile (as texturas emendam sem costura).
Entre terrenos diferentes há bordas de transição (lados, cantos e faixas retas), calculadas pelo gerador
do mundo (campo `e` de cada chunk) e desenhadas por cima do chão.

O chão de cada chunk é um `Blitter` (1 chamada de desenho) dentro de um `Container` escalado — o Blitter
do Phaser ignora a própria escala, por isso o Container.

## Câmera e resolução

- O canvas é desenhado em **pixels reais da tela** (até 2× por pixel CSS, `core/display.ts`) e exibido no
  tamanho da janela (`Scale.NONE` + `zoom = 1/dpr`). Dá para desligar em Sistema → “Alta resolução”.
- O zoom é sempre um número inteiro de pixels do canvas por pixel da arte: sem pixels de tamanhos
  diferentes e sem tremido.
- A câmera segue o jogador com suavização exponencial baseada no tempo do quadro (independe do FPS),
  com leve antecipação na direção do movimento. Posições nunca são arredondadas na lógica; o arredondamento
  acontece só no desenho.
- Chunks baixados entram numa fila e são montados um por quadro; texturas de NPCs e inimigos são geradas
  no carregamento — nada de travadas ao andar.

## Personagens em camadas

`render/characterArt.ts` desenha corpo, pernas, peitoral, luvas, rosto, cabelo, elmo e capa como camadas
separadas e as compõe numa textura com 6 quadros (frente/costas × parado/passo A/passo B). Trocar um item
troca só a sua camada. Armas e escudos são sprites à parte porque giram nos ataques (`render/CharacterView.ts`).

## Combate

- `WorldScene.hitActor` concentra o dano: crítico, armadura (`mitigate`), empurrão e estados.
- Inimigos (`entities/Enemy.ts`) usam uma máquina de estados: ocioso → persegue → **prepara** (piscando,
  é a janela para esquivar) → ataca → recupera; alguns fogem feridos.
- O chefe (`BossBrain`) troca de fase por porcentagem de vida, telegrafa golpes no chão, investe e invoca.
  Ele nasce **adormecido** (estátua, imune) e só desperta quando a missão `q_cavaleiro` está ativa e o
  jogador se aproxima: `WorldScene.startBossIntro` controla câmera e tempo; `ui/Cinematic.ts` mostra as
  faixas de cinema, o nome e as falas (com “Pular”). Saves antigos em que o chefe foi derrotado fora da
  missão são corrigidos em `game.applyState`.
- Ataque básico com combo de 3 golpes (`COMBOS` em `WorldScene`), “hit-stop” curto nos acertos e faíscas.
- Habilidades ficam em `combat/SkillCaster.ts`; o estágio de evolução (`skillTier`, maestria 3 e 5)
  muda quantidade, área, cor e efeitos extras.
- Dificuldade global em `data/enemies.ts → DIFFICULTY`; elites surgem em ~14% dos grupos de nível 2+.

## Interface de narrativa

- `ui/IntroStory.ts` + `render/storyArt.ts`: introdução ilustrada de um jogo novo (240×135 em pixel art).
- `ui/Highlight.ts`: cartões de destaque (evento `highlight`), um por vez, pausando o jogo.
- `ui/Atmosphere.ts`: filtro de cor e vinheta por área (camadas DOM, sem custo para o WebGL).

## Salvamento

`systems/save.ts` guarda em IndexedDB (com reserva em `localStorage`). Cada save tem `schema`; ao carregar,
`migrate()` atualiza saves antigos e `validateState()` rejeita arquivos corrompidos. O backup JSON passa pelo
mesmo caminho antes de ser aceito.

A penalidade de morte (`progression.applyDeathPenalty`) grava o id da morte no próprio save, então a mesma
morte nunca é cobrada duas vezes.

## Desempenho em celulares

- Zoom inteiro da câmera e `pixelArt: true`: nada de filtragem.
- Em aparelhos fracos, desligue “Alta resolução” (desenha 4× menos pixels) e “Partículas e ambiente”.
- Um atlas para o chão, um para objetos, um para efeitos — poucas trocas de textura.
- Partículas podem ser desligadas nas configurações; números de dano usam fonte bitmap.
- O HUD só toca no DOM quando um valor muda.
