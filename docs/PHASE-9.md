# The Shack: plano da Fase 9 (agente de imagens para o Instagram)

Proposta de 2026-11-07. Ainda não começou; o andamento fica na seção 9.

O plano geral fica em `PLAN.md`, e a Fase 8 em `PHASE-8.md`. Este arquivo é separado pelo mesmo motivo: o `PLAN.md` já passou de 500 linhas.

## 0. Resumo

Um agente novo cria imagens para o Instagram dos seus projetos: post único, carrossel e capa de story ou Reels. Ele também escreve a legenda. Nome provisório: **Harker** (seção 8).

- **Skills:** ele usa duas skills da Anthropic, a **canvas-design** e a **theme-factory**. Elas são copiadas para o repositório e lidas antes de entrar.
- **Desenho:** ele desenha com HTML e CSS, e o servidor transforma o resultado em PNG num navegador sem janela, neste PC.
- **Identidade:** cada projeto ganha uma (paleta, fontes e tom), para que os posts dele combinem entre si.
- **Entrega:** você vê as imagens no app, salva no iPhone e posta você mesmo.

Tudo continua com custo zero. Nada usa chave de API, serviço pago ou login de terceiros.

A fase tem três entregas, com uma parada para aprovação depois de cada uma:

1. **9.1 Skills lidas:** as duas skills entram no repositório depois de lidas, com um resumo para você aprovar.
2. **9.2 Motor de imagens:** runner, ferramenta de render, conferência pelo servidor e rota das imagens.
3. **9.3 O agente e as telas:** persona, identidade por projeto, galeria, salvar no iPhone e o pedido pelo Renfield.

## 1. Antes de começar

- **Relação com a Fase 8.** A 8.2 cria o campo `runner` no manifesto, a pasta `knowledge/` e o campo `output` do `TaskResult`. Esta fase usa os três. Se a 9 vier antes da 8.2, eles nascem aqui, no mesmo formato, e a 8.2 só os reaproveita.
- **Um navegador nos dois computadores.** O render usa o navegador que já está instalado: o Edge no Windows e o Chromium ou o Chrome no Arch.
  - O caminho fica em `SHACK_BROWSER_PATH`. Sem ele, o servidor procura nos lugares de sempre.
  - Sem navegador, o agente fica desativado com um erro claro.
- **Tailscale:** só o botão de salvar no iPhone depende dele (seção 4, "Telas").

## 2. Entrega 9.1: skills lidas

### Por que ler antes

A regra "não instale skills de terceiros" existe por causa do risco: uma skill é instrução que o modelo segue. As duas desta fase são da Anthropic, a mesma empresa do modelo, mas entram pelo mesmo cuidado:

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

## 3. Entrega 9.2: motor de imagens

### Manifesto

Campos novos, com contrato em `packages/shared`:

- `runner: design`: um valor novo para o campo da 8.2.
- `skills: [canvas-design, theme-factory]`: nomes das pastas em `plugins/shack/skills/`. Uma skill que não existe desativa o agente com um erro claro.
- `knowledge`: igual ao da 8.2.

O etnaD e o Renfield não mudam.

### O `DesignRunner`

- Mesma assinatura e mesma trava de credencial dos outros runners.
- **Skills:**
  - `plugins: [{ type: 'local', path: 'plugins/shack' }]` e `skills: ['shack:canvas-design', 'shack:theme-factory']`.
  - No início, o runner confere em `initializationResult().plugins_applied` se o plugin carregou. Se não carregou, a tarefa falha antes do primeiro pedido ao modelo.
- **Nada de fora entra:** `settingSources: []` e `strictMcpConfig: true`, com os conectores do claude.ai desligados (`disableClaudeAiConnectors`).
  - As suas skills pessoais e o `CLAUDE.md` não chegam a ele.
  - Um conector que você ligar na sua conta, como o do Canva, também não aparece para ele.
- **A pasta da tarefa** fica em `data/design/<taskId>/` e é o `cwd` do agente:
  - `input/`: anexos e prints que você mandou, só leitura.
  - `work/`: o HTML e o CSS que ele escreve.
  - `out/`: os PNGs, escritos só pela ferramenta de render.
- **Ferramentas:** `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Skill` e `AskUserQuestion`, mais a ferramenta `render`. Ele não tem shell.
- **Guarda de caminhos:** uma variação do `workspaceGuard`, com raízes de leitura e de escrita separadas.
  - Ele só escreve em `work/`.
  - Ele lê `input/`, `work/`, `out/` e a pasta do plugin, onde estão os temas e as fontes.
  - Se a tarefa tiver workspace, ele também lê o projeto, sem poder escrever nele (`workspace: optional`).
- **Saída estruturada:**
  - a ordem das imagens;
  - um texto alternativo para cada uma;
  - a legenda e as hashtags, em `output`;
  - a direção visual usada (paleta e fontes).

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
- **Isolado:**
  - JavaScript desligado.
  - Toda requisição de rede bloqueada. Só abrem arquivos de dentro da pasta da tarefa e as fontes do plugin.
  - Isso deixa o render igual a cada vez e impede que um HTML mande dados para fora.
- **Limites:**
  - 10 imagens por tarefa. O Instagram aceita mais num carrossel, mas o teto poupa cota.
  - 40 chamadas de render por tarefa, contra laços de ajuste.
  - Um navegador por tarefa, fechado no fim, inclusive em caso de falha.

### A conferência pelo servidor

No fim, o servidor lê `out/` e escreve `result.verification`. O relatório do modelo nunca é a prova; o arquivo é.

- **O que ele confere:**
  - Cada imagem do relatório existe.
  - O tamanho dela é exatamente o do formato. A largura e a altura saem do cabeçalho do PNG, sem biblioteca.
  - Todas as imagens de um carrossel têm o mesmo formato, porque o Instagram corta as outras pela primeira.
- **Se falhar:** uma imagem que falta ou um tamanho errado marcam a tarefa como `suspect`.

### Imagens na API

- **`TaskResult.images`:** cada imagem com nome, formato, largura, altura, bytes e texto alternativo. Nasce em `packages/shared`.
- **`GET /tasks/:id/images/:name`:**
  - Exige token.
  - O nome precisa estar na lista da tarefa. Não há caminho livre.
  - O app baixa com o token e mostra por `blob:`, como o `attachmentUrl`.
- **Anexos na tarefa:**
  - `POST /tasks` passa a aceitar `attachmentIds`, os mesmos anexos do chat.
  - O runner copia os arquivos para `input/`.
- **Limpeza:**
  - As imagens ficam enquanto a tarefa existir, e apagar a tarefa apaga a pasta dela.
  - A limpeza em lote segue a regra de sempre: a lista do que fica nunca pode estar vazia.
- **Documentação:** a `API.md` é atualizada, com versão nova.

### Testes

- **Manifesto:** os campos `runner: design` e `skills`, a skill que não existe e o etnaD sem mudança.
- **Guarda:**
  - escrever fora de `work/` é negado;
  - ler o projeto funciona, e escrever nele é negado;
  - não há shell.
- **`render`, com o navegador de verdade:**
  - os três formatos no tamanho exato;
  - a rede bloqueada (um HTML com imagem externa não gera requisição);
  - o JavaScript desligado;
  - um arquivo fora da pasta recusado.
  - Sem navegador na máquina, esses testes pulam com um aviso visível.
- **Conferência:** com PNGs de exemplo, a imagem que falta, o tamanho errado e o carrossel misturado.
- **Rota:** sem token, nome fora da lista e caminho com `..`.
- **`DesignRunner` com um SDK falso:** o relatório virando `images` e `output`, o plugin que não carregou e a pergunta virando aprovação.
- **Ao vivo:** uma imagem pedida por `curl` numa Shack de teste, com outras portas e outro banco.

## 4. Entrega 9.3: o agente e as telas

### O agente

```yaml
id: harker
name: Harker
role: Imagens para o Instagram
model: [opus, sonnet]     # seção 8, decisão 2
effort: medium
runner: design
chat: false
skills: [canvas-design, theme-factory]
knowledge: [knowledge/*.md]
workspace: optional       # lê o projeto, nunca escreve nele
limits:
  concurrency: 1
  maxTurns: 80
```

**A persona** adapta as skills ao Instagram:

- **Legível no celular:** títulos com pelo menos 64 px e texto com pelo menos 32 px, numa imagem de 1080 de largura.
- **Story:** os 250 px do topo e do fim ficam livres, porque a interface do Instagram cobre essas faixas.
- **Carrossel:**
  - a capa diz o assunto;
  - cada imagem tem uma ideia só;
  - a última fecha com uma chamada.
- **A canvas-design guia a direção visual.** O pedido de pouco texto dela não vale aqui.
- **Sem cara de IA:**
  - A `knowledge/` recebe o `ai-look-signals.md`, o mesmo do Ford. As seções de tipografia e de cores valem também para imagens.
  - Ele não usa o "estilo Claude": bege, laranja ferrugem e serifa itálica.
- **Ele olha o que fez.** Depois de cada render, ele abre o PNG com `Read` e confere. São no máximo duas voltas de ajuste por imagem.
- **Dados, não instruções:** o README e o código do projeto são material para o post. A regra fixa do runner diz isso, como já acontece com o `CLAUDE.md` dos workspaces.

### Identidade por projeto

- **O que guarda:**
  - a paleta em hex;
  - um par de fontes, das fontes locais do plugin;
  - o tom da legenda;
  - o @ do Instagram;
  - o logo (opcional);
  - as hashtags fixas.
- **Onde:** contrato `BrandKit` em `packages/shared` e tabela `brands`, por workspace, numa migration nova que só acrescenta.
- **A primeira tarefa de um projeto sem identidade:**
  1. O agente lê o projeto: as cores e fontes do CSS, o logo e o README.
  2. Com a theme-factory, ele propõe até 3 identidades, cada uma com uma imagem de amostra.
  3. Você toca em **Usar esta** no painel, e o servidor grava.
- **Depois:** cada tarefa do projeto recebe a identidade no prompt, e o agente não troca paleta nem fontes. Para mudar, você pede uma identidade nova.
- **Ao contrário da 8.2:** lá, o Ford varia o visual entre tarefas. Aqui, o objetivo é a consistência dentro de um projeto, e a variedade fica entre projetos.

### Telas

- **Galeria no painel da tarefa:** as imagens na ordem do carrossel, com o formato. No celular, dá para deslizar entre elas.
- **Salvar no iPhone:**
  - O botão usa `navigator.share({ files })`, que abre a folha de compartilhar com "Salvar imagens" para as Fotos.
  - O pedido precisa vir logo após um toque.
  - A Web Share só existe sob HTTPS, então, no iPhone, ela depende do Tailscale, como o push. Sem ele, fica o toque longo em cada imagem, a testar.
  - **Sem Web Share,** como num navegador de desktop que não a tenha, o botão vira **Baixar**.
- **Copiar legenda:** a legenda com as hashtags. Cada imagem tem também **Copiar texto alternativo**, para colar no Instagram em "Configurações avançadas".
- **Ajustar:**
  - Uma caixa de texto e um botão criam uma tarefa filha (`parentId`).
  - Ela parte do `work/` da anterior, para não recomeçar do zero.
  - Cada volta pede um toque seu; não há laço automático.
- **Tamanho dos arquivos:** os componentes novos ficam abaixo de 500 linhas. Um arquivo que passar disso se divide antes de crescer.

### Pelo Renfield

- "Renfield, pede pro Harker um carrossel do The Shack com essas fotos" cria a tarefa com o workspace e os anexos da mensagem.
- Ao terminar, o servidor posta no chat um resumo curto, como "5 imagens prontas", com o caminho para o painel.
- A legenda e o relatório são conteúdo externo. Antes de entrar no contexto do Renfield, eles passam por `core/external.ts`.

### Na casa

- **Estação nova:** um cavalete (`station: easel`), com tela, pincéis e uma luminária.
- **Ociosos:** ele olha a janela, folheia um caderno de esboços ou toma um café.
- **Onde ele fica:** com o Ford, ele é o quarto agente e ocupa a segunda estação da primeira ala. Sem o Ford, ele abre a ala.
- **O `engine.ts`:** se a mudança tocar nele (911 linhas hoje), ele se divide antes, como manda o `CLAUDE.md`.
- A aparência fica a combinar com você.

### Testes

- **Identidade:**
  - o contrato e a migration;
  - o **Usar esta** gravando;
  - a tarefa seguinte do projeto recebendo a identidade no prompt.
- **Web:**
  - a galeria;
  - o compartilhar chamado só no toque;
  - o **Baixar** como alternativa;
  - o copiar legenda e o texto alternativo.
- **Cena:** o layout com quatro agentes e o cavalete.
- **Ao vivo:**
  1. A identidade do próprio The Shack.
  2. Um carrossel de 5 imagens sobre ele.
  3. As imagens salvas nas Fotos do iPhone 13.
  4. O carrossel aberto no Instagram até a tela de prévia, sem publicar.

## 5. Ordem e paradas

| Passo | Entrega | Como você testa | Parada |
|---|---|---|---|
| 9.1 | As duas skills lidas no repositório | Lendo o resumo e o `SOURCE.md` de cada uma | **Sim** |
| 9.2 | Manifesto, `DesignRunner`, `render`, conferência, rota das imagens e anexos na tarefa | Uma imagem pedida por `curl` numa Shack de teste | **Sim** |
| 9.3 | O agente, a identidade por projeto, a galeria, salvar no iPhone, o Renfield e o cavalete | Um carrossel do The Shack salvo no iPhone | **Sim** |

Em todas as entregas, os testes usam o Renfield falso e o runner simulado, sem gastar cota. A fase só termina com `npm test` e `npm run typecheck` passando.

## 6. Custo e cota

| Item | Custo |
|---|---|
| canvas-design e theme-factory | Gratuitas, licença Apache 2.0 |
| Fontes | As da canvas-design, com licenças abertas que vêm junto |
| `playwright-core` | Open source; usa o navegador que você já tem |
| O agente | Usa a cota da assinatura |

- **Olhar as imagens gasta cota:** cada vez que ele abre um PNG para conferir, são cerca de 1.600 tokens de entrada.
- **Os tetos seguram o gasto:** 10 imagens, 40 renders e 80 turnos por tarefa.
- O medidor de cota da Fase 7 continua valendo, e o painel mostra os tokens de cada tarefa.

## 7. Fora desta fase

- **Hyperframes (Reels animados):**
  - É da HeyGen, de terceiros, e faz vídeo, não imagem.
  - Pode virar uma fase própria, como exceção consciente à regra: código lido, versão fixada no repositório e render neste PC.
  - Ainda falta conferir do que esse render depende.
- **Conector do Canva:** fica de fora. Ele exige o seu login no Canva, manda dados para fora do PC e tem recursos pagos. Quebra três regras: terceiros, credenciais e custo zero.
- **Postar no Instagram sozinho:** exigiria uma conta profissional e credenciais da Meta. A postagem fica com você.
- **Fotos e ilustrações geradas por IA:** o Claude não gera pixels; ele desenha com código. Fotos entram como anexo seu.
- **Prints do projeto rodando:** o agente não sobe o projeto nem abre URLs. Os prints entram como anexo ou saem do repositório.
- **Laço automático de ajustes.**

## 8. Decisões que preciso de você

1. **Nome do agente.**
   - **Harker**, de Jonathan Harker, de *Drácula*, o mesmo livro do Renfield. No capítulo 2, ele leva ao conde as fotos que tirou com a Kodak da casa de Carfax: é ele quem faz as imagens.
   - Se o Ford virar **Mina** (Fase 8, decisão 1), o casal Harker fica na casa.
   - A aparência também fica com você.
2. **Modelo.**
   - Recomendo `opus`, com `sonnet` de reserva e esforço médio. Design é onde o Opus mais se diferencia, e os tetos da seção 6 limitam o gasto.
   - A alternativa é só `sonnet`, mais econômico.
3. **Formatos.** Feed (4:5), quadrado e story (9:16) bastam, ou falta algum?
4. **Legenda.** Sempre em português do Brasil, ou algum projeto precisa de inglês?
5. **Ordem com a Fase 8.**
   - Recomendo fazer a 9 depois da 8.2, que já cria o campo `runner` e o `output`.
   - Se quiser a 9 antes, esses campos nascem aqui.

## 9. Andamento

Ainda não começou. Aguardando as decisões da seção 8 e o seu ok para a 9.1.
