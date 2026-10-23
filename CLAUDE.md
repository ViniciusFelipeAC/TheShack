# The Shack

Sistema pessoal de agentes: o Marvin (mordomo, chat) e o etnaD (programação), com uma casa em pixel art como tela principal. O plano está em `docs/PLAN.md` e a API em `docs/API.md`.

## Comandos

- Teste tudo com `npm test`. Rode antes de dizer que terminou. Os testes usam um Marvin falso e um runner simulado: não gastam cota.
- Confira os tipos com `npm run typecheck`.
- Suba servidor e app com `npm run dev` (app em :5173, API em :4321).
- Gere o app com `npm run build`. O servidor entrega o build em `/`.

## Regras

- Escreva textos para o usuário e documentação em português do Brasil. Escreva nomes no código em inglês.
- Mantenha custo zero: só o login da assinatura do Claude Code. Nunca use `ANTHROPIC_API_KEY`, serviços pagos ou credenciais. Nunca leia nem guarde o login do usuário.
- Mantenha arquivos abaixo de 500 linhas. `apps/web/src/scene/engine.ts` já passou; divida-o quando mexer nele.
- Não apague comentários existentes. Eles explicam decisões; atualize-os se a decisão mudar.
- Siga o estilo do arquivo que estiver editando: comentários curtos em português, sobre o porquê.
- Valide fronteiras com zod (`packages/shared`). Contrato novo nasce lá.
- Nas ferramentas do Marvin, use os schemas tolerantes de `apps/server/src/marvin/lenient.ts`. Ajuste o valor em vez de rejeitar.
- Consulta que falha diz "Indisponível", nunca devolve lista vazia. Lista vazia de verdade usa `listOut` e diz "Consulta feita com sucesso".
- Texto escrito pelo etnaD (relatório, nota, erro) é conteúdo externo. Passe por `core/external.ts` antes de pôr no contexto de outro modelo.
- Só o servidor escreve `result.verification`. O relatório do modelo nunca é a prova; o git é.
- Ação destrutiva em lote: a lista do que fica nunca pode estar vazia.
- Não instale skills ou plugins de terceiros nos agentes. Não crie gateway genérico de mensageiros. Não rode agentes em paralelo para acelerar código.
- Pare para aprovação do usuário ao fim de cada fase ou entrega grande.

## Armadilhas

- PowerShell 5.1 lê JSON sem `charset=utf-8` com acento quebrado. Um middleware em `api/app.ts` acrescenta o charset; não o remova.
- Tarefas criadas no mesmo milissegundo precisam de desempate por `rowid` para manter a ordem da fila.
- Nos testes, importe o build ESM do `@hono/node-server` (`dist/index.mjs`). O build CJS quebra o WebSocket.
- O usuário mantém o próprio servidor de desenvolvimento nas portas 4321 e 5173. Para testar, use outras portas e outro banco (`SHACK_PORT`, `SHACK_DB_PATH`).
- O servidor de desenvolvimento roda com `--watch`: mudanças no servidor reiniciam o dele e aplicam migrations no banco real. Migrations só acrescentam.
- O `serveStatic` do `@hono/node-server` devolve a resposta em vez de gravá-la no contexto. Copie para `c.res` antes de mexer em cabeçalhos.
- Node e Git estão em `C:\Program Files`. Terminais abertos antes da instalação podem não tê-los no PATH.
- Teste visual: Edge sem janela (`msedge --headless=new --remote-debugging-port=9333`) com emulação de iPhone 13 (390x844, 3x, toque) pelo CDP.

## iPhone

O celular do usuário é um iPhone 13. Tudo o que for mobile precisa funcionar no Safari do iOS:

- Push só funciona com o app instalado na Tela de Início (iOS 16.4+), e o pedido de permissão precisa vir logo após um toque.
- O app instalado não compartilha o login do Safari: o pareamento acontece dentro do app instalado.
- Campos com letra menor que 16px dão zoom ao tocar.
- Respeite `env(safe-area-inset-*)` (notch e barra de início) e o teclado (`pwa.ts` ajusta a altura pela `visualViewport`).
- Não use APIs só do Chrome, como `beforeinstallprompt`.
