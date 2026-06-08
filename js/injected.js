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

        if (name === "profile" || name === "balances") {
          const balances = parsed.msg && parsed.msg.balances;
          if (Array.isArray(balances)) {
            window.__binaryOps_balances = window.__binaryOps_balances || {};
            balances.forEach(b => {
              if (b.type === 1) {
                window.__binaryOps_balances.real = b.id;
              } else if (b.type === 4) {
                window.__binaryOps_balances.demo = b.id;
              }
            });
            console.log("[BinaryOps Interceptor] Saldos capturados:", window.__binaryOps_balances);
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

  // ============================================
  // ENVIO DE ORDEM VIA WEBSOCKET (API da Corretora)
  // ============================================
  // A corretora (IQ Option / Exnova) aceita mensagens WebSocket no formato:
  // { name: "sendMessage", msg: { name: "binary-options.open-option", body: { ... } } }
  // Isso é MUITO mais confiável do que clicar em botões DOM/Canvas.

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'binaryops_place_order_ws') return;

    const { direction, amount, pair, timeframe, requestId, accountType } = event.data;
    console.log(`[BinaryOps Interceptor] Ordem via WS recebida: ${pair} ${direction} $${amount} (Conta: ${accountType || 'Desconhecida'})`);

    const wsSet = window.__binaryOps_ws;
    if (!wsSet || wsSet.size === 0) {
      window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: 'Nenhum WebSocket capturado. Recarregue a corretora (F5).' }, '*');
      return;
    }

    // Achar um socket aberto
    let openWs = null;
    wsSet.forEach(w => {
      if (w.readyState === WebSocket.OPEN) openWs = w;
    });

    if (!openWs) {
      window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: 'Nenhum WebSocket está aberto (OPEN).' }, '*');
      return;
    }

    // Resolver o active_id do par
    let activeId = null;
    const dynamicIds = window.__binaryOps_dynamicIds || {};
    
    // Tentar nome exato primeiro, depois variações
    const pairVariations = [pair];
    if (pair.includes('-OTC')) {
      pairVariations.push(pair.replace('-OTC', '(OTC)'));
      pairVariations.push(pair.replace('-OTC', ' (OTC)'));
      pairVariations.push(pair.replace('/', '').replace('-OTC', '-OTC'));
    }
    
    for (let variant of pairVariations) {
      const cleanVariant = variant.replace(/[() ]/g, '').toUpperCase();
      for (let key in dynamicIds) {
        const cleanKey = key.replace(/[() ]/g, '').toUpperCase();
        if (cleanKey === cleanVariant) {
          activeId = dynamicIds[key];
          break;
        }
      }
      if (activeId) break;
    }

    // Fallback para IDs estáticos conhecidos
    if (!activeId) {
      const staticIds = {
        'EUR/USD': 1, 'GBP/USD': 2, 'USD/JPY': 3, 'EUR/JPY': 4, 'GBP/JPY': 5,
        'USD/CHF': 6, 'EUR/GBP': 7, 'EUR/CHF': 8, 'AUD/USD': 9, 'USD/CAD': 10, 'NZD/USD': 11,
        'AUD/CAD': 99, 'AUD/CHF': 100, 'AUD/JPY': 101, 'GBP/CAD': 102, 'GBP/CHF': 103,
        'GBP/AUD': 104, 'NZD/JPY': 105, 'CAD/JPY': 106, 'EUR/CAD': 107, 'EUR/AUD': 108,
        'CHF/JPY': 109, 'CAD/CHF': 110,
        
        'EUR/USD-OTC': 76, 'GBP/USD-OTC': 77, 'EUR/JPY-OTC': 78, 'EUR/GBP-OTC': 79,
        'USD/JPY-OTC': 81, 'GBP/JPY-OTC': 82, 'NZD/USD-OTC': 83, 'USD/CAD-OTC': 84,
        'AUD/USD-OTC': 85, 'AUD/CAD-OTC': 86,
        'AUD/JPY-OTC': 168, 'EUR/AUD-OTC': 169, 'EUR/CAD-OTC': 170,
        'GBP/AUD-OTC': 171, 'GBP/CAD-OTC': 172, 'GBP/CHF-OTC': 173,
        'NZD/JPY-OTC': 174, 'CAD/JPY-OTC': 175, 'CHF/JPY-OTC': 176,
        'EUR/CHF-OTC': 177, 'AUD/CHF-OTC': 178, 'CAD/CHF-OTC': 179
      };
      activeId = staticIds[pair];
    }

    if (!activeId) {
      window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: `ID do ativo "${pair}" não encontrado. Abra o gráfico deste ativo na corretora.` }, '*');
      return;
    }

    // Calcular expiração (timestamp do próximo minuto completo para M1, etc.)
    const nowMs = Date.now();
    const serverTime = window.__binaryOps_serverTime || Math.floor(nowMs / 1000);
    let expirationSec = 60;
    if (timeframe === 'M5' || timeframe === '5M') expirationSec = 300;
    else if (timeframe === 'M15' || timeframe === '15M') expirationSec = 900;

    // A expiração precisa ser o timestamp exato do fechamento da vela
    // Arredondar para o próximo múltiplo do timeframe
    const expTime = (Math.floor(serverTime / expirationSec) + 1) * expirationSec;

    const dir = direction.toUpperCase() === 'CALL' ? 'call' : 'put';
    const wsRequestId = 'bo_order_' + Math.floor(Math.random() * 1000000);

    // Calcular ID do Saldo da Conta (Demo vs Real)
    const balances = window.__binaryOps_balances || {};
    let userBalanceId = 0;
    if (accountType === 'real' && balances.real) {
      userBalanceId = balances.real;
    } else if (balances.demo) {
      userBalanceId = balances.demo;
    }

    // Formato da API IQ Option / Exnova para abrir opção binária
    const orderMsg = {
      name: "sendMessage",
      request_id: wsRequestId,
      msg: {
        name: "binary-options.open-option",
        version: "1.0",
        body: {
          user_balance_id: userBalanceId,
          active_id: activeId,
          option_type_id: 3,   // 3 = turbo (opções binárias rápidas)
          direction: dir,
          expired: expTime,
          refund_value: 0,
          price: amount,
          profit_percent: 0    // 0 = aceitar payout atual da corretora
        }
      }
    };

    console.log(`[BinaryOps Interceptor] Enviando ordem WS:`, JSON.stringify(orderMsg));

    // Escutar a resposta da corretora
    let responded = false;
    const responseTimeout = setTimeout(() => {
      if (!responded) {
        responded = true;
        openWs.removeEventListener('message', responseHandler);
        // Mesmo com timeout, a ordem pode ter sido aceita
        window.postMessage({ type: 'binaryops_order_result', requestId, status: 'success', msg: 'Ordem enviada (sem confirmação explícita, mas provavelmente aceita).' }, '*');
      }
    }, 8000);

    const responseHandler = async (event) => {
      if (responded) return;
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
          } catch(e1) {
            try {
              const arrayBuffer = rawData instanceof Blob ? await rawData.arrayBuffer() : rawData;
              const ds = new DecompressionStream('deflate-raw');
              const writer = ds.writable.getWriter();
              writer.write(arrayBuffer);
              writer.close();
              const response = new Response(ds.readable);
              const buffer = await response.arrayBuffer();
              rawData = new TextDecoder().decode(buffer);
            } catch(e2) { return; }
          }
        }

        const data = JSON.parse(rawData);
        const msgName = data.name || '';
        const respReqId = data.request_id || '';

        // Resposta direta ao nosso request_id
        if (String(respReqId) === String(wsRequestId)) {
          responded = true;
          clearTimeout(responseTimeout);
          openWs.removeEventListener('message', responseHandler);

          if (msgName === 'error' || (data.msg && data.msg.message)) {
            const errMsg = (data.msg && data.msg.message) || 'Erro desconhecido da corretora';
            console.error(`[BinaryOps Interceptor] Ordem rejeitada:`, errMsg);
            window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: errMsg }, '*');
          } else {
            console.log(`[BinaryOps Interceptor] Ordem aceita pela corretora!`, data);
            window.postMessage({ type: 'binaryops_order_result', requestId, status: 'success', data: data.msg || data }, '*');
          }
        }
      } catch(e) {}
    };

    openWs.addEventListener('message', responseHandler);
    openWs.send(JSON.stringify(orderMsg));
  });

})();
