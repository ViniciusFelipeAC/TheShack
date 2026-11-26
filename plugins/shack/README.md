# Plugin `shack`

Skills que os agentes do The Shack podem carregar. É um plugin local do Agent SDK: o runner passa `plugins: [{ type: 'local', path: 'plugins/shack' }]`, e cada agente só usa as skills que o manifesto dele pede pelo nome, como `shack:canvas-design`.

A regra do projeto é não instalar skills de terceiros, porque uma skill é instrução que o modelo segue. As duas daqui são a exceção aprovada na Fase 9 (`docs/PHASE-9.md`, seção 4):

- Vêm do repositório público da Anthropic, com licença Apache 2.0.
- Cada arquivo foi lido antes de entrar.
- O original fica intacto. As adaptações ao Shack vão na persona do agente.
- O `SOURCE.md` de cada pasta guarda a origem, o commit e o que mudou.

## As skills

| Skill | O que faz | Quem usa | Custo ao abrir |
|---|---|---|---|
| `canvas-design` | Cria uma direção visual e a pinta numa tela | Harker (Fase 9) | ~3,9 mil tokens |
| `theme-factory` | Paletas e pares de fontes prontos, ou um tema novo | Harker (Fase 9) | ~950 tokens |

As duas juntas somam uns 200 tokens fixos por sessão: só o nome e a descrição de cada uma. O resto entra quando o agente abre a skill. Os números vêm de `claude plugin details`.

## O que cada skill pede ao modelo

### canvas-design

1. **Uma filosofia de design.** O modelo escreve o manifesto de um movimento artístico: um nome de uma ou duas palavras e 4 a 6 parágrafos sobre espaço, cor, escala, composição e hierarquia. O texto insiste várias vezes em "trabalho de mestre, feito com horas de cuidado".
2. **Uma referência sutil.** Ele tira do pedido um tema que entra na arte sem se anunciar, "como um músico de jazz citando outra música".
3. **A tela:**
   - 90% visual e 10% texto, com padrões repetidos e formas perfeitas.
   - A linguagem de um diagrama de uma "disciplina imaginária", com paleta curta.
   - Fonte fina na maioria das vezes, usando as fontes de `canvas-fonts/`.
   - Nada sai da tela e nada se sobrepõe.
4. **Uma segunda volta.** A skill diz que o usuário "já disse que não está perfeito o bastante" e pede para refinar o que existe, sem acrescentar elementos.
5. **Várias páginas,** quando pedidas: cada uma é uma variação da primeira, como as páginas de um livro de mesa.

Na skill original, a saída é um `.md` com a filosofia e um `.pdf` ou `.png`.

### theme-factory

- **10 temas prontos,** cada um com 4 cores em hex, um par de fontes (títulos e texto) e os usos indicados.
- **O fluxo:** mostrar o PDF de amostra, perguntar qual tema, esperar a confirmação e aplicar as cores e as fontes com contraste e consistência.
- **Tema próprio:** quando nenhum serve, o modelo cria um no mesmo formato, a partir da descrição, e o mostra para revisão antes de aplicar.

## O que o Harker adapta

As skills ficam como vieram. Estas regras entram na persona do Harker, na entrega 9.4:

| A skill diz | No Shack | Por quê |
|---|---|---|
| Texto mínimo, 90% visual | Títulos com pelo menos 64 px e texto com pelo menos 32 px. A capa diz o assunto | O post precisa ser lido no celular |
| Fonte fina na maioria das vezes | Fonte fina só em título grande. Texto em peso regular ou médio | Um traço fino some na tela pequena e na compressão do Instagram |
| A referência não se anuncia | A referência pode morar no visual, mas o texto diz o que é o projeto | Quem passa pelo feed precisa entender o assunto num instante |
| Saída em `.md` e `.pdf` ou `.png` | Ele escreve HTML e CSS em `work/`, e só a ferramenta `render` gera PNG. A filosofia vira a direção visual do relatório | O servidor confere os PNGs. O Instagram não usa PDF |
| "O usuário já disse que não está perfeito" | A segunda volta fica, mas dentro do teto de duas voltas por imagem e de 40 renders por tarefa | A frase é um recurso de prompt, não um pedido seu. O teto poupa cota |
| Diagrama de disciplina imaginária, padrões repetidos | Uma direção possível entre outras, e não a padrão. A identidade do projeto manda | Se todo post sair assim, isso vira a nova cara de IA |
| Mostrar o PDF e perguntar o tema | Ele propõe até 3 identidades, cada uma com uma imagem de amostra, e você toca em **Usar esta** | Ele não mostra arquivos a você. A escolha acontece no painel |
| Temas com DejaVu, FreeSans e FreeSerif | Troca por fontes de `canvas-fonts/` | Elas não estão no plugin, e o render só abre as fontes do plugin |
| 10 temas prontos | Ponto de partida. O caminho principal é o tema próprio, tirado das cores e das fontes do projeto | Veja a seção abaixo |

## Cruzamento com o guia de "cara de IA"

O `ai-look-signals.md` da Mina vai também para a base do Harker, e aponta padrões que aparecem nestas skills:

- **Fontes:** a Instrument Serif e a família Geist estão nas combinações típicas de site feito por IA. Elas continuam disponíveis, mas não como par padrão, e nunca como a palavra em serifa itálica no meio de um título.
- **Temas com sinal direto:**
  - Midnight Galaxy: roxo e índigo, a cor-assinatura do design feito por IA.
  - Golden Hour, Desert Rose, Sunset Boulevard e Botanical Garden: creme ou bege com terracota e laranja, perto do "estilo Claude".
  - Tech Innovation: ciano neon sobre fundo escuro.
- **Sem sinal direto:** Ocean Depths, Forest Canopy, Arctic Frost e Modern Minimalist.
- **Um erro do original:** no Sunset Boulevard, a cor chamada "Deep Purple" (`#264653`) é, na verdade, um verde-azulado escuro. Vale o hex, não o nome.

## Fontes e licenças

São 29 famílias e 54 arquivos `.ttf`, todas com a SIL Open Font License 1.1. A licença permite usar as fontes em imagens, inclusive comerciais. Ela só proíbe vender a fonte sozinha e usar o nome reservado numa versão modificada.

| Tipo | Famílias |
|---|---|
| Sem serifa | Instrument Sans e Work Sans (regular, itálico, negrito e negrito itálico); Outfit, Bricolage Grotesque e National Park (regular e negrito); Big Shoulders (regular e negrito) e Smooch Sans (médio), condensadas; Jura (leve e médio); Arsenal SC (versaletes) |
| Com serifa | Lora e IBM Plex Serif (regular, itálico, negrito e negrito itálico); Crimson Pro (regular, itálico e negrito); Libre Baskerville; Young Serif; Instrument Serif (regular e itálico) |
| Display | Gloock (serifa de alto contraste); Italiana e Poiret One, finas; Boldonse e Erica One, pesadas; Tektur (regular e médio), técnica; Nothing You Could Do, manuscrita |
| Pixel | Pixelify Sans (médio); Silkscreen. Elas combinam com a pixel art da casa, para a identidade do próprio The Shack |
| Monoespaçada | JetBrains Mono, IBM Plex Mono, Geist Mono e Red Hat Mono (regular e negrito); DM Mono |

- **Acentos:** todas têm os acentos do português (ã, õ, ç, é, ê, à…) e as aspas e travessões. Só faltam o "ª/º" na Poiret One e o "€" na Italiana.
- **Licenças acrescentadas:** a IBM Plex Serif e a Instrument Serif vieram sem o arquivo de licença. As duas declaram a OFL 1.1 dentro da própria fonte, e o `SOURCE.md` da canvas-design registra os dois arquivos que entraram.

## Como conferir

- `claude plugin validate plugins/shack` valida o manifesto e as skills. A CLI vem com o Agent SDK, em `node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe`. Os avisos de ícone e de autor valem só para o catálogo público de plugins.
- `apps/server/test/skills.test.ts` confere a estrutura, as licenças e a ausência de instruções de baixar ou instalar.
