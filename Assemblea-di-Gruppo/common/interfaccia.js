(function () {
  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    const input = document.getElementById(button.dataset.passwordToggle);
    button.addEventListener('click', () => {
      const mostra = input.type === 'password';
      input.type = mostra ? 'text' : 'password';
      button.textContent = mostra ? 'Nascondi' : 'Mostra';
      button.setAttribute('aria-pressed', String(mostra));
    });
  });
})();
