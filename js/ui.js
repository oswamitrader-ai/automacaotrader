// ============================================
// UI MODULE - DOM, Modals, Filters, Table
// ============================================

const UI = (() => {
  const PAIRS = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
    'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'NZD/USD', 'USD/CHF',
    'AUD/CAD', 'EUR/AUD', 'EUR/CAD', 'AUD/JPY', 'CAD/JPY',
  ];

  const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

  let currentPage = 1;
  const PAGE_SIZE = 15;
  let currentFilters = {};
  let editingId = null;

  // ---- Navigation ----

  function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (!page) return;
        navigateTo(page);
        // Close mobile sidebar
        document.querySelector('.sidebar')?.classList.remove('open');
      });
    });

    // Mobile toggle
    const toggle = document.getElementById('mobileToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
      });
    }
  }

  function navigateTo(page) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    // Update sections
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.getElementById('page-' + page)?.classList.add('active');

    // Update title
    const titles = {
      dashboard: '📊 <span>Dashboard</span>',
      operations: '📋 <span>Operações</span>',
      analysis: '🔬 <span>Análise</span>',
      goals: '🎯 <span>Metas</span>',
      settings: '⚙️ <span>Configurações</span>',
      bot: '🤖 <span>Robô de Automação</span>',
      cataloger: '🔍 <span>Catalogador Probabilístico</span>',
      backtest: '📊 <span>Backtesting e Simulação</span>'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.innerHTML = titles[page] || '';

    // Render charts when navigating to dashboard
    if (page === 'dashboard') {
      setTimeout(() => App.refresh(), 100);
    }
  }

  // ---- Modals ----

  function openModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
    if (id === 'operationModal') {
      editingId = null;
      document.getElementById('operationForm')?.reset();
      document.getElementById('modalTitle').textContent = 'Nova Operação';
      document.getElementById('btnSubmitOp').textContent = '💾 Salvar';
    }
  }

  function setupModals() {
    // Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal-overlay').classList.remove('active');
        editingId = null;
      });
    });

    // Overlay click close
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          editingId = null;
        }
      });
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => {
          m.classList.remove('active');
        });
        editingId = null;
      }
    });
  }

  // ---- Operation Form ----

  function setupOperationForm() {
    const form = document.getElementById('operationForm');
    if (!form) return;

    // Populate selects
    populateSelect('opPair', PAIRS);
    populateSelect('opTimeframe', TIMEFRAMES);

    // Default date/time
    const now = new Date();
    document.getElementById('opDate').value = now.toISOString().slice(0, 16);

    // Default payout from settings
    const settings = Storage.getSettings();
    document.getElementById('opPayout').value = settings.defaultPayout || 85;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveOperation();
    });

    // New operation button
    document.getElementById('btnNewOp')?.addEventListener('click', () => {
      editingId = null;
      form.reset();
      document.getElementById('opDate').value = new Date().toISOString().slice(0, 16);
      document.getElementById('opPayout').value = Storage.getSettings().defaultPayout || 85;
      document.getElementById('modalTitle').textContent = 'Nova Operação';
      document.getElementById('btnSubmitOp').textContent = '💾 Salvar';
      openModal('operationModal');
    });

    // Quick add from header
    document.getElementById('btnQuickAdd')?.addEventListener('click', () => {
      editingId = null;
      form.reset();
      document.getElementById('opDate').value = new Date().toISOString().slice(0, 16);
      document.getElementById('opPayout').value = Storage.getSettings().defaultPayout || 85;
      document.getElementById('modalTitle').textContent = 'Nova Operação';
      document.getElementById('btnSubmitOp').textContent = '💾 Salvar';
      openModal('operationModal');
    });
  }

  function saveOperation() {
    const pair = document.getElementById('opPair').value;
    const direction = document.getElementById('opDirection').value;
    const amount = parseFloat(document.getElementById('opAmount').value);
    const payout = parseFloat(document.getElementById('opPayout').value);
    const resultElement = document.querySelector('input[name="opResult"]:checked');
    const result = resultElement ? resultElement.value : null;
    const date = document.getElementById('opDate').value;
    const timeframe = document.getElementById('opTimeframe').value;
    const strategy = document.getElementById('opStrategy').value.trim();
    const notes = document.getElementById('opNotes').value.trim();

    if (!pair || !direction || !amount || !payout || !result || !date) {
      showToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }

    const data = { pair, direction, amount, payout, result, date, timeframe, strategy, notes };

    if (editingId) {
      Storage.updateOperation(editingId, data);
      showToast('Operação atualizada!', 'success');
    } else {
      Storage.addOperation(data);
      showToast('Operação registrada!', 'success');
    }

    closeModal('operationModal');
    App.refresh();
  }

  function editOperation(id) {
    const op = Storage.getOperationById(id);
    if (!op) return;

    editingId = id;
    document.getElementById('opPair').value = op.pair;
    document.getElementById('opDirection').value = op.direction;
    document.getElementById('opAmount').value = op.amount;
    document.getElementById('opPayout').value = op.payout;
    const radio = document.querySelector(`input[name="opResult"][value="${op.result}"]`);
    if (radio) radio.checked = true;
    document.getElementById('opDate').value = op.date;
    document.getElementById('opTimeframe').value = op.timeframe || '';
    document.getElementById('opStrategy').value = op.strategy || '';
    document.getElementById('opNotes').value = op.notes || '';
    document.getElementById('modalTitle').textContent = 'Editar Operação';
    document.getElementById('btnSubmitOp').textContent = '✏️ Atualizar';
    openModal('operationModal');
  }

  function deleteOperation(id) {
    if (!confirm('Excluir esta operação?')) return;
    Storage.deleteOperation(id);
    showToast('Operação excluída', 'info');
    App.refresh();
  }

  // ---- Render Metrics Cards ----

  function renderMetrics(metrics) {
    const settings = Storage.getSettings();
    const cur = settings.currency === 'USD' ? '$' : 'R$';
    const fmt = (v) => {
      if (v === undefined || v === null || isNaN(v)) return `${cur} 0.00`;
      return `${cur} ${v.toFixed(2)}`;
    };

    setMetric('metricTotalOps', metrics.totalOps || 0);
    setMetric('metricWins', metrics.winCount || 0);
    setMetric('metricLosses', metrics.lossCount || 0);
    setMetric('metricWinRate', (metrics.winRate || 0).toFixed(1) + '%');
    setMetric('metricNetProfit', fmt(metrics.netProfit));
    setMetric('metricCurrentBank', fmt(metrics.currentBank));
    setMetric('metricMaxWinStreak', metrics.maxWinStreak || 0);
    setMetric('metricMaxLossStreak', metrics.maxLossStreak || 0);

    // Sidebar bank
    const bankEl = document.getElementById('sidebarBank');
    if (bankEl) bankEl.textContent = fmt(metrics.currentBank);

    // Quick stats
    setQuickStat('qsTodayOps', (metrics.todayMetrics && metrics.todayMetrics.total) || 0);
    setQuickStat('qsTodayProfit', fmt(metrics.todayMetrics ? metrics.todayMetrics.profit : 0));
    setQuickStat('qsProfitFactor', metrics.profitFactor === Infinity ? '∞' : (metrics.profitFactor || 0).toFixed(2));
    setQuickStat('qsROI', (metrics.roi || 0).toFixed(1) + '%');

    // Net profit color
    const netProfitEl = document.getElementById('metricNetProfit');
    if (netProfitEl) {
      const card = netProfitEl.closest('.metric-card');
      if (card) {
        card.classList.remove('green', 'red');
        card.classList.add(metrics.netProfit >= 0 ? 'green' : 'red');
      }
    }
  }

  function setMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setQuickStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ---- Render Table ----

  function renderTable(operations) {
    const tbody = document.getElementById('operationsTableBody');
    if (!tbody) return;

    const cur = Storage.getSettings().currency === 'USD' ? '$' : 'R$';

    // Apply filters
    const filtered = Metrics.filterOperations(operations, currentFilters);

    // Sort by date desc
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Pagination
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(start, start + PAGE_SIZE);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="9" class="empty-state">
          <div class="icon">📭</div>
          <p>Nenhuma operação encontrada</p>
          <button class="btn btn-primary" id="btnRegisterFirstOp">➕ Registrar Primeira Operação</button>
        </td></tr>
      `;
    } else {
      tbody.innerHTML = pageItems.map(op => {
        const amount = op.amount || 0;
        const payout = op.payout || 0;
        const profitLoss = op.result === 'WIN' ? amount * (payout / 100) :
                           op.result === 'LOSS' ? -amount : 0;
        const plClass = profitLoss >= 0 ? 'text-green' : 'text-red';
        const resultBadge = op.result === 'WIN' ? 'badge-win' :
                            op.result === 'LOSS' ? 'badge-loss' : 'badge-draw';
        const dirBadge = op.direction === 'CALL' ? 'badge-call' : 'badge-put';
        const dateStr = new Date(op.date).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: '2-digit',
          hour: '2-digit', minute: '2-digit',
        });
        return `
          <tr>
            <td>${dateStr}</td>
            <td><strong>${op.pair}</strong></td>
            <td><span class="badge ${dirBadge}">${op.direction === 'CALL' ? '▲' : '▼'} ${op.direction}</span></td>
            <td>${cur} ${amount.toFixed(2)}</td>
            <td>${payout}%</td>
            <td><span class="badge ${resultBadge}">${op.result}</span></td>
            <td class="${plClass}"><strong>${profitLoss >= 0 ? '+' : ''}${cur} ${profitLoss.toFixed(2)}</strong></td>
            <td>${op.timeframe || '-'}</td>
            <td>
              <button class="btn btn-outline btn-sm btn-icon btn-edit" data-id="${op.id}" title="Editar">✏️</button>
              <button class="btn btn-outline btn-sm btn-icon btn-delete" data-id="${op.id}" title="Excluir">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Update count
    const countEl = document.getElementById('tableCount');
    if (countEl) countEl.textContent = `${filtered.length} operação(ões)`;

    // Render pagination
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    const container = document.getElementById('tablePagination');
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
        if (i === 3 || i === totalPages - 2) html += `<span class="text-muted">…</span>`;
        continue;
      }
      html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
    container.innerHTML = html;
  }

  function goToPage(page) {
    currentPage = page;
    renderTable(Storage.getOperations());
  }

  // ---- Filters ----

  function setupFilters() {
    // Populate filter selects
    const ops = Storage.getOperations();
    const pairs = [...new Set(ops.map(o => o.pair))].sort();
    const strategies = [...new Set(ops.map(o => o.strategy).filter(Boolean))].sort();

    populateFilterSelect('filterPair', pairs);
    populateFilterSelect('filterStrategy', strategies);

    // Filter events
    ['filterDateFrom', 'filterDateTo', 'filterPair', 'filterResult', 'filterDirection', 'filterStrategy'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', applyFilters);
    });

    // Clear filters
    document.getElementById('btnClearFilters')?.addEventListener('click', () => {
      ['filterDateFrom', 'filterDateTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      ['filterPair', 'filterResult', 'filterDirection', 'filterStrategy'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
      });
      currentFilters = {};
      currentPage = 1;
      renderTable(Storage.getOperations());
    });
  }

  function applyFilters() {
    currentFilters = {
      dateFrom: document.getElementById('filterDateFrom')?.value || '',
      dateTo: document.getElementById('filterDateTo')?.value || '',
      pair: document.getElementById('filterPair')?.value || 'all',
      result: document.getElementById('filterResult')?.value || 'all',
      direction: document.getElementById('filterDirection')?.value || 'all',
      strategy: document.getElementById('filterStrategy')?.value || 'all',
    };
    currentPage = 1;
    renderTable(Storage.getOperations());
  }

  // ---- Analysis Section ----

  function renderAnalysis(metrics) {
    const cur = Storage.getSettings().currency === 'USD' ? '$' : 'R$';
    const fmt = (v) => {
      if (v === undefined || v === null || isNaN(v)) return `${cur} 0.00`;
      return `${cur} ${v.toFixed(2)}`;
    };

    // Best/Worst pair
    const pairs = Object.entries(metrics.pairPerformance || {});
    if (pairs.length > 0) {
      pairs.sort((a, b) => b[1].profit - a[1].profit);
      setAnalysis('bestPair', pairs[0][0]);
      setAnalysis('bestPairProfit', fmt(pairs[0][1].profit), pairs[0][1].profit >= 0);
      setAnalysis('worstPair', pairs[pairs.length - 1][0]);
      setAnalysis('worstPairProfit', fmt(pairs[pairs.length - 1][1].profit), pairs[pairs.length - 1][1].profit >= 0);
    }

    // Best/Worst hour
    const hours = Object.entries(metrics.hourPerformance || {});
    if (hours.length > 0) {
      hours.sort((a, b) => b[1].profit - a[1].profit);
      setAnalysis('bestHour', hours[0][0]);
      setAnalysis('bestHourProfit', fmt(hours[0][1].profit), hours[0][1].profit >= 0);
      setAnalysis('worstHour', hours[hours.length - 1][0]);
      setAnalysis('worstHourProfit', fmt(hours[hours.length - 1][1].profit), hours[hours.length - 1][1].profit >= 0);
    }

    // Best/Worst weekday
    const days = Object.entries(metrics.weekdayPerformance || {});
    if (days.length > 0) {
      days.sort((a, b) => b[1].profit - a[1].profit);
      setAnalysis('bestDay', days[0][0]);
      setAnalysis('bestDayProfit', fmt(days[0][1].profit), days[0][1].profit >= 0);
      setAnalysis('worstDay', days[days.length - 1][0]);
      setAnalysis('worstDayProfit', fmt(days[days.length - 1][1].profit), days[days.length - 1][1].profit >= 0);
    }

    // Advanced metrics
    setAnalysis('analysisProfitFactor', metrics.profitFactor === Infinity ? '∞' : (metrics.profitFactor || 0).toFixed(2));
    setAnalysis('analysisPayoffRatio', (metrics.payoffRatio || 0).toFixed(2));
    setAnalysis('analysisExpectancy', fmt(metrics.expectancy), metrics.expectancy >= 0);
    setAnalysis('analysisAvgWin', fmt(metrics.avgProfit));
    setAnalysis('analysisAvgLoss', fmt(metrics.avgLoss));
    setAnalysis('analysisROI', (metrics.roi || 0).toFixed(1) + '%', metrics.roi >= 0);

    // Withdrawal calculator
    renderWithdrawCalc(metrics);
  }

  function setAnalysis(id, value, positive) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (positive !== undefined) {
      el.classList.remove('positive', 'negative');
      el.classList.add(positive ? 'positive' : 'negative');
    }
  }

  function renderWithdrawCalc(metrics) {
    const settings = Storage.getSettings();
    const cur = settings.currency === 'USD' ? '$' : 'R$';
    const grossProfit = metrics.grossProfit;
    const fee = settings.withdrawFee || 0;
    const feeAmount = grossProfit * (fee / 100);
    const netWithdraw = grossProfit - feeAmount;

    const el = document.getElementById('withdrawResult');
    if (!el) return;

    el.innerHTML = `
      <div class="withdraw-row">
        <span>Lucro Bruto</span>
        <span class="text-green">${cur} ${grossProfit.toFixed(2)}</span>
      </div>
      <div class="withdraw-row">
        <span>Taxa de Saque (${fee}%)</span>
        <span class="text-red">- ${cur} ${feeAmount.toFixed(2)}</span>
      </div>
      <div class="withdraw-row">
        <span>Prejuízo Total</span>
        <span class="text-red">- ${cur} ${metrics.grossLoss.toFixed(2)}</span>
      </div>
      <div class="withdraw-row">
        <span>Lucro Líquido Sacável</span>
        <span class="${metrics.netWithdrawable >= 0 ? 'text-green' : 'text-red'}">
          ${cur} ${metrics.netWithdrawable.toFixed(2)}
        </span>
      </div>
    `;
  }

  // ---- Settings ----

  function setupSettings() {
    const settings = Storage.getSettings();

    const el = (id) => document.getElementById(id);
    if (el('setCurrency')) el('setCurrency').value = settings.currency || 'BRL';
    if (el('setInitialBank')) el('setInitialBank').value = settings.initialBank;
    if (el('setWithdrawFee')) el('setWithdrawFee').value = settings.withdrawFee;
    if (el('setProfitGoal')) el('setProfitGoal').value = settings.profitGoal;
    if (el('setDailyStopLoss')) el('setDailyStopLoss').value = settings.dailyStopLoss;
    if (el('setDefaultPayout')) el('setDefaultPayout').value = settings.defaultPayout;
    if (document.getElementById('sysTwelveDataKey')) {
      document.getElementById('sysTwelveDataKey').value = settings.twelveDataKey || '';
    }

    document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      Storage.updateSettings({
        currency: el('setCurrency') ? el('setCurrency').value : 'BRL',
        initialBank: el('setInitialBank') ? parseFloat(el('setInitialBank').value) : 1000,
        withdrawFee: el('setWithdrawFee') ? parseFloat(el('setWithdrawFee').value) : 0,
        profitGoal: el('setProfitGoal') ? parseFloat(el('setProfitGoal').value) : 10,
        dailyStopLoss: el('setDailyStopLoss') ? parseFloat(el('setDailyStopLoss').value) : 10,
        defaultPayout: el('setDefaultPayout') ? parseFloat(el('setDefaultPayout').value) : 85,
        twelveDataKey: el('sysTwelveDataKey') ? el('sysTwelveDataKey').value.trim() : ''
      });
      showToast('Configurações salvas!', 'success');
      App.refresh();
    });

    // Export
    document.getElementById('btnExportJSON')?.addEventListener('click', () => {
      downloadFile('operacoes-binarias.json', Storage.exportData(), 'application/json');
      showToast('Dados exportados em JSON!', 'success');
    });

    document.getElementById('btnExportCSV')?.addEventListener('click', () => {
      const csv = Storage.exportCSV();
      if (!csv) { showToast('Nenhuma operação para exportar', 'error'); return; }
      downloadFile('operacoes-binarias.csv', csv, 'text/csv');
      showToast('Dados exportados em CSV!', 'success');
    });

    // Import
    document.getElementById('btnImportJSON')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (Storage.importData(ev.target.result)) {
            showToast('Dados importados com sucesso!', 'success');
            App.refresh();
            setupSettings(); // Reload settings fields
          } else {
            showToast('Erro ao importar dados', 'error');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });

    // Clear all
    document.getElementById('btnClearAll')?.addEventListener('click', () => {
      if (!confirm('⚠️ Tem certeza que deseja apagar TODAS as operações? Esta ação é irreversível!')) return;
      Storage.clearAllOperations();
      showToast('Todas as operações foram apagadas', 'info');
      App.refresh();
    });
  }

  // ---- Goals ----

  function setupGoals() {
    // Tab switching
    document.querySelectorAll('.goals-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.goals-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.goals-period-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('goals-' + tab.dataset.period)?.classList.add('active');
      });
    });

    // Goals form
    loadGoalsForm();
    document.getElementById('goalsForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      saveGoalsForm();
    });
  }

  function loadGoalsForm() {
    const goals = Storage.getGoals();
    const periods = ['Daily', 'Weekly', 'Monthly', 'Yearly'];
    const keys = ['daily', 'weekly', 'monthly', 'yearly'];
    periods.forEach((p, i) => {
      const g = goals[keys[i]];
      const el = (field) => document.getElementById(`goal${p}${field}`);
      if (el('Profit')) el('Profit').value = g.profitTarget || '';
      if (el('Loss')) el('Loss').value = g.lossLimit || '';
      if (el('Ops')) el('Ops').value = g.maxOps || '';
      if (el('WinRate')) el('WinRate').value = g.minWinRate || '';
    });
  }

  function saveGoalsForm() {
    const periods = ['Daily', 'Weekly', 'Monthly', 'Yearly'];
    const keys = ['daily', 'weekly', 'monthly', 'yearly'];
    periods.forEach((p, i) => {
      const el = (field) => document.getElementById(`goal${p}${field}`);
      Storage.updateGoals(keys[i], {
        profitTarget: parseFloat(el('Profit')?.value) || 0,
        lossLimit: parseFloat(el('Loss')?.value) || 0,
        maxOps: parseInt(el('Ops')?.value) || 0,
        minWinRate: parseFloat(el('WinRate')?.value) || 0,
      });
    });
    showToast('Metas salvas com sucesso!', 'success');
    App.refresh();
  }

  function renderGoals(operations) {
    const goals = Storage.getGoals();
    const progress = Metrics.calculateGoalsProgress(operations, goals);
    const periodNames = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' };
    const periodKeys = ['daily', 'weekly', 'monthly', 'yearly'];
    const cur = Storage.getSettings().currency === 'USD' ? '$' : 'R$';
    const fmt = (v) => {
      if (v === undefined || v === null || isNaN(v)) return `${cur} 0.00`;
      return `${cur} ${v.toFixed(2)}`;
    };
    let alerts = [];

    periodKeys.forEach(period => {
      const data = progress[period];
      const capPeriod = period.charAt(0).toUpperCase() + period.slice(1);

      // Summary
      const summaryEl = document.getElementById(`goalsSummary${capPeriod}`);
      if (summaryEl) {
        summaryEl.innerHTML = `
          <div class="goals-summary-item">
            <div class="goals-summary-label">Operações</div>
            <div class="goals-summary-value text-blue">${data.totalOps || 0}</div>
          </div>
          <div class="goals-summary-item">
            <div class="goals-summary-label">Wins</div>
            <div class="goals-summary-value text-green">${data.wins || 0}</div>
          </div>
          <div class="goals-summary-item">
            <div class="goals-summary-label">Losses</div>
            <div class="goals-summary-value text-red">${data.losses || 0}</div>
          </div>
          <div class="goals-summary-item">
            <div class="goals-summary-label">Win Rate</div>
            <div class="goals-summary-value text-purple">${(data.winRate || 0).toFixed(1)}%</div>
          </div>
          <div class="goals-summary-item">
            <div class="goals-summary-label">Lucro</div>
            <div class="goals-summary-value ${data.netProfit >= 0 ? 'text-green' : 'text-red'}">${fmt(data.netProfit)}</div>
          </div>
        `;
      }

      // Cards
      const cardsEl = document.getElementById(`goalsCards${capPeriod}`);
      if (cardsEl) {
        cardsEl.innerHTML = renderGoalCard('profit', '💰 Meta de Lucro', data.profit, fmt(data.profit.current), fmt(data.profit.target), 'green')
          + renderGoalCard('loss', '🛡️ Limite de Prejuízo', data.loss, fmt(data.loss.current), fmt(data.loss.limit), 'red')
          + renderGoalCard('ops', '📊 Máx. Operações', data.ops, data.ops.current, data.ops.max, 'blue')
          + renderGoalCard('winrate', '🎯 Win Rate Mínimo', data.winRate, (data.winRate.current || 0).toFixed(1) + '%', data.winRate.min + '%', 'purple');
      }

      // Alerts
      if (data.profit.status === 'achieved') {
        alerts.push({ type: 'success', msg: `🏆 Meta de lucro ${periodNames[period].toLowerCase()} atingida! (${fmt(data.profit.current)})` });
      }
      if (data.loss.status === 'exceeded') {
        alerts.push({ type: 'danger', msg: `⚠️ Limite de prejuízo ${periodNames[period].toLowerCase()} EXCEDIDO! (${fmt(data.loss.current)} / ${fmt(data.loss.limit)})` });
      } else if (data.loss.status === 'warning') {
        alerts.push({ type: 'warning', msg: `⚡ Prejuízo ${periodNames[period].toLowerCase()} próximo do limite (${fmt(data.loss.current)} / ${fmt(data.loss.limit)})` });
      }
      if (data.ops.status === 'exceeded') {
        alerts.push({ type: 'danger', msg: `🚫 Limite de operações ${periodNames[period].toLowerCase()} EXCEDIDO! (${data.ops.current} / ${data.ops.max})` });
      } else if (data.ops.status === 'warning') {
        alerts.push({ type: 'warning', msg: `⚡ Operações ${periodNames[period].toLowerCase()} próximas do limite (${data.ops.current} / ${data.ops.max})` });
      }
    });

    // Render alerts
    const alertsEl = document.getElementById('goalsAlerts');
    if (alertsEl) {
      alertsEl.innerHTML = alerts.map(a =>
        `<div class="goal-alert-banner ${a.type}">${a.msg}</div>`
      ).join('');
    }
  }

  function renderGoalCard(type, title, data, currentStr, targetStr, color) {
    const statusLabels = {
      'achieved': '✅ Atingida', 'close': '🔥 Quase lá', 'in-progress': '⏳ Em progresso',
      'safe': '✅ Seguro', 'warning': '⚠️ Atenção', 'exceeded': '🚫 Excedido',
      'below': '⬇️ Abaixo', 'inactive': '⏸️ Não definida',
    };
    const statusLabel = statusLabels[data.status] || data.status;
    const isInactive = !data.active;
    const progressColor = data.status === 'exceeded' || data.status === 'warning' ? 'red' :
                          data.status === 'achieved' ? 'green' : color;

    return `
      <div class="goal-card ${type}">
        <div class="goal-card-header">
          <div class="goal-card-title">${title}</div>
          <span class="goal-status-badge ${data.status}">${statusLabel}</span>
        </div>
        <div class="goal-values">
          <span class="goal-current">${isInactive ? '-' : currentStr}</span>
          <span class="goal-target">${isInactive ? '' : '/ ' + targetStr}</span>
        </div>
        <div class="goal-progress-bar">
          <div class="goal-progress-fill ${progressColor}" style="width: ${isInactive ? 0 : data.percent}%"></div>
        </div>
        <div class="goal-percent">${isInactive ? 'Meta não definida' : (data.percent || 0).toFixed(0) + '% concluído'}</div>
      </div>
    `;
  }

  // ---- Toast Notifications ----

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---- Helpers ----

  function populateSelect(id, options) {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Keep first option (placeholder)
    const first = sel.options[0];
    sel.innerHTML = '';
    if (first) sel.appendChild(first);
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    });
  }

  function populateFilterSelect(id, options) {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Keep "Todos" option
    const allOption = sel.options[0];
    sel.innerHTML = '';
    if (allOption) sel.appendChild(allOption);
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    });
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function setupTableEvents() {
    // Delegação de cliques na tabela de operações
    const tbody = document.getElementById('operationsTableBody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btnEdit = e.target.closest('.btn-edit');
        const btnDelete = e.target.closest('.btn-delete');
        const btnFirstOp = e.target.closest('#btnRegisterFirstOp');
        
        if (btnEdit) {
          const id = btnEdit.dataset.id;
          editOperation(id);
        } else if (btnDelete) {
          const id = btnDelete.dataset.id;
          deleteOperation(id);
        } else if (btnFirstOp) {
          openModal('operationModal');
        }
      });
    }

    // Delegação de cliques na paginação
    const paginationContainer = document.getElementById('tablePagination');
    if (paginationContainer) {
      paginationContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.pagination-btn');
        if (btn && !btn.hasAttribute('disabled')) {
          const page = parseInt(btn.dataset.page);
          if (!isNaN(page)) {
            goToPage(page);
          }
        }
      });
    }
  }

  return {
    setupNavigation,
    navigateTo,
    openModal,
    closeModal,
    setupModals,
    setupOperationForm,
    setupFilters,
    setupSettings,
    setupGoals,
    setupTableEvents,
    renderMetrics,
    renderTable,
    renderAnalysis,
    renderGoals,
    editOperation,
    deleteOperation,
    goToPage,
    showToast,
  };
})();
