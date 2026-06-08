// ============================================
// STORAGE MODULE - localStorage CRUD
// ============================================

const Storage = (() => {
  const KEYS = {
    OPERATIONS: 'bo_operations',
    SETTINGS: 'bo_settings',
    GOALS: 'bo_goals',
  };

  const DEFAULT_GOALS = {
    daily: { profitTarget: 0, lossLimit: 0, maxOps: 0, minWinRate: 0 },
    weekly: { profitTarget: 0, lossLimit: 0, maxOps: 0, minWinRate: 0 },
    monthly: { profitTarget: 0, lossLimit: 0, maxOps: 0, minWinRate: 0 },
    yearly: { profitTarget: 0, lossLimit: 0, maxOps: 0, minWinRate: 0 },
  };

  const DEFAULT_SETTINGS = {
    initialBank: 1000,
    currentBank: 1000,
    withdrawFee: 5, // percentage
    profitGoal: 10, // percentage
    dailyStopLoss: 10, // percentage
    defaultPayout: 85, // percentage
    currency: 'BRL',
  };

  // ---- Operations ----

  function getOperations() {
    try {
      const data = localStorage.getItem(KEYS.OPERATIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveOperations(ops) {
    localStorage.setItem(KEYS.OPERATIONS, JSON.stringify(ops));
  }

  function addOperation(op) {
    const ops = getOperations();
    op.id = generateId();
    op.createdAt = new Date().toISOString();
    ops.push(op);
    saveOperations(ops);

    // Sincroniza com Supabase
    if (typeof Auth !== 'undefined' && Auth.getUser()) {
      const user = Auth.getUser();
      const supabase = Auth.getClient();
      if (supabase) {
        supabase.from('operations').insert({
          id: op.id,
          user_id: user.id,
          created_at: op.createdAt,
          date: op.date,
          pair: op.pair,
          direction: op.direction,
          amount: op.amount,
          payout: op.payout,
          result: op.result,
          timeframe: op.timeframe || null,
          strategy: op.strategy || null,
          notes: op.notes || null,
          is_simulation: op.isSimulation || false
        }).then(({ error }) => {
          if (error) console.error('Erro ao sincronizar operação adicionada:', error);
        });
      }
    }
    return op;
  }

  function updateOperation(id, data) {
    const ops = getOperations();
    const idx = ops.findIndex(o => o.id === id);
    if (idx === -1) return null;
    ops[idx] = { ...ops[idx], ...data };
    saveOperations(ops);

    // Sincroniza com Supabase
    if (typeof Auth !== 'undefined' && Auth.getUser()) {
      const user = Auth.getUser();
      const supabase = Auth.getClient();
      if (supabase) {
        supabase.from('operations')
          .update({
            date: ops[idx].date,
            pair: ops[idx].pair,
            direction: ops[idx].direction,
            amount: ops[idx].amount,
            payout: ops[idx].payout,
            result: ops[idx].result,
            timeframe: ops[idx].timeframe || null,
            strategy: ops[idx].strategy || null,
            notes: ops[idx].notes || null,
            is_simulation: ops[idx].isSimulation || false
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .then(({ error }) => {
            if (error) console.error('Erro ao sincronizar atualização de operação:', error);
          });
      }
    }
    return ops[idx];
  }

  function deleteOperation(id) {
    const ops = getOperations().filter(o => o.id !== id);
    saveOperations(ops);

    // Sincroniza com Supabase
    if (typeof Auth !== 'undefined' && Auth.getUser()) {
      const user = Auth.getUser();
      const supabase = Auth.getClient();
      if (supabase) {
        supabase.from('operations')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id)
          .then(({ error }) => {
            if (error) console.error('Erro ao sincronizar exclusão de operação:', error);
          });
      }
    }
  }

  function getOperationById(id) {
    return getOperations().find(o => o.id === id) || null;
  }

  function clearAllOperations() {
    saveOperations([]);

    // Sincroniza com Supabase
    if (typeof Auth !== 'undefined' && Auth.getUser()) {
      const user = Auth.getUser();
      const supabase = Auth.getClient();
      if (supabase) {
        supabase.from('operations')
          .delete()
          .eq('user_id', user.id)
          .then(({ error }) => {
            if (error) console.error('Erro ao sincronizar limpeza de operações:', error);
          });
      }
    }
  }

  // ---- Settings ----

  function getSettings() {
    try {
      const data = localStorage.getItem(KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  }

  function updateSettings(partial) {
    const current = getSettings();
    const updated = { ...current, ...partial };

    saveSettings(updated);

    // Sincroniza com Supabase
    if (typeof Auth !== 'undefined' && Auth.getUser()) {
      const user = Auth.getUser();
      const supabase = Auth.getClient();
      if (supabase) {
        supabase.from('settings')
          .upsert({
            user_id: user.id,
            initial_bank: updated.initialBank,
            current_bank: updated.currentBank,
            withdraw_fee: updated.withdrawFee,
            profit_goal: updated.profitGoal,
            daily_stop_loss: updated.dailyStopLoss,
            default_payout: updated.defaultPayout,
            currency: updated.currency,
            twelve_data_key: updated.sysTwelveDataKey || null,
            updated_at: new Date().toISOString()
          })
          .then(({ error }) => {
            if (error) console.error('Erro ao sincronizar configurações:', error);
          });
      }
    }
    return updated;
  }

  // ---- Goals ----

  function getGoals() {
    try {
      const data = localStorage.getItem(KEYS.GOALS);
      if (!data) return { ...DEFAULT_GOALS };
      const parsed = JSON.parse(data);
      return {
        daily: { ...DEFAULT_GOALS.daily, ...parsed.daily },
        weekly: { ...DEFAULT_GOALS.weekly, ...parsed.weekly },
        monthly: { ...DEFAULT_GOALS.monthly, ...parsed.monthly },
        yearly: { ...DEFAULT_GOALS.yearly, ...parsed.yearly },
      };
    } catch {
      return { ...DEFAULT_GOALS };
    }
  }

  function saveGoals(goals) {
    localStorage.setItem(KEYS.GOALS, JSON.stringify(goals));
  }

  function updateGoals(period, values) {
    const goals = getGoals();
    goals[period] = { ...goals[period], ...values };
    saveGoals(goals);

    // Sincroniza com Supabase
    if (typeof Auth !== 'undefined' && Auth.getUser()) {
      const user = Auth.getUser();
      const supabase = Auth.getClient();
      if (supabase) {
        supabase.from('goals')
          .upsert({
            user_id: user.id,
            daily: goals.daily,
            weekly: goals.weekly,
            monthly: goals.monthly,
            yearly: goals.yearly,
            updated_at: new Date().toISOString()
          })
          .then(({ error }) => {
            if (error) console.error('Erro ao sincronizar metas:', error);
          });
      }
    }
    return goals;
  }

  // ---- Helpers ----

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function exportData() {
    return JSON.stringify({
      operations: getOperations(),
      settings: getSettings(),
      goals: getGoals(),
      exportDate: new Date().toISOString(),
    }, null, 2);
  }

  function importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.operations) saveOperations(data.operations);
      if (data.settings) saveSettings(data.settings);
      if (data.goals) saveGoals(data.goals);
      return true;
    } catch {
      return false;
    }
  }

  function exportCSV() {
    const ops = getOperations();
    if (ops.length === 0) return '';
    const headers = ['Data', 'Par', 'Direção', 'Valor', 'Payout %', 'Resultado', 'Lucro/Prejuízo', 'Timeframe', 'Estratégia', 'Observações'];
    const rows = ops.map(o => {
      const profitLoss = o.result === 'WIN' ? (o.amount * (o.payout / 100)) :
                         o.result === 'LOSS' ? -o.amount : 0;
      return [
        formatDateBR(o.date),
        o.pair,
        o.direction,
        o.amount.toFixed(2),
        o.payout,
        o.result,
        profitLoss.toFixed(2),
        o.timeframe || '',
        o.strategy || '',
        o.notes || '',
      ].join(';');
    });
    return [headers.join(';'), ...rows].join('\n');
  }

  function formatDateBR(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async function syncFromSupabase(userId) {
    if (typeof Auth === 'undefined' || !Auth.getClient()) return;
    const supabase = Auth.getClient();

    try {
      // 1. Buscar configurações
      const { data: dbSettings, error: settingsError } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (settingsError) throw settingsError;

      // 2. Buscar metas
      const { data: dbGoals, error: goalsError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (goalsError) throw goalsError;

      // 3. Buscar operações
      const { data: dbOperations, error: opsError } = await supabase
        .from('operations')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (opsError) throw opsError;

      // Verificação de migração inicial (se banco remoto estiver vazio e houver dados locais)
      const localOps = getOperations();
      const localSettings = getSettings();
      const localGoals = getGoals();

      const hasLocalData = localOps.length > 0 || 
                           JSON.stringify(localSettings) !== JSON.stringify(DEFAULT_SETTINGS) ||
                           JSON.stringify(localGoals) !== JSON.stringify(DEFAULT_GOALS);

      const hasRemoteData = dbSettings || dbGoals || (dbOperations && dbOperations.length > 0);

      if (!hasRemoteData && hasLocalData) {
        console.log('Banco remoto vazio. Iniciando migração de dados locais para o Supabase...');
        
        // Upload configurações
        const settingsToUpload = {
          user_id: userId,
          initial_bank: localSettings.initialBank,
          current_bank: localSettings.currentBank,
          withdraw_fee: localSettings.withdrawFee,
          profit_goal: localSettings.profitGoal,
          daily_stop_loss: localSettings.dailyStopLoss,
          default_payout: localSettings.defaultPayout,
          currency: localSettings.currency,
          twelve_data_key: localSettings.sysTwelveDataKey || null
        };
        await supabase.from('settings').insert(settingsToUpload);

        // Upload metas
        const goalsToUpload = {
          user_id: userId,
          daily: localGoals.daily,
          weekly: localGoals.weekly,
          monthly: localGoals.monthly,
          yearly: localGoals.yearly
        };
        await supabase.from('goals').insert(goalsToUpload);

        // Upload operações
        if (localOps.length > 0) {
          const opsToUpload = localOps.map(op => ({
            id: op.id,
            user_id: userId,
            created_at: op.createdAt || new Date().toISOString(),
            date: op.date,
            pair: op.pair,
            direction: op.direction,
            amount: op.amount,
            payout: op.payout,
            result: op.result,
            timeframe: op.timeframe || null,
            strategy: op.strategy || null,
            notes: op.notes || null,
            is_simulation: op.isSimulation || false
          }));
          await supabase.from('operations').insert(opsToUpload);
        }
        console.log('Migração para nuvem concluída com sucesso!');
        return;
      }

      // Se há dados na nuvem, atualiza localstorage
      if (dbSettings) {
        const mappedSettings = {
          initialBank: Number(dbSettings.initial_bank),
          currentBank: Number(dbSettings.current_bank),
          withdrawFee: Number(dbSettings.withdraw_fee),
          profitGoal: Number(dbSettings.profit_goal),
          dailyStopLoss: Number(dbSettings.daily_stop_loss),
          defaultPayout: Number(dbSettings.default_payout),
          currency: dbSettings.currency,
          sysTwelveDataKey: dbSettings.twelve_data_key || ''
        };
        saveSettings(mappedSettings);
      }

      if (dbGoals) {
        const mappedGoals = {
          daily: dbGoals.daily,
          weekly: dbGoals.weekly,
          monthly: dbGoals.monthly,
          yearly: dbGoals.yearly
        };
        saveGoals(mappedGoals);
      }

      if (dbOperations) {
        const mappedOps = dbOperations.map(op => ({
          id: op.id,
          createdAt: op.created_at,
          date: op.date,
          pair: op.pair,
          direction: op.direction,
          amount: Number(op.amount),
          payout: Number(op.payout),
          result: op.result,
          timeframe: op.timeframe,
          strategy: op.strategy,
          notes: op.notes,
          isSimulation: op.is_simulation
        }));
        saveOperations(mappedOps);
      }

    } catch (err) {
      console.error('Erro na sincronização assíncrona do Supabase:', err);
    }
  }

  return {
    getOperations,
    addOperation,
    updateOperation,
    deleteOperation,
    getOperationById,
    clearAllOperations,
    getSettings,
    saveSettings,
    updateSettings,
    getGoals,
    saveGoals,
    updateGoals,
    exportData,
    importData,
    exportCSV,
    syncFromSupabase,
  };
})();
