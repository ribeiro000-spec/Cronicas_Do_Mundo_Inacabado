# Crônicas do Mundo Inacabado

RPG de ação 2D isométrico em pixel art, jogado direto no navegador — no computador **e no celular**.
Este repositório é a demo jogável do **Ato I** descrita no GDD (`docs/GDD-Cronicas-do-Mundo-Inacabado.pdf`):
os Campos de Orvalho, a Vila de Eldenor, a Floresta dos Sinos Mudos, as Ruínas Antigas e o chefe
**Cavaleiro Sem Brasão**.

Feito com **TypeScript + Phaser 3 + Vite**, hospedado de graça no **GitHub Pages**. Não precisa de servidor:
o progresso fica salvo no próprio navegador.

---

## Colocar no ar (GitHub Pages)

1. Crie um repositório no GitHub (pode ser público ou privado com Pages habilitado).
2. Envie estes arquivos para a branch `main`:
   ```bash
   git init
   git add .
   git commit -m "Crônicas do Mundo Inacabado — demo do Ato I"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
3. No GitHub, abra **Settings → Pages** e em **Build and deployment → Source** escolha **GitHub Actions**.
4. Pronto. A cada `push` na `main`, o workflow `.github/workflows/deploy.yml` instala as dependências,
   verifica os tipos, gera o build e publica. Acompanhe na aba **Actions**.
   O jogo fica em `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

Não é preciso configurar o nome do repositório em lugar nenhum: o build usa caminhos relativos
(`base: './'` no `vite.config.ts`).

### A página fica parada em “Costurando o mundo…”

Se o console do navegador mostrar `main.ts` ou `manifest.webmanifest` com erro 404, o Pages está publicando
os arquivos-fonte em vez do site compilado. Confira:

1. **Settings → Pages → Source** precisa estar em **GitHub Actions** (não em “Deploy from a branch”).
2. A pasta **`.github/workflows/deploy.yml`** precisa existir no repositório. O envio pela página do GitHub
   (arrastar arquivos) às vezes ignora pastas que começam com ponto; nesse caso crie o arquivo em
   **Add file → Create new file** com esse caminho e cole o conteúdo.
3. Na aba **Actions**, a execução “Publicar no GitHub Pages” precisa terminar com ✅. Se falhar, abra o log.

Depois de corrigir, recarregue a página com Ctrl+Shift+R.

### “Não foi possível carregar o mundo (404)”

A pasta `public/` não chegou ao repositório (o envio pela página do GitHub aceita no máximo 100 arquivos por vez).
O mapa (`public/data/world`) é gerado pelo próprio workflow com `npm run world`, então basta enviar os arquivos
fixos: `public/manifest.webmanifest`, `public/sw.js` e `public/icons/`.

## Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 20.19 ou mais novo.

```bash
npm install        # instala Phaser, Vite e TypeScript (gera o package-lock.json — faça commit dele)
npm run dev        # abre em http://localhost:5173 (e na rede local, para testar no celular)
npm run build      # gera a versão final em dist/
npm run preview    # serve o dist/ para conferir antes de publicar
npm run world      # regenera o mapa (public/data/world) a partir de tools/generate-world.mjs
```

Para testar no celular durante o desenvolvimento, conecte o celular na mesma rede Wi-Fi e abra o endereço
"Network" que o `npm run dev` mostra. Não abra o `index.html` direto do disco (`file://`): módulos e
dados precisam de um servidor.

---

## Controles

**Celular (toque)** — pensado para jogar deitado:

| Controle | O que faz |
|---|---|
| Joystick | Toque e arraste em qualquer ponto da metade esquerda da tela |
| ⚔️ Botão grande | Atacar. Segure para atacar sem parar. A mira é automática |
| 1–4 (em arco) | Habilidades. O número mostra a recarga |
| 💨 | Esquiva com invencibilidade breve |
| 🧪 | Usa a poção mais útil no momento |
| Botão dourado | Aparece perto de NPCs, baús, ervas e pedras-guia (Falar, Abrir, Ativar…) |
| Minimapa | Toque para abrir o mapa completo |
| ☰ / 🎒 / ⛶ | Menu, inventário e tela cheia |

Nas configurações há **modo canhoto**, **tamanho dos botões**, zoom, vibração e mira automática.

**Teclado e mouse:** `WASD`/setas movem · `J` ou clique ataca (mira no cursor) · `1`–`4` habilidades ·
`Espaço` esquiva · `E` interage · `Q` poção · `I` inventário · `M` mapa · `C` personagem ·
`K` habilidades · `L` missões · `Esc` menu.

---

## O que já está jogável

Tudo do MVP do GDD (§17), e um pouco mais:

- **Mundo em chunks** de 192×192 tiles (144 arquivos de 16×16), carregados e descarregados conforme você anda,
  com pré-carga na direção do movimento.
- **Personagens no estilo dos RPGs de ação clássicos** (≈3 cabeças de altura), em 3/4 nas quatro
  diagonais, com caminhada de 6 quadros, poses de golpe e de magia e a arma presa na mão. Monstros
  com silhueta de verdade (lobo, javali, aranha, slime) e patas articuladas.
- **Personagem livre:** 4 arquétipos iniciais (Guerreiro, Maga, Arqueira, Clérigo) que só orientam o começo.
  6 atributos (FOR, DES, INT, VON, VIG, AFI) com distribuição e **prévia antes de confirmar**.
- **19 habilidades em 8 escolas**, com até 5 níveis de maestria e 4 atalhos. Cada habilidade **evolui**
  nas maestrias 3 e 5: muda de nome, de aparência e de efeito (ex.: Espírito Lobo → Matilha Espiritual,
  com dois lobos violeta → Alfa Celestial, um lobo dourado gigante que lidera a matilha).
- **Equipamento modular:** 9 slots; cada peça muda só a sua camada do sprite. Armas de duas mãos
  bloqueiam a mão secundária; duas adagas, espada + escudo e arma + foco funcionam.
- **Combate de ação** com mira automática, **combo de três golpes** (o terceiro é mais forte e muda
  conforme a arma), “congelamento” de impacto, faíscas, esquiva com invencibilidade, números de dano,
  críticos, empurrão, atordoar, raízes, lentidão e queimadura. Inimigos “brilham” antes de atacar.
- **Inimigos de elite** (brilho dourado, mais vida e dano, mais recompensa) e grupos maiores.
- **Inimigos:** slimes, lobos (fogem feridos), javalis (investida), aranhas (teia que deixa lento),
  goblins, goblins arqueiros, saqueadores, atiradores e esqueletos — em grupos que reaparecem.
- **Chefe com 3 fases** (Terreno → Agressividade → Forma Final), ataques telegrafados, invocações
  e janelas de vulnerabilidade. Uma pista (o Brasão Partido) muda o encontro. Ele fica adormecido como
  estátua até a missão chegar a ele e desperta numa **cena de apresentação** (câmera, falas, nome na tela).
- **Introdução ilustrada** num jogo novo: o mundo, as Costuras e a origem do seu arquétipo.
- **Cartões de destaque** para itens importantes, missões concluídas, fragmentos de mapa, chefe
  derrotado e evolução de habilidade.
- **8 missões** com diálogos, objetivos, recompensas e **rotas exclusivas**
  (Academia de Lúmen × Ordem do Último Marco), seguindo os códigos M01–M05 do GDD.
- **Mapa fragmentado** com névoa, fragmentos de mapa, marcadores pessoais e **viagem rápida**
  só para pedras-guia visitadas e ativadas.
- **Reputação** com as 8 facções (afeta preços), **lojas**, baús, ervas que voltam a crescer,
  **diário** de descobertas.
- **Salvamento** em IndexedDB: 3 espaços + automático em pontos seguros, versão de esquema com
  migração, **backup JSON** validado antes de importar.
- **Morte:** volta ao último save e perde 20% do XP do nível atual, uma única vez por morte.
  Ao subir de nível o XP volta a 0 (o excedente não passa).
- **PWA:** dá para “Adicionar à tela inicial”; o Service Worker guarda o jogo e os chunks em cache.

---

## Estrutura

```
.
├─ .github/workflows/deploy.yml   # build e publicação no GitHub Pages
├─ docs/
│  ├─ ARQUITETURA.md              # como o código está organizado (leia antes de mexer)
│  └─ GDD-…pdf                    # documento de design
├─ index.html
├─ public/                        # copiado como está para o site
│  ├─ data/world/
│  │  ├─ manifest.json            # metadados, pontos de interesse, áreas, mapa-resumo
│  │  └─ chunks/<cx>_<cy>.json    # o mundo, um arquivo por chunk (baixado sob demanda)
│  ├─ assets/                     # sua arte desenhada à mão (atlas, áudio) — veja assets/README.md
│  ├─ icons/  manifest.webmanifest  sw.js
├─ src/
│  ├─ main.ts                     # ponto de entrada
│  ├─ game.ts                     # núcleo: estado, regras e ponte entre cena e interface
│  ├─ config.ts                   # balanceamento (curva de XP, pontos por nível…) e motor
│  ├─ core/                       # tipos, eventos, projeção isométrica, entrada, utilidades
│  ├─ data/                       # conteúdo: itens, habilidades, inimigos, NPCs, missões, facções…
│  ├─ systems/                    # regras puras: atributos, inventário, XP, missões, save, névoa, sons
│  ├─ world/                      # carregamento de chunks e grade de colisão
│  ├─ entities/                   # jogador, inimigos (IA e chefe), NPCs, projéteis, pontos de interesse
│  ├─ combat/                     # habilidades do jogador e suas evoluções (SkillCaster)
│  ├─ render/                     # arte procedural em pixel art (art/: chão, objetos, casas, efeitos),
│  │                              # sprites em camadas, efeitos, ilustrações da introdução
│  ├─ scenes/                     # BootScene (texturas) e WorldScene (o jogo)
│  └─ ui/                         # HUD, controles de toque, menus, mapa, diálogo, loja, introdução,
│                                 # cena do chefe, cartões de destaque e atmosfera (DOM puro)
└─ tools/generate-world.mjs       # gera o mundo em chunks
```

## Como acrescentar conteúdo

- **Item novo:** `src/data/items.ts` (requisitos, estatísticas, aparência da camada e ícone).
- **Habilidade:** `src/data/skills.ts` (com `tiers` para as evoluções) + o efeito em
  `src/combat/SkillCaster.ts` (pelo `kind`; o `tier` 0, 1 ou 2 diz o estágio de evolução).
- **Inimigo:** `src/data/enemies.ts` (humanoides reaproveitam o gerador de personagens) e coloque-o
  na tabela de `tools/generate-world.mjs`.
- **NPC e diálogo:** `src/data/npcs.ts`; posição em `tools/generate-world.mjs` (`poi({...})`).
- **Missão:** `src/data/quests.ts` (etapas: falar, derrotar, coletar, chegar, interagir).
- **Balanceamento:** `src/config.ts`.

Depois de mexer no gerador, rode `npm run world` para testar localmente. Não é preciso enviar
`public/data/world` ao GitHub: o workflow (e o `npm run build`) gera o mapa a cada publicação.

## Trocar a arte procedural pela sua

Toda a arte atual é desenhada por código (`src/render/`), então o repositório funciona sem nenhuma imagem.
Para usar arte própria (Aseprite → TexturePacker), exporte atlas no formato *JSON Hash* com os **mesmos
nomes de quadro** (por exemplo `grass:0`, `oak:1`, `house_blue:0`, `chest_closed`) e indique os caminhos em
`manifest.json → "art"` (o gerador tem o campo comentado). Detalhes em `public/assets/README.md`.

## Limites do GitHub Pages

Repositório até ~1 GB, arquivos até 100 MB, banda mensal com limite flexível e sem Git LFS no site.
Os dados do mundo deste recorte ocupam menos de 1 MB. Quando a arte final crescer, mantenha o código aqui e
sirva `public/assets` por um CDN (Cloudflare R2/Pages, por exemplo), apontando os caminhos no manifesto.

## Próximos passos sugeridos (fases 5–7 do GDD)

Crafting básico, mais regiões a partir do mesmo formato de chunk, editor de mapas no Tiled com um
conversor para chunks, áudio real e música, mais ramos de missão do Ato II e testes automatizados das regras
em `src/systems`.
