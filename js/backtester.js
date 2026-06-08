// ============================================
// BACKTESTER MODULE - Historical Simulation
// ============================================

const Backtester = (() => {
  let backtestChart = null;
  let activeData = null; // Guardará o padrão ativo sob simulação

  function init() {
    setupUIEvents();
  }

  function setupUIEvents() {
    document.getElementById('btnRunBacktest')?.addEventListener('click', () => {
      if (activeData) {
        runSimulation();
      }
    });

    document.getElementById('btnBacktestBack')?.addEventListener('click', () => {
      UI.navigateTo('cataloger');
    });

    ['bkUseMartingale', 'bkUseSoros', 'bkUseCycles'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        updateMgmtFields();
      });
    });
  }

  function updateMgmtFields() {
    const useMartingale = document.getElementById('bkUseMartingale')?.checked;
    const useSoros = document.getElementById('bkUseSoros')?.checked;
    const useCycles = document.getElementById('bkUseCycles')?.checked;
    
    const galeSettings = document.getElementById('bkMgmtMartingaleSettings');
    const sorosSettings = document.getElementById('bkMgmtSorosSettings');
    const cyclesSettings = document.getElementById('bkMgmtCyclesSettings');

    if (galeSettings) {
      galeSettings.style.display = useMartingale ? 'flex' : 'none';
    }
    if (sorosSettings) {
      sorosSettings.style.display = useSoros ? 'flex' : 'none';
    }
    if (cyclesSettings) {
      cyclesSettings.style.display = useCycles ? 'flex' : 'none';
    }
  }

  // Acionado pelo catalogador ao clicar em "Testar"
  function open(patternData) {
    activeData = patternData;
    
    // Atualizar título
    const titleEl = document.getElementById('backtestModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `📊 Backtesting: ${patternData.pattern} [${patternData.pair}]`;
    }

    // Configurações padrão carregadas a partir do robô se existirem, ou do padrão do robô
    let botSettings = {};
    try {
      const saved = localStorage.getItem('bo_bot_settings');
      if (saved) botSettings = JSON.parse(saved);
    } catch (e) {}

    document.getElementById('bkAmount').value = botSettings.entryAmount || 10;
    document.getElementById('bkPayout').value = activeData.payout || botSettings.minPayout || 80;
    
    // Configurações de Gerenciamento do Backtest vindas do Robô
    const useMartingaleEl = document.getElementById('bkUseMartingale');
    if (useMartingaleEl) useMartingaleEl.checked = botSettings.useMartingale !== false;
    
    const useSorosEl = document.getElementById('bkUseSoros');
    if (useSorosEl) useSorosEl.checked = botSettings.useSoros === true;
    
    const useCyclesEl = document.getElementById('bkUseCycles');
    if (useCyclesEl) useCyclesEl.checked = botSettings.useCycles === true;
    
    const martingalesEl = document.getElementById('bkMartingales');
    if (martingalesEl) martingalesEl.value = botSettings.martingales !== undefined ? botSettings.martingales : 1;
    
    const galeFactorEl = document.getElementById('bkGaleFactor');
    if (galeFactorEl) galeFactorEl.value = botSettings.galeFactor || 2.0;
    
    const sorosLevelEl = document.getElementById('bkSorosLevel');
    if (sorosLevelEl) sorosLevelEl.value = botSettings.sorosLevel || 1;
    
    const cyclesConfigEl = document.getElementById('bkCyclesConfig');
    if (cyclesConfigEl) cyclesConfigEl.value = botSettings.cyclesConfig || "C1: 10, 20\nC2: 15, 30\nC3: 25, 55";
    
    // Sincronizar visibilidade
    updateMgmtFields();
    
    // Navegar para a página de backtest
    UI.navigateTo('backtest');
    
    // Roda a simulação inicial
    setTimeout(runSimulation, 50);
  }

  function runSimulation() {
    if (!activeData || !activeData.candles || activeData.candles.length === 0) {
      UI.showToast('Nenhum dado de vela disponível para simulação.', 'error');
      return;
    }

    const startBank = parseFloat(document.getElementById('bkStartBank').value) || 100;
    const payout = parseFloat(document.getElementById('bkPayout').value) / 100 || 0.8;
    const baseAmount = parseFloat(document.getElementById('bkAmount').value) || 10;
    
    // Checkboxes de gerenciamento
    const useMartingale = document.getElementById('bkUseMartingale')?.checked ?? true;
    const useSoros = document.getElementById('bkUseSoros')?.checked ?? false;
    const useCycles = document.getElementById('bkUseCycles')?.checked ?? false;
    
    const maxGales = parseInt(document.getElementById('bkMartingales').value) || 0;
    const galeFactor = parseFloat(document.getElementById('bkGaleFactor').value) || 2.0;
    const maxSorosLevel = parseInt(document.getElementById('bkSorosLevel')?.value) || 1;
    const waitCycleBreak = document.getElementById('bkWaitCycleBreak')?.checked ?? true;

    const candles = activeData.candles;
    const rawPattern = activeData.rawPattern;
    const entry = activeData.entry.split(' ')[0]; // Limpa sufixos ex: "CALL (Reversão)" -> "CALL"
    const isExhaustion = activeData.pattern.includes('Exaustão') || activeData.pattern.includes('Continuidade');
    const isTimeMode = activeData.pattern.includes('minuto');

    let bank = startBank;
    let peak = startBank;
    let maxDrawdown = 0;
    
    let wins = 0;
    let losses = 0;
    let draws = 0;
    
    let currentAmount = baseAmount;
    let sorosStep = 0;

    // Ciclos
    let cycles = [];
    let currentCycleIndex = 0;
    let currentStepIndex = 0;
    
    if (useCycles) {
      const configText = document.getElementById('bkCyclesConfig').value || '';
      const lines = configText.split('\n');
      lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(':');
        if (parts.length >= 2) {
          const valuesStr = parts[1].split(',');
          const values = valuesStr.map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
          if (values.length > 0) cycles.push(values);
        } else {
          const values = line.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
          if (values.length > 0) cycles.push(values);
        }
      });
      if (cycles.length === 0) {
        cycles = [[baseAmount]];
      }
    }

    const bankHistory = [startBank];
    const labels = ['Início'];
    const simOps = [];
    let sequenceColorToBreak = null;
    
    const K = rawPattern ? rawPattern.length : 1;

    for (let i = K; i < candles.length; i++) {
      if (waitCycleBreak && sequenceColorToBreak) {
        if (candles[i].color !== sequenceColorToBreak) {
          sequenceColorToBreak = null;
        } else {
          continue; // Pula enquanto o ciclo de cores não quebrar
        }
      }

      let isMatch = false;

      if (isTimeMode) {
        // Modo por Minuto da Hora
        const targetMin = parseInt(rawPattern.replace(':', ''));
        const candleMin = candles[i].time.getMinutes();
        if (candleMin === targetMin) {
          isMatch = true;
        }
      } else if (isExhaustion) {
        // Modo Exaustão de Tendência
        const firstColor = candles[i - K].color;
        let allSame = true;
        for (let j = i - K + 1; j < i; j++) {
          if (candles[j].color !== firstColor) {
            allSame = false;
            break;
          }
        }
        if (allSame && firstColor === rawPattern[0]) {
          isMatch = true;
        }
      } else {
        // Modo Padrão de Cores normal
        let seq = '';
        for (let j = K; j > 0; j--) {
          seq += candles[i - j].color;
        }
        if (seq === rawPattern) {
          isMatch = true;
        }
      }

      if (isMatch) {
        const idxSignal = i;
        const targetColor = entry === 'CALL' ? 'G' : 'R';
        
        let opProfit = 0;
        let candlesUsed = 0;
        let opResult = 'LOSS';
        let opInfo = '';

        let entryAmount = baseAmount;
        if (useCycles && cycles.length > 0) {
          entryAmount = cycles[currentCycleIndex][currentStepIndex];
        } else if (useSoros && sorosStep > 0) {
          entryAmount = currentAmount;
        }

        // Lógica de Execução com Martingale (se ativo)
        if (useMartingale && !useCycles) {
          let cycleLossesAccumulated = 0;
          let wonGale = false;
          let galeUsedText = 'Mão 1';
          
          for (let g = 0; g <= maxGales; g++) {
            if (i + g >= candles.length) break;
            candlesUsed = g;
            const currentGaleAmount = Number((entryAmount * Math.pow(galeFactor, g)).toFixed(2));
            
            if (candles[i + g].color === targetColor) {
              opProfit = (currentGaleAmount * payout) - cycleLossesAccumulated;
              wonGale = true;
              wins++;
              galeUsedText = g === 0 ? 'Mão 1' : `Gale ${g}`;
              break;
            } else {
              cycleLossesAccumulated += currentGaleAmount;
            }
          }
          
          if (!wonGale) {
            opProfit = -cycleLossesAccumulated;
            losses++;
            galeUsedText = maxGales > 0 ? `Estourou Gale` : 'Mão 1';
          }
          opResult = wonGale ? 'WIN' : 'LOSS';
          opInfo = galeUsedText;
          
          // Se tiver Soros combinado com Martingale (SorosGale)
          if (useSoros) {
            if (opResult === 'WIN') {
              if (sorosStep < maxSorosLevel) {
                sorosStep++;
                const winAmount = entryAmount * Math.pow(galeFactor, candlesUsed);
                const winProfit = (winAmount * payout) - (winAmount - entryAmount);
                currentAmount = Number((entryAmount + winProfit).toFixed(2));
              } else {
                sorosStep = 0;
                currentAmount = baseAmount;
              }
            } else {
              sorosStep = 0;
              currentAmount = baseAmount;
            }
          }
        } 
        
        else {
          // Sem Martingale imediato (Mão Fixa, Soros Puro, ou Ciclos)
          const actualColor = candles[i].color;
          const isWin = actualColor === targetColor;
          
          if (isWin) {
            opProfit = entryAmount * payout;
            wins++;
            opResult = 'WIN';
            
            if (useCycles) {
              opInfo = `Ciclo ${currentCycleIndex + 1} Passo ${currentStepIndex + 1}`;
              currentCycleIndex = 0;
              currentStepIndex = 0;
            } else if (useSoros) {
              opInfo = sorosStep === 0 ? 'Mão Base' : `Soros Nível ${sorosStep}`;
              if (sorosStep < maxSorosLevel) {
                sorosStep++;
                currentAmount = Number((entryAmount + opProfit).toFixed(2));
              } else {
                currentAmount = baseAmount;
                sorosStep = 0;
              }
            } else {
              opInfo = 'Mão Fixa';
            }
          } else {
            opProfit = -entryAmount;
            losses++;
            opResult = 'LOSS';
            
            if (useCycles) {
              opInfo = `Ciclo ${currentCycleIndex + 1} Passo ${currentStepIndex + 1}`;
              currentStepIndex++;
              if (currentStepIndex >= cycles[currentCycleIndex].length) {
                currentCycleIndex++;
                currentStepIndex = 0;
                if (currentCycleIndex >= cycles.length) {
                  currentCycleIndex = 0;
                  currentStepIndex = 0;
                }
              }
            } else if (useSoros) {
              opInfo = sorosStep === 0 ? 'Mão Base' : `Soros Nível ${sorosStep}`;
              currentAmount = baseAmount;
              sorosStep = 0;
            } else {
              opInfo = 'Mão Fixa';
            }
          }
        }

        // Aplicar lucro/prejuízo na banca
        bank += opProfit;

        // Evitar que a banca fique menor que zero
        if (bank < 0) bank = 0;

        bankHistory.push(Number(bank.toFixed(2)));
        const dateObj = candles[i].time;
        const dateFormatted = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateTimeStr = `${dateFormatted} ${timeFormatted}`;
        const timeStr = timeFormatted; // Mantemos apenas a hora no gráfico para evitar poluição visual no eixo X
        labels.push(timeStr);

        simOps.push({
          time: dateTimeStr,
          pattern: activeData.pattern.split(' [')[0],
          direction: entry,
          result: opResult,
          info: opInfo,
          profit: opProfit,
          bank: bank
        });

        // Calcular Drawdown Máximo
        if (bank > peak) {
          peak = bank;
        }
        const drawdown = ((peak - bank) / peak) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }

        // Se a banca quebrar, interrompe
        if (bank === 0) {
          logToConsoleBacktest("💥 BANCA ZERADA durante a simulação! Ajuste o gerenciamento.");
          break;
        }

        // Pular as velas adicionais que já foram consumidas pelas tentativas de Martingale
        i += candlesUsed;

        // Evitar reconta de velas na mesma sequência contínua (exaustão/continuidade)
        if (isExhaustion) {
          const minNextIdx = idxSignal + K - 1;
          if (i < minNextIdx) {
            i = minNextIdx;
          }
        }

        if (waitCycleBreak && rawPattern && rawPattern.length > 0) {
          sequenceColorToBreak = rawPattern[0];
        }
      }
    }

    // Renderizar Resultados
    renderStats(bank, startBank, wins, losses, maxDrawdown);
    plotChart(labels, bankHistory);
    renderOpsTable(simOps);
  }

  function renderStats(endBank, startBank, wins, losses, maxDrawdown) {
    const roi = ((endBank - startBank) / startBank) * 100;
    const totalOps = wins + losses;
    const winrate = totalOps > 0 ? ((wins / totalOps) * 100).toFixed(1) : 0;

    document.getElementById('bkStatEndBank').textContent = `$ ${endBank.toFixed(2)}`;
    document.getElementById('bkStatROI').textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`;
    document.getElementById('bkStatROI').style.color = roi >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
    document.getElementById('bkStatWinRate').textContent = `${winrate}%`;
    document.getElementById('bkStatWinLoss').textContent = `${wins} W - ${losses} L`;
    document.getElementById('bkStatDrawdown').textContent = `${maxDrawdown.toFixed(1)}%`;
  }

  function logToConsoleBacktest(msg) {
    console.warn("[Backtest] " + msg);
  }

  function plotChart(labels, data) {
    const ctx = document.getElementById('backtestChart')?.getContext('2d');
    if (!ctx) return;

    if (backtestChart) {
      backtestChart.destroy();
    }

    backtestChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Evolução do Saldo ($)',
          data: data,
          borderColor: '#06fce2',
          borderWidth: 2,
          backgroundColor: 'rgba(6, 252, 226, 0.05)',
          fill: true,
          tension: 0.1,
          pointRadius: data.length > 50 ? 0 : 3,
          pointBackgroundColor: '#06fce2'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.03)'
            },
            ticks: {
              color: '#8b9bb4',
              font: { size: 9 },
              maxTicksLimit: 12
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.03)'
            },
            ticks: {
              color: '#8b9bb4',
              font: { size: 9 }
            }
          }
        }
      }
    });
  }

  function renderOpsTable(ops) {
    const tbody = document.getElementById('backtestOpsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (ops.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Nenhuma operação realizada.</td></tr>`;
      return;
    }
    
    ops.forEach(op => {
      const isWin = op.result === 'WIN';
      const plClass = op.profit >= 0 ? 'text-green' : 'text-red';
      const profitText = op.profit >= 0 ? `+$ ${op.profit.toFixed(2)}` : `-$ ${Math.abs(op.profit).toFixed(2)}`;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${op.time}</td>
        <td>${op.pattern}</td>
        <td><span class="badge ${op.direction === 'CALL' ? 'badge-call' : 'badge-put'}">${op.direction}</span></td>
        <td><span class="badge ${isWin ? 'badge-win' : 'badge-loss'}">${op.result}</span></td>
        <td style="color:var(--text-secondary);">${op.info}</td>
        <td class="${plClass}"><strong>${profitText}</strong></td>
        <td style="color: var(--neon-cyan);">$ ${op.bank.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  return {
    init,
    open
  };
})();

// Iniciar quando o DOM carregar
document.addEventListener('DOMContentLoaded', () => Backtester.init());
