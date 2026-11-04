(function () {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.self === window.top) {
      const banner = document.createElement('aside');
      banner.setAttribute('role', 'note');
      banner.textContent = 'ANTEPRIMA GRAFICA · Dati simulati · Accedi con una chiave qualsiasi · Nessuna pubblicazione reale';
      banner.style.cssText = 'position:relative;z-index:1000;flex:none;padding:10px 16px;background:#fdc500;color:#211638;text-align:center;font:700 13px/1.5 system-ui';
      document.body.prepend(banner);
    }
    const save = document.getElementById('salva-gh');
    if (save) {
      save.textContent = 'GitHub disattivato in anteprima';
      save.setAttribute('aria-disabled', 'true');
      save.title = 'Usa Scarica dati.js per conservare le prove sul tuo dispositivo.';
      save.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert('Anteprima grafica: la pubblicazione su GitHub è disattivata. Puoi usare Scarica dati.js.');
      }, true);
    }
    const consoleLink = document.getElementById('console');
    if (consoleLink) {
      consoleLink.removeAttribute('href');
      consoleLink.textContent = 'console non disponibile: metriche simulate';
    }
  });
})();
