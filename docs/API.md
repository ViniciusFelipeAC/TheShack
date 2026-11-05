# API da Shack

A referência completa das rotas REST é gerada do código e fica em `GET /api/v1/openapi.json`, com o servidor no ar. Este documento cobre o que o OpenAPI não descreve bem: autenticação, erros, eventos e o protocolo do WebSocket.

## Autenticação

Cada dispositivo tem o seu token, no formato `shk_…`. Ele aparece uma única vez, e o servidor guarda só o hash.

- **REST:** mande o cabeçalho `Authorization: Bearer <token>`.
- **Rotas públicas:** `GET /health`, `POST /auth/pair`, `GET /openapi.json` e o WebSocket, que se autentica na primeira mensagem.
- **Primeiro token:** `npm run token -- --name "Meu PC"`, rodado na raiz do projeto.
- **Pareamento de um dispositivo novo:**
  1. Um dispositivo já autenticado chama `POST /auth/pairing-codes` e recebe um código de 6 dígitos, válido por 5 minutos.
  2. O dispositivo novo chama `POST /auth/pair` com `{ "code", "deviceName", "kind" }` e recebe o token dele.
  3. Depois de 10 códigos errados em 10 minutos, o pareamento responde 429 por um tempo.
- **Revogação:** `DELETE /devices/{id}` invalida o token na hora e fecha os WebSockets daquele dispositivo.

## Erros

Todo erro tem o mesmo formato:

```json
{ "error": { "code": "conflict", "message": "Esta aprovação já foi respondida.", "details": null } }
```

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_request` | Corpo ou parâmetros inválidos. `details` traz os problemas campo a campo |
| 400 | `unknown_agent` | A tarefa aponta para um agente que não existe |
| 400 | `workspace_required`, `unknown_workspace` | Tarefa do etnaD sem workspace, ou com um que não existe |
| 409 | `agent_cannot_run` | O agente não executa tarefas (o Renfield conversa pelo chat) |
| 409 | `subscription_required` | A credencial do Claude Code não é a da sua assinatura |
| 401 | `unauthorized`, `invalid_code` | Token ausente, inválido ou revogado, ou código de pareamento errado |
| 404 | `not_found` | Recurso ou rota inexistente |
| 409 | `conflict`, `agent_disabled` | A ação não combina com o estado atual |
| 413 | `too_large` | Anexo maior que o limite do tipo |
| 429 | `too_many_attempts` | Pareamento bloqueado por excesso de tentativas |

## Tarefas

Estados e transições válidas:

```
queued        -> running | cancelled
running       -> waiting_input | done | failed | cancelled
waiting_input -> running | failed | cancelled
failed        -> queued      (retry)
cancelled     -> queued      (retry)
```

- `GET /tasks/{id}` traz a tarefa com o histórico de estados.
- `POST /tasks/{id}/input` responde à pergunta pendente de uma tarefa em `waiting_input`.
- Quando o servidor reinicia, o que estava em `running` ou `waiting_input` vira `failed`, e as aprovações pendentes expiram.

## Workspaces e o etnaD

O etnaD só trabalha dentro de pastas cadastradas como workspace.

- **Cadastro:** `POST /workspaces` com `{ "name", "path", "autoApprove"?, "gitBranching"? }`.
  - O caminho tem que ser absoluto e existir.
  - A raiz do disco e a pasta da própria Shack são recusadas.
- **Gestão:** `GET /workspaces` lista os cadastros. `PATCH /workspaces/{id}` muda o nome, os comandos liberados e o uso de branch. `DELETE /workspaces/{id}` remove o cadastro, mas não apaga a pasta.
- **Tarefa:** `POST /tasks` para o `etnad` exige `workspaceId`. Sem ele, a resposta é `workspace_required`; com um id que não existe, `unknown_workspace`.
- **O que fica livre e o que pede aprovação:**
  - Edições dentro do workspace passam sozinhas.
  - Comandos da lista do manifesto e do workspace (`autoApprove`) passam sozinhos.
  - Comandos que só leem informação também passam sozinhos, por decisão do próprio Claude Code.
  - Qualquer outro comando vira um pedido de aprovação, e a tarefa fica em `waiting_input`.
- **Proteção:** caminhos fora do workspace são bloqueados por um hook, em qualquer modo, e o bloqueio aparece nas notas do relatório.
- **Git:** se o workspace for um repositório e `gitBranching` estiver ligado, cada tarefa trabalha no branch `etnad/<título>-<id>`.
  - No fim, as mudanças viram um commit nesse branch, e o seu branch volta como estava.
  - Nada é enviado com push.
  - Se a pasta tiver mudanças não salvas, o etnaD trabalha direto no branch atual, sem branch nem commit, e avisa no relatório.
- **Relatório:** `result` traz `summary`, `changes` (arquivo e o que mudou), `howToTest` e `notes`. A tarefa também guarda `model`, `usage` (tokens) e `sessionId`. `POST /tasks/{id}/retry` retoma a mesma sessão.
- **Conferência:** `result.verification` é escrito só pelo servidor, comparando o relatório com o git: `{ status, reason, diffstat, files }`.
  - `ok`: bate com o diff.
  - `suspect`: o relatório lista mudanças e o diff está vazio, ou cita arquivos que não mudaram. A tarefa continua `done`, mas o agente aparece com erro ("Resultado suspeito: …") até você abrir o painel, e a notificação sai com prioridade alta.
  - `unverified`: não havia como conferir (workspace sem git, sem branch por tarefa ou com mudanças não salvas antes).
- **Nota de passagem:** quando uma tarefa falha ou é cancelada, `handoff` guarda o que foi feito, o que falhou e o que falta. O etnaD escreve a nota num turno curto e sem ferramentas; sem sessão, sem cota ou se o turno falhar, o servidor monta uma nota com os últimos passos e o diffstat. A nota entra no prompt da tentativa seguinte, ou da próxima tarefa no mesmo workspace, até alguma tarefa ali ser concluída. Enquanto a nota é escrita, a tarefa cancelada continua ocupando a vaga do agente.
- **Perguntas:** quando o etnaD pergunta algo, a aprovação tem `kind: "question"` e `options`. Responda com `POST /approvals/{id}` e `{ "decision": "approve", "answer": "<opção ou texto livre>" }`. No chat, "sim" e "não" não respondem perguntas, só aprovações.
- **Quem executa tarefas:** só agentes com ferramentas de código, hoje o etnaD. Pedir uma tarefa ao Renfield devolve `agent_cannot_run`, porque ele conversa pelo chat.

## Assistente: agenda, lembretes, timers, listas e notas

Horários vão em ISO 8601. Sem fuso (por exemplo, `2026-10-22T08:00`), valem no fuso da casa (`SHACK_TZ`, padrão `America/Sao_Paulo`).

| Rotas | O que faz |
|---|---|
| `GET /calendar/events?from=&to=` | Compromissos no intervalo, padrão os próximos 14 dias. Eventos recorrentes viram uma ocorrência por repetição, com `occurrenceStart` e `occurrenceEnd` |
| `POST /calendar/events`, `PATCH/DELETE /calendar/events/{id}` | Marcar, mover e cancelar. `rrule` no formato do Google Calendar, por exemplo `FREQ=WEEKLY;BYDAY=MO`. Apagar um recorrente cancela a série inteira |
| `GET /reminders?status=`, `POST /reminders`, `PATCH/DELETE /reminders/{id}` | Lembretes (`kind: "reminder"`, avisam uma vez) e alarmes (`kind: "alarm"`, tocam de 2 em 2 minutos até serem dispensados, no máximo 10 vezes). Use `at` para horário único ou `cron` de 5 campos para repetir, por exemplo `0 8 * * 1-5` (dias úteis às 8h) |
| `POST /reminders/{id}/snooze` (`{ "minutes" }`), `POST /reminders/{id}/dismiss` | Soneca e dispensar |
| `GET /timers`, `POST /timers` (`{ "seconds", "label" }`), `DELETE /timers/{id}` | Timers. Eles sobrevivem a reinícios |
| `GET/POST /lists`, `PATCH/DELETE /lists/{id}`, `POST /lists/{id}/items`, `PATCH/DELETE /lists/{id}/items/{itemId}`, `POST /lists/{id}/clear-done` | Listas com itens marcáveis. "Mercado" (lista de compras) e "Afazeres" (to-do) já vêm criadas e aparecem no Quadro do app. O Renfield entende "lista de compras", "supermercado", "to-do" e "pendências" como essas duas, pelo id, mesmo que você as renomeie |
| `GET /notes?q=`, `POST /notes`, `PATCH/DELETE /notes/{id}` | Notas rápidas, com busca por texto |

**Agendador:** quem dispara é o servidor, que confere a cada segundo o que venceu. Se o servidor estava desligado:

- Lembretes únicos que venceram há até 6 horas disparam com o aviso "atrasado".
- Os mais antigos viram um aviso de "lembrete perdido".
- As repetições perdidas de lembretes recorrentes são puladas.

**Notificações:**

- `GET /notifications` traz as recentes e o total de `unread`. `POST /notifications/{id}/read` e `POST /notifications/read-all` marcam como lidas. `POST /notifications/test` manda um teste.
- Lembretes, alarmes, timers e tarefas de outros agentes geram notificação. O Renfield também pode mandar uma, com a ferramenta `notify_user`.
- **Modo ativo:** avisos abaixo da prioridade mínima do modo ficam com `silenced: true`. Eles não tocam nem vão por push, e quando o modo é desligado chega um resumo (`kind: "digest"`).
- **Push do navegador:** `GET /push/vapid-key` devolve a chave pública. `POST /push/subscriptions` registra a assinatura (`subscription.toJSON()` do navegador), e `DELETE /push/subscriptions` com `{ "endpoint" }` cancela.
  - As chaves VAPID são geradas na primeira vez e ficam no banco.
  - Assinaturas que o navegador cancelou são removidas sozinhas.

**Eventos:** `data.changed` com `{ entity: "calendar" | "reminders" | "timers" | "lists" | "notes" }` avisa as telas para recarregar. `reminder.fired`, `timer.finished` e `notification.created` também chegam pelo WebSocket.

## Chat com o Renfield

- **Conversa principal:** tem o id `main` e é contínua, no estilo Alexa. Outras conversas podem ser criadas com `POST /conversations`.
- **Mandar mensagem:** `POST /conversations/{id}/messages` com `{ "text", "style", "attachmentIds"? }`, em que `style` é `normal`, `short` ou `voice`. Texto vazio vale quando há anexo. Duas formas de receber a resposta:
  - Sem parâmetro, responde 202 na hora, e a resposta chega pelo WebSocket.
  - Com `?wait=true`, a resposta vem no próprio corpo. É o jeito mais simples para atalhos e voz.
- **Histórico:** `GET /conversations/{id}/messages?limit=50&before=<data>` devolve as mensagens em ordem cronológica.
- **Tipos de mensagem (`kind`):**
  - `text`: conversa normal.
  - `task_notice`: aviso escrito pelo servidor quando uma tarefa termina, falha ou espera você. Não gasta cota.
  - `error`: o Renfield não conseguiu responder, e o motivo vem no texto.
- **Anexos na mensagem:** toda mensagem tem `attachments`, uma lista (vazia quando não há anexo).
- **"Sim" e "não":** quando há exatamente uma aprovação pendente, responder "sim" ou "não" no chat resolve essa aprovação sem gastar uma resposta do Renfield.
- **Feedback:** `POST /feedback` com `{ "text" }` entrega a correção ao Renfield, que a transforma em regra ou memória marcada como nova.
- **Uma resposta por vez:** as mensagens de cada conversa entram numa fila.

### Anexos

Fotos, PDFs e arquivos de texto vão ao Renfield junto com a mensagem, em dois passos:

1. `POST /attachments?name=foto.jpg` com o próprio arquivo no corpo e o tipo no `Content-Type`. Volta `201` com `{ id, name, mime, kind, size, createdAt }`, em que `kind` é `image`, `pdf` ou `text`.
2. A mensagem leva os ids em `attachmentIds`, no máximo 5. Cada anexo vale para uma mensagem só.

| Tipo | Aceita | Limite |
|---|---|---|
| `image` | JPEG, PNG, GIF e WebP, conferidos pelos bytes e não pelo nome | 5 MB. O app reduz a foto para 1568 px no lado maior antes de subir, e converte HEIC para JPEG |
| `pdf` | PDF | 10 MB |
| `text` | `text/*`, JSON, YAML, CSV, Markdown e código | 512 KB. Vão ao modelo no máximo 100 mil caracteres, limpos de caracteres invisíveis |

- **Para o modelo:** foto vira bloco de imagem, PDF vira bloco de documento e texto vira texto marcado como material do dono da casa, que não dá ordens.
- **Cota:** um anexo fica na sessão do Renfield e pesa nas respostas seguintes também. Uma foto reduzida custa até cerca de 1.600 tokens; um PDF, de 1.500 a 3.000 tokens de texto por página, mais a imagem de cada página.
- **Baixar:** `GET /attachments/{id}` exige o token, como o resto da API. Texto sai sempre como `text/plain`, nunca como página.
- **Onde ficam:** em `SHACK_UPLOADS_DIR` (padrão `data/uploads`), um arquivo por id. O que subiu e não entrou em nenhuma mensagem em 24 horas é apagado.
- O etnaD não recebe os anexos: o Renfield pode descrever o conteúdo ao delegar.

### Treino

| Rotas | O que faz |
|---|---|
| `GET/POST /memories`, `PATCH/DELETE /memories/{id}` | Fatos e preferências sobre você. `PATCH` com `{ "isNew": false }` marca como revisada |
| `GET/POST /rules`, `PATCH/DELETE /rules/{id}` | Regras aprendidas, com gatilho opcional. `enabled` liga e desliga |
| `GET/POST /modes`, `PUT /settings/mode` | Modos e o modo ativo (`{ "name": "foco" }` ou `{ "name": null }`) |
| `GET /agents/renfield/persona`, `PUT /agents/renfield/persona` | O `persona.md`. Vale a partir da próxima mensagem |

### Conta e custo

`GET /system/account` mostra a assinatura em uso, os modelos do seu plano, o modelo escolhido para cada agente e o estado da cota. A conta é verificada na primeira conversa.

`quota` é nulo até o primeiro aviso de limite do SDK. Depois traz:

- `status`: o pior estado entre as janelas: `allowed`, `allowed_warning` (perto do limite) ou `rejected` (esgotada).
- `kind`, `percent` e `resetsAt`: a janela que mais pesa agora. `percent` vai de 0 a 100 e é nulo quando o SDK não mandou o número.
- `windows`: cada janela (`five_hour`, `seven_day` e as por modelo). Uma janela cujo `resetsAt` já passou sai da lista.
- `overage`: verdadeiro se o Claude Code indicar cobrança extra.

Com `allowed_warning`, a ferramenta `tasks_create` do Renfield devolve `needsConfirmation` em vez de criar a tarefa. Ele pergunta a você e chama de novo com `quota_ok: true`.

### Acesso pelo celular

`GET /system/remote` diz como o celular chega na Shack: `{ tailscale: "missing" | "stopped" | "running", url, serving, serveCommand, webBuilt }`. `url` é o endereço HTTPS da máquina na sua tailnet; `serving` diz se o `tailscale serve` já repassa esse endereço para a porta da Shack.

Fora de `/api`, o servidor entrega o app web gerado por `npm run build` (pasta `apps/web/dist`, ou `SHACK_WEB_DIR`). Arquivos em `/assets/` vão com cache longo; o resto, com `no-cache`. Um build novo vale sem reiniciar o servidor.

O servidor remove do ambiente do Claude Code as variáveis que gerariam cobrança por uso. Se a credencial em uso não for a da assinatura, nenhuma mensagem é enviada ao modelo e o chat explica como resolver.

## Eventos

Todo evento tem este formato:

```json
{ "seq": 42, "id": "…", "ts": "2026-10-21T19:34:42.036Z", "type": "task.done", "agentId": "etnad", "taskId": "…", "data": { } }
```

O `seq` cresce sempre e serve para replay. Os eventos ficam guardados por 30 dias, valor configurável no `.env`.

| Tipo | `data` |
|---|---|
| `agent.status` | `{ status, activity, currentTaskId }` |
| `agent.updated` | `{ change: "added" \| "changed" \| "removed", error }` |
| `task.created`, `task.updated`, `task.waiting_input`, `task.done`, `task.failed`, `task.cancelled` | a tarefa completa |
| `task.progress` | `{ message, … }` |
| `approval.requested`, `approval.resolved` | a aprovação completa |
| `chat.message` | `{ message, streamId }`. O `streamId` liga a mensagem final aos pedaços `chat.delta` que vieram antes |
| `system.quota` | O mesmo objeto `quota` de `/system/account`, quando o estado muda, a cobrança extra aparece ou o uso anda 5 pontos |
| `notification.created` | a notificação completa |
| `reminder.fired`, `timer.finished` | `{ id, text ou label, … }` |
| `data.changed` | `{ entity }` |
| `mode.changed` | `{ active }`, com o modo que ficou ativo, ou `null` quando nenhum ficou |

Para quem ficou desconectado, `GET /events?since=<último seq>` devolve o que perdeu, junto com `nextSince` para a próxima chamada.

## WebSocket: `GET /api/v1/ws`

Todas as mensagens são JSON, nos dois sentidos.

1. **Autenticação:** a primeira mensagem tem que ser `{ "type": "auth", "token": "shk_…" }`, em até 5 segundos. A resposta é `{ "type": "auth.ok", "deviceId": "…" }`. Token errado, atraso ou outra mensagem antes fecham a conexão com o código **4001**.
2. **Stream de eventos:** `{ "type": "subscribe", "since": 0 }` liga o stream.
   - Com `since`, o servidor primeiro reenvia tudo depois desse `seq` e então segue ao vivo.
   - Sem `since`, vem só o que acontecer daqui em diante.
   - Cada evento chega como `{ "type": "event", "event": { … } }`.
3. **Outras mensagens:**

| Cliente manda | Servidor responde |
|---|---|
| `{ "type": "approval.respond", "approvalId", "decision": "approve" \| "deny", "answer"? }` | nada, ou `error`. O resultado chega como evento `approval.resolved` |
| `{ "type": "ping" }` | `{ "type": "pong" }` |
| `{ "type": "chat.send", "conversationId"?, "text", "style"?, "attachmentIds"?, "clientId" }` | a sua mensagem e a do Renfield chegam como eventos `chat.message`. Enquanto ele escreve, chegam `{ "type": "chat.delta", "conversationId", "messageId", "text" }` com os pedaços do texto. `conversationId` padrão: `main` |

Erros chegam como `{ "type": "error", "code", "message" }` e não fecham a conexão.
