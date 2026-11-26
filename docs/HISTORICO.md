# The Shack: histórico

O registro do projeto num lugar só. Ele guarda o que o código e o git não dizem: as decisões e o motivo de cada uma, o que mudou em relação ao plano, o que ficou sem testar, os custos medidos e o que falta fazer.

Os planos detalhados de cada fase saíram da pasta em 2026-11-25 e estão no commit `bed6494`: `docs/PLAN.md` (arquitetura e fases 1 a 7), `docs/PHASE-8.md`, `docs/PHASE-9.md` e `docs/PHASE-9-PROGRESS.md`. Para ler um deles: `git show bed6494:docs/PLAN.md`.

## Como o projeto é

- **Monorepo** com npm workspaces:
  - `apps/server`: Node 24 + Hono, com SQLite embutido (`node:sqlite`);
  - `apps/web`: React + Vite, instalável como PWA;
  - `packages/shared`: os contratos em zod.
- **Um processo só** faz tudo: API REST, WebSocket, fila de tarefas, agendador e os agentes.
- **Um agente é uma pasta** `agents/<id>/` com `agent.yaml` e `persona.md`. Uma pasta nova vira um agente novo, sem reiniciar.
- **O campo `runner` do manifesto diz quem executa:**
  - `code` é o Claude Code com git (o etnaD);
  - `text` só lê e escreve texto (a Mina);
  - `design` gera imagens (o Harker);
  - `none` só conversa (o Renfield).
- **A cena** é pixel art desenhada em Canvas 2D puro, com mapas e sprites feitos em código. É uma casa de vidro sobre palafitas numa floresta com neblina, e ela cresce sozinha com os agentes.
- **A API** está em `docs/API.md` e, com o servidor no ar, em `GET /api/v1/openapi.json`.

## Decisões que valem para o projeto inteiro

- **Custo zero.** Os agentes usam só o login da assinatura do Claude Code e os modelos do plano.
  - O servidor tira do ambiente toda variável que gere cobrança.
  - No início de cada sessão, ele confere a credencial e para antes do primeiro pedido se não for a da assinatura.
  - A Shack nunca lê nem guarda o login: quem autentica é o binário oficial. Por isso ela é de uso pessoal.
- **Roda neste PC.** O celular chega pelo Tailscale (`tailscale serve`), que dá HTTPS sem abrir portas; o iPhone exige HTTPS para instalar o app e receber push.
- **Uma tarefa por vez por agente.** Agentes em paralelo para acelerar código ficam de fora: é o que o livro de agentes desaconselha.
- **O etnaD trabalha num branch por tarefa,** faz commit e nunca dá push.
- **Shell do etnaD livre dentro do workspace,** desde 2026-11-09. Só o arriscado pede aprovação: git que muda branch, credenciais, rede, instalação global e caminhos fora do workspace. Antes, só uma lista de comandos passava sozinha. Para voltar, use `shell: allowlist` no `agent.yaml`.
- **Conferir o resultado, não o relatório.** Só o servidor escreve `result.verification`: o git para o etnaD e os PNGs em disco para o Harker. O que o modelo mandar nesse campo é descartado.
- **Vazio não é zero.** Uma consulta que falha diz "Indisponível", e uma ação destrutiva em lote com a lista do que fica vazia é bloqueada.
- **Ferramentas tolerantes.** Os schemas ajustam o valor em vez de rejeitar, porque cada rejeição custa uma volta na cota.
- **Texto de outro agente é conteúdo externo.** Ele passa por `core/external.ts`, que tira caracteres invisíveis e marca o bloco como dado, nunca como ordem.
- **Sem skills de terceiros nos agentes.** A exceção são a canvas-design e a theme-factory, da Anthropic, lidas antes de entrar (`plugins/shack`). Também não há gateway genérico de mensageiros.
- **Arquivos com menos de 500 linhas.** Um arquivo perto do limite se divide antes de crescer.

## Fases

### Fases 1 a 6: plano, núcleo, Renfield, etnaD, assistente e cena (2026-10-21 e 22)

- **Plano** aprovado em 2026-10-21, com custo zero e visual top-down, com a câmera do Stardew Valley.
- **Protótipo visual:**
  - O v1, claro e aconchegante, foi recusado.
  - O v2 foi aprovado com a neblina mais leve: escuro e enevoado, como Forks em *Crepúsculo*, com janelas âmbar, chuva e uma HUD de jogo.
  - O protótipo (`prototype/shack-topdown.html`) foi apagado em 2026-11-25 e está no git.
- **Núcleo:** registro de agentes com recarga, fila de tarefas, eventos com replay, aprovações, tokens por dispositivo com pareamento, REST, WebSocket e OpenAPI.
- **Renfield** (chamado Marvin até 2026-11-05): o chat pelo Agent SDK, com memórias, regras, modos e feedback, e delegação de tarefas.
- **etnaD:** o Claude Code dentro de workspaces cadastrados, com guarda de caminhos, aprovações, relatório e retry.
- **Assistente:** agenda local, lembretes e alarmes, timers, listas, notas e push.
- **Cena:** dois mapas (dentro e fora), personagens andando por A* e os estados ao vivo de cada agente.

### Fase 7: polimento e as ideias do livro (2026-10-22)

- **O app:** PWA instalável, servidor entregando o app web, pareamento por código de 6 dígitos, aba **Dispositivos**, ícones em pixel art, ajustes do iPhone e o `CLAUDE.md`.
- **Ideias do livro de agentes, todas feitas:**
  - a conferência do servidor (`verification`);
  - "vazio não é zero";
  - ferramentas tolerantes;
  - o relatório do etnaD como conteúdo externo;
  - a higiene da memória (datas absolutas, teto de uns 2 mil tokens, `memory_search` e feedback marcado como "não revisado");
  - a nota de passagem de uma tarefa que falha ou é cancelada;
  - o medidor de cota.
- **Uma tarefa cancelada segura a vaga do agente** até o git fechar e a nota sair. Isso corrigiu uma corrida antiga entre o cancelamento e a tarefa seguinte.

### Entre as fases (2026-11-05 a 19)

- **2026-11-05:**
  - **O Marvin virou Renfield.** A migration `006_renfield.sql` leva o banco junto.
  - **O Quadro:** calendário, agenda do dia, lista Mercado e lista Afazeres numa tela só. O que o Renfield muda pisca no Quadro.
  - **Anexos no chat:** fotos, PDFs e textos. As fotos são reduzidas a 1568 px no navegador, porque o modelo não aproveita mais que isso e cada pixel gasta cota.
- **2026-11-19:**
  - conversas novas e histórico, como o `/clear` e o `/resume`, com a conversa aberta igual em todos os aparelhos;
  - o seletor de modelo e de esforço por agente, por cima do `agent.yaml`;
  - a divisória entre a casa e o chat no computador;
  - a caixa de mensagem com várias linhas.

### Fase 8: voz e tela de bloqueio (2026-11-02 a 25), encerrada sem entrega

- **8.1, voz: cancelada em 2026-11-05.**
  - **A voz do navegador** soou robótica.
  - **A voz neural local foi escolhida e depois descartada,** porque o gargalo é o Renfield, não a voz:
    - ele leva 8,7 s na mediana para responder, e o texto sai todo de uma vez no fim;
    - a voz ocupava uns 5 GB da placa;
    - ela trazia Python, CUDA e PyTorch para um projeto Node.
  - **O botão de ditado também ficou de fora:** você preferiu o `Win + H`, que já resolve. As receitas medidas estão em "Receitas guardadas", no fim.
- **8.2, agente de prompts:** foi para a Fase 9, como a Mina.
- **8.3, tela de bloqueio:** cancelada em 2026-11-25, a seu pedido. Previa um widget pelo app Scriptable e um atalho de voz pelo app Atalhos. Widget de verdade exige app nativo, que custa US$ 99 por ano.

### Hábitos no Quadro (2026-11-25)

- **Uma grade de quadradinhos por dia,** como a do GitHub, com 53 semanas e 6 cores. O Renfield marca pelo chat ("fui à academia"), mas não cria um hábito sem perguntar.
- **Um dia sem marca não quebra a sequência** até o dia acabar. Dias no futuro são recusados.
- **Os nomes são comparados sem acento,** porque o `NOCASE` do SQLite não ignora acentos. Migration `009_habits.sql`.

### Fase 9: Mina, Harker e a ala deles (2026-11-24 e 25)

**Decisões suas (2026-11-24):**
- O nome é Mina (Mina Harker, do *Drácula*).
- O papel dela: escrever prompts e conferir se o que o etnaD e o Harker entregaram é o que foi pedido.
- O Harker usa Opus, com o Sonnet de reserva.
- Formatos: feed 4:5, quadrado e story 9:16.
- A legenda sai em português, a não ser que o pedido diga outra língua.

**Decisões minhas:**
- A conferência é automática uma vez, para tarefas que nasceram de um prompt da Mina.
- A correção sempre pede um toque seu.

**9.1, a Mina.**
- Ela só lê: não tem escrita, shell nem git.
- Confere a entrega numa cópia temporária do commit (`git worktree`), e a correção parte do branch conferido.
- O veredito é recalculado pelo servidor: um item pendente nunca vira "tudo certo".
- **Ao vivo:** um prompt no Sonnet levou 32 s e gastou 14 mil tokens de entrada e 3,7 mil de saída.

**9.2, as skills.**
- A canvas-design e a theme-factory foram copiadas do `anthropics/skills`. A única mudança no texto foi tirar a frase que mandava baixar fontes.
- Entraram duas licenças que faltavam.
- O teste `skills.test.ts` segura as regras numa cópia futura.

**9.3, o motor de imagens.**
- **O render** usa o Edge sem janela, com JavaScript desligado e uma origem falsa que só entrega arquivos da tarefa e as fontes do plugin. Nenhum nome de domínio resolve, então nada sai da máquina.
- **Tetos por tarefa:** 10 imagens e 40 renders.
- **O servidor confere cada PNG:** que ele existe, o tamanho exato, o hash do render, o carrossel num formato só e a legenda nos limites do Instagram.
- **Os anexos vão para `input/` na criação da tarefa,** porque um anexo solto some em 24 horas.

**9.4, primeira parte, o Harker.**
- A persona, a galeria no painel, salvar (o compartilhar do celular) ou baixar (no computador), copiar a legenda e o texto alternativo, e o **Ajustar**.
- O ajuste parte do `work/` e das imagens conferidas da tarefa anterior.
- O Renfield manda fotos com `attach_files`.

**O que os testes ao vivo mostraram** (Sonnet, numa Shack de teste):
- **Um post:** 32 s, 61 mil tokens de entrada.
- **O modelo pulava as skills.** Agora o pedido manda abri-las antes de desenhar.
- **Um carrossel de 2 imagens, com as skills e uma volta de ajuste:** 55 s, 218 mil tokens de entrada, a maior parte do cache.
- **As duas vezes caíram no mesmo sinal de "cara de IA":** a Instrument Serif com uma palavra em itálico colorido no título. A persona proíbe isso.

### Ajustes do iPhone e uso do plano (2026-11-25)

- **A cena borrada no iPhone:** o canvas ficava em 2x numa tela 3x, e o navegador esticava a imagem 1,5 vez. Agora ele usa a resolução real. Para poupar bateria, o celular desenha a 30 quadros por segundo, e o ritmo cheio volta enquanto você arrasta ou dá zoom.
- **A faixa vazia de 47 px embaixo, no app instalado:** o iOS informava a altura sem a barra de status. Agora o app usa a altura da tela inteira.
- **Os quatro agentes cabem na largura do celular,** e o nome da casa sai do canto em tela estreita.
- **O uso do plano no canto da casa:**
  - É o mesmo número do `/usage` do Claude Code: a sessão de 5 horas e a semana, com a hora em que cada uma renova.
  - A consulta não gasta modelo e vai no máximo uma vez por minuto.
  - Tocar no canto mostra também os tokens das tarefas de cada agente. O chat do Renfield não entra nessa soma.

## Pendente e sem teste de verdade

- **No iPhone:**
  - conferir que a faixa vazia sumiu no app instalado;
  - o push chegando de verdade;
  - a câmera e a Fototeca pelo **+**, com o HEIC virando JPEG;
  - salvar as imagens do Harker nas Fotos, que depende do HTTPS do Tailscale.
- **Agentes:**
  - a conferência da Mina sobre uma entrega real do etnaD, e uma correção;
  - cancelar uma tarefa real do etnaD no meio;
  - o custo do Harker no Opus num carrossel de 5 imagens, antes de fixar o modelo.
- **Riscos:**
  - O uso do plano depende de uma função do SDK marcada como experimental. Se ela mudar, o painel diz "Indisponível".
  - O `npm audit` aponta falhas no `hono`, no `@hono/node-server` (uma delas burla regras de acesso por caminho com barra invertida) e no `body-parser`. É preciso atualizar.

## Próximos passos

1. **9.4, segunda parte:**
   - **Identidade por projeto:** um contrato `BrandKit` com paleta, par de fontes, tom, @ e hashtags, e uma tabela `brands` numa migration nova. Na primeira tarefa de um projeto, o Harker propõe até 3 identidades com uma imagem de amostra, e você toca em **Usar esta**. Nas seguintes, ele não troca a identidade.
   - **Mina e Harker:**
     - o botão **Mandar para o Harker** no prompt dela, com uma receita de prompt de imagens na base dela;
     - a conferência automática das imagens, com ela lendo `data/design/<id>/` sem poder escrever;
     - a correção como tarefa filha, pelo mesmo caminho do **Ajustar**.
   - **O cavalete na ala:** a estação `easel`, a pose `paint`, o avental e a câmera do Harker, e a tela se pintando aos poucos.
2. **Tailscale no iPhone:** a VPN ligada, o app aberto pelo endereço do Tailscale, o pareamento dentro do app instalado e o teste de push.
3. **Atualizar os pacotes** com falha de segurança.
4. **Backlog,** só quando você pedir:
   - personalidade com humores;
   - um agente companheiro para conversar;
   - o Google Calendar;
   - deixar o Renfield mais rápido. É isso que trava qualquer volta da voz.

## Receitas guardadas

- **Ditado, se voltar:**
  - o programa é o `whisper.cpp` na build `b5454`, pacote `whisper-bin-win-cuda-12.4.0-x64.zip`;
  - o modelo é o `ggml-large-v3-turbo-q5_0.bin`;
  - o comando é `whisper-cli -m <modelo> -f <wav 16 kHz mono> -l pt -nt -np`, aberto a cada ditado.

  Na RTX 4060, ele levou 1,1 s e ocupou ~1 GB da placa só nesse tempo. No processador, levou de 6 a 9 s.
- **Voz do Renfield,** para quando ele responder em até 3 s:
  - o modelo é o Qwen3-TTS 12Hz 1.7B Base, pelo `faster-qwen3-tts`, com o `transformers` fixado na 5.15.1, porque a 5.22 quebra o carregamento;
  - a voz é clonada da `pm_santa` do Kokoro 82M, lendo "Boa tarde! Eu sou o Renfield, o mordomo da casa. Cuido da sua agenda, dos lembretes e de tudo o que você precisar, todo dia, a qualquer hora."

  Na RTX 4060, levou 0,45 s até começar a falar.
