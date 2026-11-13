# 🎄 Ranking Natalino — Degustação de Chocotones

App web para avaliação semanal de chocotones da equipe, sem necessidade de login e conectado ao banco em nuvem via **Supabase**.

- **URL pública (GitHub Pages):** `https://whoisdede.github.io/ranking-natalino/`
- **Categorias avaliadas (0 a 10, de 0,5 em 0,5):** `SABOR`, `RECHEIO`, `MACIEZ` e `DOÇURA`.
- **Dados iniciais:** já vem carregado com a Semana 1 (`Santa edwides avelã`) e Semana 2 (`Bauducco gotas`) da planilha original.

---

## ✨ Funcionalidades

- **Dashboard Geral:** mostra o chocotone líder atual, placar/pódio geral, campeões individuais por categoria, gráfico comparativo por critério, gráfico de evolução das semanas e painel de participação dos avaliadores.
- **Semanas & Notas:** tabela no formato exato da planilha (categorias nas linhas, avaliadores nas colunas e coluna/linha de `Média`), além de comentários de degustação e cadastro/edição de novas semanas.
- **Avaliar sem Login:** qualquer pessoa informa o nome (ou clica no nome já existente), ajusta as notas de 0 a 10 e salva na hora. Se votar novamente na mesma semana com o mesmo nome, a nota anterior é atualizada sem duplicar.
- **Backup:** exportação direta no rodapé para **CSV** (abre direto no Excel) e **JSON**.

---

## 🗄️ Configuração do banco (Supabase)

O site já está conectado permanentemente ao projeto Supabase configurado em [`config.js`](./config.js) (`SUPABASE_URL` e `SUPABASE_KEY`).

Caso precise recriar a estrutura em outro projeto:

1. No **SQL Editor** do Supabase, execute [`supabase/schema.sql`](./supabase/schema.sql) para criar `public.chocotone_weeks` e `public.chocotone_votes` com as políticas RLS públicas e os dados iniciais.
2. Em **Project Settings → Data API / API Keys**, copie a **Project URL** e a chave pública (`sb_publishable_...` ou `anon` `public`).
3. Atualize `SUPABASE_URL` e `SUPABASE_KEY` em [`config.js`](./config.js) e faça `git push`.
