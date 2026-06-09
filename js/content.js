// ============================================
// CONTENT SCRIPT - Injected in Broker Sites
// ============================================

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
    console.log(`[BinaryOps Content] Operação fechada recebida via WS!`, rawData);
    
    // Mapear resultado
    let result = 'DRAW';
    const profitState = rawData.result || (rawData.msg && rawData.msg.result) || '';
    if (profitState === 'win' || profitState === 'win_by_payout') result = 'WIN';
    else if (profitState === 'loose' || profitState === 'loss' || profitState === 'loose_by_payout') result = 'LOSS';
    
    // Detectar direção
    const direction = (rawData.dir || rawData.direction || 'CALL').toUpperCase();
    
    // Envia para o background
    chrome.runtime.sendMessage({
      action: "option_closed_ws",
      data: {
        activeId: rawData.active_id || (rawData.msg && rawData.msg.active_id) || rawData.activeId,
        direction: direction,
        amount: rawData.amount || (rawData.msg && rawData.msg.amount) || 0,
        profit: rawData.profit || (rawData.msg && rawData.msg.profit) || rawData.win_amount || 0,
        result: result,
        optionId: rawData.option_id || (rawData.msg && rawData.msg.option_id) || rawData.id
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

        monitorOperationResult(message.direction, message.amount, message.payout, message.pair, message.timeframe);
        sendResponse({ status: "success", msg: "Ordem executada via WebSocket API da corretora" });
      } else {
        console.warn(`[BinaryOps Content Script] ⚠️ WebSocket rejeitou/falhou: ${event.data.error}. Tentando fallback DOM...`);
        executeTradingOrder(message.direction, message.amount)
          .then(() => {
            monitorOperationResult(message.direction, message.amount, message.payout, message.pair, message.timeframe);
            sendResponse({ status: "success", msg: "Ordem executada via cliques na tela (Fallback)" });
          })
          .catch(e => {
            sendResponse({ status: "error", error: "WS falhou e DOM falhou: " + e.message });
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

    // Timeout: se o MAIN world não responder em 4s, cair pro DOM
    wsTimeout = setTimeout(() => {
      if (!wsResponded) {
        wsResponded = true;
        window.removeEventListener('message', wsResultHandler);
        console.warn("[BinaryOps Content Script] Timeout WS. Tentando fallback via DOM...");

        executeTradingOrder(message.direction, message.amount)
          .then(() => {
            monitorOperationResult(message.direction, message.amount, message.payout, message.pair, message.timeframe);
            sendResponse({ status: "success", msg: "Ordem executada via cliques na tela (Timeout)" });
          })
          .catch(e => {
            sendResponse({ status: "error", error: "Timeout WS e Falha no DOM: " + e.message });
          });
      }
    }, 4000);

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
  console.log("[BinaryOps] Ordem usando o valor atual do painel da corretora.");
  
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
  console.log(`[BinaryOps Content Script] Ordem de ${direction} enviada com clique simulado completo.`);
  return true;
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
      console.log("[BinaryOps Content Script] Timeout no monitoramento de resultado.");
      reportResult(direction, 'DRAW', amount, payout, pair, timeframe);
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
