# The Shack

Sistema pessoal de agentes de IA. O Renfield é o mordomo e a porta de entrada; o etnaD é o agente de programação. Plano completo em [docs/PLAN.md](docs/PLAN.md) e referência da API em [docs/API.md](docs/API.md).

**Estado atual:** Fase 7, a última do plano. A tela principal é a casa: uma casa de vidro numa floresta enevoada, onde cada agente tem a sua mesa e anda pela casa conforme o que está fazendo de verdade. A Shack instala no iPhone como app, pelo Tailscale.

- **O Renfield e o etnaD** conversam e programam de verdade, os dois pelo Agent SDK e só com o login da sua assinatura.
- **A Shack também tem** agenda, lembretes, alarmes, timers, listas, notas e notificações, pelo chat e por telas próprias. O **Quadro** junta o calendário, a lista de compras e os afazeres numa tela só.
- **Anexos:** mande fotos, PDFs e arquivos de texto ao Renfield pelo **+** ao lado da caixa de texto, colando com Ctrl+V ou arrastando para o chat.

- **O Renfield:** lembra de você, aprende regras e delega ao etnaD.
- **O etnaD:** trabalha num branch próprio dentro das pastas que você cadastrar. Ele pede sua aprovação para comandos fora da lista e entrega um relatório com o que mudou, onde e como testar.

## Requisitos

- Node.js 24 ou mais novo.
- Claude Code com login feito pela sua assinatura (Pro ou Max). Se precisar refazer o login, use `/login` no Claude Code.

## Como rodar

Na raiz do projeto:

```powershell
npm install
npm test
npm run token -- --name "Meu PC"
npm run dev
```

- `npm test` roda os testes dos fluxos principais. Eles usam um Renfield falso e não gastam cota.
- `npm run token` cria o token do seu dispositivo. Guarde o valor que começa com `shk_`, porque ele não aparece de novo.
- `npm run dev` sobe o servidor e o app web juntos. Abra **http://127.0.0.1:5173**, cole o token e converse com o Renfield. Ctrl+C encerra tudo.

Para mudar porta, banco ou pasta dos agentes, copie `.env.example` para `.env` e edite. O app web segue o `SHACK_PORT` do mesmo arquivo.

Para usar no dia a dia (e no celular), gere o app uma vez e suba só o servidor. Ele entrega o app e a API no mesmo endereço, **http://127.0.0.1:4321**:

```powershell
npm run build
npm start
```

Depois de mudar o código do app, rode `npm run build` de novo. O servidor pega o build novo sem reiniciar.

### Atalho

```powershell
npm run shortcut
```

No Windows, cria o atalho **The Shack** na Área de Trabalho. Ao abrir, ele sobe o servidor numa janela minimizada, "The Shack (servidor)", e abre o app numa janela própria do Edge. Se o servidor já estiver no ar, só abre o app. Se o código do app mudou desde o último build (depois de um `git pull`, por exemplo), ele roda `npm run build` antes. Para desligar o servidor, feche aquela janela.

No Linux, cria o lançador **The Shack** no menu de aplicativos. No GNOME, que não mostra ícones na Área de Trabalho, procure por ele em Atividades e fixe-o na barra. Ele faz o mesmo que o do Windows, com duas diferenças:

- **O servidor roda sem janela,** como o serviço `the-shack` do systemd do seu usuário. Para desligá-lo, clique com o botão direito no ícone e escolha **Desligar o servidor**. Se ele não subir, o erro aparece em `journalctl --user -u the-shack`.
- **A janela própria precisa de um navegador baseado no Chromium** (Chrome, Edge, Chromium ou Brave). Sem nenhum deles, o app abre no navegador padrão.

O app em `:4321` guarda o login separado do `:5173` do `npm run dev`. Na primeira vez, cole o token de novo ou pareie com um código.

Rode `npm run shortcut` uma vez em cada máquina, porque o atalho aponta para a pasta do projeto dela.

## No iPhone

O iPhone só instala apps da web e só entrega notificações com HTTPS. O Tailscale resolve isso de graça e sem abrir portas no roteador. O servidor continua rodando neste PC.

1. Instale o **Tailscale** no PC (tailscale.com/download) e no iPhone (App Store), e entre com a mesma conta nos dois.
2. No PC, com a Shack no ar (`npm run build` e `npm start`), rode num terminal: `tailscale serve --bg 4321`. Na primeira vez, o Tailscale pode pedir para ativar HTTPS na sua conta; siga o link que ele mostrar.
3. No app do PC, abra **Menu**, **Configurações**, **Dispositivos**. A tela mostra o endereço `https://…ts.net` da sua máquina e o que ainda falta.
4. No iPhone, com o Tailscale ligado, abra esse endereço no **Safari**, toque em **Compartilhar** e em **Adicionar à Tela de Início**.
5. Abra a Shack **pelo ícone novo**. No PC, toque em **Gerar código** e digite os 6 números no iPhone. O código vale 5 minutos e uma vez só.
6. No iPhone, abra **Menu**, **Configurações**, **Notificações** e toque em **Ativar neste aparelho**.

- **Por que entrar pelo ícone, e não no Safari:** o app instalado guarda o login separado do Safari, e as notificações só funcionam no app instalado (iOS 16.4 ou mais novo).
- **Perdeu o celular:** em **Dispositivos**, toque em **Revogar**. Ele perde o acesso na hora.
- **Se as notificações não chegarem no iPhone:** ponha o seu e-mail em `VAPID_SUBJECT` no `.env` (por exemplo `mailto:voce@gmail.com`) e reinicie o servidor. O push da Apple é exigente com esse campo.

## A casa

- **O que cada agente faz.** Quando está livre, ele toma café, lê no sofá, rega as plantas ou olha a neblina. Quando recebe uma tarefa, vai até a mesa, senta e digita, e os monitores mostram atividade.
- **Quando alguém precisa de você,** ele levanta, vira para você e aparece um balão "?". Um erro acende um "x" vermelho na tela e sobe um fiozinho de fumaça.
- **Enquanto o Renfield responde no chat,** aparece um balão de "digitando" sobre ele.
- **Se a cota do plano acabar,** quem está livre vai cochilar no sofá até ela voltar.
- **Cartões no canto de baixo:** mostram cada agente e o que ele está fazendo. Toque num cartão ou no personagem para abrir o painel, com a tarefa atual, o progresso, a fila, o histórico com os relatórios e os botões de aprovar, cancelar e tentar de novo.
- **Chat:** fica sempre ao lado. No celular, é a gaveta de baixo; toque em **Abrir**.
- **Menu:** traz a agenda, os lembretes e timers, as listas, as notas, o clima da cena e as configurações. As telas abrem por cima da casa.
- **Navegação:** **Ver lá fora** mostra a casa por fora, e tocar na porta também troca. Arraste para andar pela casa e use a roda do mouse, a pinça ou os botões + e − para o zoom.
- **Hora da cena:** segue a hora de São Paulo, então à noite a casa escurece e as janelas acendem.
- **Ajuda:** o tour de boas-vindas volta em **Menu**, depois **Como usar**.

## Primeiro trabalho para o etnaD

1. No app, abra **Menu**, depois **Configurações**, depois **Workspaces**, e cadastre a pasta de um projeto com o caminho completo, por exemplo `C:\Users\voce\projetos\meu-app`.
2. Peça no chat, por exemplo: "Peça ao etnaD para adicionar testes no módulo de datas do meu-app".
3. Veja o etnaD ir até a mesa e trabalhar, e toque nele para acompanhar o progresso. Se ele precisar rodar um comando fora da lista, aparece um cartão com Aprovar e Negar, no chat e no painel dele. Se tiver uma dúvida, aparece um cartão com as opções.
4. No fim, o Renfield posta o relatório no chat. Em projetos git, as mudanças ficam num branch `etnad/...`, e o seu branch não é tocado. Para revisar, use o comando que vem no relatório, por exemplo `git diff main..etnad/...`.

**O servidor confere o relatório.** Em projetos git, ele compara o que o etnaD disse com o diff de verdade. Se o relatório citar mudanças que o git não mostra, a tarefa aparece como **suspeita**: o aviso sobe de prioridade, o etnaD fica com o sinal de erro na casa e o painel mostra o que mudou de fato. Sem git, o aviso diz que não deu para conferir.

**Nota de passagem.** Se uma tarefa falhar ou for cancelada, fica uma nota curta com o que foi feito, o que falhou e o que falta. Ela aparece no histórico do painel e segue para a próxima tentativa, ou para a próxima tarefa no mesmo projeto.

Comandos que rodam sem perguntar: os de leitura e os de teste do manifesto, como `npm test`, `git status` e `git diff`. Para liberar outros num projeto, use **Comandos liberados** no workspace, por exemplo `Bash(npm run build*)`. `git push` é sempre bloqueado.

Para testar a interface sem gastar cota, ponha `SHACK_RUNNER=simulated` no `.env`. Assim o etnaD só finge trabalhar.

## O que dá para pedir ao Renfield

- "Me lembra de tomar o remédio todo dia útil às 8h."
- "Me acorda amanhã às 6h30." Vira um alarme, que toca até você dispensar.
- "Marca dentista sexta às 15h." E também: "O que tenho amanhã?"
- "Coloca leite e café na lista de compras." Ela é a lista Mercado, e "to-do" é a lista Afazeres.
- Uma foto da geladeira ou o PDF de uma conta, com "o que falta comprar?" ou "quando vence?".
- "Começa um timer de 10 minutos pro macarrão."
- "Anota a senha do Wi-Fi da praia: mar123."
- "O que o etnaD está fazendo?"
- "Peça ao etnaD para revisar o README do meu-app."
- "Lembre que prefiro respostas curtas." Ele guarda como memória.
- "Quando eu disser 'modo foco', ative o modo foco." Ele aprende uma regra com gatilho.
- "/feedback não use listas." Vira uma regra marcada como nova nas configurações.

As mesmas coisas também têm telas próprias, nas abas **Quadro**, **Agenda**, **Lembretes**, **Listas** e **Notas**.

**O Quadro** abre pelo Menu ou pelo botão **Quadro** no topo do chat. Ele mostra o mês com os compromissos, a agenda do dia escolhido, a lista de compras e os afazeres, e tudo se edita ali mesmo. É o mesmo dado que o Renfield usa: o que ele muda pelo chat entra no Quadro na hora, piscando, e no alto do Quadro há uma caixa para pedir a ele sem sair da tela.

**Anexos.** Toque no **+** à esquerda da caixa de texto. No iPhone, ele oferece Fototeca, Câmera e Arquivos. No computador, também dá para colar uma imagem com Ctrl+V ou arrastar arquivos para o chat. Vão até 5 por mensagem: fotos (até 5 MB, reduzidas antes de subir), PDFs (até 10 MB) e textos (até 512 KB). Planilhas e documentos do Word não entram; exporte como PDF. Cada anexo pesa na cota, e continua pesando nas respostas seguintes da mesma conversa.

Em **Menu**, depois **Configurações**, você vê e edita a persona, as memórias, as regras, o modo ativo, os workspaces, as notificações e a conta. Quando um agente pede aprovação, aparece um cartão com Aprovar e Negar, e você também pode responder "sim" ou "não" no chat.

## Notificações

Lembretes, alarmes, timers e avisos dos agentes aparecem no alto da tela e no botão **Avisos**. O aviso de uma tarefa tem o botão **Ver**, que abre o painel do agente. Os alarmes têm os botões **Dispensar** e **Soneca 10 min**.

Para receber os avisos também como notificação do sistema, mesmo com a aba fechada, abra **Menu**, depois **Configurações**, depois **Notificações**, e clique em **Ativar neste navegador**. O botão **Mandar um teste** confere se está funcionando.

No iPhone, as notificações só funcionam com a Shack instalada na Tela de Início (veja **No iPhone**, acima).

Quem dispara é o servidor, então o computador com a Shack precisa estar ligado. Com o **modo foco** ativo, só os avisos urgentes tocam. O resto chega num resumo quando você desliga o modo.

## Custo zero

A Shack nunca lê nem guarda o seu login. Quem autentica é o Claude Code oficial, e o servidor remove do ambiente qualquer variável que geraria cobrança por uso, como `ANTHROPIC_API_KEY`. Na primeira conversa, ele confere se a credencial é a da assinatura. Se não for, nada é enviado ao modelo. O uso conta na mesma cota que você usa no Claude Code e no claude.ai.

**Medidor de cota.** A barra do topo mostra quanto da janela atual do plano já foi usado (aparece depois da primeira resposta; antes disso, "–"). Perto do limite, sai um aviso, e o Renfield confirma com você antes de mandar uma tarefa nova ao etnaD. Se o Claude Code indicar cobrança extra, aparece um aviso vermelho. Os detalhes de cada janela ficam em **Configurações**, **Conta**.

## Teste rápido pelo PowerShell

Com o servidor no ar, num segundo terminal:

```powershell
$h = @{ Authorization = "Bearer shk_COLE_SEU_TOKEN" }
$api = "http://127.0.0.1:4321/api/v1"
$json = '{"text":"Boa tarde, Renfield. O que o etnaD está fazendo?"}'
(Invoke-RestMethod "$api/conversations/main/messages?wait=true" -Method Post -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))).reply.text
```

Se os acentos aparecerem quebrados no terminal, rode `chcp 65001` antes. Para mandar texto com acento, use `[Text.Encoding]::UTF8.GetBytes(...)` como no exemplo.

## Estrutura

```
agents/            um agente = uma pasta com agent.yaml e persona.md
apps/server/       servidor (Hono + SQLite + WebSocket + Agent SDK)
apps/web/          app web (React + Vite, instalável como PWA); a cena da casa fica em src/scene/
packages/shared/   contratos zod compartilhados entre servidor e clientes
docs/              plano e API
scripts/           dev.ts (sobe tudo) e icons.ts (gera os ícones do app)
```

## Agentes

Cada agente vive em `agents/<id>/`. O `agent.yaml` define nome, papel, modelos, ferramentas, limites e aparência, e o `persona.md` define a personalidade. O servidor recarrega os dois sozinho quando você salva. Um manifesto inválido desativa só aquele agente, e o motivo aparece em `GET /agents`.

Os modelos são apelidos em ordem de preferência, por exemplo `[sonnet, haiku]`. O servidor usa o primeiro que o seu plano oferecer.

**Aparência na casa:** fica em `appearance`, no `agent.yaml`. As opções estão comentadas no manifesto do Renfield.

- `palette`: as cores da pele, do cabelo, da roupa, do detalhe, da calça e do sapato.
- `hair`: `neat` ou `messy`.
- `accessory`: `bowtie`, `headphones` ou `none`.
- `station`: `single-monitor` ou `dual-monitor`.
- `idle`: os lugares preferidos quando o agente está livre.

As cores que faltarem são sorteadas a partir do id, sempre iguais para o mesmo agente.

**Agente novo:** ele entra pela porta e ganha uma mesa sozinho. As duas primeiras mesas ficam no cômodo principal. A cada dois agentes a mais, a casa ganha uma ala à direita, com duas mesas, uma poltrona e plantas, e por fora ganha um anexo de vidro.
