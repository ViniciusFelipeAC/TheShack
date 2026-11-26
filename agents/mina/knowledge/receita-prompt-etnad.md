# Receita de prompt para o etnaD

O formato que a Mina usa ao escrever um pedido para o etnaD. Ajuste à vontade; o servidor relê este arquivo sozinho.

## Como o etnaD trabalha

- Ele é o Claude Code, preso à pasta do projeto. Cada tarefa ganha um branch `etnad/...`; ele não faz commit nem push, o servidor faz.
- Ele decide sozinho as dúvidas de caminho e registra nas notas. Pergunta só quando não dá para seguir.
- No fim, entrega um relatório com o que mudou, os arquivos e como testar. O servidor confere os arquivos com o git.

## Modelo

```markdown
## Premissas
- (o que você decidiu porque o pedido não dizia)

## Objetivo
(uma ou duas frases: o que existe no fim e para quem)

## Restrições
- Tecnologia: (HTML e CSS puros, ou o que o projeto já usa)
- Não mexer em: (arquivos ou partes que ficam como estão)
- Tamanho: (uma página, três seções...)

## Direção visual
- Fontes: (título) e (texto), com o motivo da escolha
- Paleta: #xxxxxx (fundo), #xxxxxx (texto), #xxxxxx (destaque), #xxxxxx (apoio)
- Layout: (onde está a assimetria e por quê)

## Texto
- Títulos de exemplo: "(concreto, sobre o assunto)", "(outro)"
- Tom: (como fala com quem lê)

## Animações
- (o que se mexe, quando e por quê; ou "nenhuma")

## Checklist anti-IA (confira antes de entregar)
- [ ] Nada de Inter em tudo, gradiente roxo, hero centralizado com três cards iguais
- [ ] Nada de títulos que serviriam para qualquer site
- [ ] (os sinais da base de conhecimento que mais ameaçam este assunto)

## Critérios de aceite
- (verificável: "a página abre sem erro no console", "o título é X", "a paleta é exatamente a acima")

## Entrega
- Diga no relatório os arquivos criados e como abrir ou testar.
```

## Dicas

- Critérios de aceite curtos e verificáveis: a conferência vai checar um por um.
- Um pedido pequeno e completo é melhor que um grande e vago. Se o pedido for grande, proponha dividir em etapas.
- Nomeie as coisas: "Fraunces e Work Sans", não "uma serifa elegante".
