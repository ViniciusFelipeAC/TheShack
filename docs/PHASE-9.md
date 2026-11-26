# The Shack: plano da Fase 9 (a Mina, o Harker e a ala deles na cabana)

Proposta de 2026-11-07 para o Harker, refeita em 2026-11-24 a seu pedido: a fase agora traz os dois agentes novos e a ala deles na cabana. O andamento fica em `PHASE-9-PROGRESS.md`.

O plano geral fica em `PLAN.md`, e a Fase 8 em `PHASE-8.md`. Este arquivo é separado pelo mesmo motivo: o `PLAN.md` já passou de 500 linhas.

## 0. Resumo

Dois agentes novos chegam à casa e ocupam a primeira ala, cada um com uma estação feita para o trabalho dele.

- **Mina** (antes Ford, na entrega 8.2): escreve prompts para o etnaD e o Harker que fogem da "cara de IA" e, quando eles terminam, confere se o que foi feito é o que foi pedido. Ela nunca edita arquivos. Trabalha numa escrivaninha com máquina de escrever.
- **Harker:** cria imagens para o Instagram dos seus projetos (post único, carrossel e capa de story ou Reels) e escreve a legenda. Ele usa duas skills da Anthropic, a **canvas-design** e a **theme-factory**, e trabalha num cavalete.

Tudo continua com custo zero. Nada usa chave de API, serviço pago ou login de terceiros.

A fase tem quatro entregas, com uma parada para aprovação depois de cada uma:

1. **9.1 A Mina e a ala:** o runner de texto, a base de conhecimento, a conferência, os botões de fluxo, a ala aberta e a escrivaninha.
2. **9.2 Skills lidas:** as duas skills do Harker entram no repositório depois de lidas, com um resumo para você aprovar.
3. **9.3 Motor de imagens:** runner, ferramenta de render, conferência pelo servidor e rota das imagens.
4. **9.4 O Harker:** persona, identidade por projeto, galeria, salvar no iPhone, o pedido pelo Renfield, a conferência da Mina e o cavalete.

## 1. Antes de começar

- **A Fase 8 fica só com a tela de bloqueio (8.3).** Ela depende do iPhone pareado pelo Tailscale. Esta fase não depende disso e pode vir antes.
- **Um navegador nos dois computadores.** O render do Harker usa o navegador que já está instalado: o Edge no Windows e o Chromium ou o Chrome no Arch.
  - O caminho fica em `SHACK_BROWSER_PATH`. Sem ele, o servidor procura nos lugares de sempre.
  - Sem navegador, o Harker fica desativado com um erro claro. A Mina não precisa de navegador.
- **Tailscale:** só o botão de salvar no iPhone depende dele (seção 6, "Telas").

## 2. O que muda no manifesto e no contrato

Tudo nasce em `packages/shared`, com zod. O etnaD e o Renfield não mudam de comportamento.

| Campo | Onde | Para quê | Nasce em |
|---|---|---|---|
| `runner: code \| text \| design \| none` | manifesto | Qual runner roda o agente. O padrão continua o de hoje: `code` quando há ferramentas | 9.1 |
| `knowledge: [knowledge/*.md]` | manifesto | Documentos que entram no prompt a cada tarefa | 9.1 |
| `appearance.order` | manifesto | A ordem fixa das mesas na casa (seção 7) | 9.1 |
| `station: typewriter \| easel` | manifesto | As estações novas (seção 7) | 9.1 e 9.4 |
| `reviewOf` | tarefa | A tarefa que a Mina confere | 9.1 |
| `output` e `review` | `TaskResult` | O texto pronto (prompt ou legenda) e o resultado da conferência | 9.1 |
| `skills: [...]` | manifesto | As skills que o agente carrega, pelo nome | 9.3 |
| `images` | `TaskResult` | As imagens do Harker | 9.3 |

## 3. Entrega 9.1: a Mina, agente de prompts e conferência

### Papel

1. **Escrever prompts.** Você pede ("um site sobre a feira do bairro"), e ela devolve um prompt pronto para o etnaD, com escolhas concretas que fogem da cara de IA. Um rascunho seu também serve de ponto de partida. Na 9.4, ela passa a escrever prompts para o Harker também.
2. **Conferir.** Quando o etnaD termina (e, a partir da 9.4, o Harker), ela confere se o que foi feito é o que foi pedido. Cada requisito vira atendido, parcial ou faltou, com a prova: o arquivo e a linha, ou a imagem. O que faltou vira um prompt de correção.

Ela nunca edita arquivos. Quem programa continua sendo o etnaD, e quem desenha, o Harker.

```yaml
id: mina
name: Mina
role: Prompts e conferência
model: [sonnet]
effort: medium
runner: text
chat: false
knowledge: [knowledge/*.md]
workspace: optional       # lê o projeto, nunca escreve nele
tools:
  builtin: [Read, Glob, Grep]
appearance:
  order: 2
  station: typewriter
  idle: [tea, armchair, bookshelf]
```

### "Treino": base de conhecimento, não ajuste de modelo

A assinatura não permite treinar o modelo, e isso nem é preciso. O "treino" é um conjunto de documentos que entra no prompt dela a cada tarefa.

- Uma pasta `agents/mina/knowledge/` com arquivos `.md`.
- O primeiro arquivo é o seu PDF, transcrito em `agents/mina/knowledge/ai-look-signals.md` (antes ficava em `docs/references/`).
- O segundo é uma receita de prompt para o etnaD: restrições, seções, critérios de aceite e entrega, no formato que funcionou no teste do site "Órbita".
- Na 9.4 entra a receita de prompt para o Harker: formato, número de imagens, o texto de cada uma, a legenda e a identidade do projeto.
- Os caminhos ficam presos à pasta do agente, com a mesma checagem da persona. Há um teto de 40 mil caracteres; acima dele, o agente fica desativado com um erro claro.
- Para ensinar mais, você solta outro `.md` na pasta. O registry recarrega sozinho.

### Como ela escreve um prompt

O prompt que ela devolve para o etnaD tem sempre estas partes:

1. Objetivo.
2. Restrições.
3. **Direção visual com nomes:** um par de fontes nomeado, a paleta em hex e um layout com assimetria proposital.
4. Texto, com exemplos de títulos concretos sobre o assunto.
5. Animações variadas e com propósito.
6. Um **checklist anti-IA** que o etnaD confere antes de entregar.
7. **Critérios de aceite**, um por linha, porque são eles que a conferência vai checar.
8. Entrega.

Três regras evitam que o remédio vire outro padrão:

- **A soma é que denuncia.** A meta é no máximo um sinal da lista, e não proibir tudo às cegas. Se um sinal fizer sentido para o assunto, ela mantém e justifica.
- **Sem "estilo Claude".** Ela própria é um Claude, então a tendência é bege, laranja ferrugem e serifa itálica. A persona proíbe isso por padrão.
- **Variar.** O servidor põe no prompt dela a direção visual das últimas 5 tarefas, e ela não repete fonte nem paleta.

Se faltar algo que muda o resultado, como o público ou o tom, ela pergunta com `AskUserQuestion`, e a pergunta chega a você como as do etnaD. Se não faltar, ela decide e lista as premissas no topo do prompt.

### Como ela confere

- **O que foi pedido:** o prompt da tarefa conferida. Se a tarefa nasceu de um prompt dela, o seu pedido original entra também, para ver se nada se perdeu no caminho. Os critérios de aceite e o checklist anti-IA viram a lista de requisitos.
- **O que o etnaD fez está no branch da tarefa.** Ele faz commit no branch `etnad/...` e volta ao branch original, então a pasta não mostra o que ele fez. O servidor cria um `git worktree` temporário desse branch em `data/tmp/`, roda a conferência lá e apaga o worktree no fim.
- **O que o Harker fez (9.4):** os PNGs, a legenda e os textos alternativos da tarefa. Ela abre cada imagem com `Read`.
- **Ferramentas:** só `Read`, `Glob` e `Grep`, com o mesmo hook que prende os caminhos ao que ela confere.
- **O relatório de quem fez não é a prova.** Ela confere o código e as imagens, como o servidor faz com o git.
- **O resultado é estruturado (`review`):**
  - o veredito: `conforme` ou `com pendências`;
  - cada requisito com a situação (atendido, parcial ou faltou), a prova e uma nota curta;
  - quando a entrega é visual, os sinais de IA encontrados, na escala de Krebs (0 ou 1, 2 ou 3, 4 ou mais);
  - o prompt de correção, só quando há pendência.

### O runner de texto

O `CodeRunner` de hoje é do etnaD: regras de git, edição e commit. A Mina ganha um runner próprio, mais simples.

- **`TextRunner`:**
  - Mesma assinatura e mesma trava de credencial.
  - `settingSources: []` e sem git.
  - Ferramentas só de leitura, e só quando a tarefa tem workspace ou confere outra tarefa.
  - Saída estruturada: `output` (o prompt em markdown, até 20 mil caracteres) e `review`.
- **Verificação:** `result.verification` continua escrito só pelo servidor. Como ela não tem ferramenta de escrita, `changes` precisa vir vazio. Se vier preenchido, a tarefa é marcada como `suspect`.
- **Modelo:** `sonnet`, com esforço médio. Escrever prompts e conferir não pedem o Opus, e isso poupa cota.

### Fluxos

1. **Pedir um prompt:** "Renfield, pede pra Mina um prompt de site sobre café." Quando a tarefa termina, o painel mostra o prompt com os botões **Copiar** e **Mandar para o etnaD** (na 9.4, também **Mandar para o Harker**). O botão pede o workspace e cria a tarefa com `parentId` apontando para a da Mina.
2. **Conferir:**
   - Quando uma tarefa que nasceu de um prompt dela termina com sucesso, o servidor cria a conferência sozinho, uma vez, com `reviewOf`.
   - Qualquer outra tarefa concluída do etnaD ganha o botão **Conferir com a Mina**.
   - Tarefa que falhou ou foi cancelada não é conferida.
3. **Corrigir:** uma conferência com pendências ganha o botão **Mandar correção**. A tarefa de correção parte do branch da tarefa conferida, e não do branch base. Para isso, o runner do etnaD passa a aceitar um branch de origem. Como a correção também nasce de um prompt dela, ela é conferida de novo quando termina.

A conferência é automática; a correção não. Cada volta pede um toque seu, então não há laço sem fim, e a cota de cada volta fica à vista.

### Segurança

- O texto da Mina é conteúdo externo, como o do etnaD. Antes de entrar no contexto do Renfield, ele passa por `core/external.ts`.
- O relatório do etnaD e o do Harker também passam por `core/external.ts` antes de entrar no contexto dela.
- **Mandar para o etnaD:** o prompt dela só vira tarefa do etnaD pelo seu toque no botão. Isso conta como sua aprovação.
- Os documentos da pasta `knowledge/` são dados. A regra fixa do runner diz isso, como já acontece com o `CLAUDE.md` dos workspaces.

### Na casa

A ala abre com ela, e a escrivaninha dela entra nesta entrega (seção 7). Até a 9.4, o outro lado da ala fica com uma mesa vazia, como já acontece hoje.

### Testes

- **Manifesto:** os campos `knowledge`, `runner` e `appearance.order`, o caminho fora da pasta, o teto de tamanho e o etnaD sem mudança de comportamento.
- **`TextRunner` com um SDK falso:** a saída com `output` e `review`, o `changes` preenchido virando `suspect` e a pergunta virando aprovação.
- **Conferência automática:** criada uma vez quando a tarefa que nasceu de um prompt dela termina; não criada para tarefa que falhou nem para tarefa sem prompt dela; o relatório do etnaD chega embrulhado pelo `core/external.ts`.
- **Worktree da conferência:** é criado a partir do branch certo e apagado no fim, inclusive em caso de falha.
- **Ao vivo:** um prompt para um site, o etnaD construindo, a conferência automática e uma correção.

## 4. Entrega 9.2: skills lidas

### Por que ler antes

A regra "não instale skills de terceiros" existe por causa do risco: uma skill é instrução que o modelo segue. As duas são da Anthropic, a mesma empresa do modelo, mas entram pelo mesmo cuidado:

- Copio do repositório público `anthropics/skills`, que tem licença Apache 2.0. A licença de cada skill vem junto.
- Leio cada arquivo antes do commit: o `SKILL.md`, os temas, os scripts e as fontes.
- **O original fica intacto.** As adaptações ao Shack vão na persona do agente, e não na skill. Assim, atualizar é só copiar de novo.
- A exceção é um trecho que mande baixar, instalar ou acessar a rede: ele sai, e a mudança fica registrada.
- Um `SOURCE.md` em cada pasta guarda o commit de origem, a data e o que mudou. Atualizar é sempre um passo manual.

### Onde ficam

As skills formam um plugin local do Agent SDK, na raiz do repositório. Um agente só usa as skills que o manifesto dele pede pelo nome, como já acontece com os grupos de ferramentas.

```
plugins/shack/
├─ .claude-plugin/plugin.json   # nome do plugin: shack
├─ README.md                    # o que cada skill faz, de onde veio e quem usa
└─ skills/
   ├─ canvas-design/            # SKILL.md, canvas-fonts/, LICENSE.txt, SOURCE.md
   └─ theme-factory/            # SKILL.md, themes/, LICENSE.txt, SOURCE.md
```

### O que você recebe para aprovar

- Um resumo do que cada skill pede ao modelo, em português.
- O que precisa de adaptação. Por exemplo, a canvas-design foi feita para arte com pouco texto, e um post de projeto precisa de texto legível no celular.
- A lista das fontes e das licenças delas.

## 5. Entrega 9.3: motor de imagens

### O `DesignRunner`

- Mesma assinatura e mesma trava de credencial dos outros runners.
- **Skills:**
  - `plugins: [{ type: 'local', path: 'plugins/shack' }]` e `skills: ['shack:canvas-design', 'shack:theme-factory']`.
  - Uma skill que não existe em `plugins/shack/skills/` desativa o agente com um erro claro.
  - No início, o runner confere em `initializationResult().plugins_applied` se o plugin carregou. Se não carregou, a tarefa falha antes do primeiro pedido ao modelo.
- **Nada de fora entra:** `settingSources: []` e `strictMcpConfig: true`, com os conectores do claude.ai desligados (`disableClaudeAiConnectors`). As suas skills pessoais, o `CLAUDE.md` e um conector que você ligar na sua conta, como o do Canva, não chegam a ele.
- **A pasta da tarefa** fica em `data/design/<taskId>/` e é o `cwd` do agente:
  - `input/`: anexos e prints que você mandou, só leitura.
  - `work/`: o HTML e o CSS que ele escreve.
  - `out/`: os PNGs, escritos só pela ferramenta de render.
- **Ferramentas:** `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Skill` e `AskUserQuestion`, mais a ferramenta `render`. Ele não tem shell.
- **Guarda de caminhos:** uma variação do `workspaceGuard`, com raízes de leitura e de escrita separadas.
  - Ele só escreve em `work/`.
  - Ele lê `input/`, `work/`, `out/` e a pasta do plugin, onde estão os temas e as fontes.
  - Se a tarefa tiver workspace, ele também lê o projeto, sem poder escrever nele.
- **Saída estruturada:** a ordem das imagens, um texto alternativo para cada uma, a legenda e as hashtags em `output`, e a direção visual usada (paleta e fontes).

### A ferramenta `render`

- É uma ferramenta MCP no próprio processo, como as do Renfield, com os schemas tolerantes de `lenient.ts`.
- **Entrada:** o arquivo HTML em `work/`, o nome da imagem (`01`, `02`…) e o formato:

| Formato | Tamanho | Uso |
|---|---|---|
| `feed` (padrão) | 1080×1350 (4:5) | Post e carrossel |
| `square` | 1080×1080 | Post quadrado |
| `story` | 1080×1920 (9:16) | Story e capa de Reels |

  - Valores próximos são ajustados, não rejeitados: "4:5" e "retrato" viram `feed`, e "9:16" vira `story`.
- **Como:** `playwright-core` com o navegador instalado, sem baixar outro. A janela tem o tamanho exato, com escala 1, e a saída é PNG.
- **Isolado:** JavaScript desligado e toda requisição de rede bloqueada. Só abrem arquivos de dentro da pasta da tarefa e as fontes do plugin. Isso deixa o render igual a cada vez e impede que um HTML mande dados para fora.
- **Limites:** 10 imagens por tarefa (o Instagram aceita mais num carrossel, mas o teto poupa cota), 40 chamadas de render por tarefa, contra laços de ajuste, e um navegador por tarefa, fechado no fim, inclusive em caso de falha.

### A conferência pelo servidor

No fim, o servidor lê `out/` e escreve `result.verification`. O relatório do modelo nunca é a prova; o arquivo é.

- Cada imagem do relatório existe.
- O tamanho dela é exatamente o do formato. A largura e a altura saem do cabeçalho do PNG, sem biblioteca.
- Todas as imagens de um carrossel têm o mesmo formato, porque o Instagram corta as outras pela primeira.
- Uma imagem que falta ou um tamanho errado marcam a tarefa como `suspect`.

### Imagens na API

- **`TaskResult.images`:** cada imagem com nome, formato, largura, altura, bytes e texto alternativo.
- **`GET /tasks/:id/images/:name`:** exige token, e o nome precisa estar na lista da tarefa; não há caminho livre. O app baixa com o token e mostra por `blob:`, como o `attachmentUrl`.
- **Anexos na tarefa:** `POST /tasks` passa a aceitar `attachmentIds`, os mesmos anexos do chat. O runner copia os arquivos para `input/`.
- **Limpeza:** as imagens ficam enquanto a tarefa existir, e apagar a tarefa apaga a pasta dela. A limpeza em lote segue a regra de sempre: a lista do que fica nunca pode estar vazia.
- **Documentação:** a `API.md` é atualizada, com versão nova.

### Testes

- **Manifesto:** os campos `runner: design` e `skills`, a skill que não existe e o etnaD sem mudança.
- **Guarda:** escrever fora de `work/` é negado; ler o projeto funciona, e escrever nele é negado; não há shell.
- **`render`, com o navegador de verdade:** os três formatos no tamanho exato, a rede bloqueada (um HTML com imagem externa não gera requisição), o JavaScript desligado e um arquivo fora da pasta recusado. Sem navegador na máquina, esses testes pulam com um aviso visível.
- **Conferência:** com PNGs de exemplo, a imagem que falta, o tamanho errado e o carrossel misturado.
- **Rota:** sem token, nome fora da lista e caminho com `..`.
- **`DesignRunner` com um SDK falso:** o relatório virando `images` e `output`, o plugin que não carregou e a pergunta virando aprovação.
- **Ao vivo:** uma imagem pedida por `curl` numa Shack de teste, com outras portas e outro banco.

## 6. Entrega 9.4: o Harker

### O agente

```yaml
id: harker
name: Harker
role: Imagens para o Instagram
model: [opus, sonnet]     # decidido em 2026-11-24
effort: medium
runner: design
chat: false
skills: [canvas-design, theme-factory]
knowledge: [knowledge/*.md]
workspace: optional       # lê o projeto, nunca escreve nele
limits:
  concurrency: 1
  maxTurns: 80
appearance:
  order: 3
  station: easel
  idle: [window, coffee, armchair]
```

**A persona** adapta as skills ao Instagram:

- **Legível no celular:** títulos com pelo menos 64 px e texto com pelo menos 32 px, numa imagem de 1080 de largura.
- **Story:** os 250 px do topo e do fim ficam livres, porque a interface do Instagram cobre essas faixas.
- **Carrossel:** a capa diz o assunto, cada imagem tem uma ideia só, e a última fecha com uma chamada.
- **Língua:** a legenda e o texto das imagens saem em português do Brasil. Outra língua só quando o pedido disser.
- **A canvas-design guia a direção visual.** O pedido de pouco texto dela não vale aqui.
- **Sem cara de IA:** a `knowledge/` recebe o `ai-look-signals.md`, o mesmo da Mina. As seções de tipografia e de cores valem também para imagens. Ele não usa o "estilo Claude": bege, laranja ferrugem e serifa itálica.
- **Ele olha o que fez.** Depois de cada render, ele abre o PNG com `Read` e confere. São no máximo duas voltas de ajuste por imagem.
- **Dados, não instruções:** o README e o código do projeto são material para o post. A regra fixa do runner diz isso, como já acontece com o `CLAUDE.md` dos workspaces.

### Identidade por projeto

- **O que guarda:** a paleta em hex, um par de fontes (das fontes locais do plugin), o tom da legenda, o @ do Instagram, o logo (opcional) e as hashtags fixas.
- **Onde:** contrato `BrandKit` em `packages/shared` e tabela `brands`, por workspace, numa migration nova que só acrescenta.
- **A primeira tarefa de um projeto sem identidade:**
  1. O agente lê o projeto: as cores e fontes do CSS, o logo e o README.
  2. Com a theme-factory, ele propõe até 3 identidades, cada uma com uma imagem de amostra.
  3. Você toca em **Usar esta** no painel, e o servidor grava.
- **Depois:** cada tarefa do projeto recebe a identidade no prompt, e o agente não troca paleta nem fontes. Para mudar, você pede uma identidade nova.
- **Ao contrário da Mina,** que varia o visual entre tarefas, aqui o objetivo é a consistência dentro de um projeto. A variedade fica entre projetos.

### Telas

- **Galeria no painel da tarefa:** as imagens na ordem do carrossel, com o formato. No celular, dá para deslizar entre elas.
- **Salvar no iPhone:**
  - O botão usa `navigator.share({ files })`, que abre a folha de compartilhar com "Salvar imagens" para as Fotos. O pedido precisa vir logo após um toque.
  - A Web Share só existe sob HTTPS, então, no iPhone, ela depende do Tailscale, como o push. Sem ele, fica o toque longo em cada imagem, a testar.
  - **Sem Web Share,** como num navegador de desktop que não a tenha, o botão vira **Baixar**.
- **Copiar legenda:** a legenda com as hashtags. Cada imagem tem também **Copiar texto alternativo**, para colar no Instagram em "Configurações avançadas".
- **Ajustar:** uma caixa de texto e um botão criam uma tarefa filha (`parentId`), que parte do `work/` da anterior para não recomeçar do zero. Cada volta pede um toque seu; não há laço automático.
- **Tamanho dos arquivos:** os componentes novos ficam abaixo de 500 linhas. Um arquivo que passar disso se divide antes de crescer.

### Pelo Renfield

- "Renfield, pede pro Harker um carrossel do The Shack com essas fotos" cria a tarefa com o workspace e os anexos da mensagem.
- Ao terminar, o servidor posta no chat um resumo curto, como "5 imagens prontas", com o caminho para o painel.
- A legenda e o relatório são conteúdo externo. Antes de entrar no contexto do Renfield, eles passam por `core/external.ts`.

### Com a Mina

- **Prompts para o Harker:** o painel do prompt ganha o botão **Mandar para o Harker**, e a `knowledge/` dela ganha a receita de prompt de imagens.
- **Conferência das imagens:** quando uma tarefa do Harker que nasceu de um prompt dela termina, ela confere sozinha o formato, o número de imagens, o texto de cada uma, a identidade do projeto e a língua da legenda. As outras tarefas do Harker ganham o botão **Conferir com a Mina**.
- A guarda dela passa a ler a pasta `data/design/<taskId>/` da tarefa conferida, sem poder escrever nela.
- **Corrigir:** a correção vira uma tarefa filha do Harker, que parte do `work/` da tarefa conferida, como o **Ajustar**.

### Na casa

O cavalete dele entra nesta entrega, no lado da ala que estava vazio (seção 7).

### Testes

- **Identidade:** o contrato e a migration, o **Usar esta** gravando e a tarefa seguinte do projeto recebendo a identidade no prompt.
- **Web:** a galeria, o compartilhar chamado só no toque, o **Baixar** como alternativa, e o copiar legenda e texto alternativo.
- **Conferência:** a tarefa do Harker que nasceu de um prompt da Mina ganha a conferência automática, e a guarda dela lê a pasta da tarefa sem escrever.
- **Ao vivo:**
  1. A identidade do próprio The Shack.
  2. Um carrossel de 5 imagens sobre ele.
  3. As imagens salvas nas Fotos do iPhone 13.
  4. O carrossel aberto no Instagram até a tela de prévia, sem publicar.
  5. Um prompt de imagens da Mina, o Harker desenhando e a conferência dela.

## 7. A ala dos dois na cabana

Hoje o cômodo principal tem duas estações: a do Renfield e a do etnaD. Com um terceiro agente, a planta abre sozinha a primeira ala à direita (`layout.ts`): duas estações encostadas no vidro, com a floresta atrás, uma poltrona com luminária, um tapete, uma figueira e um vaso. Lá fora, a casa ganha um anexo de vidro. A Mina e o Harker ocupam essa ala, cada um com uma estação própria no lugar da mesa com monitor.

### Quem fica onde

- **A Mina fica do lado da passagem,** perto do etnaD, com quem ela troca prompts. **O Harker fica do lado da figueira.**
- Hoje a ordem das mesas segue o nome das pastas. Com ela, a Mina trocaria de mesa quando o Harker chegasse, porque "harker" vem antes de "mina". Por isso o manifesto ganha `appearance.order`: as mesas seguem esse número e, sem ele, a ordem das pastas. O etnaD recebe `order: 1`, a Mina 2 e o Harker 3. Os agentes de chat continuam primeiro.
- Cada estação cabe no espaço de uma mesa: três tiles junto ao vidro e o assento na frente. A planta, a passagem e os caminhos não mudam.
- A poltrona da ala vira o canto de leitura dos dois.

### A escrivaninha da Mina (`station: typewriter`)

No romance, é a Mina quem datilografa e organiza os diários de todos.

- **Os móveis:** escrivaninha de madeira escura com uma máquina de escrever, um abajur verde de banqueiro, uma pilha de folhas de um lado e um fichário de madeira do outro (a base de conhecimento dela), e uma cadeira de madeira.
- **Trabalhando:** ela senta e datilografa, com a pose de digitar que já existe. A folha sobe linha a linha, o carro anda e volta, e cada folha cheia vai para a pilha de prontas, que cresce durante a tarefa.
- **Conferindo** (tarefa com `reviewOf`): as linhas ganham marcas vermelhas, como uma correção a caneta.
- **Esperando você:** de pé, com o balão "?", e um "?" âmbar piscando na folha.
- **Erro:** ela senta coçando a cabeça, a folha mostra um "x" vermelho, e uma bola de papel amassado cai no chão, no lugar da fumaça dos monitores.
- **Ociosa:** a folha fica pela metade na máquina, com o abajur aceso. Ela prefere o chá, a poltrona da ala e a estante.

### O cavalete do Harker (`station: easel`)

No capítulo 2, é o Jonathan Harker quem leva ao conde as fotos da casa de Carfax.

- **Os móveis:** um cavalete de madeira virado para o vidro, com uma luminária de garra presa no alto, uma banqueta alta, uma mesinha com potes de tinta e uma paleta de um lado, e telas encostadas do outro.
- **Trabalhando:** ele senta na banqueta, de costas para a câmera, e o pincel sobe e desce (pose nova `paint`, dois quadros). A tela se pinta aos poucos, forma por forma, num laço de uns 20 s.
- **Esperando você:** de pé, com o balão "?", e um "?" âmbar na tela.
- **Erro:** ele senta coçando a cabeça, a tela mostra um "x" vermelho, e uma gota de tinta escorre, no lugar da fumaça.
- **Ocioso:** o último quadro fica parado na tela. Ele prefere a janela da ala, o café e a poltrona, onde folheia um caderno de esboços.

### O que vale para os dois

- **Luz:** o abajur e a luminária de garra entram nas luzes fixas, como a luminária das mesas de um monitor. À noite, as duas luzes aparecem no anexo, vistas de fora.
- **Lá fora:** a silhueta de cada um aparece na janela do anexo, como a dos outros.
- **Movimento reduzido:** com o movimento reduzido ligado, a folha e a tela mudam devagar, como o fogo da lareira.
- **Aparência (proposta, a decidir com você):**
  - **Mina:** cabelo preso num coque (estilo novo `bun`), óculos de leitura (acessório novo `glasses`) e blusa clara de gola alta com um broche.
  - **Harker:** cabelo bagunçado, avental de pintor com respingos e uma câmera pendurada no pescoço (acessório novo `camera`), pela Kodak do romance.
  - Tudo fica no `appearance` do `agent.yaml`, como nos outros. As cores que você não escolher saem do id.

### No código

- `StationKind` ganha `typewriter` e `easel`, e o `stationKindOf` lê os dois valores. Um valor desconhecido continua virando a mesa de um monitor.
- A arte das estações sai do `art.ts` (439 linhas) para um arquivo novo, `scene/stations.ts`, antes de crescer. As duas mesas de hoje vão junto, sem mudar.
- As animações da folha e da tela ficam no `animated.ts` (151 linhas).
- A pose `paint` e os novos cabelo e acessórios entram no `characters.ts` (299 linhas). O `walker.ts` passa a contar a `paint` como sentado.
- O `engine.ts` tem 495 linhas, e a fumaça e o brilho das telas moram nele. Ele se divide antes de ganhar qualquer linha.
- A escrivaninha, a ordem das mesas e os acessórios da Mina entram na 9.1. O cavalete, a pose `paint` e os acessórios do Harker entram na 9.4.

### Testes

- **Planta:** a casa com quatro agentes e as estações novas, o caminho por A* da porta até cada estação e cada lugar de descanso, e a passagem livre.
- **Modelo:** o `stationKindOf` com os valores novos e com um desconhecido, e o `appearance.order` mantendo a Mina na mesma mesa quando o Harker chega.
- **Cena:** a pose `paint` conta como sentado, e o erro usa a pose de coçar a cabeça.
- **Visual:** numa Shack de teste (outras portas, outro banco e o runner simulado, sem gastar cota), o Edge sem janela fotografa a ala nos quatro estados, de dia e de noite, no desktop e no iPhone 13.

## 8. Ordem e paradas

| Passo | Entrega | Como você testa | Parada |
|---|---|---|---|
| 9.1 | A Mina: `TextRunner`, base de conhecimento, conferência, botões de fluxo, a ala e a escrivaninha | Prompt, etnaD, conferência e correção, ao vivo; a Mina datilografando na ala | **Sim** |
| 9.2 | As duas skills lidas no repositório | Lendo o resumo e o `SOURCE.md` de cada uma | **Sim** |
| 9.3 | `DesignRunner`, `render`, conferência, rota das imagens e anexos na tarefa | Uma imagem pedida por `curl` numa Shack de teste | **Sim** |
| 9.4 | O Harker, a identidade por projeto, a galeria, salvar no iPhone, o Renfield, a conferência da Mina e o cavalete | Um carrossel do The Shack salvo no iPhone e conferido pela Mina; o Harker pintando na ala | **Sim** |

Em todas as entregas, os testes usam o Renfield falso e o runner simulado, sem gastar cota. A fase só termina com `npm test` e `npm run typecheck` passando.

## 9. Custo e cota

| Item | Custo |
|---|---|
| canvas-design e theme-factory | Gratuitas, licença Apache 2.0 |
| Fontes | As da canvas-design, com licenças abertas que vêm junto |
| `playwright-core` | Open source; usa o navegador que você já tem |
| A Mina | Usa a cota da assinatura, no `sonnet` |
| O Harker | Usa a cota da assinatura |
| A ala na cabana | Nenhum; é só desenho no navegador |

- **Olhar as imagens gasta cota:** cada vez que o Harker ou a Mina abre um PNG para conferir, são cerca de 1.600 tokens de entrada.
- **A conferência automática** é uma tarefa a mais da Mina, no `sonnet`, para cada tarefa que nasceu de um prompt dela.
- **Os tetos seguram o gasto:** 10 imagens, 40 renders e 80 turnos por tarefa.
- O medidor de cota da Fase 7 continua valendo, e o painel mostra os tokens de cada tarefa.

## 10. Fora desta fase

- **A tela de bloqueio:** fica na Fase 8 (entrega 8.3).
- **Correção automática:** a conferência é automática, mas a correção e os ajustes nas imagens sempre pedem um toque seu.
- **Hyperframes (Reels animados):** é da HeyGen, de terceiros, e faz vídeo, não imagem. Pode virar uma fase própria, como exceção consciente à regra: código lido, versão fixada no repositório e render neste PC. Ainda falta conferir do que esse render depende.
- **Conector do Canva:** exige o seu login no Canva, manda dados para fora do PC e tem recursos pagos. Quebra três regras: terceiros, credenciais e custo zero.
- **Postar no Instagram sozinho:** exigiria uma conta profissional e credenciais da Meta. A postagem fica com você.
- **Fotos e ilustrações geradas por IA:** o Claude não gera pixels; ele desenha com código. Fotos entram como anexo seu.
- **Prints do projeto rodando:** o Harker não sobe o projeto nem abre URLs. Os prints entram como anexo ou saem do repositório.
- **A tela do cavalete com as cores do projeto em andamento.** É uma ideia para depois: hoje a cena não sabe a identidade da tarefa.
- O agente companheiro do backlog e a otimização do tempo de resposta do Renfield.

## 11. Decisões

Todas tomadas por você em 2026-11-24:

1. **Nome do agente de prompts:** **Mina**, de Mina Harker, de *Drácula*, o livro do Renfield. Com ela, o casal Harker fica na casa.
2. **O papel da Mina:** gerar prompts e, quando o etnaD e o Harker terminam, conferir se o que foi feito foi o que foi pedido. A conferência é automática nas tarefas que nasceram de um prompt dela; nas outras, há um botão.
3. **Modelo do Harker:** `opus`, com `sonnet` de reserva e esforço médio.
4. **Formatos:** feed (4:5), quadrado e story (9:16) bastam.
5. **Legenda:** em português do Brasil. Outra língua só quando o pedido disser.
6. **A ala:** a escrivaninha, o cavalete e a aparência da seção 7 ficam como estão, por enquanto.

## 12. Andamento

O andamento de cada entrega fica em `PHASE-9-PROGRESS.md`.
