// ============================================
// INJECTED SCRIPT - Runs in MAIN World
// Intercepta WebSockets da corretora e expõe
// as conexões ativas em window.__binaryOps_ws
// ============================================

(() => {
  console.log("[BinaryOps Interceptor] Script MAIN world carregado.");
  
  // Set global acessível por chrome.scripting.executeScript
  window.__binaryOps_ws = window.__binaryOps_ws || new Set();
  window.__binaryOps_lastMsgs = window.__binaryOps_lastMsgs || [];
  
  const activeWebSockets = window.__binaryOps_ws;
  const OriginalWebSocket = window.WebSocket;

  window.WebSocket = function(url, protocols) {
    console.log("[BinaryOps Interceptor] Novo WebSocket detectado. URL:", url);
    const ws = new OriginalWebSocket(url, protocols);
    activeWebSockets.add(ws);

    // Sobrescrever o método send original
    const originalSend = ws.send;
    ws.send = function(data) {
      try {
        const parsed = JSON.parse(data);
        // Salvar logs de mensagens de trading
        if (parsed.name === "sendMessage" && parsed.msg && parsed.msg.name === "get-candles") {
          console.log("[BinaryOps WS Sent][get-candles]", parsed);
        }
      } catch (e) {}
      return originalSend.apply(this, arguments);
    };

    // Ouvir mensagens recebidas para fins de log
    ws.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const name = parsed.name || (parsed.msg && parsed.msg.name) || '';
        
        // Sincronizar o horário do servidor da corretora
        if (name === "timeSync") {
          const serverVal = Number(parsed.msg);
          if (serverVal > 10000000000) {
            window.__binaryOps_serverTime = Math.floor(serverVal / 1000);
          } else {
            window.__binaryOps_serverTime = serverVal;
          }
        }

        if (name === "candles" || name === "timeframe-candles" || name === "candles-generated") {
          console.log("[BinaryOps WS Received][Candles]", parsed);
          window.__binaryOps_lastMsgs.push({
            time: new Date().toLocaleTimeString(),
            type: name,
            data: parsed
          });
          if (window.__binaryOps_lastMsgs.length > 10) {
            window.__binaryOps_lastMsgs.shift();
          }

          // ROUBAR O ID SECRETO E AS VELAS DIRETAMENTE DA CORRETORA
          window.__binaryOps_maxIds = window.__binaryOps_maxIds || {};
          window.__binaryOps_stolenCandles = window.__binaryOps_stolenCandles || {};
          let activeId = parsed.msg ? parsed.msg.active_id : parsed.active_id;
          let candlesArray = null;
          
          if (parsed.msg && Array.isArray(parsed.msg.candles)) candlesArray = parsed.msg.candles;
          else if (parsed.msg && Array.isArray(parsed.msg.data)) candlesArray = parsed.msg.data;
          else if (Array.isArray(parsed.msg)) candlesArray = parsed.msg;
          else if (Array.isArray(parsed.candles)) candlesArray = parsed.candles;
          
          if (activeId && candlesArray && candlesArray.length > 0) {
            // Guardar as velas roubadas para usar como fallback final
            if (!window.__binaryOps_stolenCandles[activeId] || window.__binaryOps_stolenCandles[activeId].length < candlesArray.length) {
                window.__binaryOps_stolenCandles[activeId] = candlesArray;
            }

            let maxId = 0;
            candlesArray.forEach(c => {
              if (c.id && c.id > maxId) maxId = c.id;
            });
            if (maxId > 0) {
              window.__binaryOps_maxIds[activeId] = maxId;
              console.log(`[BinaryOps Interceptor] ID Secreto Roubado para o ativo ${activeId}: ${maxId}`);
            }
          }
        }

        // Interceptar conclusão de operação (Option/Position Closed) para feedback instantâneo
        if (name === "option-closed" || name === "position-closed" || (parsed.msg && (parsed.msg.name === "option-closed" || parsed.msg.name === "position-closed"))) {
          console.log("[BinaryOps WS Received][OptionClosed]", parsed);
          window.postMessage({
            type: 'binaryops_option_closed',
            data: parsed.msg || parsed
          }, '*');
        }
        // Tentar mapear dinamicamente os IDs que a corretora enviar
        const mapDynamicIds = (obj) => {
          if (!obj) return;
          if (Array.isArray(obj)) { obj.forEach(mapDynamicIds); return; }
          if (typeof obj === 'object') {
            const id = obj.id || obj.active_id || obj.activeId || obj.active;
            if (id) {
               const name1 = typeof obj.name === 'string' ? obj.name : '';
               const name2 = typeof obj.ticker === 'string' ? obj.ticker : '';
               const name3 = typeof obj.instrument === 'string' ? obj.instrument : '';
               
               [name1, name2, name3].forEach(n => {
                 if (n && n.length > 3) {
                   let cleanName = n.toUpperCase().replace(' ', '');
                   if (cleanName.includes('(OTC)')) cleanName = cleanName.replace('(OTC)', '-OTC');
                   
                   // Formatar GBPJPY-OTC para GBP/JPY-OTC se não tiver barra
                   if (cleanName.includes('-OTC') && !cleanName.includes('/')) {
                      let pairOnly = cleanName.replace('-OTC', '');
                      if (pairOnly.length === 6) cleanName = pairOnly.substring(0,3) + '/' + pairOnly.substring(3) + '-OTC';
                   } else if (cleanName.length === 6 && !cleanName.includes('-OTC') && !cleanName.includes('/')) {
                      cleanName = cleanName.substring(0,3) + '/' + cleanName.substring(3);
                   }

                   window.__binaryOps_dynamicIds = window.__binaryOps_dynamicIds || {};
                   if (!window.__binaryOps_dynamicIds[cleanName] || window.__binaryOps_dynamicIds[cleanName] !== id) {
                      window.__binaryOps_dynamicIds[cleanName] = id;
                      console.log(`[BinaryOps] Mapeamento Dinâmico: ${cleanName} = ${id}`);
                   }
                 }
               });
            }
            Object.values(obj).forEach(mapDynamicIds);
          }
        };
        try { mapDynamicIds(parsed); } catch(e){}

      } catch (e) {}
    });

    ws.addEventListener('close', () => {
      console.log("[BinaryOps Interceptor] WebSocket fechado. URL:", url);
      activeWebSockets.delete(ws);
    });

    return ws;
  };

  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
})();
