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
    galeAmount: 20,
    sorosAmount: 18,
    minPayout: 80,
    stopWin: 50,
    stopLoss: 50,
    useMartingale: true,
    useSoros: false,
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
    currentGaleByPair: {}, // par -> nível do Gale do par
    currentSorosStage: 0,
    baseAmount: 10,
    nextAmount: 10,
    lastOperation: null,
    consecutiveLosses: 0,
    lastTickTime: null,
    simulatedCandles: [],
    lastOrderTime: null
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
    if (el('botGaleAmount')) el('botGaleAmount').value = settings.galeAmount || (settings.entryAmount * 2.0);
    if (el('botSorosAmount')) el('botSorosAmount').value = settings.sorosAmount || (settings.entryAmount * 1.8);
    if (el('botMinPayout')) el('botMinPayout').value = settings.minPayout;
    if (el('botStopWin')) el('botStopWin').value = settings.stopWin;
    if (el('botStopLoss')) el('botStopLoss').value = settings.stopLoss;
    if (el('botUseMartingale')) el('botUseMartingale').checked = settings.useMartingale !== false;
    if (el('botUseSoros')) el('botUseSoros').checked = settings.useSoros === true;
    if (el('botNewsFilter3')) el('botNewsFilter3').checked = settings.newsFilter3;
    if (el('botNewsFilter2')) el('botNewsFilter2').checked = settings.newsFilter2;
    if (el('botNewsMinBefore')) el('botNewsMinBefore').value = settings.newsMinBefore;
    if (el('botNewsMinAfter')) el('botNewsMinAfter').value = settings.newsMinAfter;
    if (el('botWaitCycleBreak')) el('botWaitCycleBreak').checked = settings.waitCycleBreak;
    if (el('botStrategy')) el('botStrategy').value = settings.strategy;
    if (el('botSignalsList')) el('botSignalsList').value = settings.signalsList;
    if (el('botToggle')) el('botToggle').checked = settings.active;

    state.baseAmount = settings.entryAmount;
    if (state.currentGale === 0 && state.currentSorosStage === 0) {
      state.nextAmount = settings.entryAmount;
    }

    updateStrategyFields();
    updateBotStatusUI();
    renderNewsTable();
    
    // Se a automação estava ligada quando recarregou a página, inicia o motor.
    if (settings.active) {
      logToConsole("🤖 ROBÔ ATIVADO automaticamente (estado salvo).", "success");
      startBotEngine();
    }
    syncRobotDataWithExtension();
  }

  // Salvar configurações
  function saveSettings() {
    const el = (id) => document.getElementById(id);
    settings.broker = el('botBroker')?.value || 'exnova';
    settings.accountType = el('botAccountType')?.value || 'demo';
    settings.entryAmount = parseFloat(el('botEntryAmount')?.value) || 10;
    settings.galeAmount = parseFloat(el('botGaleAmount')?.value) || (settings.entryAmount * 2.0);
    settings.sorosAmount = parseFloat(el('botSorosAmount')?.value) || (settings.entryAmount * 1.8);
    settings.minPayout = parseInt(el('botMinPayout')?.value) || 80;
    settings.stopWin = parseFloat(el('botStopWin')?.value) || 50;
    settings.stopLoss = parseFloat(el('botStopLoss')?.value) || 50;
    settings.useMartingale = el('botUseMartingale')?.checked ?? true;
    settings.useSoros = el('botUseSoros')?.checked ?? false;
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
    
    if (state.currentGale === 0 && state.currentSorosStage === 0) {
      state.nextAmount = settings.entryAmount;
    }

    logToConsole(`Configurações de Gestão salvas.`, 'info');
    syncRobotDataWithExtension();
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

    ['botUseMartingale', 'botUseSoros'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
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

    // Eventos de digitação para sincronizar com a corretora
    document.getElementById('botSignalsList')?.addEventListener('input', () => {
      saveSettings();
      syncRobotDataWithExtension();
    });
    document.getElementById('botPatternsList')?.addEventListener('input', () => {
      saveSettings();
      syncRobotDataWithExtension();
    });
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

  function syncRobotDataWithExtension() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;

    // Obter sinais
    const textareaSignals = document.getElementById('botSignalsList');
    const signalsText = textareaSignals ? textareaSignals.value : settings.signalsList;
    const signalsLines = signalsText.split('\n');
    const signals = [];
    signalsLines.forEach(line => {
      if (!line.trim()) return;
      const parts = line.replace(/,/g, ';').split(';');
      if (parts.length >= 3) {
        signals.push({
          time: parts[0].trim(),
          pair: parts[1].trim(),
          direction: parts[2].trim().toUpperCase(),
          timeframe: parts[3] ? parts[3].trim().toUpperCase() : 'M1'
        });
      }
    });

    // Obter padrões
    const textareaPatterns = document.getElementById('botPatternsList');
    const patternsText = textareaPatterns ? textareaPatterns.value : '';
    const patternsLines = patternsText.split('\n');
    const patterns = [];
    patternsLines.forEach(line => {
      if (!line.trim()) return;
      const parts = line.split(';');
      if (parts.length >= 4) {
        let rawPattern = parts[0].trim();
        rawPattern = rawPattern.replace(/🟩/g, 'G').replace(/🟥/g, 'R')
                               .replace(/verde/gi, 'G').replace(/vermelh[ao]/gi, 'R')
                               .toUpperCase()
                               .replace(/[^GR]/g, '');
        if (rawPattern.length === 0) return;
        patterns.push({
          pattern: rawPattern,
          pair: parts[1].trim(),
          direction: parts[2].trim().toUpperCase(),
          timeframe: parts[3].trim().toUpperCase()
        });
      }
    });

    const operations = (typeof Storage !== 'undefined' && Storage.getOperations) ? Storage.getOperations() : [];

    const data = {
      active: settings.active,
      strategy: settings.strategy,
      nextAmount: state.nextAmount,
      baseAmount: state.baseAmount,
      galeAmount: settings.galeAmount,
      sorosAmount: settings.sorosAmount,
      useMartingale: settings.useMartingale,
      useSoros: settings.useSoros,
      currentGale: state.currentGale,
      currentSorosStage: state.currentSorosStage,
      signals: signals,
      patterns: patterns,
      operations: operations
    };

    chrome.runtime.sendMessage({
      action: "sync_bot_data",
      data: data
    }, (response) => {
      if (response && Array.isArray(response.pendingOps) && response.pendingOps.length > 0) {
        response.pendingOps.forEach(op => {
          handleTradingResult(op);
        });
      }
    });
  }

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
      if (response && Array.isArray(response.pendingOps) && response.pendingOps.length > 0) {
        response.pendingOps.forEach(op => {
          handleTradingResult(op);
        });
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
    syncRobotDataWithExtension();
  }

  function runBotTick() {
    if (!settings.active) return;
    
    // BUG 2 FIX: Executar a análise de sinais ANTES do sync com a extensão.
    // O syncRobotDataWithExtension() é assíncrono e introduzia ~3s de latência
    // porque o chrome.runtime.sendMessage bloqueava a thread antes do checkSignalsList.
    const now = new Date();
    
    // 1. Estratégia de Lista de Sinais — executar com prioridade máxima
    if (settings.strategy === 'signals_list') {
      checkSignalsList(now);
    }
    
    // 2. Estratégias Automáticas (MHI / Médias Móveis) baseadas nas velas
    if (now.getSeconds() === 0) { // Executa análise na abertura da nova vela (segundo 0)
      runAutomaticStrategies(now);
    }

    // 3. Sync com a extensão DEPOIS da análise (não bloqueia a detecção do sinal)
    syncRobotDataWithExtension();
  }

  function stopBotEngine() {
    if (timerWorker) {
      timerWorker.postMessage('stop');
      timerWorker.terminate();
      timerWorker = null;
    }
    syncRobotDataWithExtension();
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
  function executeTradingOrder(pair, direction, timeframe, forcedAmount = null) {
    // A checagem de notícias (Anti-loss) foi removida a pedido do usuário.

    // === VERIFICAÇÃO DE METAS E LIMITES (GLOBAIS E LOCAIS) ===
    if (typeof Metrics !== 'undefined' && typeof Storage !== 'undefined') {
      const ops = Storage.getOperations();
      const dbSettings = Storage.getSettings();
      const goals = Storage.getGoals();
      const progress = Metrics.calculateGoalsProgress(ops, goals);
      const dailyGoals = progress.daily;
      const cur = dbSettings.currency === 'USD' ? '$' : 'R$';
      
      let blockReason = null;
      
      // Checar Metas Globais do Dashboard
      if (dailyGoals.profit.status === 'achieved') {
        blockReason = `Meta Diária de Lucro batida (${cur} ${dailyGoals.profit.current.toFixed(2)})`;
      } else if (dailyGoals.loss.status === 'exceeded') {
        blockReason = `Stop Loss Diário atingido (${cur} ${dailyGoals.loss.current.toFixed(2)})`;
      } else if (dailyGoals.ops.status === 'exceeded') {
        blockReason = `Máximo de Operações atingido (${dailyGoals.ops.current} ops)`;
      }
      
      // Checar Metas Locais do Robô
      const metrics = Metrics.calculate(ops, dbSettings);
      const todayProfit = metrics.todayMetrics.netProfit;
      if (!blockReason && settings.stopWin > 0 && todayProfit >= settings.stopWin) {
        blockReason = `Stop Win do Robô alcançado (${cur} ${todayProfit.toFixed(2)})`;
      } else if (!blockReason && settings.stopLoss > 0 && todayProfit <= -Math.abs(settings.stopLoss)) {
        blockReason = `Stop Loss do Robô atingido (${cur} ${todayProfit.toFixed(2)})`;
      }

      if (blockReason) {
        logToConsole(`[BLOQUEIO] Ordem cancelada! ${blockReason}.`, 'error');
        if (settings.active) document.getElementById('botToggle')?.click(); // Desliga o robô
        return; // Aborta a execução da ordem
      }
    }

    // BUG 1 FIX: Ler SEMPRE os valores do painel antes de qualquer decisão de amount.
    // Isso garante que o robô use os valores digitados pelo usuário, nunca o valor da corretora.
    const uiEntryEl   = document.getElementById('botEntryAmount');
    const uiGaleEl    = document.getElementById('botGaleAmount');
    const uiSorosEl   = document.getElementById('botSorosAmount');
    const parseSafe   = (el) => { const v = parseFloat(String(el ? el.value : '').replace(',','.')); return (!isNaN(v) && v > 0) ? v : null; };
    const uiEntry  = parseSafe(uiEntryEl)  || settings.entryAmount;
    const uiGale   = parseSafe(uiGaleEl)   || settings.galeAmount  || (uiEntry * 2.0);
    const uiSoros  = parseSafe(uiSorosEl)  || settings.sorosAmount || (uiEntry * 1.8);

    // Manter settings e state sempre em sincronia com o DOM
    settings.entryAmount = uiEntry;
    settings.galeAmount  = uiGale;
    settings.sorosAmount = uiSoros;

    // FORÇAR A LEITURA DO PAINEL SE FOR A PRIMEIRA ENTRADA (Evita dessincronização) E ZERAR GALE PRESO
    const isNewBaseEntry = (state.currentSorosStage === 0 && !state.inCyclesRecovery && forcedAmount === null);
    if (isNewBaseEntry) {
      state.currentGaleByPair[pair] = 0; // Limpa gale preso da sessão anterior
      state.currentGale = 0;
      state.baseAmount  = uiEntry;
      state.nextAmount  = uiEntry;
    }

    let amount = forcedAmount !== null ? Number(Number(forcedAmount).toFixed(2)) : Number(Number(state.nextAmount).toFixed(2));

    // Segurança final: se por qualquer motivo o amount ainda for 0 ou NaN, usa o valor do painel
    if (!amount || isNaN(amount) || amount <= 0) {
      amount = Number(uiEntry.toFixed(2));
    }

    const cur = Storage.getSettings().currency === 'USD' ? '$' : 'R$';
    const dirText = direction === 'CALL' ? 'ACIMA' : 'ABAIXO';
    logToConsole(`Enviando ordem: ${pair} -> ${dirText} | Valor: ${cur} ${(amount || 0).toFixed(2)} | Expiração: ${timeframe}`, 'info');

    // Registrar o timestamp para detectar sinais consecutivos no futuro
    state.lastOrderTime = Date.now();

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
          const extra = response.msg ? ` (${response.msg})` : '';
          logToConsole(`Ordem recebida pela corretora${extra}. Aguardando resultado da operação...`, 'success');
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

  // ---- Gerenciamento de Resultados (Martingale e Soros) ----

  function handleTradingResult(opData) {
    // Filtro de Duplicatas Bulletproof (Tempo + Par)
    const now = Date.now();
    if (state.lastProcessedTime && (now - state.lastProcessedTime < 2000) && state.lastProcessedPair === opData.pair) {
      return; // Ignora duplicata do mesmo par que chegou em menos de 2s
    }
    state.lastProcessedTime = now;
    state.lastProcessedPair = opData.pair;

    const prefix = opData.isSimulation ? '[Resultado Simulação]' : '[Resultado]';
    logToConsole(`${prefix} Operação finalizada no par ${opData.pair}: ${opData.result}!`, opData.result === 'WIN' ? 'success' : opData.result === 'LOSS' ? 'error' : 'warning');

    // 1. Salvar no Storage Geral do Dashboard (Apenas se for REAL)
    if (!opData.isSimulation) {
      Storage.addOperation(opData);
      App.refresh();
    }

    // 2. Aplicar nova gestão baseada em valores fixos (Lendo do DOM para evitar dessincronização)
    const cur = Storage.getSettings ? (Storage.getSettings().currency === 'USD' ? '$' : 'R$') : '$';
    const el = (id) => document.getElementById(id);
    const parseSafe = (val) => val ? parseFloat(String(val).replace(',', '.')) : NaN;
    
    const uiEntryAmount = el('botEntryAmount') ? parseSafe(el('botEntryAmount').value) : NaN;
    const uiGaleAmount  = el('botGaleAmount')  ? parseSafe(el('botGaleAmount').value)  : NaN;
    const uiSorosAmount = el('botSorosAmount') ? parseSafe(el('botSorosAmount').value) : NaN;

    const entryVal = (!isNaN(uiEntryAmount) && uiEntryAmount > 0) ? uiEntryAmount : settings.entryAmount;
    const galeVal  = (!isNaN(uiGaleAmount)  && uiGaleAmount  > 0) ? uiGaleAmount  : (settings.galeAmount  || (entryVal * 2.0));
    const sorosVal = (!isNaN(uiSorosAmount) && uiSorosAmount > 0) ? uiSorosAmount : (settings.sorosAmount || (entryVal * 1.8));

    // BUG 3 FIX: Manter settings sincronizados com o DOM para que a próxima ordem use o valor certo
    settings.entryAmount = entryVal;
    settings.galeAmount  = galeVal;
    settings.sorosAmount = sorosVal;
    state.baseAmount     = entryVal;

    const prevAmount = opData.amount > 0 ? opData.amount : state.nextAmount;

    const pairKey = opData.pair;
    state.currentGaleByPair[pairKey] = state.currentGaleByPair[pairKey] || 0;

    if (opData.result === 'WIN') {
      state.consecutiveLosses = 0;
      state.currentGale = 0;
      state.currentGaleByPair[pairKey] = 0;
      
      if (settings.useSoros) {
        // Se a operação que acabou de vencer foi o Soros, voltamos para a mão base
        if (Math.abs(prevAmount - sorosVal) < 0.05) {
          state.currentSorosStage = 0;
          state.nextAmount = entryVal;
          logToConsole(`[Soros] Ciclo de Soros finalizado com sucesso! Retornando para mão base: ${cur} ${state.nextAmount.toFixed(2)}`, 'success');
        } else {
          // Caso contrário, entra com a mão de Soros
          state.currentSorosStage = 1;
          state.nextAmount = sorosVal;
          logToConsole(`[Soros] WIN! Aplicando mão de Soros na próxima operação: ${cur} ${state.nextAmount.toFixed(2)}`, 'success');
        }
      } else {
        state.currentSorosStage = 0;
        state.nextAmount = entryVal;
        logToConsole(`[Gestão] WIN! Retornando para mão base: ${cur} ${state.nextAmount.toFixed(2)}`, 'success');
      }
    } else if (opData.result === 'LOSS') {
      state.consecutiveLosses++;
      state.currentSorosStage = 0; // Loss reseta o Soros
      
      const currentGaleForPair = state.currentGaleByPair[pairKey] || 0;
      if (settings.useMartingale && currentGaleForPair < 1) {
        // Aplica o Martingale de 1 nível com o valor fixo configurado
        state.currentGaleByPair[pairKey] = 1;
        state.currentGale = 1;
        state.nextAmount = galeVal;
        logToConsole(`[Martingale] LOSS! Aplicando Gale Fixo de ${cur} ${galeVal.toFixed(2)} na próxima vela do par ${opData.pair} (aguardando 4s para evitar bloqueio).`, 'warning');
        
        // Disparar a operação do Gale com delay de 4s passando galeVal como forcedAmount
        setTimeout(() => {
          executeTradingOrder(opData.pair, opData.direction, opData.timeframe, galeVal);
        }, 4000);
      } else {
        // Se já era o Gale e deu LOSS (limite atingido) ou se Martingale está desligado
        state.currentGaleByPair[pairKey] = 0;
        state.currentGale = 0;
        state.nextAmount = entryVal;
        if (settings.useMartingale) {
          logToConsole(`[Martingale] LOSS! Limite de 1 Gale atingido no par ${opData.pair}. Resetando para mão base: ${cur} ${state.nextAmount.toFixed(2)}`, 'error');
        } else {
          logToConsole(`[Gestão] LOSS! Recuperação desativada. Retornando para mão base: ${cur} ${state.nextAmount.toFixed(2)}`, 'info');
        }
      }
    } else if (opData.result === 'DRAW' || opData.result === 'DRAWN') {
      logToConsole(`[Gestão] Empate detectado. Repetindo a mesma entrada de: ${cur} ${prevAmount.toFixed(2)}`, 'info');
      state.nextAmount = prevAmount;
    } else {
      state.nextAmount = entryVal;
    }

    // 3. Checar Metas Globais e Limites Locais
    if (typeof Metrics !== 'undefined' && settings.active) {
      const ops = Storage.getOperations();
      const dbSettings = Storage.getSettings();
      const goals = Storage.getGoals();
      const progress = Metrics.calculateGoalsProgress(ops, goals);
      const dailyGoals = progress.daily;
      const metrics = Metrics.calculate(ops, dbSettings);
      const todayProfit = metrics.todayMetrics.netProfit;
      
      let blockReason = null;
      let blockType = 'error';
      
      // Globais
      if (dailyGoals.profit.status === 'achieved') { blockReason = `Meta Diária de Lucro batida (${cur} ${dailyGoals.profit.current.toFixed(2)})`; blockType = 'success'; }
      else if (dailyGoals.loss.status === 'exceeded') { blockReason = `Stop Loss Diário atingido (${cur} ${dailyGoals.loss.current.toFixed(2)})`; }
      else if (dailyGoals.ops.status === 'exceeded') { blockReason = `Máximo de Operações atingido (${dailyGoals.ops.current} ops)`; blockType = 'warning'; }
      // Locais
      else if (settings.stopWin > 0 && todayProfit >= settings.stopWin) { blockReason = `Stop Win do Robô alcançado (${cur} ${todayProfit.toFixed(2)})`; blockType = 'success'; }
      else if (settings.stopLoss > 0 && todayProfit <= -Math.abs(settings.stopLoss)) { blockReason = `Stop Loss do Robô atingido (${cur} ${todayProfit.toFixed(2)})`; }

      if (blockReason) {
        logToConsole(`[BLOQUEIO] ${blockReason}. Parando robô imediatamente para proteção da banca.`, blockType);
        document.getElementById('botToggle')?.click(); // Desliga o robô
      }
    }
    syncRobotDataWithExtension();
  }

  // ---- Simulador e Captura de Mercado Real (Corretora via Extensão) ----

  function parsePatternsList() {
    const raw = document.getElementById('botPatternsList')?.value || '';
    const lines = raw.split('\n');
    const patterns = [];
    lines.forEach(line => {
      const parts = line.split(';');
      if (parts.length >= 4) {
        // Normalizar emojis (🟩🟥) e variantes para letras G/R que o motor usa internamente
        let rawPattern = parts[0].trim();
        rawPattern = rawPattern.replace(/🟩/g, 'G').replace(/🟥/g, 'R')
                               .replace(/verde/gi, 'G').replace(/vermelh[ao]/gi, 'R')
                               .toUpperCase();
        // Remover qualquer caractere que não seja G ou R (espaços, vírgulas, etc)
        rawPattern = rawPattern.replace(/[^GR]/g, '');
        
        if (rawPattern.length === 0) return; // Padrão inválido, pula
        
        patterns.push({
          pattern: rawPattern,
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

    // ========== GUARD ANTI-DUPLICATA ==========
    // Usa o timestamp da ÚLTIMA VELA FECHADA (estável) em vez da vela aberta (que muda a cada tick).
    // Isso garante que o mesmo padrão só será executado UMA vez por vela fechada.
    const lastClosedTime = lastClosed.time.getTime();
    if (lastAutoPatternTimeByPair[pair] === lastClosedTime) return;

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
        lastAutoPatternTimeByPair[pair] = lastClosedTime;

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
