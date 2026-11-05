# O que faz um site parecer feito por IA

Transcrito do PDF que o dono da casa mandou em 2026-11-02 (autor: @Vinicius). É a primeira base de conhecimento do agente de prompts; na Fase 8 ela vai para `agents/<id>/knowledge/`.

Um site parece feito por IA quando acumula vários padrões "médios" ao mesmo tempo: fonte Inter, gradiente roxo, hero centralizado com três cards e texto genérico. O fenômeno já tem nome: "AI slop" ou design "vibe-coded".

A causa é estatística. Os modelos preveem o padrão mais provável com base no que viram no treino, então tendem ao que é mais comum na internet (925Studios). Nenhum elemento isolado denuncia o site; o que denuncia é a soma.

## Tipografia

O sinal tipográfico mais citado é a Inter usada em tudo. É uma boa fonte para telas, mas é a padrão de quase toda ferramenta de IA, biblioteca de componentes e construtor de sites (925Studios).

- **Inter em todos os textos**, principalmente nos títulos centralizados do hero (Adrian Krebs).
- **Combinações recorrentes:** Space Grotesk, Instrument Serif e Geist.
- **Uma palavra em serifa itálica** de destaque no meio de um título todo em Inter.
- **Números em fonte monoespaçada** e subtítulos com espaçamento entre letras bem aberto (Northeast Times / New Yorker).
- **Títulos e rótulos de seção em maiúsculas.**
- **Nenhum par de fontes:** só Inter, Roboto ou a fonte do sistema, sem fonte de display (avoid-ai-design).

## Cores

O roxo/índigo é a cor-assinatura do site feito por IA. O Tailwind CSS usou o `bg-indigo-500` como destaque nos seus exemplos durante anos; esse índigo saturou tutoriais e demos, e os modelos passaram a associá-lo a design "bonito" (Superdesign).

| Padrão | Como aparece | Fonte |
|---|---|---|
| Índigo padrão | `#6366F1` (indigo-500 do Tailwind) como cor de destaque | Superdesign |
| Gradiente roxo → azul | No hero, nos botões de CTA e nos fundos | 925Studios |
| Gradiente índigo → rosa | `#6366f1` → `#ec4899`, a 135°, do canto superior esquerdo ao inferior direito | ux-skill |
| Texto com gradiente | Título com `bg-clip-text` | avoid-ai-design |
| Paleta Tailwind/shadcn intocada | zinc/slate, slate-700 no texto, sky-500 de destaque, botões blue-600 | avoid-ai-design |
| Modo escuro permanente | Texto cinza-médio, contraste no limite mínimo | Adrian Krebs |
| Brilhos e sombras coloridas | Glows grandes e box-shadows coloridos | Adrian Krebs |

**O "estilo Claude".** Existe também um padrão próprio do Claude. A New Yorker documentou fundos bege e creme, detalhes em laranja ferrugem, serifas grandes em itálico e faixas de texto rolando como letreiro de telejornal (Northeast Times). Designers citaram ainda painéis com vários contornos arredondados, às vezes com brilho neon, e cores primárias levemente fora do tom, com ar de modernismo de meados do século.

## Layout e estrutura

A estrutura mais reconhecível é o hero centralizado seguido de três cards iguais. A versão típica: gradiente roxo-azul sobre branco, Inter em tudo, três cards arredondados de recursos e uma barra de navegação com efeito de vidro (avoid-ai-design). Os cards são sempre três, com a mesma largura, altura e estrutura de ícone-título-parágrafo (ux-skill).

- **Badge em formato de pílula** logo acima do título principal (Adrian Krebs).
- **Borda colorida** no topo ou na lateral esquerda dos cards. Um designer disse a Krebs que ela é quase tão reveladora quanto o travessão no texto de IA.
- **Cards idênticos** com ícone em cima.
- **Sequências numeradas** "1, 2, 3".
- **Faixas de estatísticas** ("10k+ usuários", "99,9% uptime").
- **Menu lateral com emojis** como ícones.
- **Tabela de preços em três planos** e **rodapé em quatro colunas**, com zero assimetria (avoid-ai-design).

## Componentes, espaçamento e efeitos

Sites feitos por IA usam o mesmo padding, o mesmo arredondamento e a mesma altura de card em todo lugar. Com 16px de raio e 24px de padding em tudo, a página fica plana e sem hierarquia (925Studios).

Nos efeitos, os suspeitos habituais são o shadcn/ui sem customização e o glassmorphism, normalmente sobre um fundo com gradiente (Adrian Krebs).

## Ícones e imagens

Emojis no lugar de ícones e o pacote Lucide repetido são sinais fortes.

- **Ícones Lucide gastos:** Sparkles para "IA", ArrowRight, Zap (avoid-ai-design).
- **Emojis como ícones de recursos**, quase sempre foguete, brilho e raio (ux-skill).
- **Placeholders em gradiente** e avatares do DiceBear.
- **Fotos de banco de imagens:** pessoas diversas olhando um laptop num escritório perfeitamente iluminado (925Studios).
- **Blobs 3D abstratos** flutuando no fundo.
- **Ilustrações geradas por IA:** lisas e simétricas demais, com aspecto de plástico.

## Animações

A animação de site feito por IA ou não existe, ou é a mesma em tudo. Hovers que não fazem nada, botões que "estalam" em vez de suavizar e o mesmo fade-in genérico em cada elemento ao rolar a página (925Studios).

## Texto

O texto é, para vários autores, o sinal mais forte de todos, e não depende do design (21st.dev).

- **Títulos vagos e aspiracionais:** "Build the future of work", "Your all-in-one platform", "Scale without limits" (925Studios). Em português: "Transforme seu negócio", "Eleve sua experiência", "Soluções inovadoras para o futuro".
- **Vocabulário gasto:** "Elevate", "Seamless", "Powerful", CTAs genéricos e microtextos de enchimento (avoid-ai-design).
- **Linguagem evasiva:** "pode ajudar", "potencialmente".
- **Superlativos vazios:** "best-in-class", "de ponta".
- **Placeholders esquecidos:** John Doe, jane@example.com (ux-skill).
- **Botão "Get Started" que não leva a lugar nenhum** (Re-Template).

## O teste final e ressalvas

O melhor teste é perguntar: dá para trocar o logo e o nome por qualquer outra empresa sem que nada pareça errado? Um designer resumiu esse tipo de site como "um bom site para nenhuma empresa em particular" (Mejba).

Nenhum sinal prova nada sozinho. Krebs lembra que um único padrão não torna um site gerado por IA, e que antes da IA tudo parecia Bootstrap. Na análise dele de 1.590 sites do Show HN, 22% tinham 4 ou mais padrões, 32% tinham 2 ou 3, e 46% tinham 0 ou 1 (Adrian Krebs).

Para testar um site específico, Krebs disponibilizou um scanner público: slopcop.adriankrebs.ch.

## Fontes

- Adrian Krebs: Scoring Show HN submissions for AI design patterns
- 925Studios: AI Slop Web Design: Complete Guide (2026)
- Northeast Times: AI design tools are making every website look the same
- Superdesign: Why AI design looks generic
- avoid-ai-design (GitHub)
- ux-skill: How to fix AI generated UI (GitHub)
- Re-Template (GitHub)
- 21st.dev: Website not look AI generated
- Mejba: AI web design human oversight
