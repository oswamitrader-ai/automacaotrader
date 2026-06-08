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

    document.getElementById('bkMgmtType')?.addEventListener('change', (e) => {
      const container = document.getElementById('bkMgmtSettingsContainer');
      if (container) {
        container.style.display = e.target.value === 'martingale' ? 'flex' : 'none';
      }
    });
  }

  // Acionado pelo catalogador ao clicar em "Testar"
  function open(patternData) {
    activeData = patternData;
    
    // Atualizar título do modal
    const titleEl = document.getElementById('backtestModalTitle');
    if (titleEl) {
      titleEl.innerHTML = `📊 Backtesting: ${patternData.pattern} [${patternData.pair}]`;
    }

    // Configurações padrão
    document.getElementById('bkAmount').value = 10;
    document.getElementById('bkPayout').value = 80;
    
    // Sincronizar visibilidade das configurações adicionais de Martingale
    const mgmtSelect = document.getElementById('bkMgmtType');
    const container = document.getElementById('bkMgmtSettingsContainer');
    if (mgmtSelect && container) {
      container.style.display = mgmtSelect.value === 'martingale' ? 'flex' : 'none';
    }
    
    // Exibe o modal
    UI.openModal('backtestModal');
    
    // Roda a simulação inicial
    setTimeout(runSimulation, 300); // Pequeno timeout para o modal renderizar o Canvas antes
  }

  function runSimulation() {
    if (!activeData || !activeData.candles || activeData.candles.length === 0) {
      UI.showToast('Nenhum dado de vela disponível para simulação.', 'error');
      return;
    }

    const startBank = parseFloat(document.getElementById('bkStartBank').value) || 100;
    const payout = parseFloat(document.getElementById('bkPayout').value) / 100 || 0.8;
    const baseAmount = parseFloat(document.getElementById('bkAmount').value) || 10;
    const mgmt = document.getElementById('bkMgmtType').value;
    const maxGales = parseInt(document.getElementById('bkMartingales').value) || 0;
    const galeFactor = parseFloat(document.getElementById('bkGaleFactor').value) || 2.0;
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
    let galeStep = 0;
    let sorosStep = 0;
    let lastResult = 'WIN';

    const bankHistory = [startBank];
    const labels = ['Início'];
    const simOps = [];
    let sequenceColorToBreak = null;

    // Fazer a simulação cronológica (do mais antigo para o mais recente)
    // Se o catalogador já reverteu a lista, garantimos a ordem cronológica
    // A maioria das APIs fornece cronológico por padrão.
    
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
        // rawPattern ex: "15" (minuto 15)
        const targetMin = parseInt(rawPattern.replace(':', ''));
        const candleMin = candles[i].time.getMinutes();
        if (candleMin === targetMin) {
          isMatch = true;
        }
      } else if (isExhaustion) {
        // Modo Exaustão de Tendência
        // Checar se as K velas anteriores são todas da mesma cor
        const firstColor = candles[i - K].color;
        let allSame = true;
        for (let j = i - K + 1; j < i; j++) {
          if (candles[j].color !== firstColor) {
            allSame = false;
            break;
          }
        }
        
        // Se a cor for igual à cor da sequência que gerou o padrão
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
        // Simular a operação na vela atual e aplicar gestão financeira
        const targetColor = entry === 'CALL' ? 'G' : 'R';
        
        let opProfit = 0;
        let candlesUsed = 0;
        let opResult = 'LOSS';
        let opInfo = '';

        if (mgmt === 'none') {
          // Mão Fixa
          const actualColor = candles[i].color;
          const isWin = actualColor === targetColor;
          if (isWin) {
            opProfit = baseAmount * payout;
            wins++;
            opResult = 'WIN';
          } else {
            opProfit = -baseAmount;
            losses++;
            opResult = 'LOSS';
          }
          opInfo = 'Mão Fixa';
        } 
        
        else if (mgmt === 'martingale') {
          let cycleLossesAccumulated = 0;
          let wonGale = false;
          let galeUsedText = 'Mão 1';
          
          for (let g = 0; g <= maxGales; g++) {
            if (i + g >= candles.length) break;
            candlesUsed = g;
            const currentGaleAmount = Number((baseAmount * Math.pow(galeFactor, g)).toFixed(2));
            
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
        } 
        
        else if (mgmt === 'soros') {
          const actualColor = candles[i].color;
          const isWin = actualColor === targetColor;
          if (isWin) {
            opProfit = currentAmount * payout;
            wins++;
            opResult = 'WIN';
            opInfo = sorosStep === 0 ? 'Mão Base' : `Soros Nível ${sorosStep}`;
            if (sorosStep < 1) { // Soros nível 1 simples na simulação
              sorosStep++;
              currentAmount = Number((baseAmount + (baseAmount * payout)).toFixed(2));
            } else {
              currentAmount = baseAmount;
              sorosStep = 0;
            }
          } else {
            opProfit = -currentAmount;
            losses++;
            opResult = 'LOSS';
            opInfo = sorosStep === 0 ? 'Mão Base' : `Soros Nível ${sorosStep}`;
            currentAmount = baseAmount;
            sorosStep = 0;
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
