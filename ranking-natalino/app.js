(() => {
  'use strict';

  const CONFIG = window.RANKING_CONFIG || { CATEGORIES: [], SEED_DATA: { weeks: [], votes: [] } };
  const CATEGORIES = CONFIG.CATEGORIES;

  const STORAGE_KEYS = {
    data: 'ranking_natalino_data_v1',
    apiUrl: 'ranking_natalino_api_url_v1',
    lastPerson: 'ranking_natalino_last_person_v1',
    bannerDismissed: 'ranking_natalino_banner_dismissed_v1'
  };

  const CHART_PALETTE = [
    '#14452f', // Pine
    '#b4232c', // Cranberry
    '#c98a2c', // Gold
    '#6f4228', // Cocoa
    '#1f6e73', // Teal
    '#7d3b5c'  // Plum
  ];

  const state = {
    weeks: [],
    votes: [],
    activeTab: 'dashboard',
    selectedWeekFilter: 'latest', // number | 'all'
    apiUrl: '',
    connectionStatus: 'local', // 'local' | 'connected' | 'syncing' | 'error'
    lastSyncError: '',
    editingWeekOriginal: null,
    slidersTouched: false,
    pendingConfirmAction: null
  };

  // ---------- Helpers ----------
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cloneSeedData() {
    return JSON.parse(JSON.stringify(CONFIG.SEED_DATA || { weeks: [], votes: [] }));
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function formatScore(n, decimals = 2) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(decimals).replace('.', ',');
  }

  function formatShortScore(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    const rounded = round2(n);
    if (Number.isInteger(rounded)) return String(rounded);
    const oneDec = Math.round(rounded * 10) / 10;
    if (Math.abs(oneDec - rounded) < 0.001) return oneDec.toFixed(1).replace('.', ',');
    return rounded.toFixed(2).replace('.', ',');
  }

  function scoreTierClass(n) {
    if (n >= 8) return 'score-high';
    if (n >= 6.5) return 'score-mid';
    return 'score-low';
  }

  function clampScore(value) {
    const num = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return 0;
    return Math.min(10, Math.max(0, Math.round(num * 2) / 2));
  }

  function voteAverage(vote) {
    return (Number(vote.sabor) + Number(vote.recheio) + Number(vote.maciez) + Number(vote.docura)) / 4;
  }

  function mean(values) {
    if (!values.length) return null;
    return values.reduce((acc, v) => acc + v, 0) / values.length;
  }

  function normalizeAppsScriptUrl(rawUrl) {
    let url = String(rawUrl || '').trim();
    if (!url) return '';
    // Remove prefixo multi-conta (/macros/u/0/s/ -> /macros/s/)
    url = url.replace(/\/macros\/u\/\d+\/s\//i, '/macros/s/');
    url = url.replace(/\/a\/macros\/([^/]+)\/u\/\d+\/s\//i, '/a/macros/$1/s/');
    return url;
  }

  function validateAppsScriptUrl(rawUrl) {
    const url = normalizeAppsScriptUrl(rawUrl);
    if (!url) {
      return { ok: false, url: '', reason: 'Cole a URL do Web App antes de testar.' };
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return { ok: false, url, reason: 'URL inválida. Verifique se copiou o link completo começando com https://.' };
    }
    if (parsed.protocol !== 'https:') {
      return { ok: false, url, reason: 'A URL precisa começar com https://.' };
    }
    if (parsed.hostname === 'docs.google.com') {
      return {
        ok: false,
        url,
        reason: 'Essa é a URL da planilha, não do Web App. Vá em Extensões → Apps Script → Implantar → App da Web e copie a URL terminada em /exec.'
      };
    }
    if (parsed.hostname !== 'script.google.com') {
      return {
        ok: false,
        url,
        reason: 'A URL deve pertencer a script.google.com (terminada em /exec).'
      };
    }
    if (/\/dev(\?|$)/i.test(parsed.pathname)) {
      return {
        ok: false,
        url,
        reason: 'Você colou a URL de teste (/dev). Use a URL da implantação final terminada em /exec.'
      };
    }
    return { ok: true, url };
  }

  function isValidAppsScriptUrl(url) {
    return validateAppsScriptUrl(url).ok;
  }

  function normalizePayload(raw) {
    const rawWeeks = Array.isArray(raw && raw.weeks) ? raw.weeks : [];
    const rawVotes = Array.isArray(raw && raw.votes) ? raw.votes : [];

    const weekMap = new Map();
    rawWeeks.forEach((w) => {
      const weekNum = parseInt(w.week, 10);
      const chocotone = String(w.chocotone || '').trim();
      if (!Number.isFinite(weekNum) || weekNum < 1 || !chocotone) return;
      weekMap.set(weekNum, {
        week: weekNum,
        chocotone,
        brand: String(w.brand || '').trim(),
        notes: String(w.notes || '').trim()
      });
    });

    const voteMap = new Map();
    rawVotes.forEach((v) => {
      const weekNum = parseInt(v.week, 10);
      const person = String(v.person || '').trim();
      if (!Number.isFinite(weekNum) || weekNum < 1 || !person) return;
      const sabor = Number(v.sabor);
      const recheio = Number(v.recheio);
      const maciez = Number(v.maciez);
      const docura = Number(v.docura);
      if (![sabor, recheio, maciez, docura].every(Number.isFinite)) return;
      const key = `${weekNum}::${person.toLowerCase()}`;
      voteMap.set(key, {
        week: weekNum,
        person,
        sabor: Math.min(10, Math.max(0, sabor)),
        recheio: Math.min(10, Math.max(0, recheio)),
        maciez: Math.min(10, Math.max(0, maciez)),
        docura: Math.min(10, Math.max(0, docura)),
        comment: String(v.comment || '').trim(),
        updatedAt: v.updatedAt || ''
      });
    });

    const weeks = Array.from(weekMap.values()).sort((a, b) => a.week - b.week);
    const votes = Array.from(voteMap.values());
    return { weeks, votes };
  }

  // ---------- Storage & Sync ----------
  function saveLocalData() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.data,
        JSON.stringify({ weeks: state.weeks, votes: state.votes })
      );
    } catch (_) {}
  }

  function loadLocalData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.data);
      if (saved) {
        const parsed = normalizePayload(JSON.parse(saved));
        if (parsed.weeks.length > 0 || parsed.votes.length > 0) {
          state.weeks = parsed.weeks;
          state.votes = parsed.votes;
          return;
        }
      }
    } catch (_) {}
    const seed = normalizePayload(cloneSeedData());
    state.weeks = seed.weeks;
    state.votes = seed.votes;
    saveLocalData();
  }

  function resolveInitialApiUrl() {
    const params = new URLSearchParams(window.location.search);
    const queryApi = (params.get('api') || '').trim();
    if (isValidAppsScriptUrl(queryApi)) {
      try {
        localStorage.setItem(STORAGE_KEYS.apiUrl, queryApi);
      } catch (_) {}
      // Limpar query string para manter URL limpa
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
      return queryApi;
    }

    try {
      const storedUrl = (localStorage.getItem(STORAGE_KEYS.apiUrl) || '').trim();
      if (isValidAppsScriptUrl(storedUrl)) return storedUrl;
    } catch (_) {}

    const configUrl = String(CONFIG.APPS_SCRIPT_URL || '').trim();
    if (isValidAppsScriptUrl(configUrl)) return configUrl;

    return '';
  }

  async function apiGetAllSingle(url) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}action=getAll&_ts=${Date.now()}`, {
      method: 'GET'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('A URL não retornou JSON válido (verifique se ela termina em /exec e está liberada para "Qualquer pessoa").');
    }
    if (!data || !data.ok) throw new Error((data && data.error) || 'Resposta inválida da planilha');
    return { payload: normalizePayload(data), effectiveUrl: url };
  }

  async function apiGetAll(url) {
    const cleanUrl = normalizeAppsScriptUrl(url);
    try {
      const { payload } = await apiGetAllSingle(cleanUrl);
      return payload;
    } catch (err) {
      // Se for URL Workspace (/a/macros/dominio/s/...), tenta também a rota padrão /macros/s/...
      if (/\/a\/macros\/[^/]+\/s\//i.test(cleanUrl)) {
        const altUrl = cleanUrl.replace(/\/a\/macros\/[^/]+\/s\//i, '/macros/s/');
        const { payload } = await apiGetAllSingle(altUrl);
        return payload;
      }
      throw err;
    }
  }

  async function apiPost(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.ok) throw new Error((data && data.error) || 'Falha ao salvar no Google Sheets');
    return {
      mode: data.mode || 'ok',
      ...normalizePayload(data)
    };
  }

  async function syncFromSheets({ silent = false } = {}) {
    if (!state.apiUrl) {
      state.connectionStatus = 'local';
      renderSyncStatus();
      return false;
    }

    state.connectionStatus = 'syncing';
    state.lastSyncError = '';
    renderSyncStatus();

    try {
      const payload = await apiGetAll(state.apiUrl);
      state.weeks = payload.weeks;
      state.votes = payload.votes;
      saveLocalData();
      state.connectionStatus = 'connected';
      ensureValidSelectedWeek();
      renderAll();
      if (!silent) showToast('Dados atualizados direto do Google Sheets.', 'success');
      return true;
    } catch (err) {
      state.connectionStatus = 'error';
      state.lastSyncError = err && err.message ? err.message : 'Erro de conexão';
      renderSyncStatus();
      if (!silent) {
        showToast(`Não foi possível sincronizar com o Google Sheets: ${state.lastSyncError}`, 'error');
      }
      return false;
    }
  }

  // ---------- Computed Stats ----------
  function computeWeekStats() {
    return state.weeks
      .slice()
      .sort((a, b) => a.week - b.week)
      .map((weekObj) => {
        const weekVotes = state.votes
          .filter((v) => v.week === weekObj.week)
          .slice()
          .sort((a, b) => a.person.localeCompare(b.person, 'pt-BR', { sensitivity: 'base' }));

        const categories = {};
        CATEGORIES.forEach((cat) => {
          categories[cat.key] = mean(weekVotes.map((v) => Number(v[cat.key])));
        });

        const overall = weekVotes.length ? mean(weekVotes.map(voteAverage)) : null;

        return {
          ...weekObj,
          votes: weekVotes,
          count: weekVotes.length,
          categories,
          overall
        };
      });
  }

  function computeLeaderboard(weekStats) {
    return weekStats
      .filter((w) => w.count > 0 && w.overall != null)
      .slice()
      .sort((a, b) => {
        if (Math.abs(b.overall - a.overall) > 0.0001) return b.overall - a.overall;
        if (Math.abs((b.categories.sabor || 0) - (a.categories.sabor || 0)) > 0.0001) {
          return (b.categories.sabor || 0) - (a.categories.sabor || 0);
        }
        if (b.count !== a.count) return b.count - a.count;
        return a.week - b.week;
      });
  }

  function computeKnownPeople() {
    const map = new Map();
    state.votes.forEach((v) => {
      const key = v.person.trim().toLowerCase();
      if (!key) return;
      map.set(key, v.person.trim());
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
  }

  function computeEvaluators(weekStats) {
    const weekLookup = new Map(weekStats.map((w) => [w.week, w]));
    const byPerson = new Map();

    state.votes.forEach((v) => {
      const key = v.person.trim().toLowerCase();
      if (!key) return;
      if (!byPerson.has(key)) {
        byPerson.set(key, {
          person: v.person.trim(),
          votes: []
        });
      }
      const entry = byPerson.get(key);
      entry.person = v.person.trim();
      entry.votes.push(v);
    });

    const list = Array.from(byPerson.values()).map((entry) => {
      const avgs = entry.votes.map((v) => ({
        week: v.week,
        avg: voteAverage(v),
        chocotone: (weekLookup.get(v.week) && weekLookup.get(v.week).chocotone) || `Semana ${v.week}`
      }));
      avgs.sort((a, b) => b.avg - a.avg);
      return {
        person: entry.person,
        count: entry.votes.length,
        avg: mean(avgs.map((a) => a.avg)),
        favorite: avgs[0] || null,
        weeksList: entry.votes.map((v) => v.week).sort((a, b) => a - b)
      };
    });

    list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.person.localeCompare(b.person, 'pt-BR', { sensitivity: 'base' });
    });

    const mostGenerous = list.length
      ? list.slice().sort((a, b) => b.avg - a.avg)[0]
      : null;
    const mostStrict = list.length
      ? list.slice().sort((a, b) => a.avg - b.avg)[0]
      : null;
    const mostActive = list.length ? list[0] : null;

    return { list, mostGenerous, mostStrict, mostActive };
  }

  function ensureValidSelectedWeek() {
    if (!state.weeks.length) {
      state.selectedWeekFilter = 'all';
      return;
    }
    if (state.selectedWeekFilter === 'all') return;
    if (state.selectedWeekFilter === 'latest') {
      const sorted = state.weeks.slice().sort((a, b) => b.week - a.week);
      state.selectedWeekFilter = sorted[0].week;
      return;
    }
    const exists = state.weeks.some((w) => w.week === state.selectedWeekFilter);
    if (!exists) {
      const sorted = state.weeks.slice().sort((a, b) => b.week - a.week);
      state.selectedWeekFilter = sorted[0].week;
    }
  }

  // ---------- Toast ----------
  function showToast(message, type = 'info') {
    const region = document.getElementById('toast-region');
    if (!region) return;
    if (typeof region.showPopover === 'function') {
      try {
        if (!region.hasAttribute('popover')) region.setAttribute('popover', 'manual');
        if (region.matches(':popover-open') && document.querySelector('dialog[open]')) {
          region.hidePopover();
        }
        if (!region.matches(':popover-open')) region.showPopover();
      } catch (_) {}
    }
    const el = document.createElement('div');
    el.className = `toast is-${type}`;
    el.textContent = message;
    region.appendChild(el);
    window.setTimeout(() => {
      el.remove();
      if (!region.children.length && typeof region.hidePopover === 'function') {
        try {
          if (region.matches(':popover-open')) region.hidePopover();
        } catch (_) {}
      }
    }, 4200);
  }

  // ---------- Navigation & Modals ----------
  function switchTab(tabName, options = {}) {
    state.activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const active = panel.id === `panel-${tabName}`;
      panel.hidden = !active;
    });

    if (tabName === 'weeks' && options.weekNum != null) {
      state.selectedWeekFilter = options.weekNum;
      renderWeeksPanel();
    }

    if (tabName === 'vote') {
      prepareVoteForm(options);
    }
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function askConfirmation(message, onConfirm, confirmLabel = 'Confirmar') {
    const msgEl = document.getElementById('confirm-dialog-message');
    const okBtn = document.getElementById('confirm-dialog-ok');
    if (!msgEl || !okBtn) return;
    msgEl.textContent = message;
    okBtn.textContent = confirmLabel;
    state.pendingConfirmAction = onConfirm;
    openDialog('confirm-dialog');
  }

  // ---------- Rendering: Header & Sync Status ----------
  function renderSyncStatus() {
    const pill = document.getElementById('sync-status-btn');
    const label = document.getElementById('sync-status-label');
    const refreshBtn = document.getElementById('refresh-btn');
    const localBanner = document.getElementById('local-banner');

    if (!pill || !label) return;
    pill.classList.remove('is-connected', 'is-error');

    if (!state.apiUrl) {
      label.textContent = 'Modo Local (Demo)';
      if (refreshBtn) refreshBtn.hidden = true;
    } else if (state.connectionStatus === 'syncing') {
      label.textContent = 'Sincronizando...';
      if (refreshBtn) refreshBtn.hidden = false;
    } else if (state.connectionStatus === 'error') {
      pill.classList.add('is-error');
      label.textContent = 'Erro no Google Sheets';
      if (refreshBtn) refreshBtn.hidden = false;
    } else {
      pill.classList.add('is-connected');
      label.textContent = 'Google Sheets Conectado';
      if (refreshBtn) refreshBtn.hidden = false;
    }

    if (localBanner) {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(STORAGE_KEYS.bannerDismissed) === '1';
      } catch (_) {}
      localBanner.hidden = Boolean(state.apiUrl) || dismissed;
    }
  }

  // ---------- Rendering: Dashboard ----------
  function renderDashboard() {
    const weekStats = computeWeekStats();
    const leaderboard = computeLeaderboard(weekStats);
    const evaluators = computeEvaluators(weekStats);

    renderHeroLeader(leaderboard, weekStats);
    renderKpis(leaderboard, weekStats, evaluators);
    renderLeaderboard(leaderboard, weekStats);
    renderCategoryChampions(leaderboard);
    renderCategoryChart(weekStats.filter((w) => w.count > 0));
    renderTrendChart(weekStats);
    renderEvaluators(evaluators, weekStats);
  }

  function renderHeroLeader(leaderboard, weekStats) {
    const container = document.getElementById('hero-leader-container');
    if (!container) return;

    if (!leaderboard.length) {
      container.innerHTML = `
        <section class="hero-leader">
          <div>
            <span class="hero-eyebrow">🎄 Temporada Natalina</span>
            <h2 class="hero-title">Nenhuma avaliação registrada ainda</h2>
            <p class="hero-meta">Cadastre o chocotone da semana e dê a primeira nota para iniciar o ranking.</p>
            <div class="hero-actions">
              <button type="button" class="btn btn-hero-gold" data-hero-action="vote">⭐ Dar Primeira Nota</button>
              <button type="button" class="btn btn-hero-ghost" data-hero-action="new-week">+ Cadastrar Semana</button>
            </div>
          </div>
        </section>
      `;
      return;
    }

    const leader = leaderboard[0];
    const runnerUp = leaderboard[1];
    const marginText = runnerUp
      ? `+${formatScore(leader.overall - runnerUp.overall)} pts à frente de ${escapeHtml(runnerUp.chocotone)}`
      : 'Primeiro chocotone avaliado da temporada';

    const latestWeek = weekStats.length ? weekStats[weekStats.length - 1] : leader;

    container.innerHTML = `
      <section class="hero-leader">
        <div>
          <span class="hero-eyebrow">🏆 Líder Atual • Semana ${leader.week}</span>
          <h2 class="hero-title">${escapeHtml(leader.chocotone)}</h2>
          <div class="hero-meta">
            <span>👥 ${leader.count} ${leader.count === 1 ? 'avaliação' : 'avaliações'}</span>
            <span class="hero-sep" aria-hidden="true">•</span>
            <span>📊 ${marginText}</span>
          </div>
          <div class="hero-actions">
            <button type="button" class="btn btn-hero-gold" data-hero-action="vote-latest" data-week="${latestWeek.week}">
              ⭐ Avaliar Semana ${latestWeek.week}
            </button>
            <button type="button" class="btn btn-hero-ghost" data-hero-action="view-week" data-week="${leader.week}">
              Ver notas do líder
            </button>
          </div>
        </div>

        <div class="hero-score-panel">
          <span class="hero-score-value">${formatScore(leader.overall)}</span>
          <span class="hero-score-max">de 10,00 pontos</span>
          <div class="hero-mini-cats">
            ${CATEGORIES.map(
              (c) => `<span>${escapeHtml(c.label)}: <strong>${formatScore(leader.categories[c.key])}</strong></span>`
            ).join('')}
          </div>
        </div>
      </section>
    `;

    container.querySelectorAll('[data-hero-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.heroAction;
        const weekNum = parseInt(btn.dataset.week || '', 10);
        if (action === 'vote') switchTab('vote');
        else if (action === 'vote-latest') switchTab('vote', { weekNum });
        else if (action === 'view-week') switchTab('weeks', { weekNum });
        else if (action === 'new-week') openWeekModal();
      });
    });
  }

  function renderKpis(leaderboard, weekStats, evaluators) {
    const container = document.getElementById('kpi-grid');
    if (!container) return;

    const evaluatedWeeks = weekStats.filter((w) => w.count > 0);
    const totalVotes = state.votes.length;

    // Categoria com maior média geral entre todos os votos
    let bestCat = null;
    if (totalVotes > 0) {
      const catAvgs = CATEGORIES.map((c) => ({
        ...c,
        avg: mean(state.votes.map((v) => Number(v[c.key])))
      })).sort((a, b) => b.avg - a.avg);
      bestCat = catAvgs[0];
    }

    const leader = leaderboard[0];

    container.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Melhor Nota Geral</div>
        <div class="kpi-value">${leader ? formatScore(leader.overall) : '—'}</div>
        <div class="kpi-detail">${leader ? escapeHtml(leader.chocotone) : 'Aguardando notas'}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Semanas Avaliadas</div>
        <div class="kpi-value">${evaluatedWeeks.length} <span style="font-size:0.9rem;font-weight:600;color:var(--text-muted)">/ ${weekStats.length}</span></div>
        <div class="kpi-detail">${evaluators.list.length} participantes diferentes</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Total de Avaliações</div>
        <div class="kpi-value">${totalVotes}</div>
        <div class="kpi-detail">${totalVotes * 4} notas individuais dadas</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Maior Média por Critério</div>
        <div class="kpi-value">${bestCat ? escapeHtml(bestCat.label) : '—'}</div>
        <div class="kpi-detail">${bestCat ? `Média geral de ${formatScore(bestCat.avg)} / 10` : 'Sem avaliações'}</div>
      </div>
    `;
  }

  function renderLeaderboard(leaderboard, weekStats) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    const pendingWeeks = weekStats.filter((w) => w.count === 0);

    if (!leaderboard.length && !pendingWeeks.length) {
      container.innerHTML = `<div class="empty-state"><p>Nenhuma semana cadastrada.</p></div>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const itemsHtml = leaderboard
      .map((w, idx) => {
        const rankBadge = medals[idx] || `${idx + 1}º`;
        const tierClass = scoreTierClass(w.overall);
        return `
          <button type="button" class="leaderboard-item ${idx === 0 ? 'is-first' : ''}" data-open-week="${w.week}">
            <div class="lb-top">
              <div class="lb-left">
                <span class="rank-medal">${rankBadge}</span>
                <div style="min-width:0">
                  <div class="lb-title">${escapeHtml(w.chocotone)}</div>
                  <div class="lb-meta">Semana ${w.week}${w.brand ? ` • ${escapeHtml(w.brand)}` : ''} • ${w.count} ${w.count === 1 ? 'voto' : 'votos'}</div>
                </div>
              </div>
              <span class="lb-score-badge ${tierClass}">${formatScore(w.overall)}</span>
            </div>
            <div class="lb-cats-bars">
              ${CATEGORIES.map((c) => {
                const val = w.categories[c.key] || 0;
                return `
                  <div class="mini-bar-item">
                    <div class="mini-bar-head">
                      <span>${escapeHtml(c.label)}</span>
                      <strong>${formatScore(val)}</strong>
                    </div>
                    <div class="mini-bar-track">
                      <div class="mini-bar-fill" style="width:${Math.min(100, val * 10)}%;background:${c.color}"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </button>
        `;
      })
      .join('');

    const pendingHtml = pendingWeeks
      .map(
        (w) => `
          <button type="button" class="leaderboard-item" data-open-week="${w.week}">
            <div class="lb-top">
              <div class="lb-left">
                <span class="rank-medal">🕒</span>
                <div>
                  <div class="lb-title">${escapeHtml(w.chocotone)}</div>
                  <div class="lb-meta">Semana ${w.week} • Aguardando primeiras notas</div>
                </div>
              </div>
              <span class="score-pill score-mid">Sem notas</span>
            </div>
          </button>
        `
      )
      .join('');

    container.innerHTML = `<div class="leaderboard-list">${itemsHtml}${pendingHtml}</div>`;

    container.querySelectorAll('[data-open-week]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab('weeks', { weekNum: parseInt(btn.dataset.openWeek, 10) });
      });
    });
  }

  function renderCategoryChampions(leaderboard) {
    const container = document.getElementById('category-champions-container');
    if (!container) return;

    if (!leaderboard.length) {
      container.innerHTML = `<div class="empty-state"><p>Os campeões por categoria aparecerão após a primeira avaliação.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="champions-grid">
        ${CATEGORIES.map((cat) => {
          const sorted = leaderboard
            .slice()
            .sort((a, b) => (b.categories[cat.key] || 0) - (a.categories[cat.key] || 0));
          const winner = sorted[0];
          const val = winner.categories[cat.key];
          return `
            <div class="champion-card">
              <div class="champion-tag" style="color:${cat.color}">
                <span class="champion-dot" style="background:${cat.color}"></span>
                Melhor ${escapeHtml(cat.label)}
              </div>
              <div class="champion-name">${escapeHtml(winner.chocotone)}</div>
              <div class="champion-footer">
                <span>Semana ${winner.week}</span>
                <span class="champion-score">${formatScore(val)}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderCategoryChart(evaluatedWeeks) {
    const container = document.getElementById('category-chart-container');
    if (!container) return;

    if (!evaluatedWeeks.length) {
      container.innerHTML = `<div class="empty-state"><p>Sem dados suficientes para gerar o gráfico.</p></div>`;
      return;
    }

    const width = 560;
    const height = 265;
    const pad = { top: 22, right: 16, bottom: 42, left: 34 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const groupCount = CATEGORIES.length;
    const seriesCount = evaluatedWeeks.length;
    const groupW = plotW / groupCount;
    const innerPad = Math.min(22, groupW * 0.16);
    const usableGroupW = groupW - innerPad * 2;
    const gapBetweenBars = seriesCount > 1 ? 4 : 0;
    const barW = Math.max(8, Math.min(34, (usableGroupW - gapBetweenBars * (seriesCount - 1)) / seriesCount));
    const totalBarsW = barW * seriesCount + gapBetweenBars * (seriesCount - 1);

    const gridLines = [0, 2, 4, 6, 8, 10]
      .map((tick) => {
        const y = pad.top + plotH - (tick / 10) * plotH;
        return `
          <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#e5d7c3" stroke-dasharray="${tick === 0 ? '0' : '3 3'}" />
          <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6c5847">${tick}</text>
        `;
      })
      .join('');

    const barsSvg = CATEGORIES.map((cat, gIdx) => {
      const groupLeft = pad.left + gIdx * groupW + (groupW - totalBarsW) / 2;
      const groupCenter = pad.left + gIdx * groupW + groupW / 2;

      const bars = evaluatedWeeks
        .map((w, sIdx) => {
          const val = w.categories[cat.key] || 0;
          const barH = Math.max(2, (val / 10) * plotH);
          const x = groupLeft + sIdx * (barW + gapBetweenBars);
          const y = pad.top + plotH - barH;
          const color = CHART_PALETTE[sIdx % CHART_PALETTE.length];
          const showLabel = evaluatedWeeks.length <= 4;
          return `
            <g>
              <title>Semana ${w.week} (${escapeHtml(w.chocotone)}) — ${escapeHtml(cat.label)}: ${formatScore(val)}</title>
              <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="5" fill="${color}" />
              ${
                showLabel
                  ? `<text x="${(x + barW / 2).toFixed(1)}" y="${Math.max(12, y - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#241710">${formatScore(val)}</text>`
                  : ''
              }
            </g>
          `;
        })
        .join('');

      return `
        ${bars}
        <text x="${groupCenter.toFixed(1)}" y="${height - 14}" text-anchor="middle" font-size="12" font-weight="700" fill="#241710">${escapeHtml(cat.label)}</text>
      `;
    }).join('');

    const legend = evaluatedWeeks
      .map((w, idx) => {
        const color = CHART_PALETTE[idx % CHART_PALETTE.length];
        return `
          <span class="legend-item">
            <span class="legend-swatch" style="background:${color}"></span>
            Sem. ${w.week}: ${escapeHtml(w.chocotone)}
          </span>
        `;
      })
      .join('');

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparativo de notas por categoria entre os chocotones">
        ${gridLines}
        ${barsSvg}
      </svg>
      <div class="chart-legend">${legend}</div>
    `;
  }

  function renderTrendChart(weekStats) {
    const container = document.getElementById('trend-chart-container');
    if (!container) return;

    const pointsData = weekStats.filter((w) => w.count > 0);
    if (!pointsData.length) {
      container.innerHTML = `<div class="empty-state"><p>A evolução semanal aparecerá quando houver notas.</p></div>`;
      return;
    }

    const width = 560;
    const height = 265;
    const pad = { top: 26, right: 34, bottom: 52, left: 36 };
    const xInset = 34;
    const plotW = width - pad.left - pad.right;
    const usableW = plotW - xInset * 2;
    const plotH = height - pad.top - pad.bottom;

    const gridLines = [0, 2, 4, 6, 8, 10]
      .map((tick) => {
        const y = pad.top + plotH - (tick / 10) * plotH;
        return `
          <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#e5d7c3" stroke-dasharray="${tick === 0 ? '0' : '3 3'}" />
          <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6c5847">${tick}</text>
        `;
      })
      .join('');

    const coords = pointsData.map((w, idx) => {
      const x =
        pointsData.length === 1
          ? pad.left + plotW / 2
          : pad.left + xInset + (idx / (pointsData.length - 1)) * usableW;
      const y = pad.top + plotH - (w.overall / 10) * plotH;
      return { ...w, x, y };
    });

    let areaPath = '';
    let linePath = '';
    if (coords.length > 1) {
      linePath = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      const bottomY = pad.top + plotH;
      areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${bottomY} L ${coords[0].x.toFixed(1)} ${bottomY} Z`;
    }

    const nodesSvg = coords
      .map(
        (p) => `
          <g>
            <title>Semana ${p.week}: ${escapeHtml(p.chocotone)} — Média ${formatScore(p.overall)} (${p.count} votos)</title>
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="#14452f" stroke="#fffdf9" stroke-width="2.5" />
            <text x="${p.x.toFixed(1)}" y="${Math.max(14, p.y - 12).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="#14452f">${formatScore(p.overall)}</text>
            <text x="${p.x.toFixed(1)}" y="${height - 26}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#241710">Sem. ${p.week}</text>
            <text x="${p.x.toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="10.5" fill="#6c5847">${p.count} ${p.count === 1 ? 'voto' : 'votos'}</text>
          </g>
        `
      )
      .join('');

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução das médias semanais">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#14452f" stop-opacity="0.22" />
            <stop offset="100%" stop-color="#14452f" stop-opacity="0.01" />
          </linearGradient>
        </defs>
        ${gridLines}
        ${areaPath ? `<path d="${areaPath}" fill="url(#trendGrad)" />` : ''}
        ${linePath ? `<path d="${linePath}" fill="none" stroke="#14452f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
        ${nodesSvg}
      </svg>
    `;
  }

  function renderEvaluators(evaluators, weekStats) {
    const container = document.getElementById('evaluators-container');
    if (!container) return;

    if (!evaluators.list.length) {
      container.innerHTML = `<div class="empty-state"><p>Nenhum avaliador participou ainda.</p></div>`;
      return;
    }

    const totalEvaluatedWeeks = weekStats.filter((w) => w.count > 0).length || weekStats.length;

    const badgesHtml = `
      <div class="insight-badges">
        ${
          evaluators.mostActive
            ? `<div class="insight-pill">🏅 <strong>Mais assíduo:</strong> ${escapeHtml(evaluators.mostActive.person)} (${evaluators.mostActive.count}/${totalEvaluatedWeeks} semanas)</div>`
            : ''
        }
        ${
          evaluators.mostStrict
            ? `<div class="insight-pill">🧐 <strong>Jurado mais exigente:</strong> ${escapeHtml(evaluators.mostStrict.person)} (média ${formatScore(evaluators.mostStrict.avg)})</div>`
            : ''
        }
        ${
          evaluators.mostGenerous
            ? `<div class="insight-pill">💛 <strong>Mais generoso:</strong> ${escapeHtml(evaluators.mostGenerous.person)} (média ${formatScore(evaluators.mostGenerous.avg)})</div>`
            : ''
        }
      </div>
    `;

    const rowsHtml = evaluators.list
      .map(
        (ev) => `
          <tr>
            <td><strong>${escapeHtml(ev.person)}</strong></td>
            <td>${ev.count} ${ev.count === 1 ? 'semana' : 'semanas'} <span style="color:var(--text-muted);font-size:0.78rem">(${ev.weeksList.map((n) => `S${n}`).join(', ')})</span></td>
            <td><span class="score-pill ${scoreTierClass(ev.avg)}">${formatScore(ev.avg)}</span></td>
            <td>${ev.favorite ? `${escapeHtml(ev.favorite.chocotone)} <span style="color:var(--text-muted)">(${formatScore(ev.favorite.avg)})</span>` : '—'}</td>
          </tr>
        `
      )
      .join('');

    container.innerHTML = `
      ${badgesHtml}
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Avaliador</th>
              <th>Participação</th>
              <th>Média dada</th>
              <th>Chocotone favorito</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  // ---------- Rendering: Weeks & Matrix Panel ----------
  function renderWeeksPanel() {
    const weekStats = computeWeekStats();
    ensureValidSelectedWeek();

    const pillsContainer = document.getElementById('week-pills');
    const contentContainer = document.getElementById('weeks-content');
    if (!pillsContainer || !contentContainer) return;

    const pillsHtml = [
      ...weekStats.map(
        (w) => `
          <button
            type="button"
            class="week-pill-btn ${state.selectedWeekFilter === w.week ? 'is-active' : ''}"
            data-week-filter="${w.week}"
          >
            Semana ${w.week}: ${escapeHtml(w.chocotone)}
          </button>
        `
      ),
      `
        <button
          type="button"
          class="week-pill-btn ${state.selectedWeekFilter === 'all' ? 'is-active' : ''}"
          data-week-filter="all"
        >
          Todas (${weekStats.length})
        </button>
      `
    ].join('');

    pillsContainer.innerHTML = pillsHtml;
    pillsContainer.querySelectorAll('[data-week-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.weekFilter;
        state.selectedWeekFilter = val === 'all' ? 'all' : parseInt(val, 10);
        renderWeeksPanel();
      });
    });

    const visibleWeeks =
      state.selectedWeekFilter === 'all'
        ? weekStats
        : weekStats.filter((w) => w.week === state.selectedWeekFilter);

    if (!visibleWeeks.length) {
      contentContainer.innerHTML = `
        <div class="empty-state">
          <h3>Nenhuma semana cadastrada</h3>
          <p>Clique em "+ Nova Semana" para cadastrar o primeiro chocotone.</p>
          <button type="button" class="btn btn-primary" id="empty-add-week-btn">+ Nova Semana</button>
        </div>
      `;
      const btn = document.getElementById('empty-add-week-btn');
      if (btn) btn.addEventListener('click', () => openWeekModal());
      return;
    }

    contentContainer.innerHTML = visibleWeeks.map(renderSingleWeekCard).join('');

    // Listeners nas ações de cada semana
    contentContainer.querySelectorAll('[data-vote-week]').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab('vote', { weekNum: parseInt(btn.dataset.voteWeek, 10) });
      });
    });

    contentContainer.querySelectorAll('[data-edit-week]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const weekNum = parseInt(btn.dataset.editWeek, 10);
        const weekObj = state.weeks.find((w) => w.week === weekNum);
        if (weekObj) openWeekModal(weekObj);
      });
    });

    contentContainer.querySelectorAll('[data-edit-vote]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const weekNum = parseInt(btn.dataset.week, 10);
        const person = btn.dataset.editVote;
        switchTab('vote', { weekNum, person });
      });
    });

    contentContainer.querySelectorAll('[data-delete-vote]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const weekNum = parseInt(btn.dataset.week, 10);
        const person = btn.dataset.deleteVote;
        askConfirmation(
          `Remover a avaliação de "${person}" da Semana ${weekNum}?`,
          () => deleteVote(weekNum, person),
          'Remover nota'
        );
      });
    });
  }

  function renderSingleWeekCard(w) {
    const matrixHtml = w.votes.length
      ? `
        <div class="table-scroll">
          <table class="matrix-table" aria-label="Notas da Semana ${w.week} - ${escapeHtml(w.chocotone)}">
            <thead>
              <tr>
                <th class="sticky-col">Categoria</th>
                ${w.votes
                  .map(
                    (v) => `
                      <th>
                        <div class="person-col-head">
                          <span>${escapeHtml(v.person)}</span>
                          <button type="button" class="person-edit-btn" data-edit-vote="${escapeHtml(v.person)}" data-week="${w.week}" title="Editar nota de ${escapeHtml(v.person)}" aria-label="Editar nota de ${escapeHtml(v.person)}">✎</button>
                          <button type="button" class="person-del-btn" data-delete-vote="${escapeHtml(v.person)}" data-week="${w.week}" title="Remover nota de ${escapeHtml(v.person)}" aria-label="Remover nota de ${escapeHtml(v.person)}">✕</button>
                        </div>
                      </th>
                    `
                  )
                  .join('')}
                <th class="avg-col">Média</th>
              </tr>
            </thead>
            <tbody>
              ${CATEGORIES.map((cat) => {
                const catAvg = w.categories[cat.key];
                return `
                  <tr>
                    <td class="sticky-col" style="color:${cat.color}">${escapeHtml(cat.sheetLabel)}</td>
                    ${w.votes.map((v) => `<td>${formatShortScore(v[cat.key])}</td>`).join('')}
                    <td class="avg-col"><span class="score-pill ${scoreTierClass(catAvg)}">${formatScore(catAvg)}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td class="sticky-col">Média</td>
                ${w.votes
                  .map((v) => {
                    const avg = voteAverage(v);
                    return `<td><span class="score-pill ${scoreTierClass(avg)}">${formatScore(avg)}</span></td>`;
                  })
                  .join('')}
                <td class="avg-col"><span class="score-pill ${scoreTierClass(w.overall)}">${formatScore(w.overall)}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `
      : `
        <div class="empty-state">
          <h3>Semana ${w.week} pronta para degustação!</h3>
          <p>Ninguém avaliou <strong>${escapeHtml(w.chocotone)}</strong> ainda.</p>
          <button type="button" class="btn btn-primary" data-vote-week="${w.week}">⭐ Dar a primeira nota</button>
        </div>
      `;

    const comments = w.votes.filter((v) => v.comment);
    const commentsHtml = comments.length
      ? `
        <div class="comments-section">
          <h4>💬 Comentários da degustação</h4>
          <div class="comments-list">
            ${comments
              .map(
                (v) => `
                  <div class="comment-bubble">
                    <strong>${escapeHtml(v.person)}:</strong> ${escapeHtml(v.comment)}
                  </div>
                `
              )
              .join('')}
          </div>
        </div>
      `
      : '';

    return `
      <article class="card week-card">
        <div class="week-card-head">
          <div>
            <span class="week-badge">Semana ${w.week}</span>
            <h2 class="week-title">${escapeHtml(w.chocotone)}</h2>
            ${
              w.brand || w.notes
                ? `<p class="week-subnotes">${[w.brand, w.notes].filter(Boolean).map(escapeHtml).join(' • ')}</p>`
                : ''
            }
          </div>

          <div class="week-head-right">
            <div class="week-avg-box">
              <span>Média (${w.count} ${w.count === 1 ? 'voto' : 'votos'})</span>
              <strong>${w.overall != null ? formatScore(w.overall) : '—'}</strong>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-edit-week="${w.week}">✎ Editar Chocotone</button>
            <button type="button" class="btn btn-primary btn-sm" data-vote-week="${w.week}">⭐ Dar Nota</button>
          </div>
        </div>

        ${matrixHtml}
        ${commentsHtml}
      </article>
    `;
  }

  // ---------- Rendering: Vote Form ----------
  function buildSlidersOnce() {
    const grid = document.getElementById('sliders-grid');
    if (!grid || grid.dataset.built === '1') return;
    grid.dataset.built = '1';

    grid.innerHTML = CATEGORIES.map(
      (cat) => `
        <div class="slider-card">
          <div class="slider-card-top">
            <div>
              <div class="slider-title" style="color:${cat.color}">
                <span class="champion-dot" style="background:${cat.color}"></span>
                ${escapeHtml(cat.label)}
              </div>
              <div class="slider-hint">${escapeHtml(cat.hint)}</div>
            </div>
            <span id="badge-${cat.key}" class="score-pill score-mid">7</span>
          </div>

          <div class="slider-controls">
            <input
              type="range"
              id="range-${cat.key}"
              min="0"
              max="10"
              step="0.5"
              value="7"
              aria-label="Nota de ${escapeHtml(cat.label)} de 0 a 10"
            />
            <div class="step-controls">
              <button type="button" class="step-btn" data-step="-0.5" data-cat="${cat.key}" aria-label="Diminuir ${escapeHtml(cat.label)} em 0,5">−</button>
              <input
                type="number"
                id="input-${cat.key}"
                class="score-number-input"
                min="0"
                max="10"
                step="0.5"
                value="7"
                aria-label="Valor numérico de ${escapeHtml(cat.label)}"
              />
              <button type="button" class="step-btn" data-step="0.5" data-cat="${cat.key}" aria-label="Aumentar ${escapeHtml(cat.label)} em 0,5">+</button>
            </div>
          </div>
        </div>
      `
    ).join('');

    CATEGORIES.forEach((cat) => {
      const range = document.getElementById(`range-${cat.key}`);
      const num = document.getElementById(`input-${cat.key}`);

      range.addEventListener('input', () => {
        state.slidersTouched = true;
        setCategoryInputValue(cat.key, range.value);
      });

      num.addEventListener('input', () => {
        state.slidersTouched = true;
        if (num.value === '') return;
        const clamped = clampScore(num.value);
        range.value = String(clamped);
        updateCategoryVisual(cat.key, clamped);
        updateLiveVoteAverage();
      });

      num.addEventListener('blur', () => {
        const clamped = clampScore(num.value);
        setCategoryInputValue(cat.key, clamped);
      });
    });

    grid.querySelectorAll('.step-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.slidersTouched = true;
        const key = btn.dataset.cat;
        const delta = parseFloat(btn.dataset.step);
        const current = parseFloat(document.getElementById(`range-${key}`).value || '7');
        setCategoryInputValue(key, clampScore(current + delta));
      });
    });
  }

  function setCategoryInputValue(key, rawValue) {
    const val = clampScore(rawValue);
    const range = document.getElementById(`range-${key}`);
    const num = document.getElementById(`input-${key}`);
    if (range) range.value = String(val);
    if (num) num.value = String(val);
    updateCategoryVisual(key, val);
    updateLiveVoteAverage();
  }

  function updateCategoryVisual(key, val) {
    const badge = document.getElementById(`badge-${key}`);
    if (!badge) return;
    badge.textContent = formatShortScore(val);
    badge.className = `score-pill ${scoreTierClass(val)}`;
  }

  function updateLiveVoteAverage() {
    const out = document.getElementById('live-vote-avg');
    if (!out) return;
    const sum = CATEGORIES.reduce((acc, cat) => {
      const el = document.getElementById(`range-${cat.key}`);
      return acc + (el ? Number(el.value) : 7);
    }, 0);
    out.textContent = formatScore(sum / CATEGORIES.length);
  }

  function renderVotePeopleOptions() {
    const people = computeKnownPeople();
    const datalist = document.getElementById('known-people-list');
    const chips = document.getElementById('person-quick-chips');
    const personInput = document.getElementById('vote-person');
    const currentVal = personInput ? personInput.value.trim().toLowerCase() : '';

    if (datalist) {
      datalist.innerHTML = people.map((p) => `<option value="${escapeHtml(p)}"></option>`).join('');
    }
    if (chips) {
      chips.innerHTML = people
        .map(
          (p) => `
            <button type="button" class="chip-btn ${p.toLowerCase() === currentVal ? 'is-selected' : ''}" data-pick-person="${escapeHtml(p)}">
              ${escapeHtml(p)}
            </button>
          `
        )
        .join('');
      chips.querySelectorAll('[data-pick-person]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (personInput) {
            personInput.value = btn.dataset.pickPerson;
            state.slidersTouched = false;
            syncExistingVoteIntoForm();
            renderVotePeopleOptions();
          }
        });
      });
    }
  }

  function renderVoteWeekSelect(preferredWeekNum) {
    const select = document.getElementById('vote-week');
    if (!select) return;
    const sorted = state.weeks.slice().sort((a, b) => a.week - b.week);

    if (!sorted.length) {
      select.innerHTML = `<option value="">Cadastre uma semana primeiro...</option>`;
      return;
    }

    const prevSelected = parseInt(select.value, 10);
    const targetWeek =
      preferredWeekNum != null
        ? preferredWeekNum
        : Number.isFinite(prevSelected) && sorted.some((w) => w.week === prevSelected)
          ? prevSelected
          : sorted[sorted.length - 1].week;

    select.innerHTML = sorted
      .map((w) => `<option value="${w.week}">Semana ${w.week} — ${escapeHtml(w.chocotone)}</option>`)
      .join('');
    select.value = String(targetWeek);
  }

  function prepareVoteForm(options = {}) {
    buildSlidersOnce();
    renderVoteWeekSelect(options.weekNum);
    renderVotePeopleOptions();

    const personInput = document.getElementById('vote-person');
    if (personInput) {
      if (options.person) {
        personInput.value = options.person;
        state.slidersTouched = false;
      } else if (!personInput.value.trim()) {
        try {
          const last = localStorage.getItem(STORAGE_KEYS.lastPerson) || '';
          if (last) personInput.value = last;
        } catch (_) {}
      }
    }
    renderVotePeopleOptions();
    syncExistingVoteIntoForm();
  }

  function syncExistingVoteIntoForm() {
    const weekSelect = document.getElementById('vote-week');
    const personInput = document.getElementById('vote-person');
    const commentInput = document.getElementById('vote-comment');
    const notice = document.getElementById('existing-vote-notice');
    const submitBtn = document.getElementById('submit-vote-btn');
    if (!weekSelect || !personInput) return;

    const weekNum = parseInt(weekSelect.value, 10);
    const person = personInput.value.trim().toLowerCase();
    const existing =
      Number.isFinite(weekNum) && person
        ? state.votes.find((v) => v.week === weekNum && v.person.trim().toLowerCase() === person)
        : null;

    if (notice) notice.hidden = !existing;
    if (submitBtn) submitBtn.textContent = existing ? 'Atualizar Avaliação' : 'Salvar Avaliação';

    if (existing && !state.slidersTouched) {
      CATEGORIES.forEach((cat) => setCategoryInputValue(cat.key, existing[cat.key]));
      if (commentInput) commentInput.value = existing.comment || '';
    }
  }

  // ---------- Mutations ----------
  async function handleVoteSubmit(e) {
    e.preventDefault();
    const weekSelect = document.getElementById('vote-week');
    const personInput = document.getElementById('vote-person');
    const commentInput = document.getElementById('vote-comment');
    const submitBtn = document.getElementById('submit-vote-btn');

    const weekNum = parseInt(weekSelect.value, 10);
    const person = personInput.value.trim();
    if (!Number.isFinite(weekNum)) {
      showToast('Cadastre ou selecione uma semana antes de votar.', 'error');
      return;
    }
    if (!person) {
      personInput.focus();
      showToast('Digite seu nome para registrar a nota.', 'error');
      return;
    }

    const votePayload = {
      action: 'submitVote',
      week: weekNum,
      person,
      sabor: clampScore(document.getElementById('range-sabor').value),
      recheio: clampScore(document.getElementById('range-recheio').value),
      maciez: clampScore(document.getElementById('range-maciez').value),
      docura: clampScore(document.getElementById('range-docura').value),
      comment: commentInput ? commentInput.value.trim() : ''
    };

    try {
      localStorage.setItem(STORAGE_KEYS.lastPerson, person);
    } catch (_) {}

    if (state.apiUrl) {
      submitBtn.disabled = true;
      const oldLabel = submitBtn.textContent;
      submitBtn.textContent = 'Salvando na planilha...';
      try {
        const res = await apiPost(state.apiUrl, votePayload);
        state.weeks = res.weeks;
        state.votes = res.votes;
        state.connectionStatus = 'connected';
        saveLocalData();
        state.slidersTouched = false;
        renderAll();
        const weekObj = state.weeks.find((w) => w.week === weekNum);
        showToast(
          `Nota de ${person} ${res.mode === 'updated' ? 'atualizada' : 'salva'} para ${weekObj ? weekObj.chocotone : `Semana ${weekNum}`}!`,
          'success'
        );
        switchTab('weeks', { weekNum });
      } catch (err) {
        state.connectionStatus = 'error';
        renderSyncStatus();
        showToast(`Erro ao salvar no Google Sheets: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = oldLabel;
      }
      return;
    }

    // Modo local
    const key = person.toLowerCase();
    const idx = state.votes.findIndex((v) => v.week === weekNum && v.person.trim().toLowerCase() === key);
    const voteObj = {
      week: weekNum,
      person,
      sabor: votePayload.sabor,
      recheio: votePayload.recheio,
      maciez: votePayload.maciez,
      docura: votePayload.docura,
      comment: votePayload.comment,
      updatedAt: new Date().toISOString()
    };

    if (idx >= 0) {
      state.votes[idx] = voteObj;
    } else {
      state.votes.push(voteObj);
    }
    saveLocalData();
    state.slidersTouched = false;
    renderAll();
    showToast(`Avaliação de ${person} salva localmente!`, 'success');
    switchTab('weeks', { weekNum });
  }

  async function deleteVote(weekNum, person) {
    if (state.apiUrl) {
      try {
        const res = await apiPost(state.apiUrl, { action: 'deleteVote', week: weekNum, person });
        state.weeks = res.weeks;
        state.votes = res.votes;
        saveLocalData();
        renderAll();
        showToast(`Avaliação de ${person} removida da planilha.`, 'success');
      } catch (err) {
        showToast(`Erro ao remover da planilha: ${err.message}`, 'error');
      }
      return;
    }

    state.votes = state.votes.filter(
      (v) => !(v.week === weekNum && v.person.trim().toLowerCase() === person.trim().toLowerCase())
    );
    saveLocalData();
    renderAll();
    showToast(`Avaliação de ${person} removida.`, 'success');
  }

  // ---------- Week Modal ----------
  function openWeekModal(existingWeek = null) {
    const title = document.getElementById('week-dialog-title');
    const numInput = document.getElementById('week-number-input');
    const chocInput = document.getElementById('week-chocotone-input');
    const brandInput = document.getElementById('week-brand-input');
    const notesInput = document.getElementById('week-notes-input');

    const maxWeek = state.weeks.reduce((max, w) => Math.max(max, w.week), 0);

    if (existingWeek) {
      state.editingWeekOriginal = existingWeek.week;
      title.textContent = `Editar Semana ${existingWeek.week}`;
      numInput.value = String(existingWeek.week);
      numInput.readOnly = true;
      chocInput.value = existingWeek.chocotone || '';
      brandInput.value = existingWeek.brand || '';
      notesInput.value = existingWeek.notes || '';
    } else {
      state.editingWeekOriginal = null;
      title.textContent = 'Nova Semana de Degustação';
      numInput.readOnly = false;
      numInput.value = String(maxWeek + 1);
      chocInput.value = '';
      brandInput.value = '';
      notesInput.value = '';
    }

    openDialog('week-dialog');
    chocInput.focus();
  }

  async function handleWeekSave(e) {
    e.preventDefault();
    const numInput = document.getElementById('week-number-input');
    const chocInput = document.getElementById('week-chocotone-input');
    const brandInput = document.getElementById('week-brand-input');
    const notesInput = document.getElementById('week-notes-input');
    const saveBtn = document.getElementById('save-week-btn');

    const weekNum = parseInt(numInput.value, 10);
    const chocotone = chocInput.value.trim();
    if (!Number.isFinite(weekNum) || weekNum < 1 || weekNum > 52) {
      showToast('Número da semana inválido (1 a 52).', 'error');
      return;
    }
    if (!chocotone) {
      chocInput.focus();
      showToast('Digite o nome do chocotone.', 'error');
      return;
    }

    const payload = {
      action: 'saveWeek',
      week: weekNum,
      chocotone,
      brand: brandInput.value.trim(),
      notes: notesInput.value.trim()
    };

    if (state.apiUrl) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';
      try {
        const res = await apiPost(state.apiUrl, payload);
        state.weeks = res.weeks;
        state.votes = res.votes;
        saveLocalData();
        closeDialog('week-dialog');
        state.selectedWeekFilter = weekNum;
        renderAll();
        showToast(`Semana ${weekNum} (${chocotone}) salva no Google Sheets!`, 'success');
      } catch (err) {
        showToast(`Erro ao salvar semana: ${err.message}`, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Semana';
      }
      return;
    }

    const idx = state.weeks.findIndex((w) => w.week === weekNum);
    const weekObj = {
      week: weekNum,
      chocotone: payload.chocotone,
      brand: payload.brand,
      notes: payload.notes
    };
    if (idx >= 0) state.weeks[idx] = weekObj;
    else state.weeks.push(weekObj);

    state.weeks.sort((a, b) => a.week - b.week);
    saveLocalData();
    closeDialog('week-dialog');
    state.selectedWeekFilter = weekNum;
    renderAll();
    showToast(`Semana ${weekNum} (${chocotone}) salva!`, 'success');
  }

  // ---------- Sheets & Backup Modal ----------
  function setSheetsInlineFeedback(html, type = 'info') {
    const box = document.getElementById('sheets-inline-feedback');
    if (!box) return;
    if (!html) {
      box.hidden = true;
      box.innerHTML = '';
      box.className = 'inline-feedback';
      return;
    }
    box.hidden = false;
    box.className = `inline-feedback is-${type}`;
    box.innerHTML = html;
  }

  function renderSheetsDialog() {
    const statusCard = document.getElementById('modal-connection-card');
    const urlInput = document.getElementById('apps-script-url-input');
    const pushBtn = document.getElementById('push-local-btn');
    const shareBtn = document.getElementById('copy-share-link-btn');
    const disconnectBtn = document.getElementById('disconnect-sheets-btn');

    if (urlInput) urlInput.value = state.apiUrl || '';
    setSheetsInlineFeedback('');

    if (statusCard) {
      if (state.apiUrl && state.connectionStatus === 'connected') {
        statusCard.className = 'setup-status-card is-connected';
        statusCard.innerHTML = `<strong>✅ Conectado ao Google Sheets</strong><br/>As notas e semanas são lidas e gravadas direto na planilha configurada.`;
      } else if (state.apiUrl && state.connectionStatus === 'error') {
        statusCard.className = 'setup-status-card';
        statusCard.innerHTML = `<strong>⚠️ Erro ao conectar com a URL informada</strong><br/>${escapeHtml(state.lastSyncError || 'Verifique se o Web App está implantado com acesso para "Qualquer pessoa".')}`;
      } else {
        statusCard.className = 'setup-status-card';
        statusCard.innerHTML = `<strong>💾 Modo Local ativo</strong><br/>Os dados estão salvos apenas neste navegador. Cole a URL do Apps Script abaixo para sincronizar com toda a equipe.`;
      }
    }

    const hasUrl = Boolean(state.apiUrl);
    if (pushBtn) pushBtn.hidden = !hasUrl;
    if (shareBtn) shareBtn.hidden = !hasUrl;
    if (disconnectBtn) disconnectBtn.hidden = !hasUrl;
  }

  async function handleConnectSheets() {
    const urlInput = document.getElementById('apps-script-url-input');
    const btn = document.getElementById('test-connect-btn');
    const validation = validateAppsScriptUrl(urlInput.value);

    if (!validation.ok) {
      setSheetsInlineFeedback(`<strong>Não foi possível validar a URL:</strong> ${escapeHtml(validation.reason)}`, 'error');
      showToast(validation.reason, 'error');
      return;
    }

    const url = validation.url;
    urlInput.value = url;
    setSheetsInlineFeedback('');

    btn.disabled = true;
    btn.textContent = 'Testando...';
    try {
      let effectiveUrl = url;
      let payload;
      try {
        const res = await apiGetAllSingle(url);
        payload = res.payload;
        effectiveUrl = res.effectiveUrl;
      } catch (firstErr) {
        if (/\/a\/macros\/[^/]+\/s\//i.test(url)) {
          const altUrl = url.replace(/\/a\/macros\/[^/]+\/s\//i, '/macros/s/');
          const res = await apiGetAllSingle(altUrl);
          payload = res.payload;
          effectiveUrl = res.effectiveUrl;
          urlInput.value = effectiveUrl;
        } else {
          throw firstErr;
        }
      }

      state.apiUrl = effectiveUrl;
      try {
        localStorage.setItem(STORAGE_KEYS.apiUrl, effectiveUrl);
      } catch (_) {}

      // Se a planilha retornou dados, atualiza localmente (se vazia, preserva local para o usuário poder enviar)
      if (payload.weeks.length > 0 || payload.votes.length > 0) {
        state.weeks = payload.weeks;
        state.votes = payload.votes;
        saveLocalData();
      }
      state.connectionStatus = 'connected';
      state.lastSyncError = '';
      renderAll();
      renderSheetsDialog();
      setSheetsInlineFeedback(
        `<strong>✅ Conectado com sucesso!</strong> Agora todas as notas são salvas direto na planilha.`,
        'success'
      );
      showToast('Conectado ao Google Sheets com sucesso!', 'success');
    } catch (err) {
      const msg = err && err.message ? err.message : 'Erro desconhecido';
      const sep = url.includes('?') ? '&' : '?';
      const testLink = `${url}${sep}action=getAll`;
      setSheetsInlineFeedback(
        `
          <strong>❌ Falha na conexão (${escapeHtml(msg)})</strong>
          <ul>
            <li><strong>Verifique a implantação:</strong> em <em>Apps Script → Implantar → Gerenciar implantações</em>, deixe <em>Quem pode acessar</em> como <strong>Qualquer pessoa</strong> (não "Somente eu" nem apenas dentro da empresa).</li>
            <li><strong>Conta Google Workspace da empresa:</strong> muitas empresas bloqueiam Web Apps públicos na conta corporativa e redirecionam para o login do Google (causando erro CORS / <code>Failed to fetch</code>).</li>
            <li><strong>Teste rápido:</strong> abra o link abaixo em uma <strong>aba anônima</strong>. Se pedir login do Google em vez de mostrar texto JSON <code>{"ok":true,...}</code>, a conta da empresa bloqueou o acesso público — nesse caso, implante em uma planilha no seu <code>@gmail.com</code> pessoal ou podemos usar Supabase.</li>
          </ul>
          <div class="inline-feedback-actions">
            <a href="${escapeHtml(testLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs">🔎 Abrir URL em nova aba</a>
          </div>
        `,
        'error'
      );
      showToast(`Falha na conexão: ${msg}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Testar e Conectar';
    }
  }

  async function handlePushLocalToSheets() {
    if (!state.apiUrl) return;
    const btn = document.getElementById('push-local-btn');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const res = await apiPost(state.apiUrl, {
        action: 'syncImport',
        weeks: state.weeks,
        votes: state.votes
      });
      state.weeks = res.weeks;
      state.votes = res.votes;
      saveLocalData();
      renderAll();
      renderSheetsDialog();
      showToast('Dados locais sincronizados com a planilha!', 'success');
    } catch (err) {
      showToast(`Erro ao enviar dados: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '⬆ Enviar dados locais para a planilha';
    }
  }

  async function handleCopyGasCode() {
    try {
      const res = await fetch('./apps-script/Code.gs', { cache: 'no-store' });
      if (!res.ok) throw new Error('Arquivo Code.gs não encontrado');
      const code = await res.text();
      await navigator.clipboard.writeText(code);
      showToast('Código Code.gs copiado para a área de transferência!', 'success');
    } catch (_) {
      showToast('Abra o arquivo ranking-natalino/apps-script/Code.gs para copiar o código.', 'info');
    }
  }

  function exportCsv() {
    const header = ['Semana', 'Chocotone', 'Pessoa', 'Sabor', 'Recheio', 'Maciez', 'Doçura', 'Média', 'Comentário'];
    const weekMap = new Map(state.weeks.map((w) => [w.week, w.chocotone]));
    const rows = [header];

    state.votes
      .slice()
      .sort((a, b) => a.week - b.week || a.person.localeCompare(b.person, 'pt-BR'))
      .forEach((v) => {
        const avg = round2(voteAverage(v));
        rows.push([
          v.week,
          weekMap.get(v.week) || `Semana ${v.week}`,
          v.person,
          v.sabor,
          v.recheio,
          v.maciez,
          v.docura,
          avg,
          v.comment || ''
        ]);
      });

    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    downloadFile('\uFEFF' + csv, 'ranking-natalino.csv', 'text/csv;charset=utf-8');
  }

  function exportJson() {
    const json = JSON.stringify({ weeks: state.weeks, votes: state.votes }, null, 2);
    downloadFile(json, 'ranking-natalino-backup.json', 'application/json;charset=utf-8');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = normalizePayload(JSON.parse(String(reader.result || '{}')));
        if (!parsed.weeks.length && !parsed.votes.length) {
          throw new Error('Nenhum dado válido encontrado no JSON.');
        }
        state.weeks = parsed.weeks;
        state.votes = parsed.votes;
        saveLocalData();
        if (state.apiUrl) {
          await handlePushLocalToSheets();
        } else {
          renderAll();
          showToast('Backup JSON importado com sucesso!', 'success');
        }
      } catch (err) {
        showToast(`Erro ao importar JSON: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Main Render ----------
  function renderAll() {
    renderSyncStatus();
    renderDashboard();
    renderWeeksPanel();
    if (state.activeTab === 'vote') {
      prepareVoteForm();
    } else {
      renderVoteWeekSelect();
      renderVotePeopleOptions();
    }
  }

  // ---------- Bootstrap ----------
  function bindEvents() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll('[data-action="go-weeks"]').forEach((btn) => {
      btn.addEventListener('click', () => switchTab('weeks'));
    });

    document.getElementById('quick-vote-btn')?.addEventListener('click', () => switchTab('vote'));
    document.getElementById('open-week-modal-btn')?.addEventListener('click', () => openWeekModal());
    document.getElementById('weeks-add-btn')?.addEventListener('click', () => openWeekModal());
    document.getElementById('inline-new-week-btn')?.addEventListener('click', () => openWeekModal());

    document.getElementById('sync-status-btn')?.addEventListener('click', () => {
      renderSheetsDialog();
      openDialog('sheets-dialog');
    });
    document.getElementById('banner-connect-btn')?.addEventListener('click', () => {
      renderSheetsDialog();
      openDialog('sheets-dialog');
    });
    document.getElementById('footer-config-btn')?.addEventListener('click', () => {
      renderSheetsDialog();
      openDialog('sheets-dialog');
    });
    document.getElementById('banner-dismiss-btn')?.addEventListener('click', () => {
      try {
        localStorage.setItem(STORAGE_KEYS.bannerDismissed, '1');
      } catch (_) {}
      renderSyncStatus();
    });

    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      syncFromSheets({ silent: false });
    });

    // Vote Form events
    const voteForm = document.getElementById('vote-form');
    voteForm?.addEventListener('submit', handleVoteSubmit);

    document.getElementById('vote-week')?.addEventListener('change', () => {
      state.slidersTouched = false;
      syncExistingVoteIntoForm();
    });

    document.getElementById('vote-person')?.addEventListener('input', () => {
      syncExistingVoteIntoForm();
      renderVotePeopleOptions();
    });

    document.getElementById('reset-vote-btn')?.addEventListener('click', () => {
      state.slidersTouched = false;
      CATEGORIES.forEach((cat) => setCategoryInputValue(cat.key, 7));
      const comment = document.getElementById('vote-comment');
      if (comment) comment.value = '';
      showToast('Notas redefinidas para 7.', 'info');
    });

    // Week Modal events
    document.getElementById('week-form')?.addEventListener('submit', handleWeekSave);

    // Sheets Modal events
    document.getElementById('test-connect-btn')?.addEventListener('click', handleConnectSheets);
    document.getElementById('push-local-btn')?.addEventListener('click', handlePushLocalToSheets);
    document.getElementById('copy-gas-code-btn')?.addEventListener('click', handleCopyGasCode);

    document.getElementById('copy-share-link-btn')?.addEventListener('click', async () => {
      if (!state.apiUrl) return;
      const shareUrl = `${window.location.origin}${window.location.pathname}?api=${encodeURIComponent(state.apiUrl)}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Link compartilhável copiado!', 'success');
      } catch (_) {
        showToast(shareUrl, 'info');
      }
    });

    document.getElementById('disconnect-sheets-btn')?.addEventListener('click', () => {
      try {
        localStorage.removeItem(STORAGE_KEYS.apiUrl);
      } catch (_) {}
      const cfgUrl = String(CONFIG.APPS_SCRIPT_URL || '').trim();
      state.apiUrl = isValidAppsScriptUrl(cfgUrl) ? cfgUrl : '';
      state.connectionStatus = state.apiUrl ? 'connected' : 'local';
      renderAll();
      renderSheetsDialog();
      showToast(
        cfgUrl
          ? 'Conexão local removida; URL padrão em config.js continua ativa.'
          : 'Desconectado do Google Sheets neste navegador.',
        'info'
      );
    });

    document.getElementById('export-csv-btn')?.addEventListener('click', exportCsv);
    document.getElementById('export-json-btn')?.addEventListener('click', exportJson);
    document.getElementById('import-json-input')?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      handleImportJson(file);
      e.target.value = '';
    });

    document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
      askConfirmation(
        'Restaurar os dados iniciais da planilha neste navegador? (Não apaga dados salvos no Google Sheets.)',
        () => {
          const seed = normalizePayload(cloneSeedData());
          state.weeks = seed.weeks;
          state.votes = seed.votes;
          saveLocalData();
          state.selectedWeekFilter = 'latest';
          renderAll();
          closeDialog('sheets-dialog');
          showToast('Dados iniciais restaurados localmente.', 'success');
        },
        'Restaurar'
      );
    });

    // Dialog close triggers & backdrop click
    document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
      btn.addEventListener('click', () => closeDialog(btn.dataset.closeDialog));
    });

    document.querySelectorAll('dialog.modal-dialog').forEach((dialog) => {
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
      });
    });

    document.getElementById('confirm-dialog-ok')?.addEventListener('click', () => {
      const fn = state.pendingConfirmAction;
      state.pendingConfirmAction = null;
      closeDialog('confirm-dialog');
      if (typeof fn === 'function') fn();
    });
  }

  function init() {
    loadLocalData();
    state.apiUrl = resolveInitialApiUrl();
    bindEvents();
    buildSlidersOnce();
    renderAll();

    if (state.apiUrl) {
      syncFromSheets({ silent: true });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
