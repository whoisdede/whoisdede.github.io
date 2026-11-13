# 🎄 Ranking Natalino — Degustação de Chocotones

App web para avaliação semanal de chocotones da equipe, sem necessidade de login e com sincronização gratuita direta com o **Google Sheets** via **Google Apps Script**.

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

## 🔗 Como conectar na sua planilha do Google Sheets (2 minutos)

O app funciona em **Modo Local** imediatamente, mas para que todos da empresa votem na mesma base compartilhada usando sua planilha do Google Sheets como "banco de dados":

1. Abra a sua planilha no **Google Sheets**.
2. No menu superior, clique em **Extensões → Apps Script**.
3. Apague o código padrão e cole todo o conteúdo do arquivo [`apps-script/Code.gs`](./apps-script/Code.gs). Salve (`Ctrl + S`).
   - *Observação:* na primeira execução, o script cria automaticamente as abas `Semanas`, `Avaliacoes` e `Resumo_Ranking`. Se já existir uma aba com blocos `Semana 1`, `Semana 2` no formato da planilha original, ele importa automaticamente os dados dela sem apagar a aba original!
4. Clique em **Implantar → Nova implantação**.
   - Clique na engrenagem ao lado de "Selecionar tipo" e escolha **App da Web**.
   - **Executar como:** `Eu`
   - **Quem pode acessar:** `Qualquer pessoa`
5. Clique em **Implantar**, autorize as permissões da sua conta Google e copie a **URL do app da Web** (terminada em `/exec`).
6. Para deixar o site já conectado para toda a empresa:
   - Cole a URL no campo `APPS_SCRIPT_URL` em [`config.js`](./config.js) e faça `git push`, **ou**
   - Teste direto pelo botão **Modo Local → Conectar Google Sheets** na interface do app.
