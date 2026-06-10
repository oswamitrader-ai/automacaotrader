// ============================================
// CONTENT SCRIPT - Injected in Broker Sites
// ============================================

(function() {
  if (window.__binaryOpsContentLoaded) {
    console.log("[BinaryOps Content Script] Já carregado nesta página. Ignorando nova injeção para evitar duplicidade de ordens.");
    return;
  }
  window.__binaryOpsContentLoaded = true;

  console.log("[BinaryOps Content Script] Iniciado na página:", window.location.hostname);

// =========================================================================
// O script de interceptação do WebSocket (MAIN World) é registrado no manifest.json
// mas também usamos um fallback de injeção inline para garantir a compatibilidade
// caso o navegador atrase o carregamento do manifest.
// =========================================================================

function injectMainScript() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/injected.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log("[BinaryOps Content] Fallback de injeção de script executado.");
  } catch (e) {
    console.warn("[BinaryOps Content] Falha no fallback de injeção:", e);
  }
}
injectMainScript();

// =========================================================================
// CONTENT SCRIPT (ISOLATED World) - Comunicação via postMessage
// =========================================================================
let currentCandlesResolver = null;
let currentRequestedActiveId = null;

window.addEventListener('message', (event) => {
  // Ignorar mensagens de outras origens ou sem tipo
  if (!event.data || !event.data.type) return;
  
  if (event.data.type === 'binaryops_candles_received') {
    const respActiveId = event.data.activeId;
    console.log(`[BinaryOps Content] Candles recebidos via postMessage. activeId: ${respActiveId}, solicitado: ${currentRequestedActiveId}`);
    
    if (currentCandlesResolver) {
      if (String(respActiveId) === String(currentRequestedActiveId)) {
        console.log(`[BinaryOps Content] activeId bateu! Resolvendo com ${event.data.candles ? event.data.candles.length : 0} velas.`);
        currentCandlesResolver({ status: "success", candles: event.data.candles });
        currentCandlesResolver = null;
        currentRequestedActiveId = null;
      } else {
        console.log(`[BinaryOps Content] activeId recebido (${respActiveId}) != solicitado (${currentRequestedActiveId}). Ignorando.`);
      }
    }
  }
  
  if (event.data.type === 'binaryops_candles_error') {
    console.error(`[BinaryOps Content] Erro via postMessage:`, event.data.error);
    if (currentCandlesResolver) {
      currentCandlesResolver({ status: "error", error: event.data.error });
      currentCandlesResolver = null;
      currentRequestedActiveId = null;
    }
  }

  if (event.data.type === 'binaryops_option_closed') {
    const rawData = event.data.data;
    const resolvedPair = event.data.pairName;
    console.log(`[BinaryOps Content] Operação fechada recebida via WS!`, rawData, "Par resolvido:", resolvedPair);
    
    // Extrair valores (investimento e retorno)
    const amountVal = rawData.amount || (rawData.msg && rawData.msg.amount) || rawData.invest || (rawData.msg && rawData.msg.invest) || rawData.enrolled_amount || (rawData.msg && rawData.msg.enrolled_amount) || 0;
    const profitVal = rawData.profit || (rawData.msg && rawData.msg.profit) || rawData.win_amount || (rawData.msg && rawData.msg.win_amount) || rawData.profit_amount || (rawData.msg && rawData.msg.profit_amount) || 0;

    // Mapear resultado (a API da corretora usa a chave "win" com os valores "win", "loose", "equal" ou similares)
    let result = 'DRAW';
    let winState = rawData.win || (rawData.msg && rawData.msg.win) || rawData.result || (rawData.msg && rawData.msg.result) || rawData.close_reason || (rawData.msg && rawData.msg.close_reason) || '';
    
    if (typeof winState === 'string') {
      winState = winState.trim().toLowerCase();
    } else if (typeof winState === 'boolean') {
      winState = winState ? 'win' : 'loose';
    } else if (winState !== null && winState !== undefined) {
      winState = String(winState).trim().toLowerCase();
    } else {
      winState = '';
    }

    if (winState === 'win' || winState === 'win_by_payout' || winState === 'won') {
      result = 'WIN';
    } else if (winState === 'loose' || winState === 'lose' || winState === 'loss' || winState === 'lost' || winState === 'loose_by_payout' || winState === 'lose_by_payout') {
      result = 'LOSS';
    } else if (winState === 'equal' || winState === 'draw' || winState === 'drawn' || winState === 'draw_by_payout') {
      result = 'DRAW';
    } else {
      // Fallback baseado nos valores financeiros se a corretora ocultar o winState
      const amt = Number(amountVal);
      const prof = Number(profitVal);
      if (prof > amt) result = 'WIN';
      else if (prof === 0 && amt > 0) result = 'LOSS';
      else if (prof === amt && amt > 0) result = 'DRAW';
      else result = 'LOSS'; // Em caso de dúvida, considerar Loss para não escalar soros indevidamente
    }
    
    // Detectar direção
    const dirRaw = rawData.dir || (rawData.msg && rawData.msg.dir) || rawData.direction || (rawData.msg && rawData.msg.direction) || rawData.type || (rawData.msg && rawData.msg.type) || 'CALL';
    const direction = String(dirRaw).toUpperCase();

    // Envia para o background
    chrome.runtime.sendMessage({
      action: "option_closed_ws",
      data: {
        activeId: rawData.active_id || (rawData.msg && rawData.msg.active_id) || rawData.activeId,
        direction: direction,
        amount: Number(amountVal),
        profit: Number(profitVal),
        result: result,
        optionId: rawData.option_id || (rawData.msg && rawData.msg.option_id) || rawData.id,
        pair: resolvedPair // Envia o par já mapeado e resolvido via WS
      }
    });
  }
});

// Detectar corretora baseada no hostname
let broker = 'unknown';
if (window.location.hostname.includes('exnova')) broker = 'exnova';
else if (window.location.hostname.includes('iqoption')) broker = 'iqoption';
else if (window.location.hostname.includes('bullex')) broker = 'bullex';

// Configuração de seletores (podem ser estendidos/ajustados)
const SELECTORS = {
  exnova: {
    amountInput: 'input[data-test="amount-input"], input.input-control, .amount-input input, input.amount-value, input.input-field-value, input[name="amount"], input.amount, input[type="number"], input[type="text"]',
    callBtn: 'button[data-test="button-call"], .btn-call, button.up, .button-up, button[data-type="up"], button.call, [class*="button-up"] button, [class*="call"] button',
    putBtn: 'button[data-test="button-put"], .btn-put, button.down, .button-down, button[data-type="down"], button.put, [class*="button-down"] button, [class*="put"] button',
    balance: '.balance-value, .user-balance, .header-balance, [class*="balance"]'
  },
  iqoption: {
    amountInput: 'input[data-test="amount-input"], input.input-control, .amount-input input, input.amount-value, input.input-field-value, input[name="amount"], input.amount, input[type="number"], input[type="text"]',
    callBtn: 'button[data-test="button-call"], .btn-call, button.up, .button-up, button[data-type="up"], button.call, [class*="button-up"] button, [class*="call"] button',
    putBtn: 'button[data-test="button-put"], .btn-put, button.down, .button-down, button[data-type="down"], button.put, [class*="button-down"] button, [class*="put"] button',
    balance: '.balance-value, .user-balance, .header-balance, [class*="balance"]'
  },
  bullex: {
    amountInput: 'input[name="amount"], input.amount, .amount-input input, input[type="number"], input[type="text"]',
    callBtn: '.btn-green, button.call, button.up, button.buy, [class*="call"] button',
    putBtn: '.btn-red, button.put, button.down, button.sell, [class*="put"] button',
    balance: '.balance, .user-balance, [class*="balance"]'
  }
};

// Registrar com o background script da extensão
chrome.runtime.sendMessage({
  action: "broker_initialized",
  broker: broker
}, (response) => {
  console.log("[BinaryOps Content Script] Registro no background respondido:", response);
});

// Ouvir ordens vindas do background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Buscar calendário econômico via DOM para evitar bloqueios do Cloudflare no background service worker
  if (message.action === "fetch_economic_calendar_dom") {
    fetch(message.url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(html => {
        sendResponse({ status: "success", html: html });
      })
      .catch(err => {
        console.error("[BinaryOps Content] Erro ao buscar calendário:", err);
        sendResponse({ status: "error", error: err.message });
      });
    return true; // mantém o canal aberto
  }

  // Requisitar candles da corretora via WebSocket ativo
  if (message.action === "request_otc_candles_from_ws") {
    currentRequestedActiveId = message.activeId;
    console.log(`[BinaryOps Content] Recebida solicitação de candles para activeId: ${currentRequestedActiveId}, size: ${message.size}`);
    
    // Envia pedido para o MAIN world via postMessage (não CustomEvent!)
    window.postMessage({
      type: 'binaryops_request_candles',
      activeId: message.activeId,
      size: message.size,
      to: message.to,
      count: 1000
    }, '*');
    
    currentCandlesResolver = (response) => {
      sendResponse(response);
    };
    
    // Timeout de 15 segundos para responder caso a corretora falhe
    setTimeout(() => {
      if (currentCandlesResolver) {
        console.warn(`[BinaryOps Content] Timeout de 15s estourado para activeId: ${currentRequestedActiveId}`);
        currentCandlesResolver({ status: "error", error: "A corretora demorou muito para responder com o histórico de candles." });
        currentCandlesResolver = null;
        currentRequestedActiveId = null;
      }
    }, 15000);
    
    return true; // canal aberto de resposta assíncrona
  }

  if (message.action === "place_order") {
    // Apenas executar no frame principal (Top Frame) para evitar ordens duplicadas via iframes.
    if (window !== window.top) {
      return false;
    }

    console.log(`[BinaryOps Content Script] Executando ordem no frame correto: ${window.location.href}`);
    
    const notifyPhysicalOrder = () => {
      window.postMessage({
        type: 'binaryops_physical_order_placed',
        direction: message.direction,
        amount: message.amount,
        pair: message.pair
      }, '*');
    };
    
    // ============================================
    // ESTRATÉGIA 1 (PRIMÁRIA): Envio via WebSocket da corretora
    // Muito mais confiável que clicar em botões DOM/Canvas.
    // ============================================
    const wsRequestId = 'content_order_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    let wsResponded = false;
    let wsTimeout = null;

    const wsResultHandler = (event) => {
      if (!event.data || event.data.type !== 'binaryops_order_result') return;
      if (event.data.requestId !== wsRequestId) return;
      
      wsResponded = true;
      clearTimeout(wsTimeout);
      window.removeEventListener('message', wsResultHandler);

      if (event.data.status === 'success') {
        console.log(`[BinaryOps Content Script] ✅ Ordem executada via WebSocket API!`);
        
        // Atualizar visualmente o campo de valor na tela apenas para dar feedback ao usuário
        try {
          const inputs = document.querySelectorAll('input:not([type="hidden"])');
          const keywords = ['amount', 'valor', 'invest', 'deal-amount'];
          let visualAmountEl = null;
          for (let input of inputs) {
            const ph = (input.placeholder || '').toLowerCase();
            const ariaph = (input.getAttribute('aria-placeholder') || '').toLowerCase();
            if (keywords.some(k => ph.includes(k) || ariaph.includes(k))) {
              visualAmountEl = input; break;
            }
          }
          if (visualAmountEl) {
            const valStr = Number.isInteger(Number(message.amount)) ? Number(message.amount).toString() : Number(message.amount).toFixed(2);
            visualAmountEl.value = valStr;
          }
        } catch(e) {}

        sendResponse({ status: "success", msg: "Ordem executada via WebSocket API da corretora" });
      } else {
        console.warn(`[BinaryOps Content Script] ⚠️ Falha na execução via WS: ${event.data.error}. Tentando fallback físico (DOM/Coordenadas)...`);
        
        notifyPhysicalOrder();
        executeTradingOrder(message.direction, message.amount)
          .then(() => {
            console.log(`[BinaryOps Content Script] ✅ Ordem executada via fallback físico.`);
            sendResponse({ status: "success", msg: "Ordem executada via clique físico após falha no WS" });
          })
          .catch((domErr) => {
            console.error(`[BinaryOps Content Script] 🚨 Falha no fallback físico também:`, domErr);
            sendResponse({ status: "error", error: `Falha no WS (${event.data.error}) e no clique físico (${domErr.message})` });
          });
      }
    };

    window.addEventListener('message', wsResultHandler);

    // Enviar pedido para o MAIN world (injected.js) via postMessage
    window.postMessage({
      type: 'binaryops_place_order_ws',
      direction: message.direction,
      amount: message.amount,
      pair: message.pair,
      timeframe: message.timeframe,
      requestId: wsRequestId,
      accountType: message.accountType
    }, '*');

    // Timeout de segurança: se o MAIN world não responder in 10s (ex: corretora indisponível)
    wsTimeout = setTimeout(() => {
      if (!wsResponded) {
        wsResponded = true;
        window.removeEventListener('message', wsResultHandler);
        console.warn("[BinaryOps Content Script] Timeout WS. Tentando fallback físico...");
        
        notifyPhysicalOrder();
        executeTradingOrder(message.direction, message.amount)
          .then(() => {
            console.log(`[BinaryOps Content Script] ✅ Ordem executada via fallback físico.`);
            sendResponse({ status: "success", msg: "Ordem executada via clique físico após timeout no WS" });
          })
          .catch((domErr) => {
            console.error(`[BinaryOps Content Script] 🚨 Falha no fallback físico também:`, domErr);
            sendResponse({ status: "error", error: `Timeout WS e falha no clique físico (${domErr.message})` });
          });
      }
    }, 10000);

    return true;
  }

  // Listener para Calibração de Botões
  if (message.action === "start_calibration") {
    const direction = message.direction;
    console.log(`[BinaryOps] Iniciando calibração para ${direction}`);
    
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
    overlay.style.zIndex = '9999999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.color = '#00ffaa';
    overlay.style.fontSize = '32px';
    overlay.style.fontWeight = 'bold';
    overlay.style.pointerEvents = 'none'; // Importante: o clique atravessa o overlay para atingir a corretora
    overlay.innerText = `CLIQUE FISICAMENTE NO ${direction === 'CALL' ? 'ACIMA' : (direction === 'PUT' ? 'ABAIXO' : 'CAMPO DE VALOR')} AGORA`;
    
    const subtext = document.createElement('div');
    subtext.innerText = "(Seu clique ficará salvo na memória do Robô. O robô vai clicar exatamente aí nas próximas vezes.)";
    subtext.style.fontSize = '18px';
    subtext.style.color = 'white';
    subtext.style.marginTop = '20px';
    overlay.appendChild(subtext);
    
    document.body.appendChild(overlay);

    const clickHandler = (e) => {
      // Capturar as coordenadas exatas da tela
      const x = e.clientX;
      const y = e.clientY;
      console.log(`[BinaryOps] Calibrado ${direction} em X:${x}, Y:${y}`);
      
      chrome.storage.local.get({ calibrationCoords: {} }).then((result) => {
        const coords = result.calibrationCoords;
        coords[direction] = { x, y };
        return chrome.storage.local.set({ calibrationCoords: coords });
      }).then(() => {
        if(overlay.parentNode) document.body.removeChild(overlay);
        window.removeEventListener('click', clickHandler, true);
        sendResponse({ status: "success", x, y });
      });
    };
    
    // Escuta na fase capture para pegar o clique em qualquer lugar da tela
    window.addEventListener('click', clickHandler, true);
    return true;
  }
});

// Função para simular clique de trading
async function executeTradingOrder(direction, amount) {
  const sel = SELECTORS[broker] || SELECTORS.exnova; // Fallback para Exnova
  const amountEl = document.querySelector(sel.amountInput);
  console.log("[BinaryOps] Tentando ajustar valor da ordem na tela para: " + amount);

  if (amountEl && amount) {
    try {
      // Tentar alterar o valor visualmente para o Fallback não usar a banca toda acidentalmente
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(amountEl, amount);
      } else {
        amountEl.value = amount;
      }
      amountEl.dispatchEvent(new Event('input', { bubbles: true }));
      amountEl.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      console.warn("Erro ao tentar alterar o valor no DOM:", e);
    }
  }
  
  // Nível 0: Tentativa via Coordenadas Calibradas (A arma definitiva contra Canvas)
  try {
    const coordsObj = await chrome.storage.local.get('calibrationCoords');
    const coords = coordsObj.calibrationCoords || {};
    if (coords[direction] && coords[direction].x) {
      console.log(`[BinaryOps] Usando clique CALIBRADO para ${direction} em X:${coords[direction].x}, Y:${coords[direction].y}`);
      simulateMouseClickByCoords(coords[direction].x, coords[direction].y);
      return true;
    }
  } catch(e) {
    console.error("Erro ao checar calibração:", e);
  }
  
  // 2. Achar o botão de direção (CALL ou PUT)
  let btn = null;
  if (direction === 'CALL') {
    btn = document.querySelector(sel.callBtn) || findButtonByKeywords(['call', 'up', 'acima', 'compra', 'cima', 'subir', 'superior', 'higher'], true, amountEl);
  } else {
    btn = document.querySelector(sel.putBtn) || findButtonByKeywords(['put', 'down', 'abaixo', 'venda', 'baixo', 'descer', 'inferior', 'lower'], false, amountEl);
  }
  
  if (!btn) {
    throw new Error(`Botão para a direção ${direction} não localizado na tela`);
  }
  
  console.log("[BinaryOps Content Script] Botão de direção encontrado:", btn);
  
  // Achar o elemento de clique ideal (o próprio botão ou o pai clicável mais próximo)
  const clickTarget = btn.closest('button, div[role="button"], [class*="btn"], [class*="button"]') || btn;
  
  // 3. Simular clique físico completo (MouseEvents)
  simulateMouseClick(clickTarget);
  console.log(`[BinaryOps Content Script] Ordem de ${direction} enviada com clique simulado cego.`);
  
  // ALERTA: Em corretoras novas (Exnova/IQ Option Canvas), clique não-isTrusted é IGNORADO!
  // Como não usamos calibração física de tela, avisaremos que pode não ter ido.
  throw new Error(`A corretora rejeitou via API e o clique simulado DOM não é confiável sem CALIBRAÇÃO DE TELA. Use a Calibração no Painel para cliques físicos perfeitos!`);
}

// Simular cliques de mouse reais (essencial para contornar proteções e React)
function simulateMouseClick(element) {
  const mouseEvents = ['mouseover', 'mousedown', 'mouseup', 'click'];
  mouseEvents.forEach(evtName => {
    const event = new MouseEvent(evtName, {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1
    });
    element.dispatchEvent(event);
  });
}

function simulateMouseClickByCoords(x, y) {
  const element = document.elementFromPoint(x, y) || document.body;
  const mouseEvents = ['mouseover', 'mousedown', 'mouseup', 'click'];
  mouseEvents.forEach(evtName => {
    const event = new MouseEvent(evtName, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      buttons: 1
    });
    element.dispatchEvent(event);
  });
}

// Helpers para encontrar elementos se os seletores fixos falharem
function findInputByPlaceholderOrLabel() {
  const inputs = document.querySelectorAll('input:not([type="hidden"])');
  
  // Nível 1: Tentar por attributes
  const keywords = ['amount', 'valor', 'invest', 'investimento', 'deal-amount', 'deal_amount', 'quantia', 'value'];
  for (let input of inputs) {
    const ph = (input.placeholder || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const aria = (input.getAttribute('aria-label') || '').toLowerCase();
    const ariaph = (input.getAttribute('aria-placeholder') || '').toLowerCase();
    const classes = (input.className || '').toLowerCase();
    
    for (let kw of keywords) {
      if (ph.includes(kw) || name.includes(kw) || id.includes(kw) || aria.includes(kw) || ariaph.includes(kw) || classes.includes(kw)) {
        return input;
      }
    }
  }
  
  // Nível 2: Procurar elementos de texto contendo palavras-chave e ver se há um input próximo no DOM
  const textElements = document.querySelectorAll('span, div, label, p');
  const labelKeywords = ['valor', 'amount', 'investimento', 'invest', 'quantia'];
  for (let el of textElements) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    if (labelKeywords.some(kw => text.includes(kw))) {
      // Procurar o input mais próximo após esse elemento
      const parent = el.parentElement;
      if (parent) {
        const siblingInput = parent.querySelector('input');
        if (siblingInput) return siblingInput;
        
        // Tentar ver no pai do pai
        const grandParent = parent.parentElement;
        if (grandParent) {
          const relativeInput = grandParent.querySelector('input');
          if (relativeInput) return relativeInput;
        }
      }
    }
  }
  
  // Nível 3: Selecionar o input que esteja na metade direita da tela (onde geralmente fica o painel de trading)
  const rightInputs = [];
  const screenWidth = window.innerWidth;
  for (let input of inputs) {
    const rect = input.getBoundingClientRect();
    if (rect.left > screenWidth * 0.5 && rect.width > 0 && rect.height > 0) {
      rightInputs.push(input);
    }
  }
  if (rightInputs.length > 0) {
    return rightInputs[0];
  }
  
  // Nível 4: Como último recurso, o primeiro input visível na página
  for (let input of inputs) {
    const rect = input.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return input;
    }
  }
  
  return null;
}

function findButtonByKeywords(keywords, isCall = true, amountEl = null) {
  // Nível 1: Buscar em absolutamente todos os elementos do DOM que contêm o texto
  const allElements = document.querySelectorAll('*');
  for (let el of allElements) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    const title = (el.title || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    
    // Ignorar elementos muito grandes (ex: body, container da tela inteira)
    if (text.length > 100 && !title && !aria) continue;
    
    for (let kw of keywords) {
      if (text === kw || text.includes(kw) || title.includes(kw) || aria.includes(kw)) {
        // Encontramos! Agora vamos garantir que retornamos o elemento clicável pai
        let target = el;
        for (let i = 0; i < 5; i++) {
          if (!target || target === document.body) break;
          const tagName = (target.tagName || '').toLowerCase();
          const classAttr = target.getAttribute('class') || '';
          const className = (typeof classAttr === 'string' ? classAttr : '').toLowerCase();
          const role = (target.getAttribute('role') || '').toLowerCase();
          
          if (tagName === 'button' || tagName === 'a' || role === 'button' || className.includes('btn') || className.includes('button') || className.includes('action')) {
            return target;
          }
          target = target.parentElement;
        }
        return el; // Retorna o próprio elemento se não achar botão óbvio
      }
    }
  }

  // Nível 2: Procurar a partir do input de Amount (pois os botões ficam logo abaixo dele no painel)
  if (amountEl) {
    // Subir até o container do painel lateral (vamos tentar subir 5-8 níveis)
    let panel = amountEl;
    for (let i = 0; i < 8; i++) {
      if (panel.parentElement) panel = panel.parentElement;
    }
    
    // Dentro desse painel, procurar elementos que pareçam botões verdes/vermelhos
    const panelElements = panel.querySelectorAll('*');
    for (let el of panelElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 20) {
        try {
          const style = window.getComputedStyle(el);
          if (!style) continue;
          const bgColor = style.backgroundColor || '';
          const rgb = bgColor.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const r = parseInt(rgb[0]);
            const g = parseInt(rgb[1]);
            const b = parseInt(rgb[2]);
            
            if (isCall && g > r + 30 && g > b + 30 && g > 100) {
              return el; // Mais verde que os outros
            }
            if (!isCall && r > g + 30 && r > b + 30 && r > 100) {
              return el; // Mais vermelho que os outros
            }
          }
        } catch(e) {}
      }
    }
  }

  // Nível 3: Buscar por classes genéricas indicativas de call/put em toda a tela (metade direita)
  const buttons = document.querySelectorAll('button, div[role="button"], a, [class*="up"], [class*="down"], [class*="call"], [class*="put"], [class*="high"], [class*="low"]');
  const screenWidth = window.innerWidth;
  
  for (let btn of buttons) {
    const rect = btn.getBoundingClientRect();
    if (rect.left > screenWidth * 0.4 && rect.width > 20 && rect.height > 20) {
      const classAttr = btn.getAttribute('class') || '';
      const className = (typeof classAttr === 'string' ? classAttr : '').toLowerCase();
      const id = (btn.id || '').toLowerCase();
      const dataTest = (btn.getAttribute('data-test') || '').toLowerCase();
      
      const callIndicators = ['up', 'call', 'high', 'green', 'buy'];
      const putIndicators = ['down', 'put', 'low', 'red', 'sell'];
      
      const checkList = isCall ? callIndicators : putIndicators;
      
      for (let ind of checkList) {
        if (className.includes(ind) || id.includes(ind) || dataTest.includes(ind)) {
          // Relaxando verificação de cor porque a Exnova usa gradientes complexos e SVGs em vez de backgroundColor simples
          let isColorMatch = false;
          try {
            const style = window.getComputedStyle(btn);
            if (style) {
              const bgColor = style.backgroundColor || '';
              const bgImage = style.backgroundImage || '';
              const rgb = bgColor.match(/\d+/g);
              if (rgb && rgb.length >= 3) {
                const r = parseInt(rgb[0]), g = parseInt(rgb[1]), b = parseInt(rgb[2]);
                if (isCall && g > r && g > 80) isColorMatch = true;
                if (!isCall && r > g && r > 80) isColorMatch = true;
              }
              // Verificar gradientes
              if (isCall && bgImage.includes('green')) isColorMatch = true;
              if (!isCall && bgImage.includes('red')) isColorMatch = true;
            }
          } catch(e) {}
          
          // Retornar o botão se a cor bater ou se o nome da classe for muito forte
          if (isColorMatch || className === ind || className.includes(`btn-${ind}`) || className.includes(`button-${ind}`)) {
            return btn;
          }
        }
      }
    }
  }

  // Nível 4: Busca por cor extrema em elementos SVG ou ícones
  const svgs = document.querySelectorAll('svg, path');
  for (let svg of svgs) {
    const rect = svg.getBoundingClientRect();
    if (rect.left > screenWidth * 0.4) {
      try {
        const style = window.getComputedStyle(svg);
        if (!style) continue;
        const fill = style.fill || '';
        const color = style.color || '';
        
        const checkColor = (colorStr) => {
          if (!colorStr) return false;
          const rgb = colorStr.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            const r = parseInt(rgb[0]), g = parseInt(rgb[1]), b = parseInt(rgb[2]);
            if (isCall && g > r + 30 && g > 100) return true;
            if (!isCall && r > g + 30 && r > 100) return true;
          }
          return false;
        };
        
        if (checkColor(fill) || checkColor(color)) {
          // Encontrou ícone colorido, subir para achar o botão clicável
          let parent = svg.parentElement;
          for(let i=0; i<4; i++) {
            if (parent) {
              const pTag = (parent.tagName || '').toLowerCase();
              const pClassAttr = parent.getAttribute('class') || '';
              const pClass = (typeof pClassAttr === 'string' ? pClassAttr : '').toLowerCase();
              if (pTag === 'button' || parent.getAttribute('role') === 'button' || pClass.includes('btn')) {
                return parent;
              }
            }
            if (parent) parent = parent.parentElement;
          }
          return svg.parentElement || svg;
        }
      } catch(e) {}
    }
  }

  // Nível 5: Heurística Estrutural Suprema (Os maiores botões do painel lateral inteiro)
  if (amountEl) {
    let panel = amountEl;
    // Subir até encontrar o container principal lateral (altura > 250px)
    while (panel && panel.parentElement && panel !== document.body) {
      const rect = panel.getBoundingClientRect();
      if (rect.height > 250 && rect.width > 150) break;
      panel = panel.parentElement;
    }
    
    const candidates = [];
    // Pegar TUDO dentro do painel que tenha tamanho de botão
    const elements = panel.querySelectorAll('*');
    for (let el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 50 && rect.width <= 400 && rect.height >= 30 && rect.height <= 150) {
        try {
          const style = window.getComputedStyle(el);
          const cursor = style ? style.cursor : '';
          const role = el.getAttribute('role') || '';
          const tagName = el.tagName.toLowerCase();
          const className = (typeof el.className === 'string' ? el.className : '').toLowerCase();
          
          // Ampliando a definição do que é um "botão" (qualquer div com cursor pointer ou classe de botão)
          if (cursor === 'pointer' || tagName === 'button' || role === 'button' || className.includes('btn') || className.includes('button')) {
            candidates.push({ el, rect, area: rect.width * rect.height });
          }
        } catch(e) {}
      }
    }
    
    // Ordenar do maior para o menor e remover elementos que contêm uns aos outros (pegar apenas os "filhos mais altos" ou pais)
    candidates.sort((a, b) => b.area - a.area);
    
    // Filtrar candidatos isolados (dois maiores que não são o mesmo botão)
    const uniqueCandidates = [];
    for (let cand of candidates) {
      let isDuplicate = false;
      for (let u of uniqueCandidates) {
        // Se um contém o outro (mesma área física aproximada), pular
        if (Math.abs(cand.rect.top - u.rect.top) < 15 && Math.abs(cand.rect.left - u.rect.left) < 15) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) uniqueCandidates.push(cand);
    }
    
    if (uniqueCandidates.length >= 2) {
      const btn1 = uniqueCandidates[0];
      const btn2 = uniqueCandidates[1];
      
      let callBtnCandidate, putBtnCandidate;
      // Botão Call costuma ficar em cima ou à esquerda
      if (Math.abs(btn1.rect.top - btn2.rect.top) > 20) {
        callBtnCandidate = btn1.rect.top < btn2.rect.top ? btn1.el : btn2.el;
        putBtnCandidate = btn1.rect.top > btn2.rect.top ? btn1.el : btn2.el;
      } else {
        callBtnCandidate = btn1.rect.left < btn2.rect.left ? btn1.el : btn2.el;
        putBtnCandidate = btn1.rect.left > btn2.rect.left ? btn1.el : btn2.el;
      }
      return isCall ? callBtnCandidate : putBtnCandidate;
    }
  }

  // Nível 6: Apelando para as Cores Globais da Metade Direita (Verde/Vermelho)
  const rightEls = document.querySelectorAll('*');
  for (let el of rightEls) {
    const rect = el.getBoundingClientRect();
    if (rect.left > screenWidth * 0.5 && rect.width >= 40 && rect.height >= 30 && rect.width <= 400) {
      try {
        const style = window.getComputedStyle(el);
        if (!style) continue;
        const bg = (style.backgroundColor || '') + ' ' + (style.backgroundImage || '');
        // Exnova Verde: rgb(46, 184, 85) ou similar, Vermelho: rgb(255, 62, 62) ou similar
        // Apenas procuramos palavras na string computada ou combinações óbvias
        if (isCall && (bg.includes('rgb(46, 184, 85)') || bg.includes('linear-gradient') && bg.includes('green') || el.className.includes('success'))) {
            return el;
        }
        if (!isCall && (bg.includes('rgb(255, 62, 62)') || bg.includes('linear-gradient') && bg.includes('red') || el.className.includes('danger'))) {
            return el;
        }
      } catch(e) {}
    }
  }
  
  return null;
}

// Ler saldo atual da banca
function getBrokerBalance() {
  const sel = SELECTORS[broker] || SELECTORS.exnova;
  const balanceEl = document.querySelector(sel.balance);
  if (balanceEl) {
    const cleanText = balanceEl.innerText.replace(/[^0-9.,]/g, '').replace(',', '.');
    return parseFloat(cleanText) || 0;
  }
  return null;
}

// Monitorar resultado da operação
function monitorOperationResult(direction, amount, payout, pair, timeframe) {
  console.log("[BinaryOps Content Script] Monitoramento de resultado iniciado...");
  
  // Salvar saldo antes do encerramento
  const balanceBefore = getBrokerBalance();
  
  // Como a expiração varia, vamos monitorar por popups de vitória/derrota na tela ou mudanças de saldo
  let checkCount = 0;
  const maxChecks = 60; // 2 minutos
  
  const interval = setInterval(() => {
    checkCount++;
    
    // 1. Procurar popups de notificação de WIN ou LOSS na tela
    const winPopup = findDOMElementByText(['venceu', 'win', 'ganhou', 'lucro', 'profit']);
    const lossPopup = findDOMElementByText(['perdeu', 'loss', 'prejuizo', 'derrota']);
    
    if (winPopup) {
      clearInterval(interval);
      reportResult(direction, 'WIN', amount, payout, pair, timeframe);
      return;
    }
    
    if (lossPopup) {
      clearInterval(interval);
      reportResult(direction, 'LOSS', amount, payout, pair, timeframe);
      return;
    }
    
    // 2. Verificar alteração no saldo
    const balanceNow = getBrokerBalance();
    if (balanceBefore !== null && balanceNow !== null && balanceBefore !== balanceNow) {
      clearInterval(interval);
      if (balanceNow > balanceBefore) {
        reportResult(direction, 'WIN', amount, payout, pair, timeframe);
      } else {
        reportResult(direction, 'LOSS', amount, payout, pair, timeframe);
      }
      return;
    }
    
    // Tempo máximo excedido
    if (checkCount >= maxChecks) {
      clearInterval(interval);
      console.log("[BinaryOps Content Script] Timeout no monitoramento de resultado. A ordem provavelmente falhou ao ser clicada ou não foi executada. Nenhum resultado será enviado ao Dashboard.");
    }
  }, 2000);
}

function findDOMElementByText(keywords) {
  const els = document.querySelectorAll('.popup, .notification, .modal, .toast, .alert, .dialog, div[class*="popup"], div[class*="notification"]');
  for (let el of els) {
    const text = el.innerText.toLowerCase();
    for (let kw of keywords) {
      if (text.includes(kw)) {
        return el;
      }
    }
  }
  return null;
}

function reportResult(direction, result, amount, payout, targetPair, targetTimeframe) {
  console.log(`[BinaryOps Content Script] Operação concluída: ${result} na direção ${direction}`);
  
  // Detectar par e timeframe padrão
  let pair = targetPair;
  
  if (!pair) {
    pair = 'EUR/USD';
    const urlPath = window.location.pathname;
    const pairMatch = urlPath.match(/[A-Z]{6}/i);
    if (pairMatch) {
      const rawPair = pairMatch[0].toUpperCase();
      if (rawPair !== 'TRADER') {
        pair = rawPair.slice(0, 3) + '/' + rawPair.slice(3);
      }
    }
  }

  const data = {
    pair: pair,
    direction: direction,
    amount: amount,
    payout: payout,
    result: result,
    date: new Date().toISOString().slice(0, 16),
    timeframe: targetTimeframe || 'M1',
    strategy: 'Robô Extensão',
    notes: `Operação automatizada executada na corretora ${broker.toUpperCase()}`
  };

  chrome.runtime.sendMessage({
    action: "operation_result",
    data: data
  });
}

// ============================================
// PAINEL FLUTUANTE (OVERLAY) - Sinais e Padrões
// ============================================

function createBrokerOverlay() {
  if (document.getElementById('binaryops-overlay')) return;

  const style = document.createElement('style');
  style.textContent = `
    #binaryops-overlay,
    #binaryops-overlay * {
      box-sizing: border-box !important;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif !important;
    }
    #binaryops-overlay {
      position: fixed !important;
      top: 80px !important;
      right: 20px !important;
      width: 250px !important;
      max-height: 70vh !important;
      z-index: 99999999 !important;
      border-radius: 12px !important;
      background: rgba(15, 17, 28, 0.92) !important;
      backdrop-filter: blur(18px) !important;
      -webkit-backdrop-filter: blur(18px) !important;
      border: 1px solid rgba(0, 255, 170, 0.25) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 60px rgba(0, 255, 170, 0.08) !important;
      color: #e0e0e0 !important;
      overflow: hidden !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      display: flex !important;
      flex-direction: column !important;
      font-size: 11px !important;
      padding: 0 !important;
      margin: 0 !important;
      line-height: 1.2 !important;
    }
    #binaryops-overlay.minimized {
      width: 40px !important;
      max-height: 40px !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      background: rgba(15, 17, 28, 0.95) !important;
      border: 2px solid rgba(0, 255, 170, 0.5) !important;
      box-shadow: 0 4px 20px rgba(0, 255, 170, 0.3) !important;
    }
    #binaryops-overlay.minimized:hover {
      box-shadow: 0 4px 30px rgba(0, 255, 170, 0.5) !important;
      transform: scale(1.1) !important;
    }
    #binaryops-overlay.minimized .bo-overlay-body,
    #binaryops-overlay.minimized .bo-overlay-header-text,
    #binaryops-overlay.minimized .bo-overlay-close,
    #binaryops-overlay.minimized .bo-overlay-minimize {
      display: none !important;
    }
    #binaryops-overlay.minimized .bo-overlay-header {
      justify-content: center !important;
      padding: 0 !important;
      height: 36px !important;
      border: none !important;
      cursor: pointer !important;
    }
    #binaryops-overlay.minimized .bo-overlay-logo {
      font-size: 18px !important;
      margin: 0 !important;
    }
    #binaryops-overlay .bo-overlay-header {
      display: flex !important;
      align-items: center !important;
      padding: 8px 12px !important;
      background: linear-gradient(135deg, rgba(0, 255, 170, 0.12), rgba(0, 170, 255, 0.08)) !important;
      border-bottom: 1px solid rgba(0, 255, 170, 0.15) !important;
      cursor: grab !important;
      user-select: none !important;
      flex-shrink: 0 !important;
      height: 36px !important;
    }
    #binaryops-overlay .bo-overlay-header:active { cursor: grabbing !important; }
    #binaryops-overlay .bo-overlay-logo {
      font-size: 14px !important;
      margin-right: 6px !important;
      filter: drop-shadow(0 0 4px rgba(0, 255, 170, 0.5)) !important;
      display: inline-block !important;
    }
    #binaryops-overlay .bo-overlay-header-text {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
    }
    #binaryops-overlay .bo-overlay-title {
      font-size: 11px !important;
      font-weight: 700 !important;
      color: #00ffaa !important;
      letter-spacing: 0.5px !important;
      display: flex !important;
      align-items: center !important;
    }
    #binaryops-overlay .bo-overlay-subtitle {
      font-size: 9px !important;
      color: #888 !important;
      margin-top: 1px !important;
      display: block !important;
    }
    #binaryops-overlay .bo-overlay-status {
      display: inline-block !important;
      width: 6px !important;
      height: 6px !important;
      border-radius: 50% !important;
      margin-right: 6px !important;
      background: #555 !important;
      transition: background 0.3s !important;
      flex-shrink: 0 !important;
    }
    #binaryops-overlay .bo-overlay-status.active {
      background: #00ff6a !important;
      box-shadow: 0 0 6px #00ff6a !important;
      animation: boPulse 1.5s infinite !important;
    }
    #binaryops-overlay .bo-overlay-status.inactive {
      background: #ff4444 !important;
    }
    @keyframes boPulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    #binaryops-overlay .bo-overlay-minimize, 
    #binaryops-overlay .bo-overlay-close {
      background: none !important;
      border: none !important;
      color: #888 !important;
      font-size: 12px !important;
      cursor: pointer !important;
      padding: 1px 4px !important;
      border-radius: 3px !important;
      transition: all 0.2s !important;
      margin-left: 2px !important;
      line-height: 1 !important;
      display: inline-block !important;
    }
    #binaryops-overlay .bo-overlay-minimize:hover, 
    #binaryops-overlay .bo-overlay-close:hover {
      color: #fff !important;
      background: rgba(255, 255, 255, 0.1) !important;
    }
    #binaryops-overlay .bo-overlay-body {
      padding: 8px 12px !important;
      overflow-y: auto !important;
      max-height: calc(70vh - 36px) !important;
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
    }
    #binaryops-overlay .bo-overlay-body::-webkit-scrollbar { width: 3px !important; }
    #binaryops-overlay .bo-overlay-body::-webkit-scrollbar-track { background: transparent !important; }
    #binaryops-overlay .bo-overlay-body::-webkit-scrollbar-thumb { background: rgba(0, 255, 170, 0.3) !important; border-radius: 3px !important; }
    #binaryops-overlay .bo-section-title {
      font-size: 9px !important;
      font-weight: 600 !important;
      color: #00ffaa !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      margin: 8px 0 4px !important;
      display: flex !important;
      align-items: center !important;
      gap: 3px !important;
    }
    #binaryops-overlay .bo-section-title:first-child { margin-top: 0 !important; }
    #binaryops-overlay .bo-info-row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 4px 6px !important;
      border-radius: 5px !important;
      margin-bottom: 2px !important;
      background: rgba(255, 255, 255, 0.03) !important;
      font-size: 10px !important;
      transition: background 0.2s !important;
      height: 20px !important;
    }
    #binaryops-overlay .bo-info-row:hover { background: rgba(255, 255, 255, 0.06) !important; }
    #binaryops-overlay .bo-info-label { color: #999 !important; font-size: 10px !important; display: inline-block !important; }
    #binaryops-overlay .bo-info-value { color: #fff !important; font-weight: 600 !important; font-size: 10px !important; display: inline-block !important; }
    #binaryops-overlay .bo-signal-item {
      display: flex !important;
      align-items: center !important;
      padding: 4px 6px !important;
      border-radius: 6px !important;
      margin-bottom: 2px !important;
      background: rgba(255, 255, 255, 0.03) !important;
      border-left: 2px solid transparent !important;
      font-size: 10px !important;
      transition: all 0.2s !important;
      height: 22px !important;
      overflow: hidden !important;
    }
    #binaryops-overlay .bo-signal-item:hover { background: rgba(255, 255, 255, 0.07) !important; }
    #binaryops-overlay .bo-signal-item.next { border-left-color: #00ffaa !important; background: rgba(0, 255, 170, 0.06) !important; }
    #binaryops-overlay .bo-signal-time {
      font-weight: 700 !important;
      color: #00ffaa !important;
      min-width: 32px !important;
      font-size: 10px !important;
      display: inline-block !important;
      flex-shrink: 0 !important;
    }
    #binaryops-overlay .bo-signal-pair {
      flex: 1 !important;
      margin: 0 4px !important;
      color: #ddd !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      font-size: 10px !important;
      display: inline-block !important;
    }
    #binaryops-overlay .bo-signal-dir {
      padding: 1px 4px !important;
      border-radius: 3px !important;
      font-size: 9px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      display: inline-block !important;
      flex-shrink: 0 !important;
    }
    #binaryops-overlay .bo-signal-dir.call { background: rgba(0, 200, 83, 0.2) !important; color: #00e676 !important; }
    #binaryops-overlay .bo-signal-dir.put { background: rgba(255, 23, 68, 0.2) !important; color: #ff5252 !important; }
    #binaryops-overlay .bo-signal-status {
      padding: 1px 4px !important;
      border-radius: 3px !important;
      font-size: 8px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      margin-left: 6px !important;
      display: inline-block !important;
      flex-shrink: 0 !important;
    }
    #binaryops-overlay .bo-signal-status.win { background: rgba(0, 200, 83, 0.2) !important; color: #00e676 !important; border: 1px solid rgba(0, 200, 83, 0.4) !important; }
    #binaryops-overlay .bo-signal-status.loss { background: rgba(255, 23, 68, 0.2) !important; color: #ff5252 !important; border: 1px solid rgba(255, 23, 68, 0.4) !important; }
    #binaryops-overlay .bo-signal-status.draw { background: rgba(136, 136, 136, 0.2) !important; color: #aaa !important; border: 1px solid rgba(136, 136, 136, 0.4) !important; }
    #binaryops-overlay .bo-pattern-item {
      display: flex !important;
      align-items: center !important;
      padding: 4px 6px !important;
      border-radius: 6px !important;
      margin-bottom: 2px !important;
      background: rgba(255, 255, 255, 0.03) !important;
      font-size: 10px !important;
      gap: 4px !important;
      height: 22px !important;
    }
    #binaryops-overlay .bo-pattern-colors {
      display: flex !important;
      gap: 1px !important;
      align-items: center !important;
    }
    #binaryops-overlay .bo-pattern-colors .dot {
      width: 8px !important;
      height: 8px !important;
      border-radius: 50% !important;
      display: inline-block !important;
    }
    #binaryops-overlay .bo-pattern-colors .dot.G { background: #00e676 !important; }
    #binaryops-overlay .bo-pattern-colors .dot.R { background: #ff5252 !important; }
    #binaryops-overlay .bo-pattern-colors .dot.D { background: #888 !important; }
    #binaryops-overlay .bo-pattern-pair { color: #aaa !important; font-size: 9px !important; display: inline-block !important; }
    #binaryops-overlay .bo-pattern-dir { font-weight: 700 !important; font-size: 9px !important; display: inline-block !important; }
    #binaryops-overlay .bo-pattern-dir.call { color: #00e676 !important; }
    #binaryops-overlay .bo-pattern-dir.put { color: #ff5252 !important; }
    #binaryops-overlay .bo-empty {
      text-align: center !important;
      color: #555 !important;
      font-size: 10px !important;
      padding: 6px 0 !important;
      font-style: italic !important;
      display: block !important;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'binaryops-overlay';
  overlay.innerHTML = `
    <div class="bo-overlay-header" id="boOverlayHeader">
      <span class="bo-overlay-logo">🤖</span>
      <div class="bo-overlay-header-text">
        <span class="bo-overlay-title"><span class="bo-overlay-status" id="boStatus"></span>BinaryOps Robô</span>
        <span class="bo-overlay-subtitle" id="boStrategy">Aguardando...</span>
      </div>
      <button class="bo-overlay-minimize" id="boMinimize" title="Minimizar">─</button>
      <button class="bo-overlay-close" id="boClose" title="Fechar">✕</button>
    </div>
    <div class="bo-overlay-body" id="boOverlayBody">
      <div class="bo-info-row">
        <span class="bo-info-label">Próxima Mão</span>
        <span class="bo-info-value" id="boNextAmount">-</span>
      </div>
      <div class="bo-info-row" id="boGaleAmountRow" style="display:none;">
        <span class="bo-info-label">Valor Martingale</span>
        <span class="bo-info-value" id="boGaleAmount">-</span>
      </div>
      <div class="bo-info-row" id="boSorosAmountRow" style="display:none;">
        <span class="bo-info-label">Valor Soros</span>
        <span class="bo-info-value" id="boSorosAmount">-</span>
      </div>
      <div class="bo-info-row">
        <span class="bo-info-label">Gale Atual</span>
        <span class="bo-info-value" id="boCurrentGale">0</span>
      </div>
      <div class="bo-info-row">
        <span class="bo-info-label">Soros Nível</span>
        <span class="bo-info-value" id="boCurrentSoros">0</span>
      </div>

      <div class="bo-section-title">📋 Sinais Agendados</div>
      <div id="boSignalsList"><div class="bo-empty">Nenhum sinal carregado</div></div>

      <div class="bo-section-title">🎯 Padrões Monitorados</div>
      <div id="boPatternsList"><div class="bo-empty">Nenhum padrão carregado</div></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // --- Drag Logic ---
  let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
  const header = document.getElementById('boOverlayHeader');
  
  header.addEventListener('mousedown', (e) => {
    if (overlay.classList.contains('minimized')) return;
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    const rect = overlay.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    overlay.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - overlay.offsetWidth, e.clientX - dragOffsetX));
    const y = Math.max(0, Math.min(window.innerHeight - overlay.offsetHeight, e.clientY - dragOffsetY));
    overlay.style.left = x + 'px';
    overlay.style.top = y + 'px';
    overlay.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      overlay.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    }
  });

  // --- Minimize / Close ---
  overlay.querySelector('#boMinimize').addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.classList.add('minimized');
  });
  overlay.addEventListener('click', (e) => {
    if (overlay.classList.contains('minimized')) {
      overlay.classList.remove('minimized');
    }
  });
  overlay.querySelector('#boClose').addEventListener('click', (e) => {
    e.stopPropagation();
    overlay.style.display = 'none';
    // Reabre após 30 segundos por segurança
    setTimeout(() => { overlay.style.display = 'flex'; }, 30000);
  });
}

function updateOverlayUI(data) {
  if (!data) return;
  const overlay = document.getElementById('binaryops-overlay');
  if (!overlay || overlay.style.display === 'none') return;

  // Log de debug para rastrear a sincronização
  console.log(`[BinaryOps Overlay] Sincronizando overlay. Ativo: ${data.active}, Sinais: ${data.signals ? data.signals.length : 0}, Operações: ${data.operations ? data.operations.length : 0}`);

  // Status
  const statusEl = document.getElementById('boStatus');
  if (statusEl) {
    statusEl.className = 'bo-overlay-status ' + (data.active ? 'active' : 'inactive');
  }

  // Strategy label
  const strategyMap = {
    'signals_list': 'Lista de Sinais',
    'auto_pattern': 'Catalogador Dinâmico',
    'mhi1': 'MHI 1',
    'mhi2': 'MHI 2',
    'price_action': 'Price Action',
    'manual': 'Manual'
  };
  const stratEl = document.getElementById('boStrategy');
  if (stratEl) {
    stratEl.textContent = data.active
      ? (strategyMap[data.strategy] || data.strategy)
      : 'Robô desligado';
  }

  // Info rows
  const nextAmountEl = document.getElementById('boNextAmount');
  if (nextAmountEl) nextAmountEl.textContent = 'R$ ' + (data.nextAmount || data.baseAmount || 0).toFixed(2);
  
  // Configs Gale e Soros
  const galeAmountRow = document.getElementById('boGaleAmountRow');
  const galeAmountEl = document.getElementById('boGaleAmount');
  if (galeAmountRow && galeAmountEl) {
    if (data.useMartingale) {
      galeAmountRow.style.display = 'flex';
      galeAmountEl.textContent = 'R$ ' + (data.galeAmount || 0).toFixed(2);
    } else {
      galeAmountRow.style.display = 'none';
    }
  }

  const sorosAmountRow = document.getElementById('boSorosAmountRow');
  const sorosAmountEl = document.getElementById('boSorosAmount');
  if (sorosAmountRow && sorosAmountEl) {
    if (data.useSoros) {
      sorosAmountRow.style.display = 'flex';
      sorosAmountEl.textContent = 'R$ ' + (data.sorosAmount || 0).toFixed(2);
    } else {
      sorosAmountRow.style.display = 'none';
    }
  }

  const galeEl = document.getElementById('boCurrentGale');
  if (galeEl) galeEl.textContent = data.currentGale || '0';
  
  const sorosEl = document.getElementById('boCurrentSoros');
  if (sorosEl) sorosEl.textContent = data.currentSorosStage || '0';

  // Signals
  const signalsContainer = document.getElementById('boSignalsList');
  if (signalsContainer && data.signals) {
    if (data.signals.length === 0) {
      signalsContainer.innerHTML = '<div class="bo-empty">Nenhum sinal carregado</div>';
    } else {
      const now = new Date();
      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      
      // Encontrar o próximo sinal
      const sorted = [...data.signals].sort((a, b) => a.time.localeCompare(b.time));
      let nextIdx = -1;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].time >= currentTime) { nextIdx = i; break; }
      }

      signalsContainer.innerHTML = sorted.map((sig, i) => {
        const isNext = i === nextIdx;
        const dirClass = sig.direction === 'CALL' ? 'call' : 'put';
        const dirSymbol = sig.direction === 'CALL' ? '▲' : '▼';
        
        let statusBadge = '';
        if (data.operations && Array.isArray(data.operations)) {
          const normSigPair = sig.pair.replace('-OTC', '').replace(' (OTC)', '').replace('/', '').toUpperCase().trim();
          const matchedOp = data.operations.find(op => {
            if (!op || !op.pair || (!op.date && !op.createdAt)) return false;
            
            const normOpPair = op.pair.replace('-OTC', '').replace(' (OTC)', '').replace('/', '').toUpperCase().trim();
            if (normSigPair !== normOpPair) return false;
            
            // Verificar direção
            const dirMatch = op.direction.toUpperCase() === sig.direction.toUpperCase();
            if (!dirMatch) return false;

            try {
              const [sigH, sigM] = sig.time.split(':').map(Number);
              const sigMinutes = sigH * 60 + sigM;

              // Limite de diferença de minutos aceitável baseado no timeframe
              const tf = String(sig.timeframe || 'M1').toUpperCase();
              let maxDiff = 3;
              if (tf.includes('5')) maxDiff = 7;
              else if (tf.includes('15')) maxDiff = 18;

              // Obter o objeto Date da operação de forma confiável
              let opDateObj = null;
              if (op.createdAt) {
                const tempDate = new Date(op.createdAt);
                if (!isNaN(tempDate.getTime())) {
                  opDateObj = tempDate;
                }
              }

              if (!opDateObj && op.date) {
                const timePart = op.date.split('T')[1] || '';
                const hasTimezone = op.date.endsWith('Z') || timePart.includes('+') || timePart.includes('-');
                
                if (hasTimezone) {
                  const tempDate = new Date(op.date);
                  if (!isNaN(tempDate.getTime())) opDateObj = tempDate;
                } else {
                  // Se não tem fuso, tentamos interpretar como UTC ou Local
                  const isAuto = op.strategy && (op.strategy.includes('Extensão') || op.strategy.includes('WS'));
                  if (isAuto && op.date.includes('T')) {
                    const tempDate = new Date(op.date + 'Z');
                    if (!isNaN(tempDate.getTime())) opDateObj = tempDate;
                  }
                  
                  if (!opDateObj) {
                    const tempDate = new Date(op.date.replace('T', ' '));
                    if (!isNaN(tempDate.getTime())) opDateObj = tempDate;
                  }
                }
              }

              if (!opDateObj) return false;

              // Obter hora e minutos locais da operação
              const opHours = opDateObj.getHours();
              const opMinutes = opDateObj.getMinutes();
              const opTotalMinutes = opHours * 60 + opMinutes;

              // Calcular diferença em minutos
              let diff = opTotalMinutes - sigMinutes;
              if (diff < -1200) diff += 1440;
              if (diff > 1200) diff -= 1440;

              if (Math.abs(diff) <= maxDiff) {
                // Verificar se a operação ocorreu no mesmo dia que o sinal (hoje)
                const now = new Date();
                const isSameDay = opDateObj.getDate() === now.getDate() &&
                                  opDateObj.getMonth() === now.getMonth() &&
                                  opDateObj.getFullYear() === now.getFullYear();
                
                if (isSameDay) {
                  console.log(`[BinaryOps Overlay] Match encontrado hoje: ${sig.pair} ${sig.time} -> ${op.result}`);
                  return true;
                }
              }
              return false;
            } catch (err) {
              return false;
            }
          });
          
          if (matchedOp) {
            const statusClass = matchedOp.result.toLowerCase(); // 'win', 'loss', 'draw'
            statusBadge = `<span class="bo-signal-status ${statusClass}">${matchedOp.result}</span>`;
          }
        }

        return `<div class="bo-signal-item ${isNext ? 'next' : ''}">
          <span class="bo-signal-time">${sig.time}</span>
          <span class="bo-signal-pair">${sig.pair}</span>
          <span class="bo-signal-dir ${dirClass}">${dirSymbol} ${sig.direction}</span>
          ${statusBadge}
        </div>`;
      }).join('');
    }
  }

  // Patterns
  const patternsContainer = document.getElementById('boPatternsList');
  if (patternsContainer && data.patterns) {
    if (data.patterns.length === 0) {
      patternsContainer.innerHTML = '<div class="bo-empty">Nenhum padrão carregado</div>';
    } else {
      patternsContainer.innerHTML = data.patterns.map(p => {
        const dots = p.pattern.split('').map(c =>
          `<span class="dot ${c}"></span>`
        ).join('');
        const dirClass = p.direction === 'CALL' ? 'call' : 'put';
        const dirSymbol = p.direction === 'CALL' ? '▲' : '▼';
        return `<div class="bo-pattern-item">
          <div class="bo-pattern-colors">${dots}</div>
          <span class="bo-pattern-pair">${p.pair}</span>
          <span class="bo-pattern-dir ${dirClass}">${dirSymbol} ${p.direction}</span>
        </div>`;
      }).join('');
    }
  }
}

// Injetar o overlay com segurança
function initOverlaySafe() {
  if (window !== window.top) return; // Rodar apenas no frame principal (Top Frame)
  
  if (document.body) {
    createBrokerOverlay();
    requestInitialBotData();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      createBrokerOverlay();
      requestInitialBotData();
    });
  }
}

function requestInitialBotData() {
  chrome.runtime.sendMessage({ action: "get_latest_bot_data" }, (response) => {
    if (response && response.data) {
      updateOverlayUI(response.data);
    }
  });
}

initOverlaySafe();

// Listener para atualizações em tempo real
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "update_broker_overlay") {
    updateOverlayUI(message.data);
  }
});

})(); // End of IIFE
