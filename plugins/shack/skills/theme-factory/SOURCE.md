# Origem da theme-factory

- **Repositório:** https://github.com/anthropics/skills, pasta `skills/theme-factory`.
- **Commit:** `e4bb5d960d87126ff3b3a8af1a104b7db67560ba`, de 2026-11-16.
- **Copiada e lida em:** 2026-11-25.
- **Licença:** Apache 2.0, em `LICENSE.txt`.

## O que mudou

Nada no conteúdo. Os arquivos de texto só viram LF pelo `.gitattributes` do projeto.

## O que conferi

- **`theme-showcase.pdf`:** 10 páginas, uma por tema, geradas pelo ReportLab. Não tem JavaScript, links, anotações, ações automáticas nem arquivos embutidos.
- **As fontes dos temas não vêm junto:** os temas citam DejaVu Sans, DejaVu Serif, FreeSans e FreeSerif. Elas não estão no plugin, e o render do Harker só abre as fontes de `canvas-design/canvas-fonts/`. A troca por fontes locais fica na persona dele.

## Como atualizar

Atualizar é sempre um passo manual:

1. Copie a pasta de novo, de um commit mais novo do repositório.
2. Leia o que mudou com `git diff` antes do commit, inclusive temas novos e o PDF.
3. Atualize o commit e a data deste arquivo.
