# The Shack: plano de arquitetura (Fase 1)

> **Status:** plano aprovado. Visual aprovado no protótipo v2. Fases 2 (núcleo), 3 (Renfield), 4 (etnaD) e 5 (assistente) concluídas. **Fase 6 (Shack visual) concluída em 2026-10-22**, aguardando sua revisão.
> **Nome, 2026-11-05:** o mordomo se chamava Marvin e passou a se chamar Renfield (id `renfield`). Este plano já usa o nome novo; o protótipo e o `prompt-shack.md` guardam o antigo.
> **Revisão 2, 2026-10-21:**
> - Custo zero: o Shack roda só com os modelos da sua assinatura, sem Fable e sem chave de API.
> - Visual top-down, com a câmera do Stardew Valley.
>
> Os fatos sobre o Agent SDK e o login foram conferidos na documentação oficial nesta data.

## 0. Resumo

- Monorepo com npm workspaces: `apps/server` (Node + Hono), `apps/web` (React + Vite, PWA) e `packages/shared` (contratos zod + cliente tipado).
- Um único processo de backend faz tudo: API REST, WebSocket, task bus, agendador e execução dos agentes.
- Um agente é uma pasta `agents/<id>/` com `agent.yaml` e `persona.md`. Um único *runner* monta as opções do Agent SDK a partir do manifesto.
- **Custo zero:** os agentes usam o login da sua assinatura e só os modelos do seu plano. O servidor bloqueia qualquer caminho que gere cobrança.
- Persistência em SQLite (`node:sqlite`, embutido no Node), atrás de repositórios com SQL simples.
- Cena em pixel art top-down, com câmera inclinada como no Stardew Valley: uma casa de vidro numa floresta enevoada, desenhada em Canvas 2D puro com mapas e sprites feitos em código. Ela cresce sozinha com os agentes.

## 1. Pré-requisitos nesta máquina

Verifiquei o ambiente: Node, npm e Git **não estão instalados**. Já existe um login do Claude Code salvo neste PC, e nenhuma chave de API está configurada.

| Item | Por quê | Como |
|---|---|---|
| Node.js 24+ (LTS) | Backend roda `.ts` direto (type stripping nativo) e builda o web | `winget install OpenJS.NodeJS.LTS` |
| Git for Windows | Git do etnaD. Também dá ao Claude Code a ferramenta Bash; sem ele, o Claude Code usa PowerShell | `winget install Git.Git` |
| Login do Claude Code com sua assinatura | O Agent SDK roda o binário do Claude Code, que usa o seu login | Já existe um login salvo. Se precisar refazer, use `/login` no Claude Code |

Tudo é gratuito. A seção 14 detalha custo e cota.

## 2. Stack e justificativas

| Camada | Escolha | Por quê |
|---|---|---|
| Runtime | Node 24+ | Roda TypeScript sem build (`node --watch src/main.ts`), lê `.env` nativamente (`--env-file`). Zero ferramenta extra no backend. |
| HTTP + WS | Hono, `@hono/node-server` v2 com `ws` | Leve, baseado em Web Standards, WebSocket no mesmo servidor. `app.request()` permite testar rotas sem abrir porta. O `@hono/node-ws` do plano original foi descontinuado; o WebSocket agora vem do próprio `@hono/node-server`. |
| Contratos | zod em `packages/shared` + `@hono/zod-openapi` | Um schema gera validação, tipos e o OpenAPI. O Agent SDK já usa zod para definir ferramentas, então é a mesma lib. |
| Banco | SQLite via `node:sqlite` | Embutido no Node, zero dependência. SQL puro em repositórios: trocar de banco = reescrever só `db/`. Se `node:sqlite` der problema, `better-sqlite3` entra no mesmo arquivo. |
| Agendador | `croner` | Zero dependências, cron com fuso horário. |
| Recorrência de eventos | RRULE (lib `rrule`, Fase 5) | Mesmo formato do Google Calendar, então o adapter futuro não precisa converter nada. |
| Agentes | `@anthropic-ai/claude-agent-sdk` | Exigência do projeto. O pacote já traz o binário do Claude Code para Windows x64, que autentica com o login da sua assinatura. |
| Push web | `web-push` (VAPID, Fase 5) | Padrão aberto e gratuito; funciona com o PWA fechado. |
| Manifesto | `yaml` | Parser sem dependências. |
| Frontend | React + Vite | O app mobile futuro em React Native reaproveita o modelo mental e o cliente tipado. Sem lib de estado e sem lib de UI. |
| Cena | Canvas 2D puro | Tile map, câmera e ordenação por profundidade cabem em pouco código. PixiJS seria peso sem ganho. |
| Testes | `node:test` | Embutido no Node. |
| Monorepo | npm workspaces | Nada extra para instalar. Expo/React Native funciona bem com ele. |

Dependências de runtime previstas no backend: hono (+2 adaptadores), @hono/zod-openapi, zod, yaml, croner, Agent SDK, e na Fase 5 web-push e rrule. No web: react e react-dom. Todas são open source e gratuitas.

## 3. Visão geral

```
   Web (PWA)          Mobile (futuro)        Scripts/CLI
       \                    |                    /
        \     REST + WebSocket, token por dispositivo
         v                  v                  v
 +-----------------------------------------------------------+
 |  apps/server  (um processo Node)                          |
 |                                                           |
 |  api/     auth -> rotas REST -> gateway WS                |
 |  core/    registry | task bus | event stream | approvals  |
 |  agents/  runner (Agent SDK, login da assinatura)         |
 |             renfield: chat + ferramentas MCP "shack"        |
 |             etnad:  Claude Code dentro de workspaces      |
 |  assistant/  calendário, lembretes, timers, listas, notas |
 |              scheduler (croner)                           |
 |  notifications/  canais ws | webpush | (push mobile)      |
 |  voice/   stubs STT/TTS                                   |
 |  db/      SQLite + repositórios                           |
 +-----------------------------------------------------------+
            ^ fs.watch
     agents/<id>/agent.yaml + persona.md
```

**Exemplo de fluxo:** "Renfield, pede pro etnaD adicionar testes no projeto X."

1. O web envia `chat.send` pelo WebSocket.
2. O serviço de chat entrega a mensagem à sessão do Renfield no Agent SDK.
3. O Renfield chama a ferramenta `tasks_create`. O task bus grava a tarefa como `queued` e publica `task.created`.
4. O dispatcher vê o etnaD livre, muda a tarefa para `running` e abre um `query()` com `cwd` no workspace X.
5. As mensagens do SDK viram eventos `task.progress`. Na cena, o etnaD caminha até a mesa e começa a digitar.
6. O etnaD quer rodar um comando fora da allowlist. O `canUseTool` cria uma aprovação, a tarefa vai para `waiting_input`, aparece o balão "?" e chega uma notificação.
7. Você aprova no painel. Ao terminar, a tarefa vira `done` com relatório, e o servidor posta um resumo curto no chat do Renfield.

## 4. Núcleo

### 4.1 Registro de agentes

- No boot, lê `agents/*/agent.yaml` e valida com zod. Manifesto inválido não derruba o sistema: o agente fica desativado e o erro aparece na API e na tela.
- `fs.watch` observa a pasta. Mudou manifesto ou persona: recarrega e publica `agent.updated`. A mudança vale a partir do próximo turno de chat ou da próxima tarefa.
- Pasta nova = agente novo, com visual e estação na casa. Ferramentas novas exigem código em `agents/tools/`; o manifesto só referencia grupos de ferramentas pelo nome.
- `model` é uma lista de apelidos em ordem de preferência. No boot, o servidor pergunta ao SDK quais modelos a sua conta tem e usa o primeiro disponível (seção 14).

Manifesto do etnaD:

```yaml
id: etnad                     # igual ao nome da pasta; usado na API
name: etnaD
role: Agente de programação
model: [opus, sonnet]         # apelidos; usa o primeiro que o seu plano tiver
effort: high                  # low | medium | high | xhigh | max
persona: persona.md
chat: false                   # true = tem sessão de chat (Renfield)
tools:
  builtin: [Read, Glob, Grep, Edit, Write, Bash, PowerShell]
  shack: [report]
workspace: required
permissions:
  autoApprove:                # vira allowedTools com escopo no SDK
    - "Bash(git status*)"
    - "Bash(git diff*)"
    - "Bash(npm test*)"
  deny:                       # vira disallowedTools; vale em qualquer modo
    - "Bash(git push*)"
limits:
  concurrency: 1
  maxTurns: 300
appearance:
  palette: { skin: "#c68863", hair: "#1f1b18", outfit: "#2f6f4e", accent: "#f2c14e" }
  hair: short-messy
  accessory: headphones
  station: dual-monitor
  idle: [coffee, bookshelf, water-plant]
```

Manifesto do Renfield (diferenças):

```yaml
id: renfield
name: Renfield
role: Assistente pessoal e orquestrador
model: [sonnet, haiku]
effort: low
chat: true
tools:
  builtin: []                 # sem arquivos e sem shell
  shack: [agents, tasks, calendar, reminders, timers, lists, notes, memory, rules, notify]
confirm: [tasks_cancel, calendar_delete, reminders_delete, lists_delete, memory_delete]
appearance:
  hair: neat
  accessory: bowtie
  station: single-monitor
  idle: [tea, sofa-read]
```

### 4.2 Task bus

```
 queued --> running --> done
   |         |  ^  \--> failed
   |         v  |
   |     waiting_input
   |         |
   +---------+--------> cancelled
```

Transições válidas: `queued -> running | cancelled`, `running -> waiting_input | done | failed | cancelled`, `waiting_input -> running | failed | cancelled`.

```ts
type TaskStatus = 'queued' | 'running' | 'waiting_input' | 'done' | 'failed' | 'cancelled';

interface Task {
  id: string;
  title: string;
  prompt: string;
  assignee: string;                 // id do agente
  origin: { kind: 'user' | 'agent' | 'schedule'; agentId?: string; deviceId?: string; conversationId?: string };
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high';
  workspaceId?: string;
  parentId?: string;
  sessionId?: string;               // sessão do Agent SDK, para retomar
  model?: string;                   // modelo efetivamente usado
  result?: TaskResult;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };   // consumo de cota, não dinheiro
  createdAt: string;                // ISO 8601 em UTC
  startedAt?: string;
  finishedAt?: string;
}

interface TaskResult {
  summary: string;
  changes: { path: string; what: string }[];
  howToTest: string;
  notes?: string;
}
```

- Cada transição grava uma linha em `task_history` e publica o evento na mesma transação.
- Uma fila por agente, respeitando `limits.concurrency`. O dispatcher roda quando uma tarefa é criada ou termina.
- Se o servidor reiniciar, tarefas `running` viram `failed` com o motivo "interrompida por reinício". `POST /tasks/:id/retry` retoma a sessão do SDK com `resume`.
- Se a cota do plano acabar, a fila pausa (seção 14). As tarefas continuam `queued` e voltam a andar sozinhas quando a cota volta.

### 4.3 Stream de eventos

```ts
interface ShackEvent {
  seq: number;          // crescente; usado para replay
  id: string;
  ts: string;
  type: EventType;
  agentId?: string;
  taskId?: string;
  data: unknown;        // schema por tipo, em packages/shared
}
```

| Tipo | Quando |
|---|---|
| `agent.status` | Mudou o estado visível: `idle`, `working`, `waiting_input`, `error`, com uma atividade curta ("Editando src/app.ts") |
| `agent.updated` | Manifesto ou persona recarregado, agente novo ou removido |
| `task.created`, `task.updated`, `task.progress` | Ciclo de vida e progresso |
| `task.waiting_input` | Pergunta ou aprovação pendente |
| `task.done`, `task.failed`, `task.cancelled` | Fim da tarefa |
| `approval.requested`, `approval.resolved` | Aprovações |
| `chat.message` | Mensagem final no chat (os pedaços em streaming vão só pelo WS) |
| `reminder.fired`, `timer.finished`, `calendar.changed` | Assistente |
| `notification.created` | Nova notificação |
| `system.quota` | Cota do plano esgotada ou liberada, com horário previsto de volta |

- Eventos ficam na tabela `events`. Ao reconectar, o cliente manda o último `seq` e recebe o que perdeu. Retenção padrão de 30 dias.
- Pub/sub em memória, dentro do processo. Sem Redis e sem broker.
- O status do agente é derivado: `waiting_input` se alguma tarefa espera você; `working` se alguma roda ou o Renfield está respondendo; `error` se a última tarefa falhou e você ainda não abriu o painel; senão `idle`.

### 4.4 Aprovações

Tudo o que precisa de um "sim" seu passa por uma única entidade:

```ts
interface Approval {
  id: string;
  agentId: string;
  taskId?: string;
  kind: 'tool' | 'question' | 'destructive';
  summary: string;                  // texto curto, bom para notificação e voz
  detail: unknown;                  // comando, caminho, opções etc.
  options?: string[];
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: string;
  resolvedAt?: string;
}
```

- **Origem:** o callback `canUseTool` do Agent SDK. Ele recebe as ferramentas não pré-aprovadas, as perguntas do agente (`AskUserQuestion`) e as ferramentas destrutivas do Renfield.
- **Resposta:** botão no painel ou no chat, `POST /approvals/:id`, ou responder "sim"/"não" no chat do Renfield.

### 4.5 Persistência

- Tabelas: `devices`, `pairing_codes`, `tasks`, `task_history`, `events`, `approvals`, `conversations`, `messages`, `memories`, `rules`, `modes`, `settings`, `workspaces`, `calendar_events`, `reminders`, `timers`, `lists`, `list_items`, `notes`, `notifications`, `push_subscriptions`, `schema_migrations`.
- Migrations são arquivos `.sql` numerados, aplicados no boot.
- Datas em UTC no banco. Exibição e agendamento usam o fuso de `settings` (padrão `America/Sao_Paulo`).
- IDs com `crypto.randomUUID()`.

### 4.6 Autenticação

- **Token por dispositivo:** 32 bytes aleatórios, mostrado uma única vez, guardado como hash SHA-256 em `devices` (nome, tipo, último acesso, revogado).
- **Primeiro token:** `npm run token -- --name "PC"`, rodado no servidor.
- **Pareamento:** um dispositivo logado gera um código de 6 dígitos que vale 5 minutos. O celular troca o código por um token em `POST /auth/pair`. Depois isso vira QR code.
- **REST:** cabeçalho `Authorization: Bearer <token>`.
- **WebSocket:** a primeira mensagem tem que ser `{ type: "auth" }` em até 5 segundos. O navegador não manda cabeçalho no WS, e token na URL vaza em logs.
- **Rede:** o servidor escuta só em `127.0.0.1` por padrão. Abrir para a rede é uma opção explícita no `.env`.
- **Revogação:** revogar um dispositivo derruba na hora as conexões WS dele.
- Esses tokens são do Shack e não têm relação com o seu login da Anthropic. O Shack nunca lê nem guarda as credenciais da sua assinatura.

## 5. Renfield

### Execução

- Uma sessão do Agent SDK por conversa, em *streaming input* (o `prompt` é um `AsyncIterable`). O processo fica vivo entre mensagens.
- **Opções do SDK:**
  - O modelo vem da lista do manifesto, por padrão `sonnet` e, como alternativa, `haiku`. O `effort` também vem do manifesto.
  - O `systemPrompt` junta regras fixas, persona, memórias e regras aprendidas.
  - As ferramentas de arquivo e shell ficam desligadas.
  - `mcpServers` recebe o servidor in-process `shack`, criado com `createSdkMcpServer`.
  - `settingSources: []` impede que suas configurações globais do Claude Code (`~/.claude`) vazem para o Renfield.
- Quando persona, memória ou regra muda, a sessão fecha ao fim do turno atual. A próxima mensagem reabre com `resume`: mesmo histórico, prompt atualizado.
- A cada mensagem sua, o servidor anexa um bloco curto de contexto: data e hora em São Paulo, modo ativo, status dos agentes e tarefas abertas. Assim "o que o etnaD está fazendo?" é respondido sem chamada de ferramenta.
- O histórico mostrado nos clientes vem da tabela `messages`. A sessão do SDK guarda só o contexto do modelo e se compacta sozinha.

### Ferramentas MCP "shack"

| Grupo | Ferramentas |
|---|---|
| agents | `agents_status` |
| tasks | `tasks_list`, `tasks_get`, `tasks_create`, `tasks_cancel`*, `tasks_answer` |
| calendar | `calendar_list`, `calendar_create`, `calendar_update`, `calendar_delete`* |
| reminders / timers | `reminders_list`, `reminders_create`, `reminders_update`, `reminders_delete`*, `timers_start`, `timers_list`, `timers_cancel` |
| lists / notes | `lists_*`, `notes_*` (listar, criar, editar, apagar*) |
| memory / rules | `memory_*`, `rules_*`, `mode_set` |
| notify | `notify_user` |

\* exige confirmação. As ferramentas chamam os mesmos serviços que a API REST usa. Nenhuma lógica fica duplicada.

### Orquestração

- **Delegação só quando você pede.** A regra fica no prompt de sistema fixo, fora da persona editável, para não sumir por engano numa edição. A descrição de `tasks_create` repete a regra.
- **"Proativo"** quer dizer avisar e sugerir. O Renfield nunca age por conta própria.
- **Avisos de tarefa:** quando uma tarefa termina, falha ou espera você, quem avisa é o servidor, não o modelo. Um listener do task bus cria a notificação e posta no chat uma mensagem curta com o resumo do relatório. Isso não gasta cota, e você pode pedir detalhes depois.

### Customização e "treino"

- **Persona:** `agents/renfield/persona.md`, editável no arquivo ou na tela de configurações (`PUT /agents/renfield/persona`).
- **Memórias:** `{ id, content, kind: fact | preference, source: user | renfield | feedback }`. Todas entram no prompt enquanto couberem em cerca de 2 mil tokens. Acima disso, entra busca.
- **Regras aprendidas:** `{ id, trigger?, instruction, enabled, source }`. Exemplo: gatilho "modo foco", instrução "ativar o modo foco".
- **Modos:** o efeito de "silencie lembretes não urgentes" precisa ser garantido pelo código, não pela memória do modelo. Por isso modo é uma entidade: `{ name, minPriority, description }`. O notificador entrega só o que tem prioridade igual ou maior que `minPriority` e guarda o resto num resumo para quando o modo acabar. Ao aprender "modo foco", o Renfield cria a regra (gatilho chama `mode_set('foco')`) e o modo (`foco`, `minPriority: high`).
- **Feedback:** `/feedback <texto>` no chat, `POST /feedback`, ou frases como "não faça mais isso". O Renfield transforma o feedback em regra ou memória. Ela já entra ativa e aparece marcada como "nova" nas configurações para você revisar.
- **Tela de configurações:** persona, memórias, regras, modos, dispositivos, workspaces e modelos em uso.

### Limites

- A confirmação não depende de o modelo lembrar de perguntar. Ferramentas listadas em `confirm` no manifesto, e casos detectados no código, passam pelo `canUseTool` e viram aprovação. Exemplos desses casos: apagar mais de um evento, ou cancelar uma tarefa que roda há mais de 5 minutos.

### Respostas curtas

- Cada mensagem aceita `style: "normal" | "short" | "voice"`.
- **`short`:** uma ou duas frases.
- **`voice`:** sem markdown e com frases fáceis de falar.
- O celular e a voz mandam `short` ou `voice`.

## 6. etnaD

- Usa o mesmo runner com as ferramentas do Claude Code: arquivos, shell e git. O `cwd` é a raiz do workspace da tarefa.
- O modelo vem da lista do manifesto: `opus` se o seu plano tiver, senão `sonnet`.
- `settingSources: ["project"]` faz o etnaD respeitar o `CLAUDE.md` do próprio workspace.
- **Workspaces** são cadastrados pela API ou pelas configurações: `{ id, name, path, autoApprove[] }`. Tarefa sem workspace válido não começa.
- **Permissões**, na ordem que o SDK aplica:
  1. Um hook `PreToolUse` bloqueia qualquer caminho de arquivo fora do workspace.
  2. Regras `deny` do manifesto (por exemplo, `git push`) valem em qualquer modo.
  3. O modo `acceptEdits` aprova sozinho edições dentro do workspace.
  4. Comandos da allowlist passam sem perguntar.
  5. O resto vai para o `canUseTool`, vira aprovação e a tarefa entra em `waiting_input`.
- **Sem sandbox:** no Windows nativo, o Claude Code não tem sandbox de sistema (ela só existe no WSL 2). O hook reduz o risco, mas um comando de shell ainda pode mexer fora do workspace. Por isso o padrão proposto pede aprovação para todo comando fora da allowlist. Veja a pergunta 3 na seção 15.
- **Git:** se o workspace é um repositório, o etnaD trabalha num branch `etnad/<slug-da-tarefa>`, faz commit no fim e nunca dá push sem você pedir. Isso é configurável por workspace.
- **Progresso:** as mensagens do SDK viram `task.progress` ("Lendo src/x.ts", "Rodando testes"), com no máximo um evento a cada 500 ms por tarefa.
- **Relatório:** saída estruturada do SDK no formato `TaskResult` (o que mudou, onde, como testar), mais os tokens consumidos e um resumo do diff.
- **Limites:** `maxTurns` por tarefa. Cancelar usa `interrupt()` ou um `AbortController`.
- **Perguntas:** quando o etnaD pergunta algo, a pergunta vira uma aprovação do tipo `question`. Você responde pelo painel, pelo chat ou pelo Renfield (`tasks_answer`).

## 7. Funções de assistente

- **Calendário:** interface `CalendarProvider { list, get, create, update, delete }`. Agora entra o `LocalCalendarProvider` em SQLite. O `GoogleCalendarProvider` entra depois sem mudar a API nem as ferramentas. Eventos aceitam RRULE opcional.
- **Lembretes e alarmes:** uma única entidade com `kind: reminder | alarm`.
  - A agenda pode ser única (`at`) ou recorrente (cron + fuso). "Todo dia útil às 8h" vira `0 8 * * 1-5`.
  - Lembrete notifica uma vez. Alarme repete até você dispensar.
  - Os dois aceitam soneca.
  - Disparar um lembrete não usa modelo nenhum, então não gasta cota.
- **Agendador no backend:** carrega os pendentes no boot e usa croner.
  - Se o servidor estava desligado, lembretes perdidos disparam com o aviso "atrasado", até um limite de algumas horas.
  - Recorrências perdidas são puladas.
- **Timers:** persistidos, então sobrevivem a reinício. Publicam `timer.finished`.
- **Listas e notas:** listas com nome livre (compras, afazeres) e itens marcáveis. Notas rápidas com busca por texto.
- **Notificações:** o `Notifier` decide quem recebe cada aviso, conforme modo ativo, prioridade e dispositivos.
  - A entrega passa por canais `NotificationChannel { send(device, notification) }`.
  - Agora entram dois canais: `ws` (app aberto) e `webpush` (funciona com o PWA fechado, no desktop e no celular).
  - Depois entra o push nativo do app mobile.

## 8. Preparação para mobile e voz

- Toda regra de negócio fica no backend; o web só desenha. O cliente tipado em `packages/shared` serve ao web e ao futuro app React Native.
- Cada dispositivo tem seu próprio token e sua própria assinatura de push.
- **Voz:**
  - `POST /voice/transcribe` recebe áudio e devolve texto.
  - `POST /voice/speak` recebe texto e devolve áudio.
  - `POST /voice/converse` recebe áudio e devolve a resposta do Renfield em áudio.
  - Por enquanto os três respondem 501, com contrato documentado. No servidor ficam as interfaces `SpeechToText` e `TextToSpeech`.
  - Implementações futuras também gratuitas: a Web Speech API do navegador, ou Whisper e Piper rodando localmente neste PC.
- **Rede:** fora de `localhost`, o navegador só permite instalar PWA, rodar service worker e receber push sob HTTPS. Para o celular, proponho Tailscale, gratuito no plano pessoal: o `tailscale serve` dá HTTPS sem abrir portas no roteador. Veja a pergunta 2 na seção 15.

## 9. A Shack visual

> **Como ficou (Fase 6, 2026-10-22).** A direção aprovada no protótipo v2.1 substituiu a cabana clara da primeira versão do plano. O que está abaixo descreve o que foi construído.

### Direção

- **Câmera e pixel art:** top-down com a câmera do Stardew Valley. Tiles de 16 px e personagens de 16x32. Zoom inteiro, com `image-rendering` em pixels.
- **Clima:** uma casa de vidro sobre palafitas numa floresta úmida do noroeste americano, no clima de Forks: neblina, chuva opcional e luz âmbar nas janelas.
- **Interior:**
  - parede de cima de vidro, com a floresta ao fundo;
  - piso de nogueira;
  - estação do Renfield (mesa de madeira, um monitor, luminária) e estação do etnaD (mesa preta, dois monitores, teclado com luz);
  - ilha com cafeteira, figueira, estante, costela-de-adão, sofá de veludo verde, lareira de aço e plantas;
  - no pé do tapete do sofá, um rack com TV e videogame. A tela fica virada para o sofá, e a luz dela muda de cor como num jogo.
- **Exterior:** a casa de dois andares, com varandas, escada e caminho de pedras, entre pinheiros, samambaias, pedras e um tronco com musgo.
  - De vez em quando, um lobo ruivo enorme sai da mata à esquerda, senta e fica olhando a casa (homenagem ao Jacob, de Crepúsculo). À noite os olhos brilham e ele uiva; tocar nele faz ele uivar e fugir.
- **Profundidade:** desenhada em camadas, nesta ordem:
  1. chão e paredes;
  2. móveis e personagens, ordenados por Y;
  3. partículas;
  4. luz e escuridão;
  5. balões.
- **Luz e horário:** seguem a hora de São Paulo. À noite a cena escurece, e as luminárias, a lareira e os monitores ganham halos.
- **Em volta da casa:** quando a câmera mostra além das paredes, aparece o chão da floresta com neblina, nunca um vazio preto.
- **Câmera:**
  - arrastar move;
  - roda do mouse, pinça ou botões + e − dão zoom;
  - tocar num agente segue ele com a câmera;
  - a câmera fica presa aos limites do mapa.
  - Quando a casa cabe inteira na altura, ela se centraliza no espaço que o HUD deixa livre.

### Agentes na cena

- **Personagens montados em código** a partir de `appearance` no manifesto: `palette`, `hair`, `accessory`, `station` e `idle`. As cores que faltam saem do id do agente, então cada agente novo tem um visual próprio e estável.
- **Poses:** quatro direções, andar, sentar e digitar, coçar a cabeça, tomar café, ler e regar.
- **Estados ligados ao WebSocket (`agent.status`):**
  - **Ocioso:** o agente escolhe um lugar, de preferência os do `idle` do manifesto, vai até lá por A*, fica um tempo e volta.
  - **Trabalhando:** vai até a mesa, senta e digita. Os monitores mostram código rolando nas estações de dois monitores e a conversa nas de um.
  - **Esperando você:** levanta, vira para a câmera e mostra o balão "?". O monitor pisca "?".
  - **Erro:** senta com um "x" vermelho na tela, LED piscando e um fio de fumaça.
  - **Renfield respondendo no chat:** um balão de "digitando" onde ele estiver, sem ir até a mesa.
  - **Cota esgotada:** quem está livre vai cochilar no sofá ou na poltrona.
- **Transições:** o painel mostra o estado real na hora, e a cena só anima o caminho. Enquanto ele anda, o cartão diz "Indo para a mesa".

### Crescimento automático

- A planta da casa é gerada a partir da lista de agentes (`apps/web/src/scene/layout.ts`, com testes).
- O cômodo principal tem as duas primeiras estações. Agentes de chat ficam primeiro; os outros seguem a ordem do servidor.
- **Alas:** a cada dois agentes a mais, a casa ganha uma ala à direita. Cada ala tem duas estações, poltrona, luminária, tapete e plantas, e uma passagem pela parede.
- Lá fora, a casa ganha um anexo de vidro por ala.
- Um agente novo entra pela porta e vai até a sua mesa.

### Técnica

- Canvas 2D puro, sem bibliotecas, em `apps/web/src/scene/`. A arte é toda original e feita em código.
- **Arquivos:** `engine.ts` (laço, câmera e fronteira com o React), `walker.ts` (agentes), `characters.ts` (sprites), `art.ts` (arte fixa), `animated.ts` (telas, fogo e TV), `light.ts`, `sky.ts`, `input.ts` e `wolf.ts`.
- **Personagens:** quadros de 24x40 com três tons por cor (luz de cima e da esquerda) e contorno de 1 pixel na cor do vizinho escurecida.
- **Arte estática:** chão, paredes, móveis e o exterior são desenhados uma vez em canvases fora da tela. A cada quadro só mudam as telas, o fogo, a luz, a neblina e as partículas.
- **Animação:** os sprites animam a cerca de 10 fps, e a câmera e a luz a 60 fps. Tudo pausa com a aba oculta e respeita "reduzir movimento".
- **Fronteira com o React:** ele passa o estado real dos agentes (`setAgents`), o foco, o clima e a cota. O motor devolve o texto do que cada um faz na cena, como "Tomando um café".

### Interação

- **HUD sobre a cena:**
  - em cima: nome, hora, conexão e modo ativo, mais **Ver lá fora**, **Avisos** e **Menu**;
  - embaixo: os cartões dos agentes.
- **Painel do agente:** tarefa atual com o progresso, fila, histórico com os relatórios, modelo do plano e as ações de aprovar, negar, cancelar, tentar de novo e limpar erro.
- **Chat do Renfield:** coluna à direita no desktop e gaveta embaixo no celular.
- **Telas de agenda, lembretes, listas e notas:** abrem por cima da casa, pelo Menu.

## 10. Estrutura de pastas

```
Agent Shack/
├─ agents/                       # um agente = uma pasta
│  ├─ renfield/
│  │  ├─ agent.yaml
│  │  └─ persona.md
│  └─ etnad/
│     ├─ agent.yaml
│     └─ persona.md
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ main.ts              # sobe tudo
│  │  │  ├─ config.ts            # lê e valida o .env
│  │  │  ├─ db/                  # conexão, migrations/*.sql, repos/*.ts
│  │  │  ├─ core/                # registry, task-bus, events, approvals
│  │  │  ├─ agents/
│  │  │  │  ├─ runner.ts         # manifesto -> opções do Agent SDK; roda tarefas
│  │  │  │  ├─ models.ts         # escolhe o modelo do plano; trava de credencial; cota
│  │  │  │  ├─ chat.ts           # sessões de chat (Renfield)
│  │  │  │  ├─ prompt.ts         # regras fixas + persona + memórias + contexto
│  │  │  │  ├─ guard.ts          # hook de workspace e allowlist (etnaD)
│  │  │  │  └─ tools/            # grupos de ferramentas MCP "shack"
│  │  │  ├─ assistant/           # calendar/, reminders, timers, lists, notes, scheduler
│  │  │  ├─ notifications/       # notifier + channels/ (ws, webpush)
│  │  │  ├─ voice/               # stt, tts (stubs)
│  │  │  ├─ auth/                # tokens, pairing
│  │  │  └─ api/                 # app, ws, routes/
│  │  ├─ scripts/                # token.ts
│  │  └─ test/
│  └─ web/
│     ├─ public/                 # manifest.webmanifest, sw.js, ícones gerados em código
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ store.ts             # estado alimentado pelo WS
│        ├─ shack/
│        │  ├─ engine.ts         # loop, camadas, ordenação por Y
│        │  ├─ camera.ts         # pan, zoom, foco, limites do mapa
│        │  ├─ maps/             # interior, exterior, módulos de ala
│        │  ├─ layout.ts         # gera a casa a partir da lista de agentes
│        │  ├─ sprites/          # tiles, móveis, partes de personagem
│        │  ├─ characters.ts     # monta personagens; máquina de estados
│        │  ├─ pathfinding.ts    # A* na grade
│        │  └─ lighting.ts       # dia e noite, halos
│        └─ panels/              # Chat, Agent, Settings, Agenda, Lists, Notes, Pair
├─ packages/
│  └─ shared/
│     └─ src/                    # schemas/ (zod), ws.ts, client.ts, index.ts
├─ docs/                         # PLAN.md (este), API.md
├─ data/                         # shack.db (fora do git)
├─ .env.example
├─ package.json                  # npm workspaces
├─ tsconfig.base.json
├─ README.md
└─ CLAUDE.md                     # Fase 7
```

Os workspaces do etnaD ficam fora deste repositório, nos caminhos que você cadastrar.

## 11. Contratos da API

- **Base:** `/api/v1`, sempre JSON, com `Authorization: Bearer <token>`.
- **Erros:** `{ "error": { "code", "message", "details?" } }`.
- **Paginação:** por cursor. `?limit=50&cursor=...` devolve `{ items, nextCursor }`.
- **Documentação:** o OpenAPI é gerado das rotas e servido em `/api/v1/openapi.json`. O `docs/API.md` cobre o protocolo WebSocket e os exemplos.

### REST

| Área | Rotas | Observação |
|---|---|---|
| Sistema | `GET /health`, `GET /system/account` | `health` não exige token. `account` mostra os modelos disponíveis no plano, o modelo de cada agente e o estado da cota |
| Auth | `POST /auth/pairing-codes`, `POST /auth/pair`, `GET /me` | `pair` não exige token: troca código por token |
| Dispositivos | `GET /devices`, `DELETE /devices/:id` | Revogar |
| Agentes | `GET /agents`, `GET /agents/:id`, `GET /agents/:id/persona`, `PUT /agents/:id/persona`, `POST /agents/:id/clear-error` | `GET /agents` já traz status e tarefa atual |
| Tarefas | `GET /tasks`, `POST /tasks`, `GET /tasks/:id`, `GET /tasks/:id/events`, `POST /tasks/:id/cancel`, `POST /tasks/:id/retry`, `POST /tasks/:id/input` | Filtros: `status`, `assignee`, `since` |
| Aprovações | `GET /approvals?status=pending`, `POST /approvals/:id` | Corpo: `{ decision: "approve" \| "deny", answer? }` |
| Eventos | `GET /events?since=&type=&agentId=` | Replay para quem estava desconectado |
| Workspaces | `GET /workspaces`, `POST /workspaces`, `PATCH /workspaces/:id`, `DELETE /workspaces/:id` | |
| Chat | `GET /conversations`, `POST /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages` | Corpo: `{ text, style? }`. Devolve 202 e a resposta chega pelo WS. Com `?wait=true`, devolve a resposta final no corpo (bom para voz e atalhos) |
| Memória | `GET /memories`, `POST /memories`, `PATCH /memories/:id`, `DELETE /memories/:id` | |
| Regras | `GET /rules`, `POST /rules`, `PATCH /rules/:id`, `DELETE /rules/:id` | |
| Modos | `GET /modes`, `POST /modes`, `PUT /settings/mode` | Corpo de `PUT`: `{ name \| null }` |
| Feedback | `POST /feedback` | Corpo: `{ text, messageId? }` |
| Configurações | `GET /settings`, `PATCH /settings` | Fuso, horário silencioso etc. |
| Calendário | `GET /calendar/events?from=&to=`, `POST /calendar/events`, `PATCH /calendar/events/:id`, `DELETE /calendar/events/:id` | |
| Lembretes | `GET /reminders`, `POST /reminders`, `PATCH /reminders/:id`, `DELETE /reminders/:id`, `POST /reminders/:id/snooze`, `POST /reminders/:id/dismiss` | Inclui alarmes (`kind`) |
| Timers | `GET /timers`, `POST /timers`, `DELETE /timers/:id` | |
| Listas | `GET /lists`, `POST /lists`, `GET /lists/:id`, `PATCH /lists/:id`, `DELETE /lists/:id`, `POST /lists/:id/items`, `PATCH /lists/:id/items/:itemId`, `DELETE /lists/:id/items/:itemId` | |
| Notas | `GET /notes?q=`, `POST /notes`, `PATCH /notes/:id`, `DELETE /notes/:id` | |
| Notificações | `GET /notifications`, `POST /notifications/:id/read`, `GET /push/vapid-key`, `POST /push/subscriptions`, `DELETE /push/subscriptions/:id` | |
| Voz | `POST /voice/transcribe`, `POST /voice/speak`, `POST /voice/converse` | Stubs: respondem 501 |

### WebSocket: `GET /api/v1/ws`

```ts
// cliente -> servidor
type ClientMessage =
  | { type: 'auth'; token: string }                       // obrigatória, em até 5 s
  | { type: 'subscribe'; since?: number }                 // stream de eventos, com replay
  | { type: 'chat.send'; conversationId: string; text: string;
      style?: 'normal' | 'short' | 'voice'; clientId: string }
  | { type: 'approval.respond'; approvalId: string;
      decision: 'approve' | 'deny'; answer?: string }
  | { type: 'ping' };

// servidor -> cliente
type ServerMessage =
  | { type: 'auth.ok'; deviceId: string }
  | { type: 'event'; event: ShackEvent }                  // inclui chat.message e notification.created
  | { type: 'chat.delta'; conversationId: string; messageId: string; text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };
```

## 12. Configuração (`.env.example`)

```
# O Shack usa só o login da sua assinatura no Claude Code.
# Não coloque ANTHROPIC_API_KEY aqui: o servidor remove essa variável de propósito.
SHACK_HOST=127.0.0.1
SHACK_PORT=4321
SHACK_TZ=America/Sao_Paulo
SHACK_DB_PATH=./data/shack.db
SHACK_FALLBACK_MODEL=sonnet
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:voce@exemplo.com
```

As chaves VAPID são geradas localmente por um script e são gratuitas.

## 13. Fases

| Fase | Entrega | Como você testa |
|---|---|---|
| 1. Plano | Este documento | Leitura e aprovação |
| 2. Núcleo | Monorepo, banco e migrations, registry com recarga, task bus, eventos com replay, aprovações, tokens e pareamento, REST + WS, OpenAPI. Os agentes ainda são simulados nos testes | `npm test`; criar tarefa via `curl` e ver os eventos chegando no WS |
| 3. Renfield | Escolha de modelo do plano, trava de credencial, pausa por cota, chat por WS e REST, persona com recarga, memórias, regras, modos, feedback, delegação e status. Tela mínima de chat | Conversar, editar `persona.md` e ver efeito na resposta seguinte, pedir uma delegação, conferir `GET /system/account` |
| 4. etnaD | Runner do Claude Code, workspaces, guarda de caminhos, aprovações, relatório, consumo e retry | Delegar uma tarefa real num workspace de teste e aprovar um comando |
| 5. Assistente | Calendário local, lembretes e alarmes, timers, listas, notas, notificações ws + webpush, telas simples | "Me lembra todo dia útil às 8h", timer de 1 minuto, push com o app fechado |
| 6. Shack visual | Protótipo, depois os dois mapas, câmera, personagens andando, estados ao vivo, painéis, layout para celular | Ver o etnaD ir até a mesa e digitar durante uma tarefa real |
| 7. Polimento | PWA instalável, Tailscale com HTTPS, testes dos fluxos principais, README, `CLAUDE.md`, e o adendo da seção 13.1 | Instalar no celular, rodar `npm test` e os testes ao vivo da seção 13.1 |

**Testes:** o runner do Agent SDK é injetável. Os testes usam um runner falso e não chamam modelo nenhum, então não gastam cota.

### 13.1 Adendo da Fase 7 (2026-10-22)

Ideias tiradas do livro sobre agentes que você me mandou, em ordem de valor. Todas entram na Fase 7, junto com o PWA, os testes e o `CLAUDE.md`.

**1. Conferir o resultado, não o relatório.** Hoje o servidor confia no `TaskResult` que o etnaD devolve.
- Depois do relatório, o servidor confere sozinho: se o branch da tarefa tem commit, o diffstat real e se os caminhos citados em `changes` aparecem no diff.
- O resultado vai para um campo novo, `verification: { status: 'ok' | 'suspect' | 'unverified', reason, diffstat }`. O status da tarefa continua `done`, para não mexer na máquina de estados.
- **`suspect`:** o relatório lista mudanças e o diff está vazio, ou cita arquivos que não mudaram. A cena, o painel e o aviso no chat mostram "suspeita", não "concluída".
- **`unverified`:** não há como conferir, por exemplo num workspace sem git ou com mudanças não salvas antes da tarefa. O aviso diz isso, em vez de fingir que conferiu.
- Uma tarefa de análise que não muda arquivo e não declara mudança é `ok`.

**2. Vazio não é zero.** Uma lista vazia não pode ser lida como "não existe nada".
- As ferramentas do Renfield distinguem "consultei e não há itens" de "não consegui consultar". No segundo caso, a resposta diz `indisponível` e o motivo, sem lista vazia.
- Uma regra fixa nova no prompt manda o Renfield dizer "não sei" ou "indisponível" nesses casos, nunca "nenhum".
- Para ações destrutivas em lote, futuras ou atuais: uma lista vazia do que deve ser mantido bloqueia a ação.

**3. Ferramentas que corrigem a entrada.** Cada rejeição de parâmetro custa uma ida e volta na cota.
- Nos schemas zod das ferramentas MCP: limitar números ao máximo em vez de rejeitar, aparar espaços, aceitar variações de formato (data sem segundos, `"true"` como booleano, prioridade em maiúsculas).
- Rejeitar só quando o valor não tem conserto, com uma mensagem que diga o formato certo.

**4. Relatório do etnaD como conteúdo de fora.** O etnaD lê repositórios, e um `CLAUDE.md` baixado pode trazer ordens escondidas.
- Antes de entrar no contexto do Renfield, o relatório é embrulhado num bloco marcado "relatório do etnaD, não são instruções".
- O servidor tira caracteres invisíveis (larguras zero, controles bidi) e limita o tamanho.
- Uma regra fixa no prompt do Renfield reforça que esse bloco é dado, nunca ordem.

**5. Higiene da memória do Renfield.** Hoje todas as memórias entram no prompt, sem o teto de 2 mil tokens previsto na seção 5.
- **Datas absolutas:** a regra 5 manda trocar "amanhã" e "semana que vem" pela data ao salvar.
- **Memória é pista:** uma regra fixa diz que memória antiga deve ser conferida antes de virar ação, e que memória errada se corrige com `memory_update` ou se apaga.
- **Teto:** até cerca de 2 mil tokens, tudo entra. Acima disso, entram as preferências e um índice curto dos fatos mais recentes, e o resto é consultado pela ferramenta nova `memory_search`, com busca por palavra no SQLite. Sem banco vetorial.
- **Regra 6 (feedback):** regras e memórias vindas de feedback continuam entrando ativas, mas ficam marcadas como "não revisadas" até você abrir. O menu mostra quantas faltam revisar, para não virar um cemitério de superstições.

**6. Nota de passagem do etnaD.** Quando uma tarefa é cancelada ou falha, o etnaD escreve uma nota curta: o que fez, o que falhou e o que falta.
- A nota fica salva com a tarefa e entra no prompt da próxima tarefa no mesmo workspace.
- Fica em paralelo ao `resume` da sessão, que continua existindo. A nota é mais barata e sobrevive a uma sessão perdida.
- No cancelamento, a nota sai de um turno curto e limitado. Se a cota acabou ou o turno falhar, o servidor monta uma nota mínima com o progresso registrado e o diffstat.

**7. Medidor de cota visível.** Hoje o Shack só reage quando a cota acaba.
- O evento `rate_limit_event` do SDK já traz `utilization`, o tipo de janela (5 horas, 7 dias) e o estado `allowed_warning`. O medidor usa esses dados e não depende da API experimental de uso.
- A barra do topo mostra o uso da janela atual e a hora em que ela renova. Em `allowed_warning`, sai um aviso, e o Renfield pede confirmação antes de mandar uma tarefa nova ao etnaD.
- Se o SDK indicar uso de *overage* (cobrança extra), o Shack avisa na hora, por causa da regra de custo zero.
- Antes da primeira medição, ou se o campo não vier, o medidor mostra "sem dados", não 0%.

**8. `CLAUDE.md`.** Receita do capítulo 9:
- Texto curto e no imperativo.
- Arquivos com menos de 500 linhas.
- "Não apague comentários."
- Um comando único de teste: `npm test`.
- Lista de armadilhas: o `charset=utf-8` no PowerShell 5.1, o desempate por `rowid`, o build CJS do `@hono/node-server` que quebra o WS nos testes, e as portas 4321 e 5173 ocupadas pelo seu servidor de desenvolvimento.

**Testes ao vivo pendentes das fases anteriores:**
- Entrega do Web Push num navegador de verdade, que depende do HTTPS do Tailscale.
- Cancelar uma tarefa real do etnaD no meio. O esperado agora é um commit "[incompleto]", a volta ao branch original e a nota de passagem salva.

**Fica para depois:** a personalidade com humores, com a lista de bordões proibidos e o humor do Renfield aparecendo no retrato. É uma feature nova, não polimento, e vai para o backlog.

**O que o livro desaconselha e o Shack não vai fazer:**
- Instalar skills ou plugins de terceiros nos agentes.
- Um gateway genérico para Telegram, WhatsApp e afins. Se o Renfield ganhar um canal externo, será um só, com assinatura verificada e aprovação para qualquer ação.
- Vários agentes em paralelo para acelerar código. Continua uma tarefa por vez por agente.

**Entregue em 2026-10-22.** Diferenças em relação ao texto acima:

- A conferência ficou em `result.verification`, e não num campo da tarefa. Só o servidor escreve nela; o que o modelo mandar ali é descartado.
- Uma tarefa cancelada continua ocupando a vaga do agente até o runner fechar o git e escrever a nota. Isso também corrigiu uma corrida antiga: antes, a tarefa seguinte podia começar enquanto o git da cancelada ainda fechava.
- O servidor passou a entregar o app web (`npm run build`), para o celular usar uma origem só, com HTTPS pelo `tailscale serve`.
- Entraram também: pareamento por código de 6 dígitos na tela de entrada, a aba **Dispositivos** (endereço do Tailscale, código e revogação), ícones em pixel art e os ajustes para o iPhone 13 (área do notch, teclado, campos de 16px, push só no app instalado).
- O assunto VAPID padrão mudou para `mailto:the-shack@example.com`, porque o push da Apple recusa domínios como `.local`.

**Ainda não verificado num iPhone de verdade:** instalação, push e o caminho completo pelo Tailscale. O Tailscale não está instalado neste PC. Também segue pendente o cancelamento ao vivo de uma tarefa real do etnaD.

## 14. Custo zero e cota do plano

### Só os modelos do seu plano

- Os manifestos usam apelidos (`haiku`, `sonnet`, `opus`), e o Claude Code resolve cada um para a versão atual que o seu plano oferece. Nenhum agente usa Fable.
- No boot, o servidor pergunta ao SDK quais modelos a sua conta tem. Cada agente fica com o primeiro modelo da sua lista que estiver disponível.
- Se nenhum modelo da lista estiver disponível, o agente fica desativado com um erro claro.
- Padrões propostos:
  - **Renfield:** `sonnet`, ou `haiku` se o plano não tiver Sonnet, com esforço baixo.
  - **etnaD:** `opus`, ou `sonnet` se o plano não tiver Opus, com esforço alto.

### Trava contra cobrança

- **Ambiente limpo:** o servidor monta o ambiente do Claude Code sem `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` e as variáveis de Bedrock, Vertex e Foundry. Essas são as formas de cobrança por uso.
- **Conferência por sessão:** no início de cada sessão, o SDK informa qual credencial está em uso. Se não for o login da assinatura, a sessão é encerrada antes do primeiro pedido ao modelo e o erro aparece no painel.

### Regras de uso da Anthropic

- A documentação prevê o uso individual do Claude Code e do Agent SDK dentro dos limites dos planos Pro e Max.
- **O que é proibido:** guardar, copiar ou intermediar as credenciais da assinatura, e oferecer o login a outras pessoas.
- **Como o Shack cumpre isso:**
  - O Shack nunca lê nem guarda o seu login.
  - Quem autentica é o binário oficial do Claude Code, com o login feito pelo fluxo da própria Anthropic.
- **Consequência:** o Shack é de uso pessoal. Se outra pessoa quiser usar, ela precisa do próprio login no próprio computador.

### Cota

O Renfield e o etnaD gastam a mesma cota que você usa no Claude Code e no claude.ai. Para poupar:

- **Sem modelo onde não precisa:** avisos de tarefa, lembretes, alarmes e timers são gerados pelo servidor.
- **Contexto barato:** o bloco de status anexado a cada mensagem evita chamadas de ferramenta só para consultar estado.
- **Tarefas limitadas:** `maxTurns` por tarefa, e uma tarefa por vez por agente.
- **Fim da cota:** quando o SDK avisa que a cota acabou, a fila pausa e sai o evento `system.quota` com o horário previsto de volta. O Renfield avisa, a cena mostra os agentes descansando, e a fila volta a andar sozinha.
- **Visibilidade:** o painel mostra os tokens consumidos por tarefa.

### O resto também é gratuito

| Item | Custo |
|---|---|
| Node, Git, todas as bibliotecas | Open source |
| Servidor | Roda neste PC |
| Tailscale para o celular | Plano pessoal gratuito, com HTTPS incluso |
| Web Push | Gratuito, pelos serviços de push dos navegadores |
| Google Calendar, quando entrar | API gratuita para uso pessoal |
| Voz, quando entrar | Web Speech API do navegador, ou Whisper e Piper locais |

## 15. Decisões

**Respondidas em 2026-10-21:**

- **Protótipo visual:** feito antes da Fase 2, em `prototype/shack-topdown.html`.
- **Onde roda:** neste PC. O celular entra depois, via Tailscale.
- **Autonomia do etnaD:** opção (a). Edições no workspace e comandos da allowlist passam sozinhos, e o resto pede aprovação.
- **Pré-requisitos:** Node 24.20 e Git 2.55 instalados.

As perguntas originais ficam abaixo como registro.

1. **Quando fazer o protótipo visual?** O documento pede protótipo antes de detalhar a cena, mas também diz para não escrever código antes da aprovação. Recomendo fazê-lo logo depois que você aprovar este plano, antes da Fase 2. É um HTML descartável que valida a direção top-down cedo. A alternativa é fazê-lo no início da Fase 6.
2. **Onde o backend roda e como o celular chega nele?** Assumo que roda neste PC. Para o celular, recomendo Tailscale, que é gratuito e dá HTTPS sem abrir portas no roteador. Sem HTTPS, o PWA não instala e o push não funciona no celular. Se o PC não fica ligado sempre, os lembretes também param quando ele desliga.
3. **Quanta autonomia o etnaD tem no shell?**
   - **(a) Recomendado:** edições dentro do workspace e comandos da allowlist passam sozinhos; qualquer outro comando pede sua aprovação.
   - **(b)** Autonomia total dentro do workspace. Mais rápido, mas sem sandbox no Windows nativo.
   - **(c)** Rodar o etnaD dentro do WSL 2, onde existe sandbox de sistema. É a opção mais segura e com mais autonomia, mas exige instalar o WSL e deixar os workspaces lá.

## 16. Premissas (mudo se você discordar)

- **Usuário:** um único usuário, com vários dispositivos. O Shack é de uso pessoal, com o seu login.
- **Chat:** uma conversa contínua com o Renfield, no estilo Alexa. O histórico fica salvo e a sessão do SDK se compacta sozinha.
- **Concorrência:** uma tarefa por vez por agente.
- **Git:** o etnaD usa um branch próprio por tarefa e faz commit sem push.
- **Feedback:** regras e memórias vindas de feedback entram ativas e aparecem como "novas" para revisão.
- **Retenção:** eventos ficam guardados por 30 dias.
- **Telas:** além do chat, o web ganha telas simples de agenda, listas e notas na Fase 5.
