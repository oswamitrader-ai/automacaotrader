// ============================================
// CATALOGER MODULE - Probability Analysis
// ============================================

const Cataloger = (() => {
  
  const BINANCE_SYMBOLS = {
    'EUR/USD': 'EURUSDT',
    'GBP/USD': 'GBPUSDT',
    'AUD/USD': 'AUDUSDT',
    'NZD/USD': 'NZDUSDT',
  };

  function getIdealCandleCount(timeframe) {
    const tf = (timeframe || '1m').toLowerCase();
    if (tf === '1m') return 300;
    if (tf === '5m') return 800;
    if (tf === '15m') return 500;
    return 300;
  }

  let bestSignalsFound = []; // Array of { timeStr, pair, direction, timeframe }
  let bestPatternsFound = []; // Array of { rawPattern, pair, direction, timeframe }
  let lastFetchedCandles = [];
  let lastCatalogerResults = []; // Guardará o histórico das últimas velas carregadas

  function updateRecommendation(e) {
    const timeframe = document.getElementById('catTimeframe')?.value || '1m';
    const textEl = document.getElementById('catRecommendationText');
    const limitInput = document.getElementById('catCandleLimit');

    // Se o evento foi disparado pela mudança do timeframe, resetar o input de velas para o padrão ideal
    if (e && e.target && e.target.id === 'catTimeframe' && limitInput) {
      limitInput.value = getIdealCandleCount(timeframe);
    }

    const limit = limitInput ? parseInt(limitInput.value) || 300 : 300;
    
    // Atualizar título do card (ex: "Catalogador Probabilístico (300 Velas)")
    const titleEl = document.querySelector('#page-cataloger h2');
    if (titleEl) {
      titleEl.innerHTML = `Catalogador Probabilístico (${limit} Velas)`;
    }
    
    // Atualizar texto explicativo do dicionário de padrões
    const dictTextEl = document.querySelector('#page-cataloger .card p');
    if (dictTextEl) {
      dictTextEl.innerHTML = `O catalogador varre as últimas <strong>${limit} velas</strong> e mapeia a taxa de acerto de <strong>todas as 8 combinações de cores possíveis</strong> para prever se a próxima vela (Vela de Entrada) fechará como <span style="color: var(--neon-green)">Verde (CALL)</span> ou <span style="color: var(--neon-red)">Vermelha (PUT)</span>.`;
    }

    if (!textEl) return;

    let text = '';
    if (timeframe === '1m') {
      const hours = (limit / 60).toFixed(1);
      text = `As últimas <strong>${limit} velas</strong> de M1 representam <strong>${hours} horas</strong> de mercado. <span style='color:var(--neon-green)'>Validade recomendada:</span> use os sinais gerados por no máximo <strong>1 a 2 horas</strong> para acompanhar o microciclo ativo.`;
    } else if (timeframe === '5m') {
      const hours = ((limit * 5) / 60).toFixed(1);
      const days = ((limit * 5) / 1440).toFixed(1);
      text = `As últimas <strong>${limit} velas</strong> de M5 representam <strong>${hours} horas</strong> (~<strong>${days} dias</strong>) de mercado. <span style='color:var(--neon-green)'>Validade recomendada:</span> recalibre a lista a cada <strong>4 a 6 horas</strong>.`;
    } else if (timeframe === '15m') {
      const hours = ((limit * 15) / 60).toFixed(1);
      const days = ((limit * 15) / 1440).toFixed(1);
      text = `As últimas <strong>${limit} velas</strong> de M15 representam <strong>${hours} horas</strong> (~<strong>${days} dias</strong>) de mercado. <span style='color:var(--neon-green)'>Validade recomendada:</span> opere esta lista por até <strong>12 a 24 horas</strong>.`;
    }
    textEl.innerHTML = text;
  }

  function init() {
    const modeEl = document.getElementById('catMode');
    modeEl?.addEventListener('change', (e) => {
      const patternSettings = document.getElementById('catPatternSettings');
      if (patternSettings) {
        const isSeqMode = e.target.value === 'exhaustion' || e.target.value === 'continuity';
        patternSettings.style.display = (e.target.value === 'pattern' || isSeqMode) ? 'block' : 'none';
        const label = patternSettings.querySelector('.form-label');
        if (label) {
          label.textContent = isSeqMode ? 'Velas Consecutivas' : 'Tamanho do Padrão';
        }
      }
    });

    const timeframeEl = document.getElementById('catTimeframe');
    timeframeEl?.addEventListener('change', updateRecommendation);

    const limitEl = document.getElementById('catCandleLimit');
    limitEl?.addEventListener('input', updateRecommendation);
    limitEl?.addEventListener('change', updateRecommendation);
    
    // Atualizar recomendação inicial
    updateRecommendation();

    document.getElementById('catalogerForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pair = document.getElementById('catPair').value;
      const timeframe = document.getElementById('catTimeframe').value;
      const mode = document.getElementById('catMode').value;
      const limitInput = document.getElementById('catCandleLimit');
      const limit = limitInput ? parseInt(limitInput.value) || 300 : 300;
      
      const btn = document.getElementById('btnRunCataloger');
      btn.innerHTML = `⏳ Baixando ${limit} velas...`;
      btn.disabled = true;
      
      const tbody = document.getElementById('catalogerTableBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">Buscando novos dados...</td></tr>`;

      try {
        const candles = await fetchHistoricalCandles(pair, timeframe);
        lastFetchedCandles = candles;
        btn.innerHTML = '⚙️ Processando...';
        
        let results = [];
        if (mode === 'time') {
          results = analyzeByTime(candles, pair, timeframe);
        } else if (mode === 'pattern') {
          results = analyzeByPattern(candles, pair, timeframe);
        } else if (mode === 'exhaustion') {
          results = analyzeByExhaustion(candles, pair, timeframe);
        } else if (mode === 'continuity') {
          results = analyzeByContinuity(candles, pair, timeframe);
        }
        
        displayResults(results);
      } catch (err) {
        console.error(err);
        UI.showToast(err.message || 'Erro ao obter dados de velas', 'error');
      } finally {
        btn.innerHTML = '🔍 Iniciar Catalogação';
        btn.disabled = false;
      }
    });

    document.getElementById('btnExportSignals')?.addEventListener('click', exportToBotSignals);
    document.getElementById('btnTestAllSignals')?.addEventListener('click', testAllSignals);
  }

  async function fetchHistoricalCandles(pair, timeframe) {
    const isOTC = pair.endsWith('-OTC');
    const basePair = isOTC ? pair.replace('-OTC', '') : pair;
    const limitInput = document.getElementById('catCandleLimit');
    const limit = limitInput ? parseInt(limitInput.value) || getIdealCandleCount(timeframe) : getIdealCandleCount(timeframe);

    const isExtensionAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    
    // Tenta primeiro capturar da corretora via extensão (para obter dados reais da IQ Option/Exnova)
    if (isExtensionAvailable) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "fetch_otc_candles",
          pair: pair,
          timeframe: timeframe,
          limit: limit
        }, (response) => {
          if (response && response.status === "success") {
            const sortedCandles = [...response.candles].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
            const candlesMapped = sortedCandles.map(c => ({
              ...c,
              time: new Date(c.time)
            }));
            resolve(candlesMapped);
          } else {
            if (isOTC) {
              reject(new Error(response ? response.error : "Falha ao obter candles de OTC via extensão. Verifique se o ativo está aberto no gráfico da corretora."));
            } else {
              const brokerError = response ? response.error : "Erro de comunicação com a extensão";
              console.warn("Falha ao obter do broker via extensão:", brokerError);
              
              fetchFromExternalAPIs(basePair, timeframe, limit)
                .then(resolve)
                .catch(err => {
                  reject(new Error(`Falha na Corretora: "${brokerError}" | Twelve Data: "${err.message}"`));
                });
            }
          }
        });
      });
    }

    if (isOTC) {
      throw new Error(`A extensão do Chrome precisa estar ativa e em execução para capturar os dados reais de OTC diretamente da corretora.`);
    }

    return fetchFromExternalAPIs(basePair, timeframe, limit);
  }

  async function fetchFromExternalAPIs(basePair, timeframe, limit) {
    const settings = Storage.getSettings ? Storage.getSettings() : {};
    const tdKey = settings.sysTwelveDataKey || settings.twelveDataKey || document.getElementById('sysTwelveDataKey')?.value?.trim();
    let tdTimeframe = timeframe.replace('m', 'min');
    let candles = [];

    if (!tdKey) {
      throw new Error(`Twelve Data API Key não configurada. Cadastre sua chave nas configurações para obter dados históricos do mercado real ou abra o gráfico do ativo na corretora.`);
    }

    try {
      const isExtensionAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
      if (isExtensionAvailable) {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: "fetch_twelvedata_candles",
            symbol: basePair,
            interval: tdTimeframe,
            limit: limit,
            apiKey: tdKey
          }, (res) => {
            if (res && res.status === "success") resolve(res.data);
            else reject(new Error(res ? res.error : "Chave ou limite da Twelve Data excedido"));
          });
        });

        if (response && response.values && response.values.length > 0) {
          const values = response.values;
          candles = values.map(k => {
            const dtStr = k.datetime.includes('T') ? k.datetime : k.datetime.replace(' ', 'T');
            const utcStr = dtStr.endsWith('Z') ? dtStr : dtStr + 'Z';
            return {
              time: new Date(utcStr),
              open: parseFloat(k.open),
              high: parseFloat(k.high),
              low: parseFloat(k.low),
              close: parseFloat(k.close),
              color: parseFloat(k.close) >= parseFloat(k.open) ? 'G' : 'R'
            };
          });

          if (candles.length > 0) {
            const lastCandle = candles[candles.length - 1];
            const tfMinutes = tdTimeframe === '1min' ? 1 : tdTimeframe === '5min' ? 5 : 15;
            const candleCloseTime = new Date(lastCandle.time.getTime() + tfMinutes * 60 * 1000);
            if (candleCloseTime.getTime() > Date.now()) {
              candles.pop();
            }
          }
        }
      }
    } catch (e) {
      console.error('Erro na Twelve Data:', e);
      throw new Error(`Erro Twelve Data: ${e.message}. Para obter dados de forma gratuita e precisa, certifique-se de que a aba da corretora está ativa com este ativo aberto.`);
    }

    if (candles.length === 0) {
      throw new Error(`Nenhum dado retornado da Twelve Data para ${basePair}. Verifique os limites da chave ou abra o gráfico do ativo na corretora.`);
    }

    return candles;
  }

  // Análise por Minuto da Hora (Modo Tempo)
  function analyzeByTime(candles, pair, timeframe) {
    // Agrupar velas pelo minuto em que aconteceram (0 a 59)
    const minutesStats = {};

    candles.forEach(candle => {
      const min = candle.time.getMinutes().toString().padStart(2, '0');
      if (!minutesStats[min]) {
        minutesStats[min] = { total: 0, greens: 0, reds: 0, ties: 0 };
      }
      
      minutesStats[min].total++;
      if (candle.color === 'G') minutesStats[min].greens++;
      else minutesStats[min].reds++; // Para simplicidade de binárias, doji vai pro R ou ignoramos.
    });

    const results = [];
    bestSignalsFound = []; // Reset signals

    // Ajustar o volume mínimo de amostragem proporcionalmente para permitir catalogar com poucas velas (ex: 100/200)
    const minVolume = Math.max(2, Math.min(10, Math.floor(candles.length / 60)));

    for (let min in minutesStats) {
      const stat = minutesStats[min];
      if (stat.total < minVolume) continue; // Precisa de amostragem mínima dinâmica

      const greenWR = (stat.greens / stat.total) * 100;
      const redWR = (stat.reds / stat.total) * 100;

      // Filtro de Ouro: Acima de 80% de Win Rate
      if (greenWR >= 80) {
        results.push({
          pattern: `Sempre no minuto :${min}`,
          entry: 'CALL',
          timeframe: timeframe.toUpperCase(),
          winrate: greenWR.toFixed(1),
          volume: stat.total,
          rawMinute: min, // usado para gerar os horários da lista
          rawPattern: min
        });
      } else if (redWR >= 80) {
        results.push({
          pattern: `Sempre no minuto :${min}`,
          entry: 'PUT',
          timeframe: timeframe.toUpperCase(),
          winrate: redWR.toFixed(1),
          volume: stat.total,
          rawMinute: min,
          rawPattern: min
        });
      }
    }

    // Ordenar por minuto crescente (conforme solicitação do usuário)
    results.sort((a, b) => a.rawMinute.localeCompare(b.rawMinute));
    
    // Gerar lista de sinais baseada em TODOS os minutos encontrados (para as próximas 3 horas)
    generateSignalsFromTimePattern(results, pair, timeframe);

    return results;
  }

  // Análise por Padrão de Sequência (Modo Padrão)
  function analyzeByPattern(candles, pair, timeframe) {
    const minWinRate = parseFloat(document.getElementById('catMinWinRate')?.value) || 60;
    const patternSize = parseInt(document.getElementById('catPatternSize')?.value) || 3;
    
    const patterns = {};

    for (let i = patternSize; i < candles.length; i++) {
      let seq = '';
      for (let j = patternSize; j > 0; j--) {
        seq += candles[i - j].color;
      }
      const nextColor = candles[i].color;
      
      if (!patterns[seq]) {
        patterns[seq] = { total: 0, nextGreen: 0, nextRed: 0 };
      }
      
      patterns[seq].total++;
      if (nextColor === 'G') patterns[seq].nextGreen++;
      else patterns[seq].nextRed++;
    }

    const results = [];
    bestPatternsFound = [];
    bestSignalsFound = []; // Não gera lista automatica para padrão ainda, apenas custom
    
    const minVolume = Math.max(10, Math.floor(candles.length * 0.035));

    for (let seq in patterns) {
      const stat = patterns[seq];

      if (stat.total < minVolume) continue;

      const callWR = (stat.nextGreen / stat.total) * 100;
      const putWR = (stat.nextRed / stat.total) * 100;

      const bestWR = Math.max(callWR, putWR);
      const entry = callWR > putWR ? 'CALL' : 'PUT';

      const displaySeq = seq.replace(/G/g, '🟩').replace(/R/g, '🟥');

      if (bestWR >= minWinRate) {
        results.push({
          pattern: `Após sequência: ${displaySeq}`,
          entry: entry,
          timeframe: timeframe.toUpperCase(),
          winrate: bestWR.toFixed(1),
          volume: stat.total,
          rawPattern: seq
        });
        bestPatternsFound.push({
          rawPattern: seq,
          pair: pair,
          direction: entry,
          timeframe: timeframe.toUpperCase()
        });
      }
    }

    results.sort((a, b) => b.winrate - a.winrate);
    return results;
  }

  function analyzeByExhaustion(candles, pair, timeframe) {
    const minWinRate = parseFloat(document.getElementById('catMinWinRate')?.value) || 60;
    const K = parseInt(document.getElementById('catPatternSize')?.value) || 5;

    let stats = {
      G: { total: 0, nextGreen: 0, nextRed: 0 },
      R: { total: 0, nextGreen: 0, nextRed: 0 }
    };

    for (let i = K; i < candles.length; i++) {
      let firstColor = candles[i - K].color;
      let allSame = true;
      for (let j = i - K + 1; j < i; j++) {
        if (candles[j].color !== firstColor) {
          allSame = false;
          break;
        }
      }

      if (allSame) {
        const nextColor = candles[i].color;
        stats[firstColor].total++;
        if (nextColor === 'G') {
          stats[firstColor].nextGreen++;
        } else {
          stats[firstColor].nextRed++;
        }
        // Evitar reconta de velas na mesma sequência contínua
        i += K - 1;
      }
    }

    const results = [];
    bestPatternsFound = [];

    const minVolume = Math.max(3, Math.floor(candles.length * 0.01));

    // Alta (K verdes seguidas) -> Espera Reversão para Vermelha (PUT)
    if (stats.G.total >= minVolume) {
      const total = stats.G.total;
      const winratePut = (stats.G.nextRed / total) * 100;
      const displaySeq = '🟩'.repeat(K);

      if (winratePut >= minWinRate) {
        results.push({
          pattern: `Exaustão: ${displaySeq} (${K} Verdes Seguidas)`,
          entry: 'PUT (Reversão)',
          timeframe: timeframe.toUpperCase(),
          winrate: winratePut.toFixed(1),
          volume: total
        });
        bestPatternsFound.push({
          rawPattern: 'G'.repeat(K),
          pair: pair,
          direction: 'PUT',
          timeframe: timeframe.toUpperCase()
        });
      }
    }

    // Queda (K vermelhas seguidas) -> Espera Reversão para Verde (CALL)
    if (stats.R.total >= minVolume) {
      const total = stats.R.total;
      const winrateCall = (stats.R.nextGreen / total) * 100;
      const displaySeq = '🟥'.repeat(K);

      if (winrateCall >= minWinRate) {
        results.push({
          pattern: `Exaustão: ${displaySeq} (${K} Vermelhas Seguidas)`,
          entry: 'CALL (Reversão)',
          timeframe: timeframe.toUpperCase(),
          winrate: winrateCall.toFixed(1),
          volume: total
        });
        bestPatternsFound.push({
          rawPattern: 'R'.repeat(K),
          pair: pair,
          direction: 'CALL',
          timeframe: timeframe.toUpperCase()
        });
      }
    }

    results.sort((a, b) => b.winrate - a.winrate);
    return results;
  }

  function analyzeByContinuity(candles, pair, timeframe) {
    const minWinRate = parseFloat(document.getElementById('catMinWinRate')?.value) || 60;
    const K = parseInt(document.getElementById('catPatternSize')?.value) || 5;

    let stats = {
      G: { total: 0, nextGreen: 0, nextRed: 0 },
      R: { total: 0, nextGreen: 0, nextRed: 0 }
    };

    for (let i = K; i < candles.length; i++) {
      let firstColor = candles[i - K].color;
      let allSame = true;
      for (let j = i - K + 1; j < i; j++) {
        if (candles[j].color !== firstColor) {
          allSame = false;
          break;
        }
      }

      if (allSame) {
        const nextColor = candles[i].color;
        stats[firstColor].total++;
        if (nextColor === 'G') {
          stats[firstColor].nextGreen++;
        } else {
          stats[firstColor].nextRed++;
        }
        // Evitar reconta de velas na mesma sequência contínua
        i += K - 1;
      }
    }

    const results = [];
    bestPatternsFound = [];

    const minVolume = Math.max(3, Math.floor(candles.length * 0.01));

    // Alta (K verdes seguidas) -> Espera Continuidade para Verde (CALL)
    if (stats.G.total >= minVolume) {
      const total = stats.G.total;
      const winrateCall = (stats.G.nextGreen / total) * 100;
      const displaySeq = '🟩'.repeat(K);

      if (winrateCall >= minWinRate) {
        results.push({
          pattern: `Continuidade: ${displaySeq} (${K} Verdes Seguidas)`,
          entry: 'CALL (Fluxo)',
          timeframe: timeframe.toUpperCase(),
          winrate: winrateCall.toFixed(1),
          volume: total
        });
        bestPatternsFound.push({
          rawPattern: 'G'.repeat(K),
          pair: pair,
          direction: 'CALL',
          timeframe: timeframe.toUpperCase()
        });
      }
    }

    // Queda (K vermelhas seguidas) -> Espera Continuidade para Vermelha (PUT)
    if (stats.R.total >= minVolume) {
      const total = stats.R.total;
      const winratePut = (stats.R.nextRed / total) * 100;
      const displaySeq = '🟥'.repeat(K);

      if (winratePut >= minWinRate) {
        results.push({
          pattern: `Continuidade: ${displaySeq} (${K} Vermelhas Seguidas)`,
          entry: 'PUT (Fluxo)',
          timeframe: timeframe.toUpperCase(),
          winrate: winratePut.toFixed(1),
          volume: total
        });
        bestPatternsFound.push({
          rawPattern: 'R'.repeat(K),
          pair: pair,
          direction: 'PUT',
          timeframe: timeframe.toUpperCase()
        });
      }
    }

    results.sort((a, b) => b.winrate - a.winrate);
    return results;
  }

  function displayResults(results) {
    const tbody = document.getElementById('catalogerTableBody');
    const container = document.getElementById('catalogerResultsContainer');
    const minWinRate = parseFloat(document.getElementById('catMinWinRate')?.value) || 60;
    const timeframe = document.getElementById('catTimeframe')?.value || '1m';
    const limitInput = document.getElementById('catCandleLimit');
    const limit = limitInput ? parseInt(limitInput.value) || getIdealCandleCount(timeframe) : getIdealCandleCount(timeframe);
    
    const titleEl = document.getElementById('catalogerResultsTitle');
    if (titleEl) {
      titleEl.innerHTML = `Melhores Padrões Encontrados (&gt;${minWinRate}% Acerto)`;
    }

    tbody.innerHTML = '';
    
    lastCatalogerResults = results;

    if (results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">Nenhum padrão acima de ${minWinRate}% de win rate encontrado nas últimas ${limit} velas.</td></tr>`;
    } else {
      const mode = document.getElementById('catMode')?.value || 'time';
      const volumeSuffix = mode === 'time' ? 'velas' : 'ocorrências';
      
      results.forEach(res => {
        const isCall = res.entry === 'CALL' || res.entry.includes('CALL');
        const entryClass = isCall ? 'text-green' : 'text-red';
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
          <td>${res.pattern}</td>
          <td class="${entryClass}" style="font-weight:bold;">${res.entry}</td>
          <td>${res.timeframe}</td>
          <td style="color:var(--neon-cyan);">${res.winrate}%</td>
          <td>${res.volume} ${volumeSuffix}</td>
          <td style="text-align:right;">
            <button class="btn btn-outline btn-xs btn-backtest" style="padding: 2px 8px; font-size:0.7rem; height:24px; border-color:var(--neon-cyan); color:var(--neon-cyan);">📈 Testar</button>
          </td>
        `;

        tr.querySelector('.btn-backtest').addEventListener('click', () => {
          let patternToTest = res.rawPattern;
          if (!patternToTest) {
            if (res.rawMinute) {
              patternToTest = res.rawMinute;
            } else if (res.pattern.includes('Após sequência')) {
              patternToTest = res.pattern.replace('Após sequência: ', '').replace(/🟩/g, 'G').replace(/🟥/g, 'R');
            } else if (res.pattern.includes('Exaustão') || res.pattern.includes('Continuidade')) {
              const cleanColors = res.pattern.split(': ')[1].split(' ')[0];
              patternToTest = cleanColors.replace(/🟩/g, 'G').replace(/🟥/g, 'R');
            }
          }

          const pair = document.getElementById('catPair').value;
          Backtester.open({
            pattern: res.pattern,
            rawPattern: patternToTest,
            entry: res.entry,
            timeframe: res.timeframe,
            pair: pair,
            candles: lastFetchedCandles
          });
        });

        tbody.appendChild(tr);
      });
    }

    container.style.display = 'block';
  }

  function generateSignalsFromTimePattern(topResults, pair, timeframe) {
    const now = new Date();
    let currentHour = now.getHours();
    
    // Gerar sinais para a hora atual e as próximas 2 horas
    for (let hOffset = 0; hOffset < 3; hOffset++) {
      let h = (currentHour + hOffset) % 24;
      const hourStr = h.toString().padStart(2, '0');
      
      topResults.forEach(res => {
        if (hOffset === 0 && parseInt(res.rawMinute) <= now.getMinutes()) {
          return; // Já passou nessa hora
        }
        bestSignalsFound.push({
          timeStr: `${hourStr}:${res.rawMinute}`,
          pair: pair,
          direction: res.entry,
          timeframe: res.timeframe
        });
      });
    }

    // Ordenar cronologicamente
    bestSignalsFound.sort((a, b) => a.timeStr.localeCompare(b.timeStr));
  }

  function exportToBotSignals() {
    const mode = document.getElementById('catMode').value;
    
    if (mode === 'time') {
      if (bestSignalsFound.length === 0) {
        UI.showToast('Nenhum sinal futuro gerado.', 'warning');
        return;
      }
      let signalsText = '';
      bestSignalsFound.forEach(sig => {
        signalsText += `${sig.timeStr};${sig.pair};${sig.direction};${sig.timeframe}\n`;
      });
      const el = document.getElementById('botSignalsList');
      if (el) {
        el.value = signalsText;
        document.getElementById('botStrategy').value = 'signals_list';
        document.getElementById('botStrategy').dispatchEvent(new Event('change'));
        UI.showToast('Sinais exportados com sucesso! A lista anterior foi atualizada.', 'success');
        document.querySelector('.nav-item[data-page="bot"]').click();
      }
    } else {
      if (bestPatternsFound.length === 0) {
        UI.showToast('Nenhum padrão válido encontrado para exportar.', 'warning');
        return;
      }
      let patternsText = '';
      bestPatternsFound.forEach(p => {
        patternsText += `${p.rawPattern};${p.pair};${p.direction};${p.timeframe}\n`;
      });
      const el = document.getElementById('botPatternsList');
      if (el) {
        el.value = patternsText;
        document.getElementById('botStrategy').value = 'auto_pattern';
        document.getElementById('botStrategy').dispatchEvent(new Event('change'));
        UI.showToast('Padrões exportados com sucesso! A lista anterior foi atualizada.', 'success');
        document.querySelector('.nav-item[data-page="bot"]').click();
      }
    }
  }

  function testAllSignals() {
    if (lastCatalogerResults.length === 0) {
      UI.showToast('Nenhum resultado para testar.', 'warning');
      return;
    }

    const pair = document.getElementById('catPair').value;
    const payout = parseInt(document.getElementById('botMinPayout')?.value) || 80;

    const allPatternsData = lastCatalogerResults.map(res => {
      let patternToTest = res.rawPattern;
      if (!patternToTest) {
        if (res.rawMinute) {
          patternToTest = res.rawMinute;
        } else if (res.pattern.includes('Após sequência')) {
          patternToTest = res.pattern.replace('Após sequência: ', '').replace(/🟩/g, 'G').replace(/🟥/g, 'R');
        } else if (res.pattern.includes('Exaustão') || res.pattern.includes('Continuidade')) {
          const cleanColors = res.pattern.split(': ')[1].split(' ')[0];
          patternToTest = cleanColors.replace(/🟩/g, 'G').replace(/🟥/g, 'R');
        }
      }
      return {
        pattern: res.pattern,
        rawPattern: patternToTest,
        entry: res.entry,
        timeframe: res.timeframe,
        pair: pair,
        payout: payout
      };
    });

    Backtester.openAll(allPatternsData, lastFetchedCandles, pair);
  }

  return { init };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => Cataloger.init());
