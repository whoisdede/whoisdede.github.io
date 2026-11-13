# 🎄 Ranking Natalino — Degustação de Chocotones

App web para avaliação semanal de chocotones da equipe, sem necessidade de login e com sincronização gratuita em nuvem via **Supabase** (ou, opcionalmente, via Google Sheets).

- **URL pública (GitHub Pages):** `https://whoisdede.github.io/ranking-natalino/`
- **Categorias avaliadas (0 a 10, de 0,5 em 0,5):** `SABOR`, `RECHEIO`, `MACIEZ` e `DOÇURA`.
- **Dados iniciais:** já vem carregado com a Semana 1 (`Santa edwides avelã`) e Semana 2 (`Bauducco gotas`) da planilha original.

---

## ✨ Funcionalidades

- **Dashboard Geral:** mostra o chocotone líder atual, placar/pódio geral, campeões individuais por categoria, gráfico comparativo por critério, gráfico de evolução das semanas e painel de participação dos avaliadores.
- **Semanas & Notas:** tabela no formato exato da planilha (categorias nas linhas, avaliadores nas colunas e coluna/linha de `Média`), além de comentários de degustação e cadastro/edição de novas semanas.
- **Avaliar sem Login:** qualquer pessoa informa o nome (ou clica no nome já existente), ajusta as notas de 0 a 10 e salva na hora. Se votar novamente na mesma semana com o mesmo nome, a nota anterior é atualizada sem duplicar.
- **Backup:** exportação para **CSV** (abre direto no Excel) e **JSON**.

---

## 🗄️ Como conectar ao Supabase em 4 passos (sem login para a equipe)

O app funciona em **Modo Local** imediatamente, mas para que todos da empresa votem na mesma base compartilhada:

1. **Crie as tabelas no Supabase:**
   - Crie (ou abra) um projeto gratuito no [Supabase](https://supabase.com).
   - No menu lateral, entre em **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) e clique em **Run**.
   - Isso cria as tabelas `public.chocotone_weeks` e `public.chocotone_votes`, configura as políticas públicas RLS (sem exigir login) e já insere a Semana 1 e a Semana 2.
2. **Pegue a URL e a chave pública do projeto:**
   - Em **Project Settings → Data API**, copie a **Project URL** (`https://seuprojeto.supabase.co`).
   - Em **Project Settings → API Keys**, copie a **Publishable key** (`sb_publishable_...`) **ou**, na aba **Legacy anon, service_role API keys**, a chave **`anon` `public`** (`eyJ...`). Nunca use `sb_secret_` ou `service_role`.
3. **Teste direto no app (opcional):**
   - Clique no botão **Modo Local (Demo)** no topo do app, cole a `Project URL` e a chave pública, e clique em **Testar e Conectar Supabase**.
4. **Deixe ativo para toda a equipe:**
   - Cole `SUPABASE_URL` e `SUPABASE_KEY` em [`config.js`](./config.js) e faça `git push` para publicar no GitHub Pages.

---

## 📊 Alternativa opcional: Google Sheets + Apps Script

Se preferir usar Google Sheets em uma conta Google pessoal (`@gmail.com` — contas corporativas do Google Workspace costumam bloquear Web Apps públicos com CORS):

1. Na planilha do Google Sheets, abra **Extensões → Apps Script**, cole [`apps-script/Code.gs`](./apps-script/Code.gs) e salve.
2. Clique em **Implantar → Nova implantação → App da Web** (**Executar como:** `Eu`, **Quem pode acessar:** `Qualquer pessoa`).
3. Cole a URL terminada em `/exec` em `APPS_SCRIPT_URL` no [`config.js`](./config.js) ou no campo **Alternativa opcional: Google Sheets** dentro do modal de conexão do app.
