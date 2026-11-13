/**
 * Configuração do Ranking Natalino de Chocotones
 *
 * Para conectar toda a empresa na mesma planilha do Google Sheets:
 * 1. Siga o guia em README.md (ou no botão "Conectar Google Sheets" no app)
 * 2. Cole a URL do seu Web App do Google Apps Script abaixo em APPS_SCRIPT_URL
 * 3. Faça commit e push — todos que acessarem o link já entrarão conectados!
 */
window.RANKING_CONFIG = {
  APP_TITLE: 'Ranking Natalino',
  APP_SUBTITLE: 'Degustação Semanal de Chocotones da Firma',

  // Exemplo: 'https://script.google.com/macros/s/AKfycb.../exec'
  APPS_SCRIPT_URL: '',

  CATEGORIES: [
    {
      key: 'sabor',
      label: 'Sabor',
      sheetLabel: 'SABOR',
      hint: 'Gosto geral da massa, chocolate e equilíbrio de aromas',
      color: '#b4232c'
    },
    {
      key: 'recheio',
      label: 'Recheio',
      sheetLabel: 'RECHEIO',
      hint: 'Quantidade, distribuição e cremosidade do recheio',
      color: '#c98a2c'
    },
    {
      key: 'maciez',
      label: 'Maciez',
      sheetLabel: 'MACIEZ',
      hint: 'Fofura, umidade e leveza da massa ao cortar/morder',
      color: '#1b5e3f'
    },
    {
      key: 'docura',
      label: 'Doçura',
      sheetLabel: 'DOÇURA',
      hint: 'Ponto ideal de açúcar — agradável sem ser enjoativo',
      color: '#7c4d2b'
    }
  ],

  // Dados iniciais importados diretamente de "Ranking natalino.xlsx"
  SEED_DATA: {
    weeks: [
      {
        week: 1,
        chocotone: 'Santa edwides avelã',
        brand: 'Santa Edwiges',
        notes: 'Avelã • Importado da planilha inicial'
      },
      {
        week: 2,
        chocotone: 'Bauducco gotas',
        brand: 'Bauducco',
        notes: 'Gotas de chocolate • Importado da planilha inicial'
      }
    ],
    votes: [
      { week: 1, person: 'Ana', sabor: 7, recheio: 8, maciez: 4, docura: 6, comment: '' },
      { week: 1, person: 'André', sabor: 7, recheio: 8, maciez: 3, docura: 5, comment: '' },
      { week: 1, person: 'Carol', sabor: 6, recheio: 6, maciez: 4, docura: 6, comment: '' },
      { week: 1, person: 'João', sabor: 9, recheio: 9, maciez: 7, docura: 5, comment: '' },
      { week: 1, person: 'Jonas', sabor: 7, recheio: 8, maciez: 6, docura: 8, comment: '' },
      { week: 1, person: 'Mandy', sabor: 7, recheio: 7, maciez: 5, docura: 8, comment: '' },
      { week: 1, person: 'Mariana', sabor: 8, recheio: 7, maciez: 5, docura: 9, comment: '' },
      { week: 1, person: 'Regina', sabor: 7, recheio: 8, maciez: 7, docura: 6, comment: '' },
      { week: 1, person: 'Ortiga', sabor: 8, recheio: 5, maciez: 8, docura: 7, comment: '' },

      { week: 2, person: 'Ana', sabor: 8, recheio: 6, maciez: 8, docura: 7.5, comment: '' },
      { week: 2, person: 'André', sabor: 6, recheio: 4, maciez: 9, docura: 8, comment: '' },
      { week: 2, person: 'Carolina', sabor: 8, recheio: 9, maciez: 10, docura: 8, comment: '' },
      { week: 2, person: 'João', sabor: 7, recheio: 6, maciez: 9, docura: 8, comment: '' },
      { week: 2, person: 'Jonas', sabor: 8, recheio: 6, maciez: 7, docura: 8, comment: '' },
      { week: 2, person: 'Mandy', sabor: 8, recheio: 5, maciez: 8, docura: 8, comment: '' },
      { week: 2, person: 'Mariana', sabor: 9, recheio: 5, maciez: 8.5, docura: 8, comment: '' },
      { week: 2, person: 'Barbara', sabor: 8.5, recheio: 9, maciez: 8.5, docura: 8.5, comment: '' },
      { week: 2, person: 'Ortiga', sabor: 7, recheio: 7, maciez: 9, docura: 8, comment: '' },
      { week: 2, person: 'Samuel', sabor: 7, recheio: 6, maciez: 9, docura: 6, comment: '' }
    ]
  }
};
