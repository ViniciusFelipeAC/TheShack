# The Shack: andamento da Fase 9

O plano da fase fica em `PHASE-9.md`. Este arquivo guarda o que foi feito em cada entrega; saiu de lá quando o plano chegou perto de 500 linhas.

- **2026-11-07:** proposta da fase, só com o Harker.
- **2026-11-24:** a seu pedido, a fase passou a trazer também o agente de prompts, que era a entrega 8.2, e ganhou a ala dos dois na cabana (seção 7 do plano). A Fase 8 ficou só com a tela de bloqueio.
- **2026-11-24:** as decisões da seção 11 foram tomadas. A revisão da Mina virou conferência do pedido, e passou a valer também para o Harker. A 9.1 começou.

**9.1 entregue em 2026-11-24** e aprovada por você em 2026-11-25. Nada foi commitado.

- **O que existe:** a pasta `agents/mina` (manifesto, persona e base de conhecimento), o `TextRunner`, a conferência numa cópia temporária do commit, a conferência automática, a correção partindo do branch conferido, os botões no painel e a escrivaninha na ala. API 0.10.0, migration `008_review.sql`.
- **Diferenças em relação ao plano:**
  - O manifesto ganhou `article` (`o` ou `a`). Sem ele, os avisos diriam "O Mina concluiu". Os textos da casa agora passam por `named()`.
  - O resultado da conferência se chama `review`, e não `findings`. O veredito é recalculado pelo servidor: um item pendente nunca vira "tudo certo".
  - Mandar o prompt e mandar a correção usam o `POST /tasks` de sempre, com `parentId`; não precisou de rota nova.
  - Os cartões do pé da casa ficam numa linha só e encolhem. Com três agentes, eles subiam numa segunda linha por baixo do painel.
  - O `engine.ts` foi dividido antes de crescer: as partículas foram para `particles.ts`, e as mesas saíram do `art.ts` para `stations.ts`.
  - Não achei o prompt do teste do site "Órbita". A receita em `knowledge/receita-prompt-etnad.md` segue as 8 partes da seção 3 do plano. Se você tiver aquele prompt, solte na pasta.
- **Conferido:**
  - `npm test` (92 no servidor, 31 no web) e `npm run typecheck`.
  - Numa Shack de teste (porta 4399, outro banco, runner simulado): o prompt, a tarefa do etnaD, a conferência automática, a correção e o aviso no chat. O Edge sem janela fotografou a ala no desktop e no iPhone 13: a Mina datilografando, as marcas vermelhas na conferência e o botão **Mandar para o etnaD** criando a tarefa.
  - Ao vivo, uma tarefa de verdade da Mina no Sonnet: 32 s, 14 mil tokens de entrada e 3,7 mil de saída, com um prompt de 6 mil caracteres. Ela deixou uma autocorreção no meio da paleta; a persona agora pede só a versão final.
- **Falta conferir ao vivo:** a conferência de uma entrega real do etnaD (o worktree com o git de verdade) e uma correção. Isso gasta a cota do etnaD no Opus, então fica para o seu teste.

**9.2 entregue e aprovada por você em 2026-11-25.** Nada foi commitado.

- **O que existe:** o plugin `plugins/shack/`, com a canvas-design e a theme-factory copiadas do commit `e4bb5d9` (2026-11-16) do `anthropics/skills`. O `README.md` dele traz o resumo para você aprovar: o que cada skill pede ao modelo, o que o Harker adapta na persona, o cruzamento com o guia de "cara de IA" e as fontes com as licenças.
- **O que mudou no original** (registrado no `SOURCE.md` de cada skill):
  - Saiu da canvas-design a frase que mandava baixar fontes. É a única diferença no texto.
  - A IBM Plex Serif e a Instrument Serif vieram sem arquivo de licença. As duas declaram a OFL 1.1 dentro da fonte, e os dois arquivos entraram.
  - A theme-factory veio sem mudança.
- **Achados que pesam na 9.4:**
  - Os temas da theme-factory usam DejaVu e FreeSans, que não vêm no plugin. A persona troca por fontes de `canvas-fonts/`.
  - Seis dos dez temas e duas famílias de fontes caem em padrões do `ai-look-signals.md`.
  - A canvas-design pede fonte fina e pouco texto, o contrário do que um post de projeto no celular precisa.
- **Diferenças em relação ao plano:**
  - O `.gitattributes` marca `*.ttf` e `*.pdf` como binários, para o fim de linha LF não corromper as fontes e o PDF.
  - O teste `skills.test.ts` segura as regras numa cópia futura: só as duas skills, a licença e a origem de cada uma, nenhuma instrução de baixar ou instalar e cada fonte com a sua licença.
  - O `CLAUDE.md` registra a exceção à regra das skills de terceiros.
- **Conferido:**
  - `claude plugin validate` (a CLI que vem com o SDK) aceita o plugin. Sobram dois avisos, de ícone e de autor, que só valem para o catálogo público.
  - `claude plugin details`: 202 tokens fixos por sessão, cerca de 3,9 mil ao abrir a canvas-design e 950 ao abrir a theme-factory.
  - As 54 fontes são TrueType, e todas têm os acentos do português. Só faltam o "ª/º" na Poiret One e o "€" na Italiana.
  - O PDF de amostra tem 10 páginas, sem JavaScript, links nem ações automáticas.

**9.3 entregue e aprovada por você em 2026-11-25.** Nada foi commitado.

- **O que existe:**
  - O runner `design` (`agents/design-runner.ts`) e o campo `skills` no manifesto.
  - A ferramenta `render` (`agents/render.ts`), com o `playwright-core` 1.65.0 e o navegador instalado.
  - A conferência pelo servidor (`agents/design-check.ts`) e a rota `GET /tasks/{id}/images/{name}`.
  - `attachmentIds` em `POST /tasks`.
  - API 0.12.0, sem migration nova.
- **Diferenças em relação ao plano:**
  - **O render usa uma origem falsa** (`https://render.shack`), e não `file://`. Toda requisição passa por um roteador que só entrega arquivos de `input/`, `work/` e `out/` e as fontes, em `/fonts/<arquivo>`. O resto é bloqueado. O navegador também sobe com todos os nomes de domínio sem resolver, e nem um prefetch de DNS sai da máquina.
  - **A render devolve a imagem ao modelo,** em JPEG, junto com o resumo. Ele confere sem gastar outra volta com o `Read`, e cada volta reenvia o contexto inteiro.
  - **A conferência confere também o hash:** cada PNG precisa ser o que a render gravou. E a legenda acima de 2.200 caracteres ou de 30 hashtags, os limites do Instagram, deixa a tarefa suspeita.
  - **Os anexos são copiados para `input/` na criação da tarefa,** e não na execução: um anexo solto some em 24 horas, e a tarefa pode esperar mais que isso na fila. Por isso não precisou de tabela nova.
  - **Apagar tarefa:** a API não apaga tarefas hoje, então as pastas ficam. Quando houver como apagar, a pasta vai junto.
  - **O prompt da tarefa manda abrir as skills do manifesto.** No primeiro teste ao vivo, o modelo desenhou direto, sem abrir nenhuma.
  - O teto de 40 renders conta toda chamada, mesmo a que falha.
  - O `askUser` e o `usageOf` saíram do `TextRunner` para `agents/sdk-common.ts`, e os dois runners usam.
  - O progresso mostra "Escrevendo o relatório" no lugar de "Usando StructuredOutput", também para a Mina.
- **Conferido:**
  - `npm test` (114 no servidor, 35 no web) e `npm run typecheck`. Os testes de render usam o Edge de verdade: os três formatos no tamanho exato, a fonte do plugin aplicada, nenhuma requisição chegando a um servidor local de teste, o JavaScript desligado e um arquivo fora das pastas recusado.
  - Uma sonda do SDK, sem mensagem ao modelo, confirmou `plugins_applied: true`, as skills como `shack:canvas-design` e `shack:theme-factory` e nenhum conector do claude.ai na sessão.
  - **Ao vivo, numa Shack de teste** (porta 4399, outro banco), com um agente de teste no runner design e no Sonnet:
    - Um post único pedido por `curl`: 32 s, 61 mil tokens de entrada e 4,6 mil de saída. A conferência deu `ok`, 1080×1350. O modelo não abriu as skills, e a imagem caiu em dois sinais do guia da Mina: a Instrument Serif com uma palavra em itálico colorido no título e a paleta âmbar com creme.
    - Depois do aviso das skills, um carrossel de 2 imagens: 55 s, 218 mil tokens de entrada (a maior parte lida do cache) e 7,2 mil de saída. Ele abriu as duas skills, fez uma volta de ajuste na primeira imagem e entregou as duas no mesmo formato, com a conferência `ok`. Abrir as skills e ajustar multiplicou a entrada por 3,5.
- **Achados que pesam na 9.4:**
  - Nos dois testes, ele escolheu a Instrument Serif com uma palavra em itálico colorido. A persona precisa proibir esse padrão e trazer o `ai-look-signals.md` na base.
  - Ele deixou nas notas uma autocorreção da paleta ("o valor acima tem um erro de digitação"), como a Mina na 9.1. A persona pede só a versão final.
  - Custo: no Opus, um carrossel de 5 imagens deve gastar bem mais que esses 218 mil tokens no Sonnet. Vale medir na 9.4 antes de decidir entre Opus e Sonnet.

**9.4, primeira parte, entregue em 2026-11-25:** o Harker utilizável no app, para o seu teste. Nada foi commitado. A identidade por projeto, a integração com a Mina e o cavalete ficam para a segunda parte, depois do seu teste.

- **O que existe:**
  - A pasta `agents/harker`: manifesto (Opus com o Sonnet de reserva, esforço médio, as duas skills), persona e base de conhecimento. O `ai-look-signals.md` é uma cópia do da Mina, e o `skills.test.ts` confere que as duas continuam iguais.
  - A galeria no painel da tarefa (`apps/web/src/DesignReport.tsx`): as imagens na ordem do post, deslizando para o lado no celular, com **Copiar texto alternativo** em cada uma, **Copiar legenda** e **Salvar imagens** (a folha de compartilhar, em tela de toque) ou **Baixar imagens** (no computador).
  - **Ajustar:** uma caixa de texto cria uma tarefa filha. O servidor copia o `work/`, as fotos e as imagens conferidas da tarefa anterior, e o Harker refaz só o que o ajuste pede. A correção da Mina vai usar o mesmo caminho.
  - **Pelo Renfield:** a regra 22 manda os pedidos de imagens para o Harker. O `tasks_create` ganhou `attach_files`, que leva as fotos da mensagem. O aviso no chat diz quantas imagens ficaram prontas e onde.
- **Diferenças em relação ao plano:**
  - **A persona proíbe o que os testes da 9.3 mostraram:** a palavra em serifa itálica colorida no título, a Instrument Serif e a Geist como fonte de título e o "estilo Claude". Ela também sugere cinco pares de fontes do plugin para variar.
  - **No computador, o botão baixa em vez de compartilhar.** O Edge do Windows também tem a folha de compartilhar, mas ali o esperado é o arquivo.
  - **Campo de texto `.prose` no celular:** ele ficava com 15 px e dava zoom ao tocar no Safari. Agora tem 16 px em tela de toque, também nos outros campos da casa que usam a classe.
  - O botão de copiar saiu do `TaskReport.tsx` para `CopyButton.tsx`, porque a galeria também usa.
- **Conferido:**
  - `npm test` (117 no servidor, 37 no web) e `npm run typecheck`.
  - Numa Shack de teste (porta 4399, outro banco, runner simulado), o Edge sem janela abriu o painel com as imagens do teste ao vivo da 9.3, no computador e no iPhone 13 emulado. A galeria, os botões, o **Ajustar** e o campo com 16 px no celular funcionaram, sem erro no console.
  - Não rodei o Harker de verdade no Opus: esse teste é seu.
