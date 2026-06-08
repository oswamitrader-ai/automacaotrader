// ============================================
// BACKGROUND SERVICE WORKER - Chrome Extension
// ============================================

let dashboardTabId = null;
let brokerTabs = new Map(); // tabId -> brokerInfo (e.g., 'exnova', 'iqoption', 'bullex')

// 1. Abrir o Dashboard em uma aba inteira ao clicar no ícone da extensão
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("index.html")
  }, (newTab) => {
    dashboardTabId = newTab.id;
  });
});

// 2. Ouvir mensagens de abas de corretoras (Content Scripts) e do Dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  // Registrar aba da corretora quando ela é iniciada
  if (message.action === "broker_initialized") {
    brokerTabs.set(tabId, {
      broker: message.broker,
      url: sender.tab.url,
      title: sender.tab.title
    });
    console.log(`[Background] Corretora registrada: ${message.broker} na aba ${tabId}`);
    notifyDashboardStatus();
    sendResponse({ status: "registered", tabId });
    return true;
  }

  // Ping de status vindo do Dashboard
  if (message.action === "get_connected_brokers") {
    const activeBrokers = [];
    brokerTabs.forEach((info, id) => {
      activeBrokers.push({ tabId: id, broker: info.broker, title: info.title });
    });
    sendResponse({ brokers: activeBrokers });
    return true;
  }

  // Encaminhar sinal/ordem do Dashboard para a corretora
  if (message.action === "execute_order") {
    const targetTabId = message.targetTabId;
    if (targetTabId && brokerTabs.has(targetTabId)) {
      chrome.tabs.sendMessage(targetTabId, {
        action: "place_order",
        direction: message.direction,
        amount: message.amount,
        payout: message.payout,
        pair: message.pair,
        timeframe: message.timeframe
      }, (response) => {
        sendResponse(response);
      });
      return true; // Manter canal de resposta aberto
    } else {
      sendResponse({ status: "error", error: "Corretora não encontrada ou desconectada" });
    }
  }

  // Encaminhar sinal de calibração do Dashboard para a corretora
  if (message.action === "calibrate_order_button") {
    const targetTabId = message.targetTabId;
    if (targetTabId && brokerTabs.has(targetTabId)) {
      chrome.tabs.sendMessage(targetTabId, {
        action: "start_calibration",
        direction: message.direction
      }, (response) => {
        sendResponse(response);
      });
      return true;
    } else {
      sendResponse({ status: "error", error: "Corretora não encontrada ou desconectada" });
    }
  }

  // Receber resultado da corretora e enviar ao Dashboard
  if (message.action === "operation_result") {
    console.log("[Background] Resultado recebido da corretora:", message.data);
    if (dashboardTabId) {
      chrome.tabs.sendMessage(dashboardTabId, {
        action: "save_bot_operation",
        data: message.data
      });
    } else {
      // Se o dashboard estiver fechado, salvar provisoriamente no storage local
      chrome.storage.local.get({ pendingOps: [] }, (result) => {
        const pending = result.pendingOps;
        pending.push(message.data);
        chrome.storage.local.set({ pendingOps: pending });
      });
    }
    sendResponse({ status: "delivered" });
    return true;
  }

  // Receber resultado instantâneo da corretora capturado via WebSocket
  if (message.action === "option_closed_ws") {
    const raw = message.data;
    const pair = getPairForActiveId(raw.activeId);
    
    // Mapear Payout
    let payout = 85; 
    if (raw.amount > 0) {
      const netProfit = raw.profit - raw.amount;
      payout = Math.round((netProfit / raw.amount) * 100);
      if (payout < 0 || payout > 200) payout = 85;
    }

    const opData = {
      pair: pair.replace('-OTC', ' (OTC)'), // Formato amigável do dashboard
      direction: raw.direction,
      amount: raw.amount,
      payout: payout,
      result: raw.result,
      date: new Date().toISOString().slice(0, 16),
      timeframe: 'M1', // Padrão M1
      strategy: 'Robô Extensão (WS)',
      notes: `Resultado capturado instantaneamente via WebSocket (Option ID: ${raw.optionId})`
    };

    console.log("[Background] Transmitindo resultado instantâneo via WS:", opData);
    if (dashboardTabId) {
      chrome.tabs.sendMessage(dashboardTabId, {
        action: "save_bot_operation",
        data: opData
      });
    } else {
      // Salvar provisoriamente no storage local
      chrome.storage.local.get({ pendingOps: [] }, (result) => {
        const pending = result.pendingOps;
        pending.push(opData);
        chrome.storage.local.set({ pendingOps: pending });
      });
    }
    sendResponse({ status: "success" });
    return true;
  }

  // Buscar velas de OTC reais da corretora via chrome.scripting.executeScript (MAIN world)
  if (message.action === "fetch_otc_candles") {
    const activeId = getActiveIdForOTC(message.pair);
    const timeframeSec = getTimeframeSeconds(message.timeframe);
    // Arredondar o timestamp "to" para o início da última vela fechada (múltiplo do timeframe em segundos)
    // Isso evita chaves de busca quebradas ou inexistentes no banco de dados do servidor da corretora.
    const nowSec = Math.floor(Date.now() / 1000);
    const to = Math.floor(nowSec / timeframeSec) * timeframeSec - timeframeSec;
    const limit = message.limit || 1000;
    
    // Acha a aba da corretora conectada
    const brokerTabsList = Array.from(brokerTabs.keys());
    if (brokerTabsList.length === 0) {
      sendResponse({ 
        status: "error", 
        error: "Nenhuma aba de corretora (IQ Option/Exnova) está ativa. Abra a corretora no navegador." 
      });
      return true;
    }
    
    const targetTabId = brokerTabsList[0];
    console.log(`[Background] Solicitando candles OTC de ${message.pair} (fallback ID ${activeId}) via executeScript com allFrames:true na aba ${targetTabId}`);
    
    // Executa uma função async diretamente no MAIN world em todos os frames da aba da corretora
    chrome.scripting.executeScript({
      target: { tabId: targetTabId, allFrames: true },
      world: "MAIN",
      func: (fallbackActiveId, size, to, count, pairName) => {
        return new Promise((resolve) => {
          let activeId = fallbackActiveId;
          if (window.__binaryOps_dynamicIds && window.__binaryOps_dynamicIds[pairName]) {
             activeId = window.__binaryOps_dynamicIds[pairName];
             console.log(`[BinaryOps] Sucesso! Usando NOVO ID Dinâmico Mapeado para ${pairName}: ${activeId}`);
          } else {
             console.log(`[BinaryOps] Nenhum ID novo detectado para ${pairName}, tentando usar o ID antigo: ${fallbackActiveId}`);
          }

          const reqId = `binaryops_${activeId}_${Date.now()}`;
          const wsSet = window.__binaryOps_ws;
          if (!wsSet || wsSet.size === 0) {
            resolve({ status: "error", error: "Nenhum WebSocket capturado pelo interceptor. Recarregue a página da corretora (F5)." });
            return;
          }
          
          const openSockets = [];
          wsSet.forEach(w => {
            if (w.readyState === WebSocket.OPEN) openSockets.push(w);
          });
          
          if (openSockets.length === 0) {
            resolve({ status: "error", error: `Nenhum WebSocket está aberto (OPEN).` });
            return;
          }
          
          let resolved = false;
          let timeoutId;

          timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              
              // FALLBACK SUPREMO ANTES DO TIMEOUT!
              if (window.__binaryOps_stolenCandles) {
                if (window.__binaryOps_stolenCandles[activeId] && window.__binaryOps_stolenCandles[activeId].length > 0) {
                   console.log(`[BinaryOps] TIMEOUT! Usando velas roubadas do activeId=${activeId}`);
                   resolve({ status: "success", candles: window.__binaryOps_stolenCandles[activeId], frameId: 0 });
                   return;
                }
                
                // Procurar o maior array de velas (o gráfico que o usuário acabou de abrir)
                let bestId = null;
                let maxLen = 0;
                for (let cid in window.__binaryOps_stolenCandles) {
                   if (window.__binaryOps_stolenCandles[cid].length > maxLen) {
                      maxLen = window.__binaryOps_stolenCandles[cid].length;
                      bestId = cid;
                   }
                }
                if (bestId && maxLen > 0) {
                   console.log(`[BinaryOps] TIMEOUT! Usando velas roubadas do bestId=${bestId}`);
                   resolve({ status: "success", candles: window.__binaryOps_stolenCandles[bestId], frameId: 0 });
                   return;
                }
              }

              resolve({ status: "error", error: `Timeout de 20s aguardando a corretora.` });
            }
          }, 20000);

          const nowSec = Math.floor(Date.now() / 1000);
          const nowMicro = Date.now() * 1000;
          
          const reqFormats = [];
          
          // FORMATO SUPREMO: ID Roubado do Gráfico
          if (window.__binaryOps_maxIds && window.__binaryOps_maxIds[activeId]) {
            const stolenId = window.__binaryOps_maxIds[activeId];
            reqFormats.push({ 
              name: "get-candles", 
              version: "2.0", 
              body: { active_id: activeId, size: size, count: count, from_id: stolenId - count, to_id: stolenId, only_closed: true, split_normalization: false } 
            });
            console.log(`[BinaryOps] Usando Formato Supremo (ID Roubado): to_id=${stolenId}`);
          } else {
            console.log(`[BinaryOps] ID Roubado não encontrado para activeId ${activeId}. Ative o gráfico na corretora primeiro.`);
          }

          // Fallbacks Cegos
          reqFormats.push(
            { name: "get-candles", version: "2.0", body: { active_id: activeId, size: size, count: count, only_closed: true, split_normalization: false } },
            { name: "get-candles", version: "1.0", body: { active_id: activeId, size: size, to: nowSec, count: count } },
            { name: "get-candles", version: "2.0", body: { active_id: activeId, size: size, to: nowSec, count: count, only_closed: true, split_normalization: false } },
            { name: "get-candles", version: "2.0", body: { active_id: activeId, size: size, to: nowMicro, count: count, only_closed: true, split_normalization: false } },
            { name: "get-candles", version: "1.0", body: { active_id: activeId, size: size, from: nowSec - (count * size), to: nowSec } }
          );

          const tryFetch = (formatIndex) => {
            if (resolved) return;
            if (formatIndex >= reqFormats.length) {
              resolved = true;
              clearTimeout(timeoutId);
              
              // FALLBACK SUPREMO: Se tudo falhar, devolve as velas que foram interceptadas quando o usuário abriu o gráfico!
              if (window.__binaryOps_stolenCandles && window.__binaryOps_stolenCandles[activeId] && window.__binaryOps_stolenCandles[activeId].length > 0) {
                 console.log(`[BinaryOps] Todos os formatos falharam. Usando as ${window.__binaryOps_stolenCandles[activeId].length} velas ROUBADAS diretamente do gráfico!`);
                 resolve({ status: "success", candles: window.__binaryOps_stolenCandles[activeId], frameId: 0 });
                 return;
              }
              
              resolve({ status: "error", error: "A corretora bloqueou a busca. Por favor, deixe o gráfico deste ativo aberto na corretora por alguns segundos antes de catalogar." });
              return;
            }

            const reqFmt = reqFormats[formatIndex];
            const historyReqId = "hist_" + Math.floor(Math.random() * 100000).toString();
            const requestMsg = {
              name: "sendMessage",
              request_id: historyReqId,
              msg: reqFmt
            };
            
            const histHandler = async (event) => {
              if (resolved) return;
              try {
                let rawData = event.data;
                if (typeof rawData !== 'string') {
                  try {
                    const arrayBuffer = rawData instanceof Blob ? await rawData.arrayBuffer() : rawData;
                    const ds = new DecompressionStream('deflate');
                    const writer = ds.writable.getWriter();
                    writer.write(arrayBuffer);
                    writer.close();
                    const response = new Response(ds.readable);
                    const buffer = await response.arrayBuffer();
                    rawData = new TextDecoder().decode(buffer);
                  } catch(err) {
                    try {
                      const arrayBuffer = rawData instanceof Blob ? await rawData.arrayBuffer() : rawData;
                      const ds = new DecompressionStream('deflate-raw');
                      const writer = ds.writable.getWriter();
                      writer.write(arrayBuffer);
                      writer.close();
                      const response = new Response(ds.readable);
                      const buffer = await response.arrayBuffer();
                      rawData = new TextDecoder().decode(buffer);
                    } catch(err2) { return; }
                  }
                }
                const data = JSON.parse(rawData);
                const msgName = data.name || '';
                const respReqId = data.request_id || (data.msg && data.msg.request_id) || '';

                if (msgName === "error" && String(respReqId) === String(historyReqId)) {
                   openSockets.forEach(ws => ws.removeEventListener('message', histHandler));
                   tryFetch(formatIndex + 1);
                } else if (msgName === "candles" && String(respReqId) === String(historyReqId)) {
                  openSockets.forEach(ws => ws.removeEventListener('message', histHandler));
                  
                  let candles = null;
                  if (data.msg && Array.isArray(data.msg.candles)) candles = data.msg.candles;
                  else if (data.msg && Array.isArray(data.msg.data)) candles = data.msg.data;
                  else if (Array.isArray(data.msg)) candles = data.msg;
                  else if (Array.isArray(data.candles)) candles = data.candles;

                  if (candles && candles.length > 0) {
                    const lastC = candles[candles.length - 1];
                    let ts = lastC.from !== undefined ? lastC.from : (lastC.at !== undefined ? lastC.at : lastC.time);
                    if (ts < 10000000000) ts *= 1000;
                    else if (ts > 100000000000000) ts = Math.floor(ts / 1000);
                    
                    // Se a última vela for mais antiga que 30 dias, é o banco de dados congelado de 2025!
                    if (Date.now() - ts > 30 * 24 * 60 * 60 * 1000) {
                       console.log(`[BinaryOps] Formato ${formatIndex} retornou dados congelados antigos. Tentando próximo formato...`);
                       tryFetch(formatIndex + 1);
                       return;
                    }

                    resolved = true;
                    clearTimeout(timeoutId);
                    resolve({ status: "success", candles: candles, frameId: 0 });
                  } else {
                     tryFetch(formatIndex + 1);
                  }
                }
              } catch (e) {}
            };
            openSockets.forEach(ws => ws.addEventListener('message', histHandler));
            openSockets.forEach(ws => ws.send(JSON.stringify(requestMsg)));
          };

          tryFetch(0);
        });
      },
      args: [activeId, timeframeSec, to, limit, message.pair]
    }).then((results) => {
      if (results && results.length > 0) {
        // Encontrar o resultado que teve sucesso
        const successfulResult = results.find(r => r.result && r.result.status === "success");
        
        if (successfulResult && Array.isArray(successfulResult.result.candles)) {
          const candles = successfulResult.result.candles;
          
          // Mapear para o formato do catalogador (suportando diferentes chaves de API: open/o, close/c, max/h, min/l)
          const mappedCandles = candles.map(k => {
            let ts = k.from !== undefined ? k.from : (k.at !== undefined ? k.at : k.time);
            if (!ts) ts = Date.now();
            if (ts < 10000000000) ts *= 1000; // Segundos para milis
            else if (ts > 100000000000000) ts = Math.floor(ts / 1000); // Microsegundos para milis

            const open = parseFloat(k.open !== undefined ? k.open : k.o);
            const close = parseFloat(k.close !== undefined ? k.close : k.c);
            const high = parseFloat(k.max !== undefined ? k.max : (k.h !== undefined ? k.h : k.high));
            const low = parseFloat(k.min !== undefined ? k.min : (k.l !== undefined ? k.l : k.low));
            
            return {
              time: new Date(ts).toISOString(),
              open: open,
              high: high,
              low: low,
              close: close,
              color: close >= open ? 'G' : 'R',
              isClosed: true // Histórico sempre fechado
            };
          });
          
          // Debugging log para ver se as velas estão sendo mapeadas corretamente e não apenas com cor R
          if (mappedCandles.length > 0) {
            console.log(`[Background] 1a vela amostra: time=${mappedCandles[0].time}, open=${mappedCandles[0].open}, close=${mappedCandles[0].close}, color=${mappedCandles[0].color}`);
          }
          
          console.log(`[Background] ${mappedCandles.length} candles mapeados com sucesso a partir do frame ${successfulResult.frameId}.`);
          sendResponse({ status: "success", candles: mappedCandles });
        } else {
          // Se nenhum deu sucesso, coletar os erros
          const errors = results
            .filter(r => r.result && r.result.status === "error")
            .map(r => `[Frame ${r.frameId}]: ${r.result.error}`);
          const combinedError = errors.length > 0 ? errors.join(" | ") : "Nenhum WebSocket ativo nos frames da aba respondeu à solicitação de candles.";
          console.error(`[Background] Erro do executeScript nos frames:`, combinedError);
          sendResponse({ status: "error", error: combinedError });
        }
      } else {
        sendResponse({ status: "error", error: "executeScript não retornou nenhum resultado nos frames da aba." });
      }
    }).catch((err) => {
      console.error(`[Background] Falha no executeScript:`, err);
      sendResponse({ status: "error", error: `Erro ao executar script na aba da corretora: ${err.message}` });
    });
    
    return true; // Mantém canal de resposta assíncrona aberto
  }

  // Buscar velas reais da Binance em background para evitar CORS
  if (message.action === "fetch_binance_candles") {
    const url = `https://api.binance.com/api/v3/klines?symbol=${message.symbol}&interval=${message.interval}&limit=${message.limit}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        sendResponse({ status: "success", data: data });
      })
      .catch(err => {
        console.error("[Background] Erro Binance fetch:", err);
        sendResponse({ status: "error", error: err.message });
      });
    return true;
  }

  // Buscar velas reais da Twelve Data em background para evitar CORS
  if (message.action === "fetch_twelvedata_candles") {
    const url = `https://api.twelvedata.com/time_series?symbol=${message.symbol}&interval=${message.interval}&outputsize=${message.limit}&apikey=${message.apiKey}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        sendResponse({ status: "success", data: data });
      })
      .catch(err => {
        console.error("[Background] Erro Twelve Data fetch:", err);
        sendResponse({ status: "error", error: err.message });
      });
    return true;
  }
});

// 3. Monitorar quando abas são fechadas para remover corretoras desconectadas
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === dashboardTabId) {
    dashboardTabId = null;
  }
  if (brokerTabs.has(tabId)) {
    console.log(`[Background] Corretora desconectada: aba ${tabId} fechada`);
    brokerTabs.delete(tabId);
    notifyDashboardStatus();
  }
});

// Função para notificar o Dashboard sobre mudanças de corretoras
function notifyDashboardStatus() {
  if (!dashboardTabId) return;

  const activeBrokers = [];
  brokerTabs.forEach((info, id) => {
    activeBrokers.push({ tabId: id, broker: info.broker, title: info.title });
  });

  chrome.tabs.sendMessage(dashboardTabId, {
    action: "broker_status_update",
    brokers: activeBrokers
  }).catch(() => {
    // Silenciar erros caso a aba do dashboard não esteja escutando ainda
  });
}

// Helpers para mapear ativos OTC e timeframes da IQ Option/Exnova
function getActiveIdForOTC(pair) {
  const ids = {
    'EUR/USD-OTC': 76,
    'GBP/USD-OTC': 77,
    'EUR/GBP-OTC': 79,
    'EUR/JPY-OTC': 78,
    'GBP/JPY-OTC': 82,
    'USD/JPY-OTC': 81,
    'USD/CAD-OTC': 84,
    'NZD/USD-OTC': 83,
    'AUD/USD-OTC': 85,
    'AUD/CAD-OTC': 86,
    'AUD/JPY-OTC': 168,
    'EUR/AUD-OTC': 169,
    'EUR/CAD-OTC': 170,
    'GBP/AUD-OTC': 171,
    'GBP/CAD-OTC': 172,
    'GBP/CHF-OTC': 173,
    'NZD/JPY-OTC': 174,
    'CAD/JPY-OTC': 175,
    'CHF/JPY-OTC': 176,
    'EUR/CHF-OTC': 177,
    'AUD/CHF-OTC': 178,
    'CAD/CHF-OTC': 179
  };
  return ids[pair] || 76; // Padrão EUR/USD-OTC se não encontrar
}

function getTimeframeSeconds(tf) {
  const sizes = {
    '1m': 60,
    '5m': 300,
    '15m': 900
  };
  return sizes[tf] || 60; // Padrão M1
}

function getPairForActiveId(activeId) {
  const pairs = {
    // OTC Pairs
    76: 'EUR/USD-OTC',
    77: 'GBP/USD-OTC',
    79: 'EUR/GBP-OTC',
    78: 'EUR/JPY-OTC',
    82: 'GBP/JPY-OTC',
    81: 'USD/JPY-OTC',
    84: 'USD/CAD-OTC',
    83: 'NZD/USD-OTC',
    85: 'AUD/USD-OTC',
    86: 'AUD/CAD-OTC',
    168: 'AUD/JPY-OTC',
    169: 'EUR/AUD-OTC',
    170: 'EUR/CAD-OTC',
    171: 'GBP/AUD-OTC',
    172: 'GBP/CAD-OTC',
    173: 'GBP/CHF-OTC',
    174: 'NZD/JPY-OTC',
    175: 'CAD/JPY-OTC',
    176: 'CHF/JPY-OTC',
    177: 'EUR/CHF-OTC',
    178: 'AUD/CHF-OTC',
    179: 'CAD/CHF-OTC',
    // Real Pairs
    1: 'EUR/USD',
    2: 'GBP/USD',
    3: 'USD/JPY',
    4: 'EUR/JPY',
    5: 'GBP/JPY',
    6: 'USD/CHF',
    7: 'EUR/GBP',
    8: 'EUR/CHF',
    9: 'AUD/USD',
    10: 'USD/CAD',
    11: 'NZD/USD'
  };
  return pairs[activeId] || 'EUR/USD-OTC';
}
