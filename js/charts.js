// ============================================
// CHARTS MODULE - Chart.js Graphs
// ============================================

const Charts = (() => {
  let instances = {};

  // Chart.js defaults
  function setDefaults() {
    Chart.defaults.color = '#8888a0';
    Chart.defaults.borderColor = 'rgba(30, 30, 48, 0.6)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
    Chart.defaults.plugins.legend.labels.boxHeight = 6;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(18, 18, 26, 0.95)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(0, 212, 255, 0.3)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
    Chart.defaults.scale.grid = { color: 'rgba(30, 30, 48, 0.5)' };
  }

  function destroy(name) {
    if (instances[name]) {
      instances[name].destroy();
      delete instances[name];
    }
  }

  function destroyAll() {
    Object.keys(instances).forEach(k => destroy(k));
  }

  // 1. Balance Evolution (Line)
  function renderBalanceChart(canvasId, balanceHistory) {
    destroy('balance');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = balanceHistory.map(b => b.date);
    const data = balanceHistory.map(b => b.balance);
    const initialBalance = data[0] || 0;

    // Gradient
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

    instances['balance'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Saldo',
          data,
          borderColor: '#00d4ff',
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: data.length > 30 ? 0 : 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#00d4ff',
          pointBorderColor: '#0a0a0f',
          pointBorderWidth: 2,
          segment: {
            borderColor: (ctx) => {
              const val = ctx.p1.parsed.y;
              return val >= initialBalance ? '#00ff88' : '#ff3366';
            },
          },
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `Saldo: R$ ${item.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 10 } },
          y: {
            ticks: {
              callback: (v) => 'R$ ' + v.toFixed(0),
            },
          },
        },
      },
    });
  }

  // 2. Win/Loss Distribution (Doughnut)
  function renderWinLossChart(canvasId, wins, losses, draws) {
    destroy('winloss');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    instances['winloss'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Win', 'Loss', 'Empate'],
        datasets: [{
          data: [wins, losses, draws],
          backgroundColor: [
            'rgba(0, 255, 136, 0.8)',
            'rgba(255, 51, 102, 0.8)',
            'rgba(255, 215, 0, 0.8)',
          ],
          borderColor: ['#00ff88', '#ff3366', '#ffd700'],
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { padding: 16 },
          },
          tooltip: {
            callbacks: {
              label: (item) => {
                const total = item.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((item.parsed / total) * 100).toFixed(1) : 0;
                return ` ${item.label}: ${item.parsed} (${pct}%)`;
              },
            },
          },
        },
      },
      plugins: [{
        id: 'centerText',
        beforeDraw(chart) {
          const { ctx, chartArea: { width, height, top } } = chart;
          const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          const winRate = total > 0 ?
            ((chart.data.datasets[0].data[0] / (chart.data.datasets[0].data[0] + chart.data.datasets[0].data[1])) * 100).toFixed(1) : '0.0';
          ctx.save();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e8e8ef';
          ctx.font = "bold 24px 'Orbitron', monospace";
          ctx.fillText(winRate + '%', width / 2 + chart.chartArea.left / 2, top + height / 2 - 5);
          ctx.font = "11px 'Inter', sans-serif";
          ctx.fillStyle = '#8888a0';
          ctx.fillText('Win Rate', width / 2 + chart.chartArea.left / 2, top + height / 2 + 18);
          ctx.restore();
        },
      }],
    });
  }

  // 3. Profit by Pair (Bar)
  function renderPairChart(canvasId, pairPerformance) {
    destroy('pair');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const pairs = Object.keys(pairPerformance).sort();
    const profits = pairs.map(p => pairPerformance[p].profit);
    const colors = profits.map(p => p >= 0 ? 'rgba(0, 255, 136, 0.7)' : 'rgba(255, 51, 102, 0.7)');
    const borders = profits.map(p => p >= 0 ? '#00ff88' : '#ff3366');

    instances['pair'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: pairs,
        datasets: [{
          label: 'Lucro/Prejuízo',
          data: profits,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `R$ ${item.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          y: {
            ticks: { callback: (v) => 'R$ ' + v.toFixed(0) },
          },
        },
      },
    });
  }

  // 4. Performance by Hour (Bar)
  function renderHourChart(canvasId, hourPerformance) {
    destroy('hour');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const hours = Object.keys(hourPerformance).sort();
    const profits = hours.map(h => hourPerformance[h].profit);
    const colors = profits.map(p => p >= 0 ? 'rgba(0, 212, 255, 0.6)' : 'rgba(255, 51, 102, 0.6)');

    instances['hour'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hours,
        datasets: [{
          label: 'Lucro/Prejuízo',
          data: profits,
          backgroundColor: colors,
          borderRadius: 3,
          maxBarThickness: 30,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `R$ ${item.parsed.y.toFixed(2)}`,
            },
          },
        },
        scales: {
          y: { ticks: { callback: (v) => 'R$ ' + v.toFixed(0) } },
        },
      },
    });
  }

  // 5. Daily Results (Stacked Bar)
  function renderDailyChart(canvasId, dailyPerformance) {
    destroy('daily');
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const dates = Object.keys(dailyPerformance).sort();
    const displayDates = dates.map(d => {
      const parts = d.split('-');
      return parts[2] + '/' + parts[1];
    });
    const wins = dates.map(d => dailyPerformance[d].wins);
    const losses = dates.map(d => -dailyPerformance[d].losses);

    instances['daily'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: displayDates,
        datasets: [
          {
            label: 'Wins',
            data: wins,
            backgroundColor: 'rgba(0, 255, 136, 0.6)',
            borderColor: '#00ff88',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Losses',
            data: losses,
            backgroundColor: 'rgba(255, 51, 102, 0.6)',
            borderColor: '#ff3366',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${Math.abs(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { maxTicksLimit: 15 } },
          y: { stacked: true },
        },
      },
    });
  }

  function renderAll(metrics) {
    setDefaults();
    renderBalanceChart('balanceChart', metrics.balanceHistory);
    renderWinLossChart('winLossChart', metrics.winCount, metrics.lossCount, metrics.drawCount);
    renderPairChart('pairChart', metrics.pairPerformance);
    renderHourChart('hourChart', metrics.hourPerformance);
    renderDailyChart('dailyChart', metrics.dailyPerformance);
  }

  return {
    renderAll,
    renderBalanceChart,
    renderWinLossChart,
    renderPairChart,
    renderHourChart,
    renderDailyChart,
    destroyAll,
    setDefaults,
  };
})();
