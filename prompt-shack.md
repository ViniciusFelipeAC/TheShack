# Projeto "The Shack": meus agentes de IA pessoais

Você vai construir comigo um sistema pessoal de agentes de IA. Leia este documento inteiro antes de começar. **Não escreva código ainda.** Primeiro me apresente um plano de arquitetura e a estrutura de pastas, e espere minha aprovação.

## Visão geral

O sistema começa com dois agentes que trabalham juntos dentro de uma "casa" virtual (a Shack). A casa também é a interface visual do projeto.

- **Marvin**: meu assistente pessoal, no estilo Jarvis ou Alfred, e o ponto central entre mim e os outros agentes.
- **etnaD**: o agente de código.

O projeto precisa crescer bem: novos agentes serão adicionados depois. Em breve também vou querer falar com o Marvin pelo celular.

## Princípios gerais

- Código limpo, leve e funcional. Sem dependências desnecessárias e sem abstração antes da hora.
- **API-first**: toda funcionalidade deve existir no backend e ficar exposta por API. As interfaces (web agora, mobile depois) são só clientes.
- Identificadores e código em inglês. A interface e as respostas dos agentes ficam em português (pt-BR).
- Fuso horário padrão: America/Sao_Paulo.
- Segredos (chaves de API, tokens) ficam em `.env`, nunca no código. Inclua um `.env.example`.
- Use o Claude Agent SDK para os agentes. Consulte a documentação atual antes de usar, em vez de confiar na memória.
- O modelo de cada agente deve ser configurável. Padrão: `claude-fable-5-1`.

## Stack sugerida

Você pode propor outra, desde que justifique.

- **Backend**: TypeScript + Node, com um framework HTTP leve (Hono ou Fastify).
- **Tempo real**: WebSocket para eventos.
- **Persistência**: SQLite, com uma camada simples que permita trocar de banco depois.
- **Frontend**: web responsivo, instalável como PWA.
- **Organização**: monorepo com tipos compartilhados (`packages/shared`). Assim um app React Native futuro reaproveita os mesmos contratos.

## Arquitetura central

1. **Registro de agentes**: cada agente vive na sua própria pasta com um manifesto (`agent.yaml`). O manifesto define nome, papel, modelo, ferramentas, persona e aparência visual. Adicionar um agente novo deve ser basicamente criar uma pasta nova.
2. **Barramento de tarefas (task bus)**: as tarefas têm estados (`queued`, `running`, `waiting_input`, `done`, `failed`, `cancelled`), responsável, origem, histórico e resultado. Tudo fica persistido.
3. **Stream de eventos**: todo agente publica o que está fazendo (início, progresso, conclusão, erro). O Marvin e a interface visual consomem esse stream.
4. **API**:
   - REST para comandos e consultas.
   - WebSocket para chat e eventos ao vivo.
   - Autenticação por token desde o início, pensando no acesso pelo celular.
   - Documente os endpoints (OpenAPI ou um `API.md`).

## Agente 1: Marvin

### Papel

Meu assistente pessoal e mordomo digital. É educado, eficiente e proativo, com um toque de humor seco. Ele é a minha porta de entrada para o sistema.

### Orquestração

- Sabe em tempo real o que cada agente está fazendo, consultando o task bus e o stream de eventos.
- Responde perguntas como "o que o etnaD está fazendo?" ou "o que ficou pendente hoje?".
- Cria, delega, acompanha e cancela tarefas para outros agentes **quando eu pedir**.
- Me avisa quando uma tarefa delegada termina, falha ou precisa de informação minha.

### Assistente pessoal (estilo Alexa)

- **Calendário**: criar, listar, mover e cancelar eventos. Comece com um calendário local, mas use uma interface (adapter) que permita conectar o Google Calendar depois.
- **Lembretes e alarmes**: inclusive recorrentes ("todo dia útil às 8h"). O agendador roda no backend, não no navegador.
- **Timers, listas** (compras, afazeres) e **notas rápidas**.
- **Notificações**: uma camada abstrata de entrega, com uma implementação web agora e push mobile depois.

### Customização e "treino"

- `agents/marvin/persona.md`: personalidade, tom, regras de comportamento. Eu edito esse arquivo à vontade e ele é recarregado sem reiniciar o sistema.
- **Memória de longo prazo**: fatos e preferências sobre mim, persistidos, que eu posso ver, editar e apagar.
- **Regras aprendidas**: posso ensinar comportamentos como "quando eu disser 'modo foco', silencie lembretes não urgentes". Ele guarda e aplica.
- **Feedback**: um comando para corrigir respostas ("não faça mais isso", "prefiro assim") que vira regra ou memória.
- Uma tela de configurações onde vejo e edito persona, memórias e regras.

### Limites

O Marvin pede confirmação antes de qualquer ação destrutiva ou irreversível, como apagar eventos em massa ou cancelar tarefas longas.

## Agente 2: etnaD

### Papel

Agente exclusivo de programação. Na prática, é o próprio Claude Code rodando via Agent SDK, com ferramentas de arquivo, shell e git.

### Comportamento

- Escreve código limpo, leve e funcional.
- Prefere mudanças pequenas e legíveis e evita dependências desnecessárias.
- Escreve testes quando fizer sentido.
- Trabalha apenas dentro das pastas de workspace que eu configurar.
- Recebe tarefas pelo task bus, direto de mim ou delegadas pelo Marvin.
- Publica o progresso no stream de eventos.
- Ao terminar, entrega um resumo curto: o que mudou, onde e como testar.

### Persona

A persona fica em `agents/etnad/persona.md`, também editável.

## Preparação para mobile

Não construa o app mobile agora. Deixe o caminho pronto:

- Toda funcionalidade disponível via API, sem lógica de negócio no frontend.
- Autenticação por token e suporte a múltiplos dispositivos.
- Uma abstração de notificações push.
- Endpoints e interfaces reservados para voz: entrada de áudio para texto (STT) e resposta em áudio (TTS). Por enquanto podem ser só stubs documentados.
- Respostas do Marvin que funcionem bem em formato curto, pensando em tela pequena e voz.

## Representação visual: a Shack

A interface principal é uma cena de uma **cozy shack**.

### Ambientação

- **Por fora**: madeira, luz quente nas janelas, clima aconchegante.
- **Por dentro**: moderno, com linhas limpas, plantas, boa iluminação e estações de trabalho com monitores.

### Agentes na cena

Os agentes aparecem como personagens dentro da casa, cada um na sua estação. A cena reflete o estado real dos agentes ao vivo, via WebSocket:

- **Ocioso**: o personagem relaxa, toma café ou lê.
- **Trabalhando**: digita, e a tela do monitor ganha atividade.
- **Esperando input**: um indicador visível, como um balão de "?".
- **Erro**: um sinal discreto.

### Interação

- Clicar num agente abre um painel com a tarefa atual, a fila e o histórico.
- Um painel de chat com o Marvin fica sempre acessível.

### Estilo e tecnologia

- Sugestão de estilo: pixel art ou isométrico, quente e acolhedor. Proponha uma direção e me mostre um protótipo antes de detalhar.
- Toda a arte deve ser original, feita em código ou por você. Sem assets de terceiros com direitos autorais.
- Pode usar Canvas, SVG ou uma lib leve (PixiJS, por exemplo).
- Deve funcionar bem no celular.
- Novos agentes ganham automaticamente um espaço na casa, a partir do manifesto.

## Entregas em fases

1. **Plano**: arquitetura, estrutura de pastas e contratos da API. Espere minha aprovação.
2. **Núcleo**: registro de agentes, task bus, eventos, persistência, API e autenticação.
3. **Marvin**: chat, persona editável, memória, delegação e status dos agentes.
4. **etnaD**: integração com o Agent SDK, workspaces e relatórios de tarefa.
5. **Funções de assistente**: calendário, lembretes, alarmes, timers, listas e notificações.
6. **Shack visual**: cena, personagens, estados ao vivo e painéis.
7. **Polimento**: PWA, testes dos fluxos principais, README e um `CLAUDE.md` com as convenções do projeto.

Ao final de cada fase:

- Pare e me mostre o que foi feito.
- Mostre como rodar e testar.
- Diga o que vem a seguir.

Se algo neste documento estiver ambíguo ou contraditório, pergunte antes de decidir.
