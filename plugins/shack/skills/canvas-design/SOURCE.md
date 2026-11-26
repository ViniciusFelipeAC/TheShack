# Origem da canvas-design

- **Repositório:** https://github.com/anthropics/skills, pasta `skills/canvas-design`.
- **Commit:** `e4bb5d960d87126ff3b3a8af1a104b7db67560ba`, de 2026-11-16.
- **Copiada e lida em:** 2026-11-25.
- **Licença:** Apache 2.0, em `LICENSE.txt`. As fontes usam a SIL Open Font License 1.1, cada família com o seu `*-OFL.txt`.

## O que mudou

O resto é cópia fiel. As adaptações ao Shack ficam na persona do Harker, e não aqui.

1. **`SKILL.md`, seção "Canvas creation":** saiu a frase "Download and use whatever fonts are needed to make this a reality." O Harker não acessa a rede e usa só as fontes de `canvas-fonts/`.
2. **Duas licenças acrescentadas:** `canvas-fonts/IBMPlexSerif-OFL.txt` e `canvas-fonts/InstrumentSerif-OFL.txt`.
   - As duas famílias vieram sem o arquivo de licença.
   - Cada fonte declara a OFL 1.1 na própria tabela de nomes.
   - O texto é o mesmo das outras 27 licenças, com o copyright da família.
3. **Fins de linha:** os arquivos de texto viram LF pelo `.gitattributes` do projeto. O conteúdo não muda.

## Como atualizar

Atualizar é sempre um passo manual:

1. Copie a pasta de novo, de um commit mais novo do repositório.
2. Leia o que mudou com `git diff` antes do commit, inclusive fontes novas e as licenças delas.
3. Refaça as mudanças acima e atualize o commit e a data deste arquivo.

O teste `apps/server/test/skills.test.ts` falha se a frase de baixar fontes voltar ou se uma família de fontes ficar sem licença.
