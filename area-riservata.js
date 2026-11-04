(function () {
  const A = window.ACCESSO;
  const form = document.getElementById('login-form');
  const input = document.getElementById('chiave');
  const stato = document.getElementById('accesso-stato');
  const submit = form.querySelector('button[type=submit]');
  function mostraStrumenti() {
    input.value = '';
    document.getElementById('login').hidden = true;
    document.getElementById('riservata').hidden = false;
    stato.textContent = '';
  }
  async function login(key) {
    submit.disabled = true;
    submit.textContent = 'Verifica in corso…';
    stato.textContent = 'Verifica della chiave...';
    try {
      await A.entra(key);
      mostraStrumenti();
      input.ariaInvalid = 'false';
      document.getElementById('strumenti-titolo').focus();
    } catch (e) {
      stato.textContent = e.message;
      document.getElementById('login').hidden = false;
      document.getElementById('riservata').hidden = true;
      input.ariaInvalid = 'true';
      input.focus();
    } finally { submit.disabled = false; submit.textContent = 'Accedi' }
  }
  form.onsubmit = e => { e.preventDefault(); login(input.value.trim()) };
  document.getElementById('esci').onclick = () => {
    A.esci();
    location.replace('./');
  };
  if (A.verificata()) mostraStrumenti();
  else if (A.chiave()) login(A.chiave());
})();
