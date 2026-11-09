(function () {
  const A = window.ACCESSO;
  if (window.NAS) {
    const form = document.getElementById('nas-login-form');
    const code = document.getElementById('census-code');
    const password = document.getElementById('nas-password');
    const confirmation = document.getElementById('nas-confirmation');
    const fields = document.getElementById('password-fields');
    const repeat = document.getElementById('confirmation-field');
    const status = document.getElementById('accesso-stato');
    const button = form.querySelector('button');
    let checkedCode = '';
    document.getElementById('login-form').hidden = true;
    document.getElementById('legacy-login-hint').textContent = 'Accesso riservato ai capi censiti nel gruppo.';
    form.hidden = false;
    function resetFields() {
      checkedCode = '';
      fields.hidden = repeat.hidden = true;
      password.disabled = confirmation.disabled = true;
      password.value = confirmation.value = '';
      button.textContent = 'Continua';
    }
    function showTools() {
      password.value = confirmation.value = '';
      document.getElementById('login').hidden = true;
      document.getElementById('riservata').hidden = false;
      document.getElementById('people-tool').hidden = !window.NAS.user.admin;
      status.textContent = '';
      window.AREA_DASHBOARD.load();
    }
    code.oninput = () => { resetFields(); status.textContent = '' };
    form.onsubmit = async e => {
      e.preventDefault();
      button.disabled = code.disabled = true;
      status.textContent = 'Verifica in corso...';
      try {
        if (!checkedCode) {
          const result = await A.request('auth/status', 'POST', { code: code.value });
          checkedCode = code.value;
          fields.hidden = false;
          password.disabled = false;
          repeat.hidden = !result.firstAccess;
          confirmation.disabled = !result.firstAccess;
          confirmation.required = result.firstAccess;
          password.minLength = result.firstAccess ? 8 : 1;
          password.pattern = result.firstAccess ? '(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{8,128}' : '';
          password.title = result.firstAccess ? 'Almeno 8 caratteri, una maiuscola, una minuscola, un numero e un carattere speciale, come @' : '';
          password.autocomplete = result.firstAccess ? 'new-password' : 'current-password';
          button.textContent = result.firstAccess ? 'Imposta password e accedi' : 'Accedi';
          status.textContent = '';
          password.focus();
        } else {
          await A.entra(password.value, checkedCode, confirmation.disabled ? undefined : confirmation.value);
          showTools();
        }
      } catch (error) {
        status.textContent = error.message;
        password.value = confirmation.value = '';
      } finally { button.disabled = code.disabled = false }
    };
    document.getElementById('esci').onclick = async () => {
      try { await A.esci(); location.replace('../') }
      catch (error) { status.textContent = error.message }
    };
    if (A.verificata()) showTools();
    return;
  }
  const form = document.getElementById('login-form');
  const input = document.getElementById('chiave');
  const stato = document.getElementById('accesso-stato');
  function mostraStrumenti() {
    input.value = '';
    document.getElementById('login').hidden = true;
    document.getElementById('riservata').hidden = false;
    stato.textContent = '';
    window.AREA_DASHBOARD.load();
  }
  async function login(key) {
    form.querySelector('button').disabled = true;
    stato.textContent = 'Verifica della chiave...';
    try {
      await A.entra(key);
      mostraStrumenti();
    } catch (e) {
      stato.textContent = e.message;
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
