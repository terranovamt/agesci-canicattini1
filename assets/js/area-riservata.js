(function () {
  const A = window.ACCESSO;
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
