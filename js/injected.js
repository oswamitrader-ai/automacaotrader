// ============================================
// INJECTED SCRIPT - Runs in MAIN World
// Intercepta WebSockets da corretora e expõe
// as conexões ativas em window.__binaryOps_ws
// ============================================

(() => {
  console.log("[BinaryOps Interceptor] Script MAIN world carregado.");
  
  if (window.__binaryOps_injectedLoaded) {
    console.warn("[BinaryOps Interceptor] Script já estava carregado. Ignorando re-injeção.");
    return;
  }
  window.__binaryOps_injectedLoaded = true;
  
  // Set global acessível por chrome.scripting.executeScript
  window.__binaryOps_ws = window.__binaryOps_ws || new Set();
  window.__binaryOps_lastMsgs = window.__binaryOps_lastMsgs || [];
  window.__binaryOps_openedOptionIds = window.__binaryOps_openedOptionIds || new Set();
  
  function getPairNameByActiveId(activeId) {
    if (!activeId) return null;
    // 1. Procurar no mapeamento dinâmico primeiro
    if (window.__binaryOps_dynamicIds) {
      for (const [pair, id] of Object.entries(window.__binaryOps_dynamicIds)) {
        if (String(id) === String(activeId)) {
          let resolved = pair;
          if (resolved === 'BITCOIN-OTC' || resolved === 'BITCOIN(OTC)') resolved = 'BTC/USD-OTC';
          if (resolved === 'BITCOIN') resolved = 'BTC/USD';
          return resolved;
        }
      }
    }
    
    // 2. Dicionário estático fallback
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
    for (const [pair, id] of Object.entries(staticIds)) {
      if (String(id) === String(activeId)) {
        return pair;
      }
    }
    return null;
  }

  function getActiveIdByPair(pair) {
    if (!pair) return null;
    if (window.__binaryOps_dynamicIds) {
      const cleanPair = pair.replace(/[ /]/g, '').toUpperCase();
      const possibleNames = [pair, cleanPair, cleanPair.replace('-OTC', 'OTC')];
      
      if (pair.includes('BTC')) {
         possibleNames.push('BITCOIN');
         possibleNames.push('BITCOIN-OTC');
         possibleNames.push('BITCOIN(OTC)');
         possibleNames.push('BTC');
      }
      
      for (let name of possibleNames) {
         if (window.__binaryOps_dynamicIds[name]) {
           return window.__binaryOps_dynamicIds[name];
         }
      }
    }
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
    const cleanPair = pair.replace(' ', '').toUpperCase();
    return staticIds[cleanPair] || null;
  }

  async function decompressMsg(rawData) {
    if (typeof rawData === 'string') return rawData;
    try {
      const arrayBuffer = rawData instanceof Blob ? await rawData.arrayBuffer() : rawData;
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(arrayBuffer);
      writer.close();
      const response = new Response(ds.readable);
      const buffer = await response.arrayBuffer();
      return new TextDecoder().decode(buffer);
    } catch(e1) {
      try {
        const arrayBuffer = rawData instanceof Blob ? await rawData.arrayBuffer() : rawData;
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(arrayBuffer);
        writer.close();
        const response = new Response(ds.readable);
        const buffer = await response.arrayBuffer();
        return new TextDecoder().decode(buffer);
      } catch(e2) {
        return null;
      }
    }
  }
  
  const activeWebSockets = window.__binaryOps_ws;
  const OriginalWebSocket = window.WebSocket;

  window.WebSocket = function(url, protocols) {
    console.log("[BinaryOps Interceptor] Novo WebSocket detectado. URL:", url);
    const ws = new OriginalWebSocket(url, protocols);
    activeWebSockets.add(ws);

    const originalSend = ws.send;
    ws.send = function(data) {
      if (!window.__binaryOps_balances && !this._balancesRequested) {
        this._balancesRequested = true;
        try { originalSend.call(this, JSON.stringify({"name":"sendMessage","msg":{"name":"get-balances","version":"1.0"}})); } catch(e) {}
      }
      try {
        const parsed = JSON.parse(data);
        if (parsed.name === "sendMessage" && parsed.msg && parsed.msg.name === "get-candles") {
          console.log("[BinaryOps WS Sent][get-candles]", parsed);
        }
        
        // Tentar capturar balance_id se a corretora enviar em alguma outra requisição
        if (parsed.msg && parsed.msg.body && parsed.msg.body.user_balance_id) {
            window.__binaryOps_lastSeenBalanceId = parsed.msg.body.user_balance_id;
        }
      } catch (e) {}
      return originalSend.apply(this, arguments);
    };

    // Ouvir mensagens recebidas para fins de log
    ws.addEventListener('message', async (event) => {
      try {
        const decompressed = await decompressMsg(event.data);
        if (!decompressed) return;
        const parsed = JSON.parse(decompressed);
        const name = parsed.name || (parsed.msg && parsed.msg.name) || '';

        // Sincronizar o horário do servidor da corretora
        if (name === "timeSync" || name === "profile" || name === "balances" || name === "candles") {
          event.target._isMainSocket = true;
        }

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
          let balances = (parsed.msg && parsed.msg.balances) || parsed.balances;
          if (!balances && Array.isArray(parsed.msg)) balances = parsed.msg;
          
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

        // Interceptar abertura de operação (Option Opened) globalmente para associar IDs a ordens físicas (DOM) ou WS recentes
        if (name === "option" || name === "option-opened" || name === "binary-options.option-opened" || (parsed.msg && (parsed.msg.name === "option-opened" || parsed.msg.name === "binary-options.option-opened"))) {
          const optData = (parsed.msg && parsed.msg.body) || parsed.msg || parsed;
          const optId = String(optData.id || optData.option_id || optData.optionId || '');
          const activeId = optData.active_id || optData.activeId;
          const dir = String(optData.direction || optData.dir || optData.type || '').toLowerCase();
          
          if (optId && optId !== 'undefined' && window.__binaryOps_lastRobotOrder) {
            const lastOrder = window.__binaryOps_lastRobotOrder;
            const timeSinceOrder = Date.now() - lastOrder.timestamp;
            const activeIdMatches = String(activeId) === String(lastOrder.activeId);
            const directionMatches = dir === lastOrder.direction.toLowerCase();
            
            // Se foi enviada há menos de 90 segundos (cobre M1 inteiro + margem)
            if (activeIdMatches && directionMatches && timeSinceOrder < 90000) {
              console.log(`[BinaryOps WS Received][OptionOpened] Associando ID ${optId} à ordem recente do robô!`);
              window.__binaryOps_openedOptionIds.add(optId);
            }
          }
        }

        // Interceptar conclusão de operação (Option/Position Closed) para feedback instantâneo
        if (name === "option-closed" || name === "position-closed" || name === "binary-options.option-closed" || (parsed.msg && (parsed.msg.name === "option-closed" || parsed.msg.name === "position-closed" || parsed.msg.name === "binary-options.option-closed"))) {
          const optData = (parsed.msg && parsed.msg.body) || parsed.msg || parsed;
          const closedId = String(optData.option_id || optData.id || optData.optionId || '');
          if (closedId === '' || closedId === 'undefined') return;
          
          let isRobotOrder = window.__binaryOps_openedOptionIds.has(closedId);
          
          // Fallback se o ID não estiver no Set (ex: falha na captura de abertura), mas as características batem
          if (!isRobotOrder && window.__binaryOps_lastRobotOrder) {
            const lastOrder = window.__binaryOps_lastRobotOrder;
            const timeSinceOrder = Date.now() - lastOrder.timestamp;
            const activeIdMatches = String(optData.active_id || optData.activeId) === String(lastOrder.activeId);
            const directionMatches = String(optData.dir || optData.direction || optData.type || '').toLowerCase() === lastOrder.direction.toLowerCase();
            
            // Se foi enviada há menos de 10 minutos (600000ms)
            if (activeIdMatches && directionMatches && timeSinceOrder < 600000) {
              console.log("[BinaryOps WS Received][OptionClosed] Fallback de segurança ativado: Correspondência encontrada por par e direção!", optData);
              isRobotOrder = true;
              window.__binaryOps_openedOptionIds.add(closedId); // Adiciona para evitar duplicidade
            }
          }
          
          if (isRobotOrder) {
            console.log("[BinaryOps WS Received][OptionClosed] Operação do robô finalizada:", parsed);
            const activeId = optData.active_id || optData.activeId;
            const resolvedPair = getPairNameByActiveId(activeId);
            window.postMessage({
              type: 'binaryops_option_closed',
              data: optData,
              pairName: resolvedPair
            }, '*');
          } else {
            console.log("[BinaryOps WS Received][OptionClosed] Ignorando operação manual (ID não foi aberto pelo robô).", closedId);
          }
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

  function showErrorAlert(errMsg) {
    // Removido a pedido do usuário. Os logs ainda vão pro console, mas o card vermelho sumiu.
    console.warn("[BinaryOps] (Alerta Oculto) Motivo da falha WS:", errMsg);
  }

  window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    if (event.data.type === 'binaryops_physical_order_placed') {
      const { direction, amount, pair } = event.data;
      const activeId = getActiveIdByPair(pair);
      const dir = direction.toUpperCase() === 'CALL' ? 'call' : 'put';
      console.log(`[BinaryOps Interceptor] Recebida notificação de ordem física (DOM): ${pair} -> ${dir} $${amount}`);
      
      window.__binaryOps_lastRobotOrder = {
        activeId: activeId,
        direction: dir,
        amount: amount,
        timestamp: Date.now()
      };
      return;
    }

    if (event.data.type !== 'binaryops_place_order_ws') return;

    const { direction, amount, pair, timeframe, requestId, accountType } = event.data;
    console.log(`[BinaryOps Interceptor] Ordem via WS recebida: ${pair} ${direction} $${amount} (Conta: ${accountType || 'Desconhecida'})`);

    const wsSet = window.__binaryOps_ws;
    if (!wsSet || wsSet.size === 0) {
      showErrorAlert('Nenhum WebSocket capturado. O robô foi injetado tarde demais. Tente dar um CTRL+F5 na página.');
      window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: 'Nenhum WebSocket capturado.' }, '*');
      return;
    }

    // Achar um socket aberto (Priorizar o socket principal que recebe timeSync/profile)
    let openWs = null;
    let fallbackWs = null;
    wsSet.forEach(w => {
      if (w.readyState === WebSocket.OPEN) {
        if (w._isMainSocket) {
          openWs = w;
        }
        fallbackWs = w; // Guarda qualquer um como backup
      }
    });
    
    // Se não achou o principal, usa o backup
    if (!openWs) {
      openWs = fallbackWs;
    }

    if (!openWs) {
      showErrorAlert('Nenhum WebSocket está aberto (OPEN). A corretora pode estar desconectada.');
      window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: 'Nenhum WebSocket aberto.' }, '*');
      return;
    }

    // Calcular ID do Saldo da Conta (Demo vs Real)
    const balances = window.__binaryOps_balances || {};
    let userBalanceId = window.__binaryOps_lastSeenBalanceId || 0;
    
    if (accountType === 'real' && balances.real) {
      userBalanceId = balances.real;
    } else if (accountType === 'demo' && balances.demo) {
      userBalanceId = balances.demo;
    } else if (balances.demo && userBalanceId === 0) {
      userBalanceId = balances.demo;
    }

    if (userBalanceId === 0) {

      // Se ainda for zero, pede pra corretora enviar os saldos agora mesmo e usa o fallback de DOM por enquanto
      try { openWs.send(JSON.stringify({"name":"sendMessage","msg":{"name":"get-balances","version":"1.0"}})); } catch(e){}
      
      showErrorAlert('ID da sua conta (Real/Demo) ainda não foi detectado pela injeção. O robô vai tentar clicar na tela desta vez, mas para a próxima, o ID já foi solicitado ao servidor!');
      window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: 'user_balance_id é ZERO.' }, '*');
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
    } else {
      // Se o par não tiver OTC no nome, mas a corretora só tiver a versão OTC aberta:
      pairVariations.push(pair + '-OTC');
      pairVariations.push(pair + ' (OTC)');
    }

    if (pair.includes('BTC')) {
      pairVariations.push('BITCOIN');
      pairVariations.push('BITCOIN-OTC');
      pairVariations.push('BITCOIN(OTC)');
      pairVariations.push('BTC');
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
        'EUR/CHF-OTC': 177, 'AUD/CHF-OTC': 178, 'CAD/CHF-OTC': 179,
        'BTC/USD': 810, 'BTC/USD-OTC': 808
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
    let expTime = (Math.floor(serverTime / expirationSec) + 1) * expirationSec;
    
    // Na IQ Option / Exnova, opções turbo não podem ser compradas faltando menos de 30s para expirar.
    // O tempo de compra (purchase time) encerra 30s antes do tempo de expiração.
    if (expTime - serverTime < 30) {
      expTime += expirationSec;
      console.log(`[BinaryOps Interceptor] Expiração ajustada para +1 vela pois faltam menos de 30s para o corte.`);
    }

    const dir = direction.toUpperCase() === 'CALL' ? 'call' : 'put';
    const wsRequestId = 'bo_order_' + Math.floor(Math.random() * 1000000);

    // Registrar a última ordem do robô como fallback de captura no option-closed
    window.__binaryOps_lastRobotOrder = {
      activeId: activeId,
      direction: dir,
      amount: amount,
      expired: expTime,
      timestamp: Date.now()
    };

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
          value: amount,       // Redundância para novas APIs
          amount: amount,      // Redundância para novas APIs
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
        window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: 'Timeout WS (5.0s).' }, '*');
      }
    }, 5000);

    const responseHandler = async (event) => {
      if (responded) return;
      try {
        const decompressed = await decompressMsg(event.data);
        if (!decompressed) return;
        const data = JSON.parse(decompressed);
        const msgName = data.name || '';
        const respReqId = data.request_id || '';

        // Resposta direta ao nosso request_id
        if (String(respReqId) === String(wsRequestId)) {
          responded = true;
          clearTimeout(responseTimeout);
          openWs.removeEventListener('message', responseHandler);

          const optDataRes = (data.msg && data.msg.body) || data.msg || data;
          const optionId = optDataRes.id || optDataRes.option_id || optDataRes.optionId;

          const isErrorMsg = msgName === 'error' || 
                             (data.msg && data.msg.name === 'error') ||
                             (data.msg && data.msg.isSuccessful === false) ||
                             (data.msg && data.msg.status === 'error') ||
                             (data.msg && typeof data.msg.message === 'string' && data.msg.message.toLowerCase().includes('error'));

          if (isErrorMsg) {
            
            const errMsg = (data.msg && data.msg.message) ? data.msg.message : `Rejeitado pela corretora: ${JSON.stringify(data.msg || data)}`;
            console.warn(`[BinaryOps Interceptor] Falha ao enviar ordem:`, data);
            
            window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: errMsg }, '*');
          } else if (optionId || (data.msg && data.msg.isSuccessful === true) || msgName === 'option-opened') {
            console.log(`[BinaryOps Interceptor] Ordem aceita pela corretora! ID: ${optionId || 'Aguardando broadcast'}`, data);
            if (optionId) {
              window.__binaryOps_openedOptionIds.add(String(optionId));
            }
            window.postMessage({ type: 'binaryops_order_result', requestId, status: 'success', data: optDataRes }, '*');
          } else {
            // Respondeu ao request_id mas sem optionId. Isso quase sempre é uma rejeição silenciosa!
            console.warn(`[BinaryOps Interceptor] Resposta vaga da corretora, tratando como falha para agilizar fallback:`, data);
            const rawResponse = JSON.stringify(data.msg || data);
            window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: `Rejeição Silenciosa: ${rawResponse}` }, '*');
          }
        }
        // Resposta via broadcast de abertura de opção da corretora
        if (msgName === 'option' || msgName === 'option-opened' || msgName === 'binary-options.option-opened' || (data.msg && (data.msg.name === 'option-opened' || data.msg.name === 'binary-options.option-opened'))) {
          const optData = (data.msg && data.msg.body) || data.msg || data;
          const optId = optData.id || optData.option_id || optData.optionId;
          if (optId) {
             window.__binaryOps_openedOptionIds.add(String(optId));
          }
          // Validar se o broadcast é da opção que acabamos de mandar (mesmo par e direção)
          const bActive = String(optData.active_id || optData.activeId || activeId); // Assume o mesmo se não vier
          const bDir = String(optData.direction || optData.dir || optData.type || dir).toLowerCase();
          
          if (bActive === String(activeId) && bDir === String(dir)) {
            if (!responded) {
              responded = true;
              clearTimeout(responseTimeout);
              openWs.removeEventListener('message', responseHandler);
              console.log(`[BinaryOps Interceptor] Ordem confirmada via "${msgName}" validada por par e direção!`, data);
              window.postMessage({ type: 'binaryops_order_result', requestId, status: 'success', data: optData }, '*');
            }
          }
        }
        // Interceptar erros gerais enviados pela corretora MESMO SEM o nosso request_id
        if (msgName === 'error' || (data.msg && data.msg.message && data.msg.message.toLowerCase().includes("error"))) {
          if (!responded) {
            const errMsg = (data.msg && data.msg.message) ? data.msg.message : (data.message || `Erro Genérico Global: ${JSON.stringify(data)}`);
            console.error(`[BinaryOps Interceptor] ERRO GLOBAL DA CORRETORA:`, errMsg, data);
            
            // Só mandamos o erro pro fallback se tivermos a certeza que foi uma tentativa de operação recente.
            // Para não cancelar de graça, esperamos o timeout, a não ser que pareça ser relacionado à nossa ordem.
            if (errMsg.includes("expired") || errMsg.includes("balance") || errMsg.includes("asset")) {
               responded = true;
               clearTimeout(responseTimeout);
               openWs.removeEventListener('message', responseHandler);
               window.postMessage({ type: 'binaryops_order_result', requestId, status: 'error', error: errMsg }, '*');
            }
          }
        }
      } catch(e) {}
    };

    openWs.addEventListener('message', responseHandler);
    openWs.send(JSON.stringify(orderMsg));
  });

})();

