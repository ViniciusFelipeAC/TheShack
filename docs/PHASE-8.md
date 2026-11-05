# The Shack: plano da Fase 8 (agente de prompts e tela de bloqueio)

Proposta de 2026-11-02. A entrega 8.1, de voz, foi cancelada em 2026-11-05. O andamento fica na seção 9.

O plano geral fica em `PLAN.md`. Este arquivo é separado porque o `PLAN.md` já passou de 500 linhas.

## 0. Resumo

A fase tinha três entregas, com uma parada para aprovação depois de cada uma. Ficaram duas:

1. **8.1 Voz:** cancelada em 2026-11-05 (seção 2). Para ditar, use o `Win + H` ou o microfone do teclado do iPhone.
2. **8.2 Agente de prompts:** um agente novo escreve prompts para o etnaD que evitam a "cara de IA" e revisa o que o etnaD entregou. Nome provisório: **Ford**.
3. **8.3 Tela de bloqueio:** um widget com o resumo da casa e um botão para falar com o Renfield sem abrir o app.

Tudo continua com custo zero. Nada usa chave de API ou serviço pago.

## 1. Antes de começar: Tailscale e o teste pendente da Fase 7

No celular, o push só funciona sob HTTPS, e o widget precisa alcançar o servidor de fora de casa. Os dois dependem do Tailscale, que ainda não está instalado.

- Instale o Tailscale no PC e no iPhone (plano pessoal gratuito) e ligue o `tailscale serve`.
- Faça o teste que ficou pendente na Fase 7: instalar o app na Tela de Início, parear e receber um push.
- A 8.2 não depende disso e pode começar antes. A 8.3 depende.

## 2. Entrega 8.1: cancelada

Em 2026-11-05, a 8.1 saiu da fase. Para ditar, use o que o sistema já tem:

- **No Windows 11:** clique na caixa de mensagem e aperte `Win + H`.
- **No iPhone:** use o microfone do teclado.

Os dois foram testados e descartados nesse dia. Os números completos estão na seção 9.

- **O Renfield respondendo em voz alta:** saiu porque o gargalo é ele, não a voz. A mediana de resposta é de 8,7 s, e a voz ocuparia uns 5 GB da placa o tempo todo.
- **Um botão de ditado na Shack:**
  - No processador, o Whisper levou de 6 a 9 s por ditado, ou errou frases curtas com o modelo menor.
  - Na placa, aberto só durante o ditado, levou 1,1 s e acertou.
  - Você preferiu o `Win + H`, que já resolve sem código nem manutenção.

Se o botão voltar um dia, o caminho medido é este:

- **Programa:** `whisper.cpp` na build `b5454`, pacote `whisper-bin-win-cuda-12.4.0-x64.zip` (sha256 `afef0b88…957a`). Ele já traz o cuBLAS; o pacote 11.8 não traz e cai para o processador.
- **Modelo:** `ggml-large-v3-turbo-q5_0.bin` (574 MB, sha256 `39422170…a7e2`).
- **Comando:** `whisper-cli -m <modelo> -f <wav de 16 kHz mono> -l pt -nt -np`, aberto a cada ditado. Na RTX 4060, leva 1,1 s e ocupa ~1 GB da placa só nesse tempo.

## 3. Entrega 8.2: o agente de prompts e revisão

### Papel

1. **Escrever prompts.** Você pede ("um site sobre a feira do bairro"), e ele devolve um prompt pronto para o etnaD, com escolhas concretas que fogem da cara de IA. Ele também melhora um prompt que você já escreveu.
2. **Revisar.** Ele lê o que o etnaD entregou, conta os sinais de IA que encontrou, aponta o arquivo e a linha de cada um, e escreve um prompt de correção.

Ele nunca edita arquivos. Quem programa continua sendo o etnaD.

### "Treino": base de conhecimento, não ajuste de modelo

A assinatura não permite treinar o modelo, e isso nem é preciso. O "treino" é um conjunto de documentos que entra no prompt dele a cada tarefa.

- Uma pasta `agents/ford/knowledge/` com arquivos `.md`.
- O primeiro arquivo é o seu PDF, já transcrito em `docs/references/ai-look-signals.md`, que vai para essa pasta.
- O segundo é uma receita de prompt para o etnaD: restrições, seções, critérios de aceite e entrega, no formato que funcionou no teste do site "Órbita".
- O manifesto ganha `knowledge: [knowledge/*.md]`. Os caminhos ficam presos à pasta do agente, com a mesma checagem da persona. Há um teto de 40 mil caracteres; acima dele, o agente fica desativado com um erro claro.
- Para ensinar mais, você solta outro `.md` na pasta. O registry recarrega sozinho.

### Como ele escreve um prompt

O prompt que ele devolve tem sempre estas partes:

1. Objetivo.
2. Restrições.
3. **Direção visual com nomes:** um par de fontes nomeado, a paleta em hex e um layout com assimetria proposital.
4. Texto, com exemplos de títulos concretos sobre o assunto.
5. Animações variadas e com propósito.
6. Um **checklist anti-IA** que o etnaD confere antes de entregar.
7. Critérios de aceite.
8. Entrega.

Três regras evitam que o remédio vire outro padrão:

- **A soma é que denuncia.** A meta é no máximo um sinal da lista, e não proibir tudo às cegas. Se um sinal fizer sentido para o assunto, ele mantém e justifica.
- **Sem "estilo Claude".** O próprio agente é um Claude, então a tendência dele é bege, laranja ferrugem e serifa itálica. A persona proíbe isso por padrão.
- **Variar.** O servidor põe no prompt dele a direção visual das últimas 5 tarefas, e ele não repete fonte nem paleta.

Se faltar algo que muda o resultado, como o público ou o tom, ele pergunta com `AskUserQuestion`, e a pergunta chega a você como as do etnaD. Se não faltar, ele decide e lista as premissas no topo do prompt.

### Como ele revisa

- Ele só tem `Read`, `Glob` e `Grep`, com o mesmo hook que prende os caminhos ao workspace.
- **O que ele lê é o branch da tarefa.** O etnaD faz commit no branch `etnad/...` e volta ao branch original, então a pasta não mostra o que ele fez. O servidor cria um `git worktree` temporário desse branch em `data/tmp/`, roda a revisão lá e apaga o worktree no fim.
- **O resultado é estruturado:** a nota (quantos sinais, na escala de Krebs: 0 ou 1, 2 ou 3, 4 ou mais), cada achado com sinal, arquivo e linha, e a correção sugerida. No fim vem o prompt de correção e o "teste final": dá para trocar o nome do site por qualquer outro?

### O runner de texto

O `CodeRunner` de hoje é do etnaD: regras de git, edição e commit. O agente novo ganha um runner próprio, mais simples.

- **Manifesto:** campo novo `runner: code | text | none`. O padrão continua o de hoje (`code` quando há ferramentas), então o etnaD não muda.
- **`TextRunner`:**
  - Mesma assinatura e mesma trava de credencial.
  - `settingSources: []` e sem git.
  - Ferramentas só de leitura, e só quando a tarefa tem workspace (`workspace: optional`).
  - Saída estruturada.
- **`TaskResult` ganha dois campos opcionais, nascidos em `packages/shared`:**
  - `output`: o prompt em markdown, até 20 mil caracteres.
  - `findings`: os achados da revisão.
- **Verificação:** `result.verification` continua escrito só pelo servidor. Como o agente não tem ferramenta de escrita, `changes` precisa vir vazio. Se vier preenchido, a tarefa é marcada como `suspect`.
- **Modelo:** `sonnet`, com esforço médio. Escrever prompts não pede o Opus, e isso poupa cota.

### Fluxos

1. **Pedir um prompt:** "Renfield, pede pro Ford um prompt de site sobre café." Quando a tarefa termina, o painel mostra o prompt com os botões **Copiar** e **Mandar para o etnaD**. O segundo pede o workspace e cria a tarefa do etnaD com `parentId` apontando para a do Ford.
2. **Revisar:** uma tarefa concluída do etnaD ganha o botão **Revisar com o Ford**.
3. **Corrigir:** a revisão ganha o botão **Mandar correção para o etnaD**. A tarefa de correção parte do branch da tarefa revisada, e não do branch base. Para isso, o runner do etnaD passa a aceitar um branch de origem.

Cada passo pede um toque seu. Não há laço automático entre prompt, etnaD e revisão: cada volta gasta cota, e a regra "delegação só quando você pede" continua valendo para o Renfield.

### Segurança

- O texto do Ford é conteúdo externo, como o do etnaD. Antes de entrar no contexto do Renfield, ele passa por `core/external.ts`.
- **Mandar para o etnaD:** o prompt do Ford só vira tarefa do etnaD pelo seu toque no botão. Isso conta como sua aprovação.
- Os documentos da pasta `knowledge/` são dados. A regra fixa do runner diz isso, como já acontece com o `CLAUDE.md` dos workspaces.

### Na casa

Com um terceiro agente, a casa abre a primeira ala sozinha, porque o layout já cresce assim. A aparência dele fica a combinar com você.

### Testes

- **Manifesto:** os campos `knowledge` e `runner`, o caminho fora da pasta, o teto de tamanho e o etnaD sem mudança de comportamento.
- **`TextRunner` com um SDK falso:** a saída com `output` e `findings`, o `changes` preenchido virando `suspect` e a pergunta virando aprovação.
- **Worktree de revisão:** é criado a partir do branch certo e apagado no fim, inclusive em caso de falha.
- **Ao vivo:** um prompt para um site, o etnaD construindo, a revisão e uma correção.

## 4. Entrega 8.3: tela de bloqueio

### O que o iOS permite

- Widgets da tela de bloqueio só existem para apps nativos, feitos com WidgetKit. Um PWA não consegue pôr nada ali.
- Um app nativo exige um Mac com Xcode e uma conta paga de desenvolvedor da Apple (US$ 99 por ano). Sem a conta paga, o app expira a cada 7 dias. Isso quebra o custo zero, então fica de fora.
- Os pushes da Fase 7 já aparecem na tela de bloqueio, mas são avisos, não widgets.

### Proposta: Scriptable para o widget, Atalhos para a voz

**A. Widget com o app Scriptable (gratuito na App Store).**
- O Scriptable roda JavaScript e oferece widgets nos três formatos da tela de bloqueio: redondo, retangular e em linha.
- O repositório ganha `scripts/ios/shack-widget.js`; você cola o script no Scriptable uma vez.
- **O que ele mostra, no formato retangular:** o próximo compromisso ou lembrete, o estado do etnaD e do Ford, as aprovações pendentes e a cota.
- **Limites:**
  - O iOS decide quando o widget atualiza, em geral de 15 em 15 minutos ou mais. Não é tempo real.
  - Tocar no widget abre o Scriptable ou o Safari, não o app instalado, por uma restrição do iOS.

**B. "Falar com o Renfield" no app Atalhos (nativo).**
- **O que o atalho faz:**
  1. Ditar texto.
  2. `POST /conversations/main/messages?wait=true` com `style: "voice"`, uma rota que já existe.
  3. Falar a resposta.
- **Onde ele fica:**
  - No iOS 18 ou mais novo, o atalho vira um controle na tela de bloqueio, no lugar da lanterna ou da câmera, e na Central de Controle.
  - Ele também funciona com "E aí, Siri, falar com o Renfield".
- **Fica para testar:** se o iOS exige desbloquear o celular antes de o atalho acessar a rede.
- Não dá para gerar o arquivo do atalho (o iOS exige assinatura), então o README traz o passo a passo para montá-lo.

Os dois precisam do Tailscale ligado no iPhone. O app do Tailscale tem "VPN sob demanda" para isso.

### Servidor

- **`GET /widget`:** um resumo compacto, com contrato em `packages/shared`.
  - Cada bloco que falhar vem marcado como `Indisponível`, nunca como lista vazia.
  - Não gasta modelo nenhum.
- **Tokens com escopo:** a tabela de dispositivos ganha `scope: full | widget | voice`, numa migration que só acrescenta, com padrão `full`.
  - **`widget`:** só lê `GET /widget`.
  - **`voice`:** lê o widget e manda mensagens na conversa principal.
- **Proteção do token `voice`:** o atalho pode rodar com o celular bloqueado, nas mãos de qualquer pessoa. Por isso, com esse token:
  - "Sim" e "não" no chat **não** resolvem aprovações.
  - Ferramentas que exigem confirmação são recusadas, com o pedido para abrir o app.
- **Na aba Dispositivos:** um botão "Novo token para widget ou atalho". O token aparece uma vez, com um botão de copiar.
- Para não passar de 500 linhas, o `Settings.tsx` (435 hoje) se divide antes de ganhar a tela nova.

### Testes

- **`/widget`:** o resumo com dados, um bloco indisponível e a negação para tokens sem o escopo certo.
- **Token `voice`:** manda mensagem, mas não aprova nada pelo "sim" e não usa ferramenta com confirmação.
- **Ao vivo:** o widget na tela de bloqueio do iPhone 13 e o atalho respondendo em voz alta.

## 5. Ordem e paradas

| Passo | Entrega | Como você testa | Parada |
|---|---|---|---|
| 0 | Tailscale e o teste pendente da Fase 7 | App instalado no iPhone e push recebido | Não |
| 8.1 | Cancelada (seção 2) | — | — |
| 8.2 | Base de conhecimento, `TextRunner`, o agente e os botões de fluxo | Prompt, etnaD, revisão e correção, ao vivo | **Sim** |
| 8.3 | `/widget`, tokens com escopo, o script do Scriptable e o roteiro do atalho | Widget e atalho no iPhone | **Sim** |

Em todas as entregas, os testes usam o Renfield falso e o runner simulado, sem gastar cota. A fase só termina com `npm test` e `npm run typecheck` passando.

## 6. Custo e cota

| Item | Custo |
|---|---|
| Scriptable e Atalhos | Gratuitos |
| Tailscale | Plano pessoal gratuito |
| Agente de prompts | Usa a cota da assinatura, no `sonnet` |

O medidor de cota da Fase 7 continua valendo.

## 7. Fora desta fase

- Palavra de ativação ("Ei, Renfield"). Um PWA não escuta em segundo plano.
- O Renfield respondendo em voz alta. Volta a ser avaliado quando ele começar a responder em até 3 s (seção 9).
- Um botão de ditado na Shack. O `Win + H` e o teclado do iPhone já fazem isso (seção 2).
- App nativo e Live Activities.
- Laço automático entre prompt, etnaD e revisão.
- O agente companheiro do backlog e a otimização do tempo de resposta do Renfield, que só ganha as medições.

## 8. Decisões que preciso de você

1. **Nome do agente.** O nome Ford vinha de Ford Prefect, do *Guia do Mochileiro*, o mesmo livro do Marvin: ele vivia escrevendo e revisando verbetes do Guia. Em 2026-11-05 o mordomo virou **Renfield**, de *Drácula*, e o par se perdeu. Se quiser manter um livro só, sugiro **Mina**, de Mina Harker: no romance, é ela quem datilografa, organiza e confere os diários de todos, ou seja, escreve e revisa. Ford continua valendo. A aparência na casa também fica com você.
2. **O que é "correção".** Entendi como duas coisas: revisar o que o etnaD fez e gerar o prompt de correção, e melhorar prompts que você escrever. Está certo?
3. **Tela de bloqueio.** Recomendo A e B juntos. As alternativas são só o atalho de voz (B), ou ficar só com os pushes. E o que o widget deve mostrar?

## 9. Andamento

**8.1 entregue em 2026-11-02**, aguardando o teste no iPhone. Diferenças em relação ao texto acima:

- As decisões 4 e 5 seguiram a recomendação: começar pela voz do navegador, com o modo conversa como opção que se liga e desliga em **Configurações > Voz**, desligada por padrão.
- O teste no iPhone virou a própria aba **Voz**, e não uma página separada: ela roda dentro do app instalado, que é onde o reconhecimento pode falhar. A aba mostra o que o aparelho suporta e qual voz foi escolhida, e testa a fala e o microfone.
- As medições vão para `POST /voice/timings`, viram o evento `voice.timing` e aparecem no painel do Renfield.
- **O plano B (Whisper) não foi construído.** Ele só entra se o teste no iPhone falhar.
- **Conferido:** `npm test`, `npm run typecheck`, e o Edge sem janela emulando o iPhone 13 e o desktop, sem erros no console. Lá aparecem o botão, a aba **Voz**, a escolha da voz neural "Antônio" e o erro de microfone bloqueado traduzido.
- **Falta conferir num aparelho de verdade:** a conversa por voz com o Renfield no PC e no iPhone. No iPhone, também se o microfone reabre sozinho no modo conversa, porque o Safari pode exigir um toque para cada escuta.

**8.1 apagada em 2026-11-05.** No teste real, a voz do navegador soou robótica, "como a do tradutor". Você pediu uma voz o mais humana possível, no nível da voz do app do Claude no celular, e mandou recomeçar.

- Todo o código da voz saiu: o app, o servidor, o contrato, os testes, o campo `voice` do `agent.yaml`, a seção do README e a da `API.md`. Os testes voltaram a 64 no servidor e 12 no web.
- No banco real ficou 1 evento `voice.timing` do teste. Ninguém valida o tipo ao ler eventos, então ele não atrapalha e sai na limpeza de 30 dias.
- **Próximo passo, aguardando a sua aprovação:** gerar a voz neste PC, com um modelo neural aberto na RTX 4060, e ouvir amostras antes de escrever qualquer código no app.

**Voz escolhida em 2026-11-05: a D do provador.** O provador fica em `tools/voice-lab` e roda tudo neste PC.

- **1ª rodada:** Qwen3-TTS, Chatterbox Multilingual e Kokoro. Você ouviu sotaque de Portugal. O Qwen e o Chatterbox só têm um "português", e o sotaque vem da referência que eles clonam.
- **2ª rodada:** vozes descritas de novo, agora exigindo o português do Brasil, e o Qwen clonando as vozes brasileiras do Kokoro.
- **3ª rodada:** o OmniVoice BR-PT, treinado só com vozes brasileiras.
- **O Chatterbox pt-BR oficial ficou de fora:** o modo automático bloqueou rodar o código baixado do Space dele.
- **A escolhida:** a D é o Qwen3-TTS 1.7B otimizado, clonando a voz "Santa" do Kokoro. A referência é `tools/voice-lab/out/ref-k_santa.wav`, e o texto dela fica em `tools/voice-lab/common.py` (`REF_TEXT`).
- **Limpeza:** os ambientes e modelos das outras vozes foram apagados, e o provador caiu de 38 GB para 9 GB.
- **Próximo passo, aguardando a sua aprovação:** a seção 2 reescrita e as decisões 4 a 6.

**Fala do Renfield cancelada em 2026-11-05.** Antes de aprovar, você pediu uma análise sem complacência. Os números foram estes:

- **O gargalo é o Renfield, não a voz.** Em 14 respostas registradas no banco, ele levou 8,7 s na mediana (de 2,5 a 14,9 s). No teste por voz, o primeiro pedaço chegou a 11,95 s e a resposta completa a 11,98 s. O texto sai todo de uma vez no fim, então falar frase a frase não adiantaria: seriam uns 10 s de silêncio depois de você falar.
- **A placa:** medida no driver, a voz ocupava cerca de 5 GB. Com o Whisper, passaria de 7 GB dos 8, e qualquer outro uso da placa faria o Windows jogar o excesso na RAM.
- **A manutenção:** Python, CUDA e PyTorch num projeto Node, 9 GB de instalação, versões fixadas à mão porque atualizações quebraram o código, e um pacote de aceleração ainda na versão 0.5.
- **O iPhone:** num PWA não há segundo plano nem palavra de ativação. Nenhuma voz deixaria a conversa sem as mãos.

Ficou só o ditado (seção 2). Tudo o que o teste deixou foi apagado: a pasta `tools/voice-lab` (9 GB), o cache de pacotes do `uv` (17 GB, todo deste teste) e os Pythons 3.11 e 3.12 que ele instalou.

A receita da voz D, para o dia em que o Renfield responder em até 3 s:

- **Modelo:** o Qwen3-TTS 12Hz 1.7B Base, rodando pelo `faster-qwen3-tts` com `transformers==5.15.1`, porque a 5.22 quebra o carregamento.
- **Referência:** a voz `pm_santa` do Kokoro 82M lendo "Boa tarde! Eu sou o Renfield, o mordomo da casa. Cuido da sua agenda, dos lembretes e de tudo o que você precisar, todo dia, a qualquer hora." O Qwen clona esse áudio com esse texto, no modo ICL.
- **Medido na RTX 4060:** 0,45 s até começar a falar, 2 vezes mais rápido que a fala e 21 s para ligar a frio.

**Ditado cancelado em 2026-11-05.** Antes de construir o botão, medi o Whisper (`whisper.cpp`, build `b5454`) com dois áudios em português gerados pela voz Maria do Windows: um curto, de 3,5 s, e um longo, de 15,7 s.

| Onde roda | Curto | Longo | Precisão |
|---|---|---|---|
| Processador, modelo `turbo` | 8 a 12 s | 5,5 a 9,5 s | Boa, mas repetiu a frase curta com a janela proporcional (`-ac`) |
| Processador, modelo `small` | 0,7 a 2,2 s | 2,2 a 3,4 s | Errou a frase curta: "porque eu tenho" no lugar de "O que eu tenho" |
| Placa, aberto só durante o ditado, modelo `turbo` | 1,1 s | 1,2 s | Acertou as duas, com pontuação |

- **Por que o processador demora:** o Whisper sempre processa uma janela de 30 s, mesmo com pouca fala. No `turbo`, esse passo levou 8,2 dos 9,5 s. A versão com OpenBLAS não ajudou.
- **A placa:** ocupou ~1 GB por ~1 s e liberou tudo quando o programa fechou. O pico foi de 2,1 GB, contra 1,2 GB do Windows.
- **A decisão:** você preferiu o `Win + H`, que resolve sem código. Os programas e modelos baixados para o teste (2,6 GB em `data/whisper`) foram apagados. A receita está na seção 2.

**A fase segue com a 8.2 e a 8.3.** Ainda faltam as decisões 1 a 3 (seção 8). A otimização do tempo de resposta do Renfield continua no backlog, e é ela que trava qualquer volta da voz.

**Antes da 8.2, em 2026-11-05: três pedidos seus, fora do plano da fase.**

- **O Marvin virou Renfield.** O id também mudou (`renfield`), com as pastas `agents/renfield` e `apps/server/src/renfield`. A migration `006_renfield.sql` leva o banco junto: conversa, tarefas, eventos, memórias, regras e avisos. A sessão antiga do Agent SDK foi descartada, porque falava com o nome velho; o histórico do chat, as memórias e as regras continuam.
- **O Quadro:** calendário do mês, agenda do dia, lista de compras (a lista Mercado) e afazeres (a lista Afazeres), numa tela só, aberta pelo Menu ou pelo topo do chat. É o mesmo dado das ferramentas do Renfield: o que ele muda pisca no Quadro, e o Quadro tem uma caixa para pedir a ele. O Renfield entende "lista de compras" e "to-do" como essas duas listas.
- **Anexos no chat:** botão **+**, colar e arrastar. Fotos, PDFs e textos sobem por `POST /attachments` e vão ao modelo como blocos de imagem, documento e texto. Migration `007_attachments.sql`, API 0.8.0.
- **Conferido:** 76 testes no servidor e 18 no web, `npm run typecheck`, e o Edge sem janela no desktop e no iPhone 13. Ao vivo, numa Shack de teste: o Renfield leu um PDF e uma foto reduzida no navegador, e um pedido feito pelo Quadro pôs o item na lista e o compromisso na agenda, que piscaram na tela.
- **Falta conferir num aparelho de verdade:** a câmera e a Fototeca pelo **+** no iPhone, e o HEIC virando JPEG.
