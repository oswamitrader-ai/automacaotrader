// ============================================
// AUTH MODULE - Integração com Supabase
// ============================================

const Auth = (() => {
  // Configurações do Supabase (novo banco zerado)
  const supabaseUrl = 'https://ldpsnxkssimjepbxvebn.supabase.co';
  const supabaseKey = 'sb_publishable_F9739kqQDsS91tdWDrBPSQ_8S_EFTeY';
  
  let supabase = null;
  let currentUser = null;

  async function init() {
    if (typeof window.supabase === 'undefined') {
      console.error('Supabase library not loaded!');
      return;
    }
    
    // Inicializa o cliente do Supabase
    supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    
    // Verifica a sessão atual
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (session) {
      currentUser = session.user;
      showApp();
      // Sincroniza dados do Supabase
      if (typeof Storage !== 'undefined' && Storage.syncFromSupabase) {
        Storage.syncFromSupabase(currentUser.id).then(() => {
          if (typeof App !== 'undefined' && App.refresh) App.refresh();
        });
      }
    } else {
      showLogin();
    }

    // Escuta mudanças no estado de autenticação
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        currentUser = session.user;
        showApp();
        if (typeof Storage !== 'undefined' && Storage.syncFromSupabase) {
          await Storage.syncFromSupabase(currentUser.id);
          if (typeof App !== 'undefined' && App.refresh) App.refresh();
        }
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        showLogin();
        // Limpa dados locais ao sair para evitar vazamento entre contas
        localStorage.removeItem('bo_operations');
        localStorage.removeItem('bo_settings');
        localStorage.removeItem('bo_goals');
        if (typeof App !== 'undefined' && App.refresh) App.refresh();
      }
    });

    setupUIEvents();
  }

  function setupUIEvents() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', handleAuthSubmit);
    }

    const toggleModeBtn = document.getElementById('authToggleMode');
    if (toggleModeBtn) {
      toggleModeBtn.addEventListener('click', toggleAuthMode);
    }

    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logout);
    }
  }

  let isRegisterMode = false;

  function toggleAuthMode(e) {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleBtn = document.getElementById('authToggleMode');
    const nameGroup = document.getElementById('authNameGroup');

    if (isRegisterMode) {
      title.textContent = 'Criar Conta';
      subtitle.textContent = 'Registre-se para salvar suas operações';
      submitBtn.innerHTML = 'Cadastrar 🚀';
      toggleBtn.innerHTML = 'Já tem uma conta? <span>Faça Login</span>';
      nameGroup.style.display = 'block';
      document.getElementById('authName').required = true;
    } else {
      title.textContent = 'Acesso ao Dashboard';
      subtitle.textContent = 'Entre com suas credenciais para continuar';
      submitBtn.innerHTML = 'Entrar ⚡';
      toggleBtn.innerHTML = 'Não tem uma conta? <span>Registre-se grátis</span>';
      nameGroup.style.display = 'none';
      document.getElementById('authName').required = false;
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const submitBtn = document.getElementById('authSubmitBtn');
    const originalText = submitBtn.innerHTML;

    submitBtn.innerHTML = '<div class="loader-spinner" style="width:20px;height:20px;margin:auto;"></div>';
    submitBtn.disabled = true;

    try {
      if (isRegisterMode) {
        const fullName = document.getElementById('authName').value;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });

        if (error) throw error;
        
        UI.showToast('Conta criada com sucesso! Verifique seu email se necessário, ou entre direto.', 'success');
        if (data.session) {
           // Já logou automático
        } else {
           // Voltar pro login
           toggleAuthMode(new Event('click'));
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        UI.showToast('Login efetuado com sucesso!', 'success');
      }
    } catch (error) {
      console.error(error);
      UI.showToast(error.message, 'error');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  }

  async function logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      UI.showToast('Sessão encerrada.', 'info');
    } catch (error) {
      console.error(error);
      UI.showToast('Erro ao sair da conta.', 'error');
    }
  }

  function showLogin() {
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'flex';
  }

  function showApp() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
    // Atualiza nome de usuário se existir o elemento
    const userNameEl = document.getElementById('navUserName');
    if (userNameEl && currentUser) {
      userNameEl.textContent = currentUser.user_metadata?.full_name || currentUser.email;
    }
  }

  return { init, getUser: () => currentUser, logout, getClient: () => supabase };
})();
