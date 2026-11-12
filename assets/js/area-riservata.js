(function () {
  const A = window.ACCESSO;
  const feedback = document.getElementById(window.NAS ? 'accesso-stato' : 'legacy-accesso-stato');
  function loginFeedback(form, state, message, target) {
    form.querySelectorAll('input[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    feedback.setAttribute('data-state', state);
    feedback.setAttribute('role', state === 'error' ? 'alert' : 'status');
    feedback.setAttribute('aria-live', state === 'error' ? 'assertive' : 'polite');
    form.setAttribute('aria-busy', String(state === 'pending'));
    feedback.textContent = message;
    if (state === 'error' && target) {
      target.setAttribute('aria-invalid', 'true');
      target.focus();
    }
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
    let temporary;
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
    form.hidden = false;
    function resetFields() {
      checkedCode = '';
      temporary = undefined;
      password.removeAttribute('pattern');
      password.minLength = 1;
      fields.hidden = repeat.hidden = true;
      password.disabled = confirmation.disabled = togglePassword.disabled = toggleConfirmation.disabled = true;
      password.value = confirmation.value = '';
      conceal(password, togglePassword);
      conceal(confirmation, toggleConfirmation);
      form.querySelector('label[for="nas-password"]').textContent = 'Password';
      button.textContent = 'Continua';
    }
    function showTools() {
      password.value = confirmation.value = '';
      document.getElementById('login').hidden = true;
      document.getElementById('riservata').hidden = false;
      document.getElementById('esci').hidden = false;
      loginFeedback(form, '', '');
      window.AREA_DASHBOARD.load();
    }
    code.oninput = () => {
      // I gestori password possono emettere input anche senza cambiare il codice.
      if (code.value.trim() === checkedCode) return;
      resetFields();
      loginFeedback(form, '', '');
    };
    form.onsubmit = async e => {
      e.preventDefault();
      if (button.disabled) return;
      button.disabled = code.disabled = true;
      loginFeedback(form, 'pending', checkedCode ? 'Accesso in corso…' : 'Verifica del codice in corso…');
      try {
        if (!checkedCode) {
          const submittedCode = code.value.trim();
          const result = await A.request('auth/status', 'POST', { code: submittedCode });
          checkedCode = submittedCode;
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
          form.querySelector('label[for="nas-password"]').textContent = result.firstAccess ? 'Scegli una password' : 'Password';
          loginFeedback(form, '', '');
          password.focus();
        } else {
          const changing = !confirmation.disabled;
          const typed = password.value;
          const result = await A.entra(password.value, checkedCode, changing ? confirmation.value : undefined, changing ? temporary : undefined);
          password.value = confirmation.value = '';
          conceal(password, togglePassword);
          conceal(confirmation, toggleConfirmation);
          if (result && result.mustChange) {
            // Password provvisoria corretta: nessuna sessione finché non ne viene scelta una personale.
            temporary = typed;
            repeat.hidden = false;
            confirmation.disabled = toggleConfirmation.disabled = false;
            confirmation.required = true;
            password.minLength = 8;
            password.pattern = '(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,128}';
            password.title = 'Almeno 8 caratteri, una maiuscola, una minuscola, un numero e un carattere speciale, come @';
            password.autocomplete = 'new-password';
            button.textContent = 'Imposta password e accedi';
            form.querySelector('label[for="nas-password"]').textContent = 'Scegli una nuova password';
            loginFeedback(form, '', '');
            password.focus();
          } else showTools();
        }
      } catch (error) {
        const mismatch = !confirmation.disabled && password.value !== confirmation.value;
        const target = !checkedCode ? code : mismatch ? confirmation : password;
        if (!mismatch) password.value = confirmation.value = '';
        conceal(password, togglePassword);
        conceal(confirmation, toggleConfirmation);
        code.disabled = false;
        loginFeedback(form, 'error', 'Accesso non riuscito: ' + error.message, target);
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
      document.getElementById('login').hidden = false;
      document.getElementById('riservata').hidden = true;
      loginFeedback(form, 'error', 'Accesso non riuscito: ' + e.message, input);
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
