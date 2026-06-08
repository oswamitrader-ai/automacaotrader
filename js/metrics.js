// ============================================
// METRICS MODULE - Cálculos de Performance
// ============================================

const Metrics = (() => {

  function calculate(operations, settings) {
    if (!operations || operations.length === 0) {
      return getEmptyMetrics(settings);
    }

    const wins = operations.filter(o => o.result === 'WIN');
    const losses = operations.filter(o => o.result === 'LOSS');
    const draws = operations.filter(o => o.result === 'DRAW');

    const totalOps = operations.length;
    const winCount = wins.length;
    const lossCount = losses.length;
    const drawCount = draws.length;

    // Assertividade
    const validOps = winCount + lossCount;
    const winRate = validOps > 0 ? (winCount / validOps) * 100 : 0;

    // Lucros
    const grossProfit = wins.reduce((sum, o) => sum + (o.amount * (o.payout / 100)), 0);
    const grossLoss = losses.reduce((sum, o) => sum + o.amount, 0);
    const netProfit = grossProfit - grossLoss;

    // Volume total
    const totalVolume = operations.reduce((sum, o) => sum + o.amount, 0);

    // ROI
    const roi = totalVolume > 0 ? (netProfit / totalVolume) * 100 : 0;

    // Saldo atual
    const currentBank = settings.initialBank + netProfit;

    // Sequências
    const { maxWinStreak, maxLossStreak, currentStreak, currentStreakType } = calculateStreaks(operations);

    // Lucro médio por operação
    const avgProfit = winCount > 0 ? grossProfit / winCount : 0;
    const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;

    // Fator de lucro (Profit Factor)
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Payoff ratio
    const payoffRatio = avgLoss > 0 ? avgProfit / avgLoss : 0;

    // Expectância matemática
    const winRateDecimal = winRate / 100;
    const expectancy = validOps > 0 ?
      (winRateDecimal * avgProfit) - ((1 - winRateDecimal) * avgLoss) : 0;

    // Saque líquido
    const withdrawFee = settings.withdrawFee || 0;
    const netWithdrawable = netProfit > 0 ? netProfit * (1 - withdrawFee / 100) : 0;

    // Performance por par
    const pairPerformance = calculatePairPerformance(operations);

    // Performance por horário
    const hourPerformance = calculateHourPerformance(operations);

    // Performance por dia da semana
    const weekdayPerformance = calculateWeekdayPerformance(operations);

    // Performance diária (timeline)
    const dailyPerformance = calculateDailyPerformance(operations);

    // Performance por timeframe
    const timeframePerformance = calculateTimeframePerformance(operations);

    // Evolução do saldo
    const balanceHistory = calculateBalanceHistory(operations, settings.initialBank);

    // Hoje
    const todayMetrics = calculateTodayMetrics(operations);

    return {
      totalOps,
      winCount,
      lossCount,
      drawCount,
      winRate,
      grossProfit,
      grossLoss,
      netProfit,
      totalVolume,
      roi,
      currentBank,
      maxWinStreak,
      maxLossStreak,
      currentStreak,
      currentStreakType,
      avgProfit,
      avgLoss,
      profitFactor,
      payoffRatio,
      expectancy,
      netWithdrawable,
      withdrawFee,
      pairPerformance,
      hourPerformance,
      weekdayPerformance,
      dailyPerformance,
      timeframePerformance,
      balanceHistory,
      todayMetrics,
    };
  }

  function getEmptyMetrics(settings) {
    return {
      totalOps: 0, winCount: 0, lossCount: 0, drawCount: 0,
      winRate: 0, grossProfit: 0, grossLoss: 0, netProfit: 0,
      totalVolume: 0, roi: 0, currentBank: settings.initialBank,
      maxWinStreak: 0, maxLossStreak: 0, currentStreak: 0, currentStreakType: null,
      avgProfit: 0, avgLoss: 0, profitFactor: 0, payoffRatio: 0,
      expectancy: 0, netWithdrawable: 0, withdrawFee: settings.withdrawFee || 0,
      pairPerformance: {}, hourPerformance: {}, weekdayPerformance: {},
      dailyPerformance: {}, timeframePerformance: {},
      balanceHistory: [{ date: 'Início', balance: settings.initialBank }],
      todayMetrics: { wins: 0, losses: 0, profit: 0 },
    };
  }

  function calculateStreaks(operations) {
    let maxWinStreak = 0, maxLossStreak = 0;
    let currentWin = 0, currentLoss = 0;
    let currentStreak = 0, currentStreakType = null;

    // Sort by date
    const sorted = [...operations].sort((a, b) => new Date(a.date) - new Date(b.date));

    sorted.forEach(op => {
      if (op.result === 'WIN') {
        currentWin++;
        currentLoss = 0;
        if (currentWin > maxWinStreak) maxWinStreak = currentWin;
      } else if (op.result === 'LOSS') {
        currentLoss++;
        currentWin = 0;
        if (currentLoss > maxLossStreak) maxLossStreak = currentLoss;
      }
    });

    // Current streak
    for (let i = sorted.length - 1; i >= 0; i--) {
      const r = sorted[i].result;
      if (r === 'DRAW') continue;
      if (currentStreakType === null) {
        currentStreakType = r;
        currentStreak = 1;
      } else if (r === currentStreakType) {
        currentStreak++;
      } else {
        break;
      }
    }

    return { maxWinStreak, maxLossStreak, currentStreak, currentStreakType };
  }

  function calculatePairPerformance(operations) {
    const map = {};
    operations.forEach(op => {
      if (!map[op.pair]) map[op.pair] = { wins: 0, losses: 0, profit: 0 };
      if (op.result === 'WIN') {
        map[op.pair].wins++;
        map[op.pair].profit += op.amount * (op.payout / 100);
      } else if (op.result === 'LOSS') {
        map[op.pair].losses++;
        map[op.pair].profit -= op.amount;
      }
    });
    return map;
  }

  function calculateHourPerformance(operations) {
    const map = {};
    operations.forEach(op => {
      const h = new Date(op.date).getHours();
      const key = `${h.toString().padStart(2, '0')}:00`;
      if (!map[key]) map[key] = { wins: 0, losses: 0, profit: 0 };
      if (op.result === 'WIN') {
        map[key].wins++;
        map[key].profit += op.amount * (op.payout / 100);
      } else if (op.result === 'LOSS') {
        map[key].losses++;
        map[key].profit -= op.amount;
      }
    });
    return map;
  }

  function calculateWeekdayPerformance(operations) {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const map = {};
    operations.forEach(op => {
      const d = days[new Date(op.date).getDay()];
      if (!map[d]) map[d] = { wins: 0, losses: 0, profit: 0 };
      if (op.result === 'WIN') {
        map[d].wins++;
        map[d].profit += op.amount * (op.payout / 100);
      } else if (op.result === 'LOSS') {
        map[d].losses++;
        map[d].profit -= op.amount;
      }
    });
    return map;
  }

  function calculateDailyPerformance(operations) {
    const map = {};
    operations.forEach(op => {
      const d = new Date(op.date).toISOString().slice(0, 10);
      if (!map[d]) map[d] = { wins: 0, losses: 0, profit: 0, count: 0 };
      map[d].count++;
      if (op.result === 'WIN') {
        map[d].wins++;
        map[d].profit += op.amount * (op.payout / 100);
      } else if (op.result === 'LOSS') {
        map[d].losses++;
        map[d].profit -= op.amount;
      }
    });
    return map;
  }

  function calculateTimeframePerformance(operations) {
    const map = {};
    operations.forEach(op => {
      const tf = op.timeframe || 'N/A';
      if (!map[tf]) map[tf] = { wins: 0, losses: 0, profit: 0 };
      if (op.result === 'WIN') {
        map[tf].wins++;
        map[tf].profit += op.amount * (op.payout / 100);
      } else if (op.result === 'LOSS') {
        map[tf].losses++;
        map[tf].profit -= op.amount;
      }
    });
    return map;
  }

  function calculateBalanceHistory(operations, initialBank) {
    const sorted = [...operations].sort((a, b) => new Date(a.date) - new Date(b.date));
    const history = [{ date: 'Início', balance: initialBank }];
    let balance = initialBank;

    sorted.forEach(op => {
      if (op.result === 'WIN') {
        balance += op.amount * (op.payout / 100);
      } else if (op.result === 'LOSS') {
        balance -= op.amount;
      }
      const dateStr = new Date(op.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      history.push({ date: dateStr, balance, id: op.id });
    });

    return history;
  }

  function calculateTodayMetrics(operations) {
    const today = new Date().toISOString().slice(0, 10);
    const todayOps = operations.filter(o => o.date && o.date.startsWith(today));
    let wins = 0, losses = 0, profit = 0;
    todayOps.forEach(op => {
      if (op.result === 'WIN') {
        wins++;
        profit += op.amount * (op.payout / 100);
      } else if (op.result === 'LOSS') {
        losses++;
        profit -= op.amount;
      }
    });
    return { wins, losses, profit, total: todayOps.length };
  }

  // Filtragem
  function filterOperations(operations, filters) {
    return operations.filter(op => {
      if (filters.dateFrom && op.date < filters.dateFrom) return false;
      if (filters.dateTo && op.date > filters.dateTo + 'T23:59:59') return false;
      if (filters.pair && filters.pair !== 'all' && op.pair !== filters.pair) return false;
      if (filters.result && filters.result !== 'all' && op.result !== filters.result) return false;
      if (filters.direction && filters.direction !== 'all' && op.direction !== filters.direction) return false;
      if (filters.strategy && filters.strategy !== 'all' && op.strategy !== filters.strategy) return false;
      if (filters.timeframe && filters.timeframe !== 'all' && op.timeframe !== filters.timeframe) return false;
      return true;
    });
  }

  // ---- Goals Progress ----

  function calculateGoalsProgress(operations, goals) {
    const now = new Date();
    const periods = {
      daily: filterByPeriod(operations, 'daily', now),
      weekly: filterByPeriod(operations, 'weekly', now),
      monthly: filterByPeriod(operations, 'monthly', now),
      yearly: filterByPeriod(operations, 'yearly', now),
    };

    const result = {};
    for (const [period, ops] of Object.entries(periods)) {
      const goal = goals[period];
      const wins = ops.filter(o => o.result === 'WIN');
      const losses = ops.filter(o => o.result === 'LOSS');
      const totalOps = ops.length;
      const validOps = wins.length + losses.length;
      const winRate = validOps > 0 ? (wins.length / validOps) * 100 : 0;
      const grossProfit = wins.reduce((s, o) => s + (o.amount * (o.payout / 100)), 0);
      const grossLoss = losses.reduce((s, o) => s + o.amount, 0);
      const netProfit = grossProfit - grossLoss;

      result[period] = {
        profit: {
          current: netProfit,
          target: goal.profitTarget,
          percent: goal.profitTarget > 0 ? Math.min((netProfit / goal.profitTarget) * 100, 100) : 0,
          status: getGoalStatus(netProfit, goal.profitTarget, 'profit'),
          active: goal.profitTarget > 0,
        },
        loss: {
          current: grossLoss,
          limit: goal.lossLimit,
          percent: goal.lossLimit > 0 ? Math.min((grossLoss / goal.lossLimit) * 100, 100) : 0,
          status: getGoalStatus(grossLoss, goal.lossLimit, 'loss'),
          active: goal.lossLimit > 0,
        },
        ops: {
          current: totalOps,
          max: goal.maxOps,
          percent: goal.maxOps > 0 ? Math.min((totalOps / goal.maxOps) * 100, 100) : 0,
          status: getGoalStatus(totalOps, goal.maxOps, 'ops'),
          active: goal.maxOps > 0,
        },
        winRate: {
          current: winRate,
          min: goal.minWinRate,
          percent: goal.minWinRate > 0 ? Math.min((winRate / goal.minWinRate) * 100, 100) : 0,
          status: getGoalStatus(winRate, goal.minWinRate, 'winRate'),
          active: goal.minWinRate > 0,
        },
        totalOps,
        wins: wins.length,
        losses: losses.length,
        netProfit,
        winRate,
      };
    }
    return result;
  }

  function filterByPeriod(operations, period, now) {
    const start = getPeriodStart(period, now);
    const end = getPeriodEnd(period, now);
    return operations.filter(o => {
      const d = new Date(o.date);
      return d >= start && d <= end;
    });
  }

  function getPeriodStart(period, now) {
    const d = new Date(now);
    switch (period) {
      case 'daily':
        d.setHours(0, 0, 0, 0);
        return d;
      case 'weekly':
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1; // Monday start
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d;
      case 'monthly':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      case 'yearly':
        d.setMonth(0, 1);
        d.setHours(0, 0, 0, 0);
        return d;
    }
  }

  function getPeriodEnd(period, now) {
    const d = new Date(now);
    switch (period) {
      case 'daily':
        d.setHours(23, 59, 59, 999);
        return d;
      case 'weekly':
        const day = d.getDay();
        const diff = day === 0 ? 0 : 7 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(23, 59, 59, 999);
        return d;
      case 'monthly':
        d.setMonth(d.getMonth() + 1, 0);
        d.setHours(23, 59, 59, 999);
        return d;
      case 'yearly':
        d.setMonth(11, 31);
        d.setHours(23, 59, 59, 999);
        return d;
    }
  }

  function getGoalStatus(current, target, type) {
    if (target <= 0) return 'inactive';
    if (type === 'profit') {
      if (current >= target) return 'achieved';
      if (current >= target * 0.7) return 'close';
      return 'in-progress';
    }
    if (type === 'loss') {
      if (current >= target) return 'exceeded';
      if (current >= target * 0.8) return 'warning';
      return 'safe';
    }
    if (type === 'ops') {
      if (current >= target) return 'exceeded';
      if (current >= target * 0.8) return 'warning';
      return 'safe';
    }
    if (type === 'winRate') {
      if (current >= target) return 'achieved';
      if (current >= target * 0.8) return 'close';
      return 'below';
    }
    return 'inactive';
  }

  return {
    calculate,
    filterOperations,
    calculateGoalsProgress,
  };
})();
