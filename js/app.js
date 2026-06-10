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
    if (!localStorage.getItem('__injectedCataloger4')) {
      setTimeout(() => {
        const mockData = {
          "operations": [
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T17:54:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :54", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T17:55:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :55", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T17:56:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :56", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T17:59:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :59", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:00:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :00", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:01:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :01", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:02:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :02", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:03:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :03", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:04:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :04", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:08:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :08", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:10:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :10", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:11:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :11", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:14:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :14", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:16:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :16", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:17:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :17", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:18:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :18", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:19:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :19", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:20:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :20", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:21:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :21", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:23:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :23", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:25:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :25", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:26:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :26", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:27:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :27", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:28:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :28", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:30:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :30", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:31:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :31", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:52:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :52", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:54:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :54", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:55:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :55", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T18:56:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :56", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T18:59:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :59", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:00:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :00", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:01:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :01", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:02:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :02", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:03:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :03", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:04:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :04", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:08:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :08", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:10:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :10", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:11:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :11", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:14:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :14", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:16:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :16", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:17:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :17", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:18:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :18", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:19:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :19", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:20:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :20", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:21:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :21", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:23:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :23", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:25:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :25", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "CALL", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:26:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :26", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:27:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :27", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:28:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :28", "notes": "Mão Base" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 9, "payout": 80, "result": "WIN", "date": "2026-06-09T19:30:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :30", "notes": "Soros Nível 1" },
            { "pair": "EUR/USD", "direction": "PUT", "amount": 5, "payout": 80, "result": "WIN", "date": "2026-06-09T19:31:00.000Z", "timeframe": "M1", "strategy": "Sempre no minuto :31", "notes": "Mão Base" }
          ]
        };
        Storage.clearAllOperations(); // Limpar a sujeira primeiro!
        mockData.operations.forEach(op => Storage.addOperation(op));
        localStorage.setItem('__injectedCataloger4', '1');
        
        // Recarregar a UI automaticamente após injetar
        const ops = Storage.getOperations();
        const settings = Storage.getSettings();
        const metrics = Metrics.calculate(ops, settings);
        UI.renderMetrics(metrics);
        UI.renderTable(ops);
        UI.renderAnalysis(metrics);
        UI.renderGoals(ops);
      }, 3500); // Esperar 3.5 segundos para garantir que o Supabase sync terminou
    }

    const ops = Storage.getOperations();
    const settings = Storage.getSettings();
    const metrics = Metrics.calculate(ops, settings);

    UI.renderMetrics(metrics);
    UI.renderTable(ops);
    UI.renderAnalysis(metrics);
    UI.renderGoals(ops);
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
