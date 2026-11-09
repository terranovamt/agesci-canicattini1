(function () {
  const A = window.ACCESSO;
  const feedback = document.getElementById(window.NAS ? 'accesso-stato' : 'legacy-accesso-stato');
  function loginFeedback(form, state, message) {
    feedback.setAttribute('data-state', state);
    form.setAttribute('aria-busy', String(state === 'pending'));
    feedback.textContent = message;
  }
  if (window.NAS) {
    const form = document.getElementById('nas-login-form');
    const code = document.getElementById('census-code');
    const password = document.getElementById('nas-password');
    const confirmation = document.getElementById('nas-confirmation');
    const togglePassword = document.getElementById('toggle-nas-password');
    const toggleConfirmation = document.getElementById('toggle-nas-confirmation');
    const fields = document.getElementById('password-fields');
    const repeat = document.getElementById('confirmation-field');
    const button = form.querySelector('button[type="submit"]');
    let checkedCode = '';
    function visibilityLabel(input, visible) {
      return (visible ? 'Nascondi ' : 'Mostra ') +
        (input === confirmation ? 'conferma password' : 'password');
    }
    function conceal(input, toggle) {
      input.type = 'password';
      toggle.setAttribute('aria-label', visibilityLabel(input, false));
      toggle.setAttribute('title', visibilityLabel(input, false));
      toggle.setAttribute('aria-pressed', 'false');
    }
    function toggleVisibility(input, toggle) {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-label', visibilityLabel(input, visible));
      toggle.setAttribute('title', visibilityLabel(input, visible));
      toggle.setAttribute('aria-pressed', String(visible));
    }
    togglePassword.onclick = () => toggleVisibility(password, togglePassword);
    toggleConfirmation.onclick = () => toggleVisibility(confirmation, toggleConfirmation);
    document.getElementById('login-form').hidden = true;
    document.getElementById('legacy-login-hint').textContent = 'Accesso riservato ai capi censiti nel gruppo.';
    form.hidden = false;
    function resetFields() {
      checkedCode = '';
      fields.hidden = repeat.hidden = true;
      password.disabled = confirmation.disabled = togglePassword.disabled = toggleConfirmation.disabled = true;
      password.value = confirmation.value = '';
      conceal(password, togglePassword);
      conceal(confirmation, toggleConfirmation);
      button.textContent = 'Continua';
    }
    function showTools() {
      password.value = confirmation.value = '';
      document.getElementById('login').hidden = true;
      document.getElementById('riservata').hidden = false;
      document.getElementById('esci').hidden = false;
      document.getElementById('people-tool').hidden = !window.NAS.user.admin && !window.NAS.user.serviceBranch;
      document.getElementById('people-access-tool').hidden = !window.NAS.user.admin;
      loginFeedback(form, '', '');
      window.AREA_DASHBOARD.load();
    }
    code.oninput = () => { resetFields(); loginFeedback(form, '', '') };
    form.onsubmit = async e => {
      e.preventDefault();
      button.disabled = code.disabled = true;
      loginFeedback(form, 'pending', checkedCode ? 'Accesso in corso…' : 'Verifica del codice in corso…');
      try {
        if (!checkedCode) {
          const result = await A.request('auth/status', 'POST', { code: code.value });
          checkedCode = code.value;
          fields.hidden = false;
          password.disabled = false;
          togglePassword.disabled = false;
          repeat.hidden = !result.firstAccess;
          confirmation.disabled = toggleConfirmation.disabled = !result.firstAccess;
          confirmation.required = result.firstAccess;
          password.minLength = result.firstAccess ? 8 : 1;
          if (result.firstAccess)
            password.pattern = '(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,128}';
          else
            password.removeAttribute('pattern');
          password.title = result.firstAccess ? 'Almeno 8 caratteri, una maiuscola, una minuscola, un numero e un carattere speciale, come @' : '';
          password.autocomplete = result.firstAccess ? 'new-password' : 'current-password';
          button.textContent = result.firstAccess ? 'Imposta password e accedi' : 'Accedi';
          loginFeedback(form, 'info', result.firstAccess ? 'Primo accesso: scegli e conferma la password.' : 'Codice verificato. Inserisci la password.');
          password.focus();
        } else {
          await A.entra(password.value, checkedCode, confirmation.disabled ? undefined : confirmation.value);
          password.value = confirmation.value = '';
          conceal(password, togglePassword);
          conceal(confirmation, toggleConfirmation);
          showTools();
        }
      } catch (error) {
        loginFeedback(form, 'error', 'Accesso non riuscito: ' + error.message);
        password.value = confirmation.value = '';
        conceal(password, togglePassword);
        conceal(confirmation, toggleConfirmation);
      } finally { button.disabled = code.disabled = false }
    };
    document.getElementById('esci').onclick = async () => {
      try { await A.esci(); location.replace('../') }
      catch (error) {
        const sessionStatus = document.getElementById('dashboard-session-status');
        sessionStatus.dataset.state = 'error';
        sessionStatus.textContent = 'Uscita non riuscita: ' + error.message;
      }
    };
    if (A.verificata()) showTools();
    return;
  }
  const form = document.getElementById('login-form');
  const input = document.getElementById('chiave');
  function mostraStrumenti() {
    input.value = '';
    document.getElementById('login').hidden = true;
    document.getElementById('riservata').hidden = false;
    document.getElementById('esci').hidden = false;
    loginFeedback(form, '', '');
    window.AREA_DASHBOARD.load();
  }
  async function login(key) {
    form.querySelector('button').disabled = true;
    loginFeedback(form, 'pending', 'Verifica della chiave in corso…');
    try {
      await A.entra(key);
      mostraStrumenti();
    } catch (e) {
      loginFeedback(form, 'error', 'Accesso non riuscito: ' + e.message);
      document.getElementById('login').hidden = false;
      document.getElementById('riservata').hidden = true;
    } finally { form.querySelector('button').disabled = false }
  }
  form.onsubmit = e => { e.preventDefault(); login(input.value.trim()) };
  document.getElementById('esci').onclick = () => {
    A.esci();
    location.replace('../');
  };
  if (A.verificata()) mostraStrumenti();
  else if (A.chiave()) login(A.chiave());
})();
