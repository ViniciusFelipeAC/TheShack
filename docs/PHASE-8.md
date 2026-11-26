# The Shack: plano da Fase 8 (encerrada)

Proposta de 2026-11-02. A 8.1, de voz, foi cancelada em 2026-11-05, a 8.2 foi para a Fase 9 em 2026-11-24 e a 8.3, do widget, foi cancelada em 2026-11-25. Não sobrou entrega. O andamento fica na seção 9.

O plano geral fica em `PLAN.md`. Este arquivo é separado porque o `PLAN.md` já passou de 500 linhas.

## 0. Resumo

A fase tinha três entregas. Nenhuma ficou:

1. **8.1 Voz:** cancelada em 2026-11-05 (seção 2). Para ditar, use o `Win + H` ou o microfone do teclado do iPhone.
2. **8.2 Agente de prompts:** movida para a Fase 9 em 2026-11-24 (seção 3). Nome provisório agora: **Mina**.
3. **8.3 Tela de bloqueio:** cancelada em 2026-11-25 (seção 4). Sem widget e sem atalho de voz.

Tudo continua com custo zero. Nada usa chave de API ou serviço pago.

## 1. Antes de começar: Tailscale e o teste pendente da Fase 7

No celular, o push só funciona sob HTTPS, e acessar de fora de casa também. Os dois dependem do Tailscale, que ainda não está instalado.

- Instale o Tailscale no PC e no iPhone (plano pessoal gratuito) e ligue o `tailscale serve`.
- Faça o teste que ficou pendente na Fase 7: instalar o app na Tela de Início, parear e receber um push.
- A Fase 9 não depende disso.

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

## 3. Entrega 8.2: movida para a Fase 9

Em 2026-11-24, a seu pedido, o agente de prompts e revisão foi para a Fase 9, junto com o Harker e a ala dos dois na cabana. O texto completo desta seção está lá, sem cortes, na seção 3 do `PHASE-9.md`. O nome provisório passou a ser **Mina**.

## 4. Entrega 8.3: cancelada

Em 2026-11-25, a 8.3 saiu da fase, a seu pedido. Ela previa um widget (pelo app Scriptable, com a rota `GET /widget` e tokens com escopo) e o atalho de voz "Falar com o Renfield" (app Atalhos). Nada disso foi construído. Os pushes da Fase 7 continuam avisando na tela de bloqueio.

Se voltar, o desenho completo está no histórico do git deste arquivo.

## 5. Ordem e paradas

| Passo | Entrega | Como você testa | Parada |
|---|---|---|---|
| 0 | Tailscale e o teste pendente da Fase 7 | App instalado no iPhone e push recebido | Não |
| 8.1 | Cancelada (seção 2) | — | — |
| 8.2 | Movida para a Fase 9 (seção 3) | — | — |
| 8.3 | Cancelada (seção 4) | — | — |

Em todas as entregas, os testes usam o Renfield falso e o runner simulado, sem gastar cota. A fase só termina com `npm test` e `npm run typecheck` passando.

## 6. Custo e cota

| Item | Custo |
|---|---|
| Scriptable e Atalhos | Gratuitos |
| Tailscale | Plano pessoal gratuito |

O medidor de cota da Fase 7 continua valendo.

## 7. Fora desta fase

- Palavra de ativação ("Ei, Renfield"). Um PWA não escuta em segundo plano.
- O Renfield respondendo em voz alta. Volta a ser avaliado quando ele começar a responder em até 3 s (seção 9).
- Um botão de ditado na Shack. O `Win + H` e o teclado do iPhone já fazem isso (seção 2).
- App nativo e Live Activities.
- O agente de prompts, agora na Fase 9.
- O agente companheiro do backlog e a otimização do tempo de resposta do Renfield, que só ganha as medições.

## 8. Decisões que preciso de você

1. **Nome do agente** e 2. **O que é "correção":** foram com a 8.2 para a Fase 9 (seção 11 do `PHASE-9.md`).
3. **Tela de bloqueio:** decidido em 2026-11-25: fica sem widget e sem atalho de voz.

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

**A 8.2 foi para a Fase 9 em 2026-11-24.** A seu pedido, o agente de prompts entrou na Fase 9, junto com o Harker e a ala dos dois na cabana (`PHASE-9.md`). Esta fase ficou só com a 8.3, que espera o iPhone pareado pelo Tailscale. A decisão 3 (seção 8) continua em aberto.

**8.3 cancelada em 2026-11-25**, a seu pedido: sem widget e sem atalho de voz. A Fase 8 está encerrada.
