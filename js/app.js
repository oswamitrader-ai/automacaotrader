// ============================================
// APP MODULE - Init & Orchestration
// ============================================

const App = (() => {

  function init() {
    UI.setupNavigation();
    UI.setupModals();
    UI.setupOperationForm();
    UI.setupFilters();
    UI.setupSettings();
    UI.setupGoals();
    UI.setupTableEvents();
    refresh();
    UI.navigateTo('bot');
  }

  function refresh() {
    // Como as telas de Dashboard e Operações foram removidas,
    // não precisamos recalcular ou renderizar tabelas e métricas gerais do dashboard no refresh,
    // evitando processamento desnecessário e chamadas nulas.
  }

  return { init, refresh };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  if (typeof Auth !== 'undefined') {
    Auth.init();
  }
});
