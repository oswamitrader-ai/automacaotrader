// ============================================
// BOT MODULE - Automation Engine & Strategies
// ============================================

const Bot = (() => {
  const STORAGE_KEY = 'bo_bot_settings';
  
  const DEFAULT_SETTINGS = {
    active: false,
    broker: 'exnova',
    accountType: 'demo',
    entryAmount: 10,
    minPayout: 80,
    stopWin: 50,
    stopLoss: 50,
    martingales: 1,
    galeFactor: 2.0,
    sorosLevel: 0,
    mgmtType: 'martingale', // 'martingale', 'soros', 'sorosgale', 'cycles'
    cyclesConfig: 'C1: 10, 20\nC2: 15, 30\nC3: 25, 55',
    newsFilter3: true,
    newsFilter2: false,
    newsMinBefore: 15,
    newsMinAfter: 15,
    waitCycleBreak: true,
    strategy: 'signals_list',
    signalsList: '12:30;EUR/USD;CALL;M1\n12:45;GBP/USD;PUT;M1\n13:00;USD/JPY;CALL;M5'
  };

  let settings = { ...DEFAULT_SETTINGS };
  let activeConnections = [];
  let botInterval = null;
  let timerWorker = null;
  let simulatedMarketInterval = null;
  
  // Estado operacional do Robô
  let state = {
    currentGale: 0,
    currentSorosStage: 0,
    baseAmount: 10,
    nextAmount: 10,
    lastOperation: null,
    consecutiveLosses: 0,
    lastTickTime: null,
    // Histórico de velas simuladas para as estratégias MHI e Médias Móveis
    simulatedCandles: [],
    
    // Propriedades do gerenciamento de Ciclos
    cycles: [], // Array de arrays, ex: [[10, 20], [15, 30], [25, 55]]
    currentCycleIndex: 0, // Ciclo ativo
    currentStepIndex: 0,  // Passo ativo no ciclo
    inCyclesRecovery: false,
    patternCooldownPairs: {},
    
    // Propriedades do SorosGale
    prejuizoAcumuladoSorosGale: 0,
    inSorosGaleRecovery: false,
    sorosGaleStep: 0 // 0 = normal, 1 = recuperando Soros
  };

  // Inicialização
  function init() {
    loadSettings();
    setupUIEvents();
    setupExtensionListeners();
    startMarketDataFeed();
    checkConnectedBrokers();
    
    // Iniciar ticker de ping a cada 5 segundos para manter status da corretora atualizado
    setInterval(checkConnectedBrokers, 5000);

    // Inicialização da parte do calendário foi removida.
  }

  // Carregar configurações do LocalStorage
  function loadSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }

    // Preencher campos da UI
    const el = (id) => document.getElementById(id);
    if (el('botBroker')) el('botBroker').value = settings.broker;
    if (el('botAccountType')) el('botAccountType').value = settings.accountType;
    if (el('botEntryAmount')) el('botEntryAmount').value = settings.entryAmount;
    if (el('botMinPayout')) el('botMinPayout').value = settings.minPayout;
    if (el('botStopWin')) el('botStopWin').value = settings.stopWin;
    if (el('botStopLoss')) el('botStopLoss').value = settings.stopLoss;
    if (el('botMartingales')) el('botMartingales').value = settings.martingales;
    if (el('botGaleFactor')) el('botGaleFactor').value = settings.galeFactor;
    if (el('botSorosLevel')) el('botSorosLevel').value = settings.sorosLevel;
    if (el('botUseMartingale')) el('botUseMartingale').checked = settings.useMartingale !== false;
    if (el('botUseSoros')) el('botUseSoros').checked = settings.useSoros === true;
    if (el('botUseCycles')) el('botUseCycles').checked = settings.useCycles === true;
    if (el('botCyclesConfig')) el('botCyclesConfig').value = settings.cyclesConfig;
    if (el('botNewsFilter3')) el('botNewsFilter3').checked = settings.newsFilter3;
    if (el('botNewsFilter2')) el('botNewsFilter2').checked = settings.newsFilter2;
    if (el('botNewsMinBefore')) el('botNewsMinBefore').value = settings.newsMinBefore;
    if (el('botNewsMinAfter')) el('botNewsMinAfter').value = settings.newsMinAfter;
    if (el('botWaitCycleBreak')) el('botWaitCycleBreak').checked = settings.waitCycleBreak;
    if (el('botStrategy')) el('botStrategy').value = settings.strategy;
    if (el('botSignalsList')) el('botSignalsList').value = settings.signalsList;
    if (el('botToggle')) el('botToggle').checked = settings.active;

    state.baseAmount = settings.entryAmount;
    if (settings.mgmtType === 'cycles') {
      loadCyclesTable();
    } else {
      state.nextAmount = settings.entryAmount;
    }

    updateStrategyFields();
    updateMgmtFields();
    updateBotStatusUI();
    renderNewsTable();
    
    // Se a automação estava ligada quando recarregou a página, inicia o motor.
    if (settings.active) {
      logToConsole("🤖 ROBÔ ATIVADO automaticamente (estado salvo).", "success");
      startBotEngine();
    }
  }

  // Salvar configurações
  function saveSettings() {
    const el = (id) => document.getElementById(id);
    settings.broker = el('botBroker')?.value || 'exnova';
    settings.accountType = el('botAccountType')?.value || 'demo';
    settings.entryAmount = parseFloat(el('botEntryAmount')?.value) || 10;
    settings.minPayout = parseInt(el('botMinPayout')?.value) || 80;
    settings.stopWin = parseFloat(el('botStopWin')?.value) || 50;
    settings.stopLoss = parseFloat(el('botStopLoss')?.value) || 50;
    settings.martingales = parseInt(el('botMartingales')?.value) || 0;
    settings.galeFactor = parseFloat(el('botGaleFactor')?.value) || 2.0;
    settings.sorosLevel = parseInt(el('botSorosLevel')?.value) || 0;
    settings.useMartingale = el('botUseMartingale')?.checked ?? true;
    settings.useSoros = el('botUseSoros')?.checked ?? false;
    settings.useCycles = el('botUseCycles')?.checked ?? false;
    settings.cyclesConfig = el('botCyclesConfig')?.value || '';
    settings.newsFilter3 = el('botNewsFilter3')?.checked ?? true;
    settings.newsFilter2 = el('botNewsFilter2')?.checked ?? false;
    settings.newsMinBefore = parseInt(el('botNewsMinBefore')?.value) || 15;
    settings.newsMinAfter = parseInt(el('botNewsMinAfter')?.value) || 15;
    settings.waitCycleBreak = el('botWaitCycleBreak')?.checked ?? true;
    settings.strategy = el('botStrategy')?.value || 'signals_list';
    settings.signalsList = el('botSignalsList')?.value || '';
    settings.active = el('botToggle')?.checked || false;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    
    state.baseAmount = settings.entryAmount;
    if (settings.useCycles) {
      loadCyclesTable();
    }
    
    if (state.currentGale === 0 && state.currentSorosStage === 0 && !state.inCyclesRecovery && !state.inSorosGaleRecovery) {
      state.nextAmount = settings.entryAmount;
    }

    logToConsole(`Configurações de Gestão salvas.`, 'info');
  }

  // UI Event Handlers
  function setupUIEvents() {
    document.getElementById('botConfigForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings();
      UI.showToast('Configurações do Robô atualizadas!', 'success');
    });

    document.getElementById('botToggle')?.addEventListener('change', (e) => {
      settings.active = e.target.checked;
      saveSettings();
      updateBotStatusUI();
      
      if (settings.active) {
        logToConsole("🤖 ROBÔ ATIVADO. Iniciando monitoramento de mercado...", "success");
        startBotEngine();
      } else {
        logToConsole("🔴 ROBÔ DESATIVADO. Parando operações.", "warning");
        stopBotEngine();
      }
    });

    document.getElementById('botStrategy')?.addEventListener('change', () => {
      updateStrategyFields();
      saveSettings();
    });

    ['botUseMartingale', 'botUseSoros', 'botUseCycles'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        updateMgmtFields();
        saveSettings();
      });
    });

    // Evento de sync de calendário removido.

    document.getElementById('btnClearConsole')?.addEventListener('click', () => {
      const consoleLogs = document.getElementById('botConsoleLogs');
      if (consoleLogs) {
        consoleLogs.innerHTML = `
          <div class="log-entry">
            <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
            <span class="log-text log-info">Console limpo. Aguardando eventos...</span>
          </div>
        `;
      }
    });

    // Manual triggers
    document.getElementById('btnManualCall')?.addEventListener('click', () => triggerManualOrder('CALL'));
    document.getElementById('btnManualPut')?.addEventListener('click', () => triggerManualOrder('PUT'));

    // Calibration triggers
    document.getElementById('btnCalibrateCall')?.addEventListener('click', () => triggerCalibration('CALL'));
    document.getElementById('btnCalibratePut')?.addEventListener('click', () => triggerCalibration('PUT'));
    document.getElementById('btnCalibrateAmount')?.addEventListener('click', () => triggerCalibration('AMOUNT'));
  }

  function updateStrategyFields() {
    const strategy = document.getElementById('botStrategy')?.value;
    const signalsGroup = document.getElementById('botSignalsListGroup');
    const patternsGroup = document.getElementById('botPatternsListGroup');
    const manualGroup = document.getElementById('botManualButtonsGroup');
    const customGroup = document.getElementById('botCustomPatternGroup');
    const priceActionGroup = document.getElementById('botPriceActionGroup');

    if (signalsGroup) {
      signalsGroup.style.display = strategy === 'signals_list' ? 'block' : 'none';
    }
    if (patternsGroup) {
      patternsGroup.style.display = strategy === 'auto_pattern' ? 'block' : 'none';
    }
    if (manualGroup) {
      manualGroup.style.display = strategy === 'manual' || strategy === 'custom_pattern' || strategy === 'price_action' ? 'block' : 'none';
    }
    if (customGroup) {
      customGroup.style.display = strategy === 'custom_pattern' ? 'block' : 'none';
    }
    if (priceActionGroup) {
      priceActionGroup.style.display = strategy === 'price_action' ? 'block' : 'none';
    }
  }

  function updateBotStatusUI() {
    const dot = document.getElementById('botStatusDot');
    const text = document.getElementById('botStatusText');
    const isExtensionAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

    if (!settings.active) {
      dot.className = 'status-dot disconnected';
      text.textContent = 'Robô Inativo';
      return;
    }

    if (!isExtensionAvailable) {
      dot.className = 'status-dot connecting';
      text.textContent = 'Modo Simulado (Extensão não detectada)';
      return;
    }

    const connectedToBroker = activeConnections.some(c => c.broker === settings.broker);
    if (connectedToBroker) {
      dot.className = 'status-dot connected';
      text.textContent = `Conectado à ${settings.broker.toUpperCase()} (${settings.accountType.toUpperCase()})`;
    } else {
      dot.className = 'status-dot connecting';
      text.textContent = `Buscando aba da ${settings.broker.toUpperCase()}...`;
    }
  }

  // Logs no console neon do painel
  function logToConsole(message, type = 'info') {
    const consoleLogs = document.getElementById('botConsoleLogs');
    if (!consoleLogs) return;

    const time = new Date().toLocaleTimeString();
    const typeClass = `log-${type}`;
    const logEl = document.createElement('div');
    logEl.className = 'log-entry';
    logEl.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-text ${typeClass}">${escapeHTML(message)}</span>
    `;
    consoleLogs.appendChild(logEl);
    
    // Limitar logs a 100 linhas para performance
    while (consoleLogs.children.length > 100) {
      consoleLogs.removeChild(consoleLogs.firstChild);
    }

    // Scroll to bottom
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // ---- Comunicação da Extensão ----

  function setupExtensionListeners() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 1. Receber atualizações de status de conexão de corretoras
      if (message.action === "broker_status_update") {
        activeConnections = message.brokers;
        updateActiveConnectionsCount();
        updateBotStatusUI();
      }

      // 2. Receber resultado da corretora
      if (message.action === "save_bot_operation") {
        handleTradingResult(message.data);
      }
    });
  }

  function checkConnectedBrokers() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;

    chrome.runtime.sendMessage({ action: "get_connected_brokers" }, (response) => {
      if (response && response.brokers) {
        activeConnections = response.brokers;
        updateActiveConnectionsCount();
        updateBotStatusUI();
      }
    });
  }

  function updateActiveConnectionsCount() {
    const el = document.getElementById('botActiveConnections');
    if (el) {
      el.textContent = `${activeConnections.length} corretora(s) detectada(s)`;
    }
  }

  // ---- Motor do Robô (Lógica das Estratégias) ----

  function startBotEngine() {
    if (timerWorker) {
      timerWorker.terminate();
      timerWorker = null;
    }
    
    // Criar o script do Web Worker via Blob para rodar em thread separada de alta precisão.
    // Isso evita o throttling severo que o Chrome aplica no setInterval de abas em background.
    const blob = new Blob([`
      let interval = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (interval) clearInterval(interval);
          interval = setInterval(() => {
            self.postMessage('tick');
          }, 1000);
        } else if (e.data === 'stop') {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      };
    `], { type: 'application/javascript' });
    
    const workerURL = URL.createObjectURL(blob);
    timerWorker = new Worker(workerURL);
    
    timerWorker.onmessage = function(e) {
      if (e.data === 'tick') {
        runBotTick();
      }
    };
    
    timerWorker.postMessage('start');
  }

  function runBotTick() {
    if (!settings.active) return;
    
    const now = new Date();
    
    // 1. Estratégia de Lista de Sinais
    if (settings.strategy === 'signals_list') {
      checkSignalsList(now);
    }
    
    // 2. Estratégias Automáticas (MHI / Médias Móveis) baseadas nas velas
    if (now.getSeconds() === 0) { // Executa análise na abertura da nova vela (segundo 0)
      runAutomaticStrategies(now);
    }
  }

  function stopBotEngine() {
    if (timerWorker) {
      timerWorker.postMessage('stop');
      timerWorker.terminate();
      timerWorker = null;
    }
  }

  let lastExecutedSignalTime = null;
  let lastLoggedUpcoming = null;
  let executedSignalsInCurrentWindow = new Set();

  function checkSignalsList(now) {
    const seconds = now.getSeconds();
    
    let targetMin;
    let isDelayed = false;
    
    // O navegador pode "dormir" a aba do dashboard se o usuário não estiver nela, atrasando o setInterval.
    if (seconds >= 58) {
      targetMin = new Date(now.getTime() + 2000); 
    } else if (seconds <= 10) {
      targetMin = now; 
      isDelayed = true;
    } else {
      targetMin = new Date(now.getTime() + 60000); // Apenas para checar o próximo minuto no log visual
    }

    // Criar a string de hora de forma manual e blindada contra fuso-horários bizarros do OS
    const h = targetMin.getHours().toString().padStart(2, '0');
    const m = targetMin.getMinutes().toString().padStart(2, '0');
    const targetTimeStr = `${h}:${m}`;
    const isExecutionWindow = (seconds >= 58 || seconds <= 10);

    const textarea = document.getElementById('botSignalsList');
    const listText = textarea ? textarea.value : settings.signalsList;
    const lines = listText.split('\n');
    
    const parsedSignals = [];
    
    for (let line of lines) {
      if (!line.trim()) continue;
      // Suporta ponto e vírgula ou vírgula
      const parts = line.replace(/,/g, ';').split(';');
      if (parts.length >= 3) {
        const sigTime = parts[0].trim();
        const sigPair = parts[1].trim();
        const sigDirection = parts[2].trim().toUpperCase();
        const sigTimeframe = parts[3] ? parts[3].trim().toUpperCase() : 'M1';
        
        parsedSignals.push({
          time: sigTime,
          pair: sigPair,
          direction: sigDirection,
          timeframe: sigTimeframe,
          raw: line
        });
      }
    }
    
    // Ordenar os sinais cronologicamente por horário (HH:MM)
    parsedSignals.sort((a, b) => a.time.localeCompare(b.time));
    
    const validSignalsCount = parsedSignals.length;
    let nextSignal = null;

    // Achar o próximo sinal futuro na lista ordenada
    for (let sig of parsedSignals) {
      if (sig.time >= targetTimeStr) {
        nextSignal = `${sig.time} - ${sig.pair} (${sig.direction})`;
        break; // Como está ordenado, o primeiro que for >= é o mais próximo
      }
    }

    // Se mudou o minuto da janela de execução, limpa o controle de execuções daquela janela
    if (lastExecutedSignalTime !== targetTimeStr) {
      lastExecutedSignalTime = targetTimeStr;
      executedSignalsInCurrentWindow.clear();
    }

    for (let sig of parsedSignals) {
      // Avisar o usuário com 1 minuto de antecedência (só ocorre uma vez por sinal)
      if (!isExecutionWindow && sig.time === targetTimeStr && lastLoggedUpcoming !== targetTimeStr) {
        logToConsole(`[Atenção] Preparando para o sinal de ${sig.pair} às ${sig.time}...`, 'info');
        lastLoggedUpcoming = targetTimeStr;
      }

      // Executar o sinal
      const sigKey = `${sig.time}_${sig.pair}_${sig.direction}`;
      if (isExecutionWindow && sig.time === targetTimeStr && !executedSignalsInCurrentWindow.has(sigKey)) {
        executedSignalsInCurrentWindow.add(sigKey);
        
        if (isDelayed) {
          logToConsole(`[Aviso] Sinal acionado com pequeno atraso pelo navegador: ${sig.pair} às ${sig.time} -> ${sig.direction}`, 'warning');
        } else {
          logToConsole(`Sinal da lista identificado com precisão: ${sig.pair} às ${sig.time} -> ${sig.direction}`, 'success');
        }
        executeTradingOrder(sig.pair, sig.direction, sig.timeframe);
      }
    }
    
    // Update UI Status
    const parsedUI = document.getElementById('botParsedSignals');
    if (parsedUI) {
      if (validSignalsCount === 0) {
        parsedUI.innerHTML = `<span style="color:var(--text-red)">Nenhum sinal válido encontrado na caixa. Verifique o formato!</span>`;
      } else {
        parsedUI.innerHTML = `Sinais identificados: ${validSignalsCount} <br> <span style="color:var(--neon-green)">Próximo/Atual: ${nextSignal || 'Nenhum sinal futuro hoje'}</span>`;
      }
    }
  }

  // Estratégia 2: MHI e Média Móvel (Análise de velas do simulador)
  function runAutomaticStrategies(date) {
    if (settings.strategy === 'signals_list' || settings.strategy === 'manual') return;

    const min = date.getMinutes();
    
    // MHI 1: Analisa as cores das 3 últimas velas de 1min em blocos de 5 minutos (minutos 1, 2 e 3 do ciclo)
    // Faz a entrada na abertura do minuto 5 (fim da vela 4) seguindo a cor da minoria
    if (settings.strategy === 'mhi1') {
      const cycleStartMin = Math.floor(min / 5) * 5;
      
      // Analisar no minuto correspondente à entrada (segundo 0 do minuto final do ciclo)
      if (min % 5 === 4) {
        logToConsole(`Ciclo MHI 1 (5m): Executando análise no minuto ${min}...`, 'info');
        
        // Pega as velas referentes aos minutos passados do ciclo corrente (ex: se min=4, pega min 0, 1 e 2 do ciclo)
        const last3 = state.simulatedCandles.slice(-4, -1);
        if (last3.length === 3) {
          const greens = last3.filter(c => c.close > c.open).length;
          const reds = last3.filter(c => c.close < c.open).length;
          
          let direction = '';
          if (greens > reds) direction = 'CALL'; // Maioria é verde
          else if (reds > greens) direction = 'PUT'; // Maioria é vermelha
          
          if (direction) {
            logToConsole(`Padrão MHI 1 identificado (Wins: ${greens}G, ${reds}V) -> Entrada em ${direction}`, 'info');
            executeTradingOrder('EUR/USD', direction, 'M1');
          } else {
            logToConsole(`Padrão MHI 1 empatado (3 velas neutras). Nenhuma entrada realizada.`, 'warning');
          }
        }
      }
    }

    // MHI 2: Ciclo de 1 minuto (Entrada na minoria das últimas velas do ciclo rápido)
    if (settings.strategy === 'mhi2') {
      // Simula análise de tendências rápidas (velas das últimas 3 ordens do simulador)
      const last3 = state.simulatedCandles.slice(-3);
      if (last3.length === 3) {
        const greens = last3.filter(c => c.close > c.open).length;
        const reds = last3.filter(c => c.close < c.open).length;
        
        let direction = '';
        if (greens > reds) direction = 'CALL'; // Maioria é verde
        else if (reds > greens) direction = 'PUT'; // Maioria é vermelha

        if (direction) {
          logToConsole(`Padrão MHI 2 identificado (Ciclo Rápido 1m) -> Entrada em ${direction}`, 'info');
          executeTradingOrder('EUR/USD', direction, 'M1');
        }
      }
    }

    // Cruzamento de Médias Móveis
    if (settings.strategy === 'moving_average') {
      const prices = state.simulatedCandles.map(c => c.close);
      if (prices.length >= 21) {
        const ema9 = calculateSMA(prices.slice(-9), 9);
        const ema21 = calculateSMA(prices.slice(-21), 21);
        
        const prevPrices = prices.slice(0, -1);
        const prevEma9 = calculateSMA(prevPrices.slice(-9), 9);
        const prevEma21 = calculateSMA(prevPrices.slice(-21), 21);

        // Se a média rápida cruzou a lenta para cima -> CALL
        if (prevEma9 <= prevEma21 && ema9 > ema21) {
          logToConsole(`Cruzamento de Média Móvel (Rápida acima da Lenta) -> CALL no EUR/USD`, 'info');
          executeTradingOrder('EUR/USD', 'CALL', 'M1');
        } 
        // Se a média rápida cruzou para baixo -> PUT
        else if (prevEma9 >= prevEma21 && ema9 < ema21) {
          logToConsole(`Cruzamento de Média Móvel (Rápida abaixo da Lenta) -> PUT no EUR/USD`, 'info');
          executeTradingOrder('EUR/USD', 'PUT', 'M1');
        }
      }
    }

    // Padrão Personalizado (Custom Builder)
    if (settings.strategy === 'custom_pattern') {
      const pair = document.getElementById('botManualPair')?.value || 'EUR/USD';
      // Pegar as últimas 3 velas fechadas (excluindo a atual que está aberta)
      const closedCandles = state.simulatedCandles.slice(0, -1).slice(-3);
      if (closedCandles.length === 3) {
        const color1 = document.getElementById('customCandle1')?.value;
        const color2 = document.getElementById('customCandle2')?.value;
        const color3 = document.getElementById('customCandle3')?.value;
        const action = document.getElementById('customAction')?.value;

        const c1 = closedCandles[0].close >= closedCandles[0].open ? 'G' : 'R';
        const c2 = closedCandles[1].close >= closedCandles[1].open ? 'G' : 'R';
        const c3 = closedCandles[2].close >= closedCandles[2].open ? 'G' : 'R';

        if ((color1 === 'ANY' || color1 === c1) &&
            (color2 === 'ANY' || color2 === c2) &&
            (color3 === 'ANY' || color3 === c3)) {
          
          logToConsole(`[Padrão Customizado] Sequência detectada! Entrando com ${action} em ${pair}`, 'success');
          executeTradingOrder(pair, action, 'M1');
        }
      }
    }
  }

  function calculateSMA(data, period) {
    const sum = data.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  // Disparar Ordem Manual da UI do Robô
  function triggerManualOrder(direction) {
    if (!settings.active) {
      UI.showToast('Ative a automação do robô primeiro!', 'error');
      return;
    }
    const pair = document.getElementById('botManualPair')?.value || 'EUR/USD';
    logToConsole(`Disparo manual acionado: ${direction} em ${pair}`, 'info');
    executeTradingOrder(pair, direction, 'M1');
  }

  function triggerCalibration(direction) {
    if (!settings.active) {
      UI.showToast('Ative a automação do robô primeiro!', 'error');
      return;
    }
    const targetBrokerTab = activeConnections.find(c => c.broker === settings.broker);
    if (!targetBrokerTab) {
      UI.showToast('Corretora não conectada!', 'error');
      return;
    }
    const isExtensionAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    if (isExtensionAvailable) {
      const dirText = direction === 'CALL' ? 'ACIMA' : (direction === 'PUT' ? 'ABAIXO' : 'CAMPO DE VALOR');
      logToConsole(`[Calibragem] Vá para a aba da corretora e CLIQUE NO ${dirText}...`, 'info');
      chrome.runtime.sendMessage({
        action: "calibrate_order_button",
        targetTabId: targetBrokerTab.tabId,
        direction: direction
      }, (response) => {
        if (response && response.status === "success") {
          logToConsole(`Calibragem Concluída! Coordenadas gravadas (X: ${response.x}, Y: ${response.y}) para ${dirText}.`, 'success');
        } else {
          logToConsole(`Falha na calibragem: ${response ? response.error : 'Sem resposta'}`, 'error');
        }
      });
    }
  }

  // Executar Ordem real ou simulada
  function executeTradingOrder(pair, direction, timeframe) {
    // A checagem de notícias (Anti-loss) foi removida a pedido do usuário.

    let amount = Number(Number(state.nextAmount).toFixed(2));
    
    // FORÇAR A LEITURA DO PAINEL SE FOR A PRIMEIRA ENTRADA (Evita dessincronização)
    if (state.currentGale === 0 && state.currentSorosStage === 0 && !state.inCyclesRecovery) {
      const uiAmountEl = document.getElementById('botEntryAmount');
      if (uiAmountEl) {
        const uiAmount = parseFloat(uiAmountEl.value);
        if (!isNaN(uiAmount) && uiAmount > 0) {
          amount = Number(uiAmount.toFixed(2));
          state.baseAmount = amount; // Atualiza a base para garantir
        }
      }
    }

    const cur = Storage.getSettings().currency === 'USD' ? '$' : 'R$';
    const dirText = direction === 'CALL' ? 'ACIMA' : 'ABAIXO';
    logToConsole(`Enviando ordem: ${pair} -> ${dirText} | Valor: ${cur} ${(amount || 0).toFixed(2)} | Expiração: ${timeframe}`, 'info');

    const isExtensionAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    
    // Identificar a aba correta para multi-pares
    const brokerTabs = activeConnections.filter(c => c.broker === settings.broker);
    let targetBrokerTab = null;

    // Função para normalizar nome do par (remove traços, espaços e parênteses)
    // Isso permite que um sinal "EUR/USD-OTC" ache a aba "EUR/USD (OTC)"
    const normalizeStr = (str) => str.replace(/[-/() ]/g, '').toUpperCase();
    const normalizedPair = normalizeStr(pair);

    if (brokerTabs.length === 1) {
      // Apenas 1 aba aberta: usa ela (mesmo que o par do sinal seja diferente do par aberto)
      targetBrokerTab = brokerTabs[0];
      
      const cleanPair = pair.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const cleanTitle = (targetBrokerTab.title || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      
      const commonPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'USDCHF', 'EURGBP', 'EURCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'AUDCAD', 'AUDCHF', 'AUDJPY', 'GBPCAD', 'GBPCHF', 'GBPAUD', 'NZDJPY', 'CADJPY', 'EURCAD', 'EURAUD', 'CHFJPY', 'CADCHF'];
      const anotherPairInTitle = commonPairs.find(p => p !== cleanPair && cleanTitle.includes(p));
      
      if (anotherPairInTitle) {
        const displayPair = anotherPairInTitle.substring(0,3) + '/' + anotherPairInTitle.substring(3);
        logToConsole(`[Aviso] A ordem é para ${pair}, mas a aba atual está no par ${displayPair}. Abra o par correto na corretora!`, 'warning');
      }
    } else if (brokerTabs.length > 1) {
      // Múltiplas abas abertas! Roteamento inteligente pelo título da aba
      const cleanPair = pair.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); // EURUSD
      const cleanPairOTC = cleanPair + 'OTC'; // EURUSDOTC
      
      targetBrokerTab = brokerTabs.find(c => {
         const cleanTitle = (c.title || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
         return cleanTitle.includes(cleanPair) || cleanTitle.includes(cleanPairOTC);
      });
      
      if (!targetBrokerTab) {
        logToConsole(`🚨 [CANCELADO] Nenhuma aba da corretora aberta foi encontrada para o par ${pair}. Para evitar operar no par errado, a ordem foi cancelada. Abra o par ${pair} na corretora e recarregue a página!`, 'error');
        return; // ABORTAR ENVIO REAL
      }
    }

    // Se estiver rodando como Extensão E a corretora estiver conectada
    if (isExtensionAvailable && targetBrokerTab) {
      logToConsole(`[Extensão] Transmitindo ordem para a aba do par ${pair}...`, 'info');
      
      chrome.runtime.sendMessage({
        action: "execute_order",
        targetTabId: targetBrokerTab.tabId,
        direction: direction,
        amount: amount,
        payout: settings.minPayout,
        pair: pair,
        timeframe: timeframe,
        accountType: settings.accountType
      }, (response) => {
        if (response && response.status === "success") {
          logToConsole(`Ordem recebida pela corretora. Aguardando resultado da operação...`, 'success');
        } else {
          const errorMsg = response ? response.error : 'Sem resposta da corretora';
          logToConsole(`Falha ao injetar ordem na corretora: ${errorMsg}`, 'error');
        }
      });
    } else {
      // Se não houver extensão ou corretora conectada, abortar operação
      logToConsole(`🚨 [FALHA] A corretora (${settings.broker.toUpperCase()}) está desconectada. A ordem foi cancelada. Para operar na corretora real, verifique se a aba da corretora está aberta e atualizada (F5).`, 'error');
    }
  }

  // Simulador de trading local (Removido)
  function simulateLocalTradingResult(pair, direction, amount, timeframe) {
    // Função obsoleta. Removida para evitar simulações indesejadas.
  }

  // ---- Gerenciamento de Resultados (Martingale e Soros) ----

  function handleTradingResult(opData) {
    const prefix = opData.isSimulation ? '[Resultado Simulação]' : '[Resultado]';
    logToConsole(`${prefix} Operação finalizada no par ${opData.pair}: ${opData.result}!`, opData.result === 'WIN' ? 'success' : opData.result === 'LOSS' ? 'error' : 'warning');

    // 1. Salvar no Storage Geral do Dashboard (Apenas se for REAL)
    if (!opData.isSimulation) {
      Storage.addOperation(opData);
      App.refresh();
    }

    // 2. Aplicar gerenciamento flexível (Soros, Martingale, Ciclos)
    const cur = Storage.getSettings ? (Storage.getSettings().currency === 'USD' ? '$' : 'R$') : '$';

    if (settings.useCycles) {
      // CICLOS TÊM PRIORIDADE ABSOLUTA SE ATIVADOS
      if (opData.result === 'WIN') {
        state.consecutiveLosses = 0;
        state.currentCycleIndex = 0;
        state.currentStepIndex = 0;
        state.inCyclesRecovery = false;
        
        if (state.cycles.length > 0) {
          state.nextAmount = state.cycles[0][0];
        } else {
          state.nextAmount = state.baseAmount;
        }
        logToConsole(`[Ciclos] WIN detectado! Ciclo resetado para o início. Próxima entrada: ${cur} ${state.nextAmount.toFixed(2)}`, 'success');
      } else if (opData.result === 'LOSS') {
        state.consecutiveLosses++;
        
        // Avançar passo no ciclo atual
        if (state.cycles.length > 0 && state.currentCycleIndex < state.cycles.length) {
          state.currentStepIndex++;
          const currentCycleArray = state.cycles[state.currentCycleIndex];
          
          if (state.currentStepIndex < currentCycleArray.length) {
             state.nextAmount = currentCycleArray[state.currentStepIndex];
             logToConsole(`[Ciclos] LOSS. Avançando mão no Ciclo ${state.currentCycleIndex + 1}. Próxima entrada: ${cur} ${state.nextAmount.toFixed(2)}`, 'warning');
          } else {
             state.currentCycleIndex++;
             state.currentStepIndex = 0;
             if (state.currentCycleIndex < state.cycles.length) {
                state.nextAmount = state.cycles[state.currentCycleIndex][0];
                logToConsole(`[Ciclos] LOSS. Ciclo falhou. Pulando para o Ciclo ${state.currentCycleIndex + 1}. Próxima entrada: ${cur} ${state.nextAmount.toFixed(2)}`, 'warning');
             } else {
                state.currentCycleIndex = 0;
                state.nextAmount = state.cycles[0][0];
                logToConsole(`[Ciclos] LOSS. Todos os Ciclos falharam (STOP). Resetando para o início. Próxima entrada: ${cur} ${state.nextAmount.toFixed(2)}`, 'error');
             }
          }
        }
      } else {
        logToConsole(`[Ciclos] Empate. Repetindo a entrada: ${cur} ${state.nextAmount.toFixed(2)}`, 'info');
      }
      return; // Se estiver em Ciclos, ignora Soros/Gale
    }

    // LÓGICA FLEXÍVEL (SOROS + MARTINGALE)
    if (opData.result === 'WIN') {
      state.consecutiveLosses = 0;
      state.currentGale = 0; // Win reseta o Gale
      
      if (settings.useSoros) {
        if (settings.sorosLevel > 0 && state.currentSorosStage < settings.sorosLevel) {
          state.currentSorosStage++;
          const profit = opData.amount * (opData.payout / 100);
          state.nextAmount = Number((opData.amount + profit).toFixed(2));
          logToConsole(`[Soros] WIN! Alavancando para nível ${state.currentSorosStage}. Próxima entrada: ${cur} ${state.nextAmount.toFixed(2)}`, 'success');
        } else {
          state.currentSorosStage = 0;
          state.nextAmount = state.baseAmount;
          logToConsole(`[Soros] Ciclo de Soros finalizado com sucesso! Retornando para mão base: ${cur} ${state.nextAmount.toFixed(2)}`, 'success');
        }
      } else {
        state.nextAmount = state.baseAmount;
      }
    } else if (opData.result === 'LOSS') {
      state.consecutiveLosses++;
      
      if (settings.useMartingale && state.currentGale < settings.martingales) {
        state.currentGale++;
        state.nextAmount = Number((opData.amount * settings.galeFactor).toFixed(2));
        logToConsole(`[Martingale] LOSS! Aplicando Gale nível ${state.currentGale} imediatamente na próxima vela.`, 'warning');
        // Disparar a operação do Gale IMEDIATAMENTE
        executeTradingOrder(opData.pair, opData.direction, opData.timeframe);
      } else {
        state.currentGale = 0;
        state.currentSorosStage = 0;
        state.nextAmount = state.baseAmount;
        if (settings.useMartingale && settings.martingales > 0) {
          logToConsole(`[Martingale] LOSS! Limite de Gale atingido. Resetando para mão base: ${cur} ${state.nextAmount.toFixed(2)}`, 'error');
        } else {
          logToConsole(`[Gestão] LOSS! Mão de recuperação não ativa. Retornando para mão base: ${cur} ${state.nextAmount.toFixed(2)}`, 'info');
        }
      }
    } else if (opData.result === 'DRAW' || opData.result === 'DRAWN') {
      logToConsole(`[Gestão] Empate detectado. Repetindo a mesma entrada de: ${cur} ${opData.amount.toFixed(2)}`, 'info');
      state.nextAmount = opData.amount;
    } else {
      state.nextAmount = state.baseAmount;
    }

    // 3. Checar Stop Win e Stop Loss Automáticos
    if (typeof Metrics !== 'undefined' && settings.active) {
      const ops = Storage.getOperations();
      const dbSettings = Storage.getSettings();
      const metrics = Metrics.calculate(ops, dbSettings);
      const todayProfit = metrics.todayMetrics.netProfit;
      
      const cur = dbSettings.currency === 'USD' ? '$' : 'R$';
      
      if (settings.stopWin > 0 && todayProfit >= settings.stopWin) {
        logToConsole(`[META BATIDA] Stop Win alcançado! Lucro de ${cur} ${todayProfit.toFixed(2)}. Parando robô...`, 'success');
        document.getElementById('botToggle')?.click(); // Desliga o robô
      } else if (settings.stopLoss > 0 && todayProfit <= -Math.abs(settings.stopLoss)) {
        logToConsole(`[STOP LOSS] Limite de prejuízo diário atingido! Prejuízo de ${cur} ${todayProfit.toFixed(2)}. Parando robô para proteção...`, 'error');
        document.getElementById('botToggle')?.click(); // Desliga o robô
      }
    }
  }

  // ---- Simulador e Captura de Mercado Real (API Binance) ----

  const BINANCE_SYMBOLS = {
    'EUR/USD': 'EURUSDT',
    'GBP/USD': 'GBPUSDT',
    'USD/JPY': 'USDJPY', // Alguns podem não estar nativos, mas usamos proxy
    'AUD/USD': 'AUDUSDT',
  };

  function parsePatternsList() {
    const raw = document.getElementById('botPatternsList')?.value || '';
    const lines = raw.split('\n');
    const patterns = [];
    lines.forEach(line => {
      const parts = line.split(';');
      if (parts.length >= 4) {
        patterns.push({
          pattern: parts[0].trim(),
          pair: parts[1].trim(),
          direction: parts[2].trim().toUpperCase(),
          timeframe: parts[3].trim().toUpperCase()
        });
      }
    });
    
    const parsedUI = document.getElementById('botParsedPatterns');
    if (parsedUI) {
      if (patterns.length === 0) {
        parsedUI.innerHTML = `<span style="color:var(--text-red)">Nenhum padrão válido encontrado.</span>`;
      } else {
        parsedUI.innerHTML = `Padrões identificados: ${patterns.length} <br> <span style="color:var(--text-muted)">Robô monitorando o mercado ao vivo...</span>`;
      }
    }
    
    return patterns;
  }

  async function startMarketDataFeed() {
    logToConsole('Iniciando feed de mercado...', 'info');
    const isExtensionAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;

    // Iniciar loop de polling
    simulatedMarketInterval = setInterval(async () => {
      if (!settings.active) return;
      
      let targets = [];
      let activePatterns = [];
      
      if (settings.strategy === 'auto_pattern') {
         activePatterns = parsePatternsList();
         if (activePatterns.length === 0) return;
         
         const uniquePairs = [...new Set(activePatterns.map(p => p.pair))];
         targets = uniquePairs.map(p => ({ 
           pair: p, 
           // Usa o timeframe do primeiro padrão daquele par, simplificação.
           interval: activePatterns.find(x => x.pair === p).timeframe.toLowerCase() 
         }));
      } else {
         const pair = document.getElementById('botManualPair')?.value || 'EUR/USD';
         let interval = '1m';
         if (settings.strategy === 'price_action') {
           interval = document.getElementById('paTimeframe')?.value || '5m';
         }
         targets = [{ pair, interval }];
      }

      await Promise.all(targets.map(async (target) => {
        const isOTC = target.pair.endsWith('-OTC');
        const symbol = BINANCE_SYMBOLS[target.pair];
        
        // Se for par OTC ou não tiver suporte na Binance, buscar da corretora via extensão
        if (isOTC || !symbol) {
          if (isExtensionAvailable) {
            try {
              // Solicitar candles da corretora através do background
              const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                  action: "fetch_otc_candles",
                  pair: target.pair,
                  timeframe: target.interval,
                  limit: 20 // 20 velas são suficientes para monitorar os padrões (máximo 8 velas fechadas)
                }, (res) => resolve(res));
              });
              
              if (response && response.status === "success" && Array.isArray(response.candles)) {
                // Converter string de data para objeto Date e garantir que isClosed exista
                const newCandles = response.candles.map((c, index) => ({
                  ...c,
                  time: new Date(c.time),
                  isClosed: c.isClosed !== undefined ? c.isClosed : (index < response.candles.length - 1)
                }));
                
                if (targets.length === 1) {
                  state.simulatedCandles = newCandles;
                }
                
                if (settings.strategy === 'auto_pattern') {
                  runAutoPatternEngine(target.pair, newCandles, activePatterns);
                } else if (settings.strategy === 'price_action') {
                  runPriceActionEngine(newCandles, target.pair, target.interval);
                }
              }
            } catch (err) {
              // Silenciar erros de comunicação periódica
            }
          }
          return;
        }

        // Se for par normal da Binance, buscar via API Binance
        try {
          const limit = settings.strategy === 'price_action' ? 50 : 10;
          const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${target.interval}&limit=${limit}`);
          const data = await res.json();
          
          if (data && data.length > 0) {
            const newCandles = data.map(k => ({
              time: new Date(k[0]),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              isClosed: k[6] < Date.now()
            }));
            
            // Retrocompatibilidade para single-pair
            if (targets.length === 1) {
              state.simulatedCandles = newCandles;
            }
            
            if (settings.strategy === 'auto_pattern') {
              runAutoPatternEngine(target.pair, newCandles, activePatterns);
            } else if (settings.strategy === 'price_action') {
              runPriceActionEngine(newCandles, target.pair, target.interval);
            } else {
              // Log heartbeat para estratégias single
              const now = new Date();
              if (now.getSeconds() === 0) {
                 const lastClosed = newCandles[newCandles.length - 2]; 
                 if (lastClosed) {
                   const cType = lastClosed.close >= lastClosed.open ? 'VERDE' : 'VERMELHA';
                   console.log(`[Mercado Real] Vela fechada em ${target.pair}: ${lastClosed.close.toFixed(5)} (${cType})`);
                 }
              }
            }
          }
        } catch (err) {
          // Silent catch to prevent console flood
        }
      }));
    }, 2000); // Poll a cada 2s
  }

  let lastAutoPatternTimeByPair = {};

  function runAutoPatternEngine(pair, candles, allPatterns) {
    // Filtra regras específicas para este par
    const rules = allPatterns.filter(p => p.pair === pair);
    if (rules.length === 0) return;

    // Pegar apenas as fechadas
    const closedCandles = candles.filter(c => c.isClosed);
    if (closedCandles.length < 5) return;

    // Verificar se o cooldown de quebra de ciclo está ativo para este par
    const lastClosed = closedCandles[closedCandles.length - 1];
    const lastClosedColor = lastClosed.close >= lastClosed.open ? 'G' : 'R';
    if (settings.waitCycleBreak && state.patternCooldownPairs && state.patternCooldownPairs[pair]) {
      if (lastClosedColor !== state.patternCooldownPairs[pair]) {
        delete state.patternCooldownPairs[pair];
        logToConsole(`[Filtro Ciclo] Sequência quebrada no par ${pair}. Padrão reativado.`, 'info');
      } else {
        // Ignora análise enquanto a sequência de cor não for rompida
        return;
      }
    }

    const currentCandle = candles[candles.length - 1];
    if (!currentCandle || !currentCandle.time) return;

    // Evita entrar mais de 1 vez na mesma vela de sinal
    const currentTickTime = currentCandle.time.getTime();
    if (lastAutoPatternTimeByPair[pair] === currentTickTime) return;

    // Constrói a sequência das últimas velas fechadas
    let recentColors = '';
    closedCandles.slice(-8).forEach(c => {
       recentColors += c.close >= c.open ? 'G' : 'R';
    });
    const displaySeq = recentColors.replace(/G/g, '🟩').replace(/R/g, '🟥');

    for (let rule of rules) {
      const pLength = rule.pattern.length;
      // Pega os ultimos X caracteres que correspondem ao tamanho do padrao
      const tailColors = recentColors.slice(-pLength);
      
      // O Padrão no array (rule.pattern) está no formato GRG (ou GGG, etc)
      if (tailColors === rule.pattern) {
        logToConsole(`[Catalogador Dinâmico] Padrão ${rule.pattern} detectado em ${pair}! Entrando com ${rule.direction}`, 'success');
        lastAutoPatternTimeByPair[pair] = currentTickTime;

        // Ativar cooldown se configurado
        if (settings.waitCycleBreak) {
          if (!state.patternCooldownPairs) state.patternCooldownPairs = {};
          // A cor que precisa quebrar é a cor da última vela do padrão
          state.patternCooldownPairs[pair] = rule.pattern[rule.pattern.length - 1];
        }

        executeTradingOrder(pair, rule.direction, rule.timeframe);
        break; // Não avalia mais regras para este par neste tick
      }
    }
  }

  // --- MOTOR DE PRICE ACTION E FRACTAIS ---
  let lastPaCandleTime = 0;

  function runPriceActionEngine(candles, pair, interval) {
    if (candles.length < 10) return;

    const sensitivity = parseInt(document.getElementById('paSensitivity')?.value) || 5;
    const timeFilterMinutes = parseFloat(document.getElementById('paTimeFilter')?.value) || 3.0;
    const mode = document.getElementById('paMode')?.value || 'retraction';
    const timeframeMins = interval === '15m' ? 15 : 5;

    // Calcular Fractais (Zonas de S/R) excluindo a vela atual (que está em formação)
    const closedCandles = candles.slice(0, -1);
    const supports = [];
    const resistances = [];
    const halfSens = Math.floor(sensitivity / 2); // Para 5, é 2.

    for (let i = halfSens; i < closedCandles.length - halfSens; i++) {
      let isSupport = true;
      let isResistance = true;
      const centerCandle = closedCandles[i];

      for (let j = i - halfSens; j <= i + halfSens; j++) {
        if (i === j) continue;
        if (closedCandles[j].low <= centerCandle.low) isSupport = false;
        if (closedCandles[j].high >= centerCandle.high) isResistance = false;
      }

      if (isSupport) supports.push(centerCandle.low);
      if (isResistance) resistances.push(centerCandle.high);
    }

    const currentCandle = candles[candles.length - 1];
    const currentPrice = currentCandle.close;

    // Evita entrar mais de 1 vez na mesma vela
    if (lastPaCandleTime === currentCandle.time.getTime()) return;

    // Filtro de Tempo (Tempo limite para a entrada)
    const elapsedMs = Date.now() - currentCandle.time.getTime();
    const elapsedMinutes = elapsedMs / 60000;
    if (elapsedMinutes > timeFilterMinutes) return;

    // Filtros Avançados
    const trendFilter = document.getElementById('paTrendFilter')?.value || 'none';
    const distanceFilter = document.getElementById('paDistanceFilter')?.value || 'none';

    let currentSma = null;
    if (trendFilter !== 'none') {
      const period = trendFilter === 'sma20' ? 20 : 50;
      if (closedCandles.length >= period) {
        currentSma = calculateSMA(closedCandles.slice(-period).map(c => c.close), period);
      }
    }

    if (distanceFilter === 'stretch') {
      // Exigir pelo menos 20 pipetes de distância do open para confirmar "esticamento"
      const moveDistance = Math.abs(currentPrice - currentCandle.open);
      if (moveDistance < 0.00020) return;
    }

    // Lógica de Retração: Tocar na linha e entrar pra mesma vela
    if (mode === 'retraction') {
      const margin = 0.00005; // Margem de erro do toque (5 pipetes)
      
      const touchedSupport = supports.find(s => currentPrice <= s + margin && currentPrice >= s - margin);
      if (touchedSupport) {
        // Filtro de Tendência: se a tendência for de baixa (preço < SMA), aborta o CALL em suporte
        if (currentSma && currentPrice < currentSma) return;
        
        logToConsole(`[Price Action] Retração de SUPORTE detectada no par ${pair}! Entrando CALL...`, 'success');
        lastPaCandleTime = currentCandle.time.getTime();
        executeTradingOrder(pair, 'CALL', interval === '15m' ? 'M15' : 'M5');
        return;
      }

      const touchedResistance = resistances.find(r => currentPrice >= r - margin && currentPrice <= r + margin);
      if (touchedResistance) {
        // Filtro de Tendência: se a tendência for de alta (preço > SMA), aborta o PUT em resistência
        if (currentSma && currentPrice > currentSma) return;

        logToConsole(`[Price Action] Retração de RESISTÊNCIA detectada no par ${pair}! Entrando PUT...`, 'success');
        lastPaCandleTime = currentCandle.time.getTime();
        executeTradingOrder(pair, 'PUT', interval === '15m' ? 'M15' : 'M5');
        return;
      }
    } else if (mode === 'false_breakout') {
      // Falso Rompimento: Preço rompeu forte a zona, mas retraiu de volta cruzando a linha
      // Para simular isso, vamos ver se a vela atual tem um pavio longo que cruzou a linha, mas o preço atual recuou.
      const margin = 0.00002;
      
      // Falso rompimento de Suporte (Preço desceu muito, fez mínima abaixo do suporte, e agora subiu cruzando o suporte de volta)
      const fbSupport = supports.find(s => currentCandle.low < s - 0.00010 && currentPrice >= s - margin && currentPrice <= s + margin * 3);
      if (fbSupport) {
        logToConsole(`[Price Action] Falso Rompimento de SUPORTE confirmado em ${pair}! Entrando CALL...`, 'success');
        lastPaCandleTime = currentCandle.time.getTime();
        executeTradingOrder(pair, 'CALL', interval === '15m' ? 'M15' : 'M5');
        return;
      }

      // Falso rompimento de Resistência (Preço subiu muito, fez máxima acima da resistência, e agora desceu cruzando de volta)
      const fbResistance = resistances.find(r => currentCandle.high > r + 0.00010 && currentPrice <= r + margin && currentPrice >= r - margin * 3);
      if (fbResistance) {
        logToConsole(`[Price Action] Falso Rompimento de RESISTÊNCIA confirmado em ${pair}! Entrando PUT...`, 'success');
        lastPaCandleTime = currentCandle.time.getTime();
        executeTradingOrder(pair, 'PUT', interval === '15m' ? 'M15' : 'M5');
        return;
      }
    }
  }

  let simPrice = 1.08250;
  function generateSimulatedCandle() {
    const now = new Date();
    // Lógica antiga do simulador movida para cá como fallback
    if (state.simulatedCandles.length === 0) {
      for (let i = 0; i < 10; i++) {
        state.simulatedCandles.push({
          open: simPrice, high: simPrice, low: simPrice, close: simPrice, time: new Date(Date.now() - (10 - i)*60000)
        });
      }
    }
    
    let currentCandle = state.simulatedCandles[state.simulatedCandles.length - 1];
    
    // Nova vela no minuto
    if (currentCandle.time.getMinutes() !== now.getMinutes()) {
      currentCandle = { open: simPrice, high: simPrice, low: simPrice, close: simPrice, time: now };
      state.simulatedCandles.push(currentCandle);
      if (state.simulatedCandles.length > 20) state.simulatedCandles.shift();
    }

    const tick = (Math.random() - 0.5) * 0.0001;
    simPrice += tick;
    currentCandle.close = simPrice;
    currentCandle.high = Math.max(currentCandle.high, simPrice);
    currentCandle.low = Math.min(currentCandle.low, simPrice);
  }

  function updateMgmtFields() {
    const useMartingale = document.getElementById('botUseMartingale')?.checked;
    const useSoros = document.getElementById('botUseSoros')?.checked;
    const useCycles = document.getElementById('botUseCycles')?.checked;
    
    const galeSettings = document.getElementById('mgmtMartingaleSettings');
    const sorosSettings = document.getElementById('mgmtSorosSettings');
    const cyclesSettings = document.getElementById('mgmtCyclesSettings');

    if (galeSettings) {
      galeSettings.style.display = useMartingale ? 'flex' : 'none';
    }
    if (sorosSettings) {
      sorosSettings.style.display = useSoros ? 'block' : 'none';
    }
    if (cyclesSettings) {
      cyclesSettings.style.display = useCycles ? 'block' : 'none';
    }
  }

  function loadCyclesTable() {
    const configText = settings.cyclesConfig || '';
    const lines = configText.split('\n');
    const parsedCycles = [];
    
    lines.forEach(line => {
      if (!line.trim()) return;
      const parts = line.split(':');
      if (parts.length >= 2) {
        const valuesStr = parts[1].split(',');
        const values = valuesStr.map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        if (values.length > 0) {
          parsedCycles.push(values);
        }
      } else {
        const values = line.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
        if (values.length > 0) {
          parsedCycles.push(values);
        }
      }
    });

    state.cycles = parsedCycles;
    if (state.cycles.length > 0) {
      if (state.currentCycleIndex >= state.cycles.length) {
        state.currentCycleIndex = 0;
        state.currentStepIndex = 0;
        state.inCyclesRecovery = false;
      }
      
      if (settings.useCycles) {
        state.nextAmount = state.cycles[state.currentCycleIndex][state.currentStepIndex];
      }
    } else {
      state.cycles = [[settings.entryAmount]];
      state.currentCycleIndex = 0;
      state.currentStepIndex = 0;
      state.inCyclesRecovery = false;
    }
  }

  async function fetchEconomicCalendar(force = false) {
    // Função removida a pedido do usuário
  }

  function renderNewsTable(events) {
    // Removido
  }

  function checkNewsFilter(pair) {
    return { block: false }; // Sempre passa pois o filtro foi removido
  }

  return {
    init,
    logToConsole
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => Bot.init());
