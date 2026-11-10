document.addEventListener('DOMContentLoaded', () => {
  if (!window.LIVE?.nas || document.querySelector('#stage') ||
      new URLSearchParams(location.search).has('embed')) return;
  const base = window.LIVE.basePath || '';
  let header = document.querySelector('.reserved-header, .setup-header, .hd');
  if (!header) {
    header = document.createElement('header');
    header.className = 'nas-navbar';
    const brand = document.createElement('a');
    brand.href = base + '/area-riservata/';
    brand.className = 'nas-brand';
    const logo = document.createElement('img');
    logo.src = base + '/assets/img/logo-grande.webp';
    logo.alt = 'AGESCI Canicattini 1';
    brand.append(logo, document.createTextNode('Canicattini 1'));
    const link = document.createElement('a');
    link.href = base + '/';
    link.textContent = 'Sito pubblico';
    header.append(brand, link);
    document.body.prepend(header);
  }
  if (document.body.classList.contains('dashboard-page')) return;
  const nav = document.createElement('nav');
  nav.className = 'reserved-location';
  nav.setAttribute('aria-label', 'Dove sei e come tornare');
  const home = document.createElement('a');
  home.href = base + '/area-riservata/';
  home.textContent = '← Home capi';
  const current = document.createElement('strong');
  current.textContent = document.title.split(/[·—]/)[0].trim();
  current.setAttribute('aria-current', 'page');
  nav.append(home, current);
  for (const [file, label] of [['attivita.html', 'Attività'], ['soci.html', 'Soci']]) {
    if (current.textContent === label || label === 'Soci' && current.textContent === 'Libro soci') continue;
    const link = document.createElement('a');
    link.href = base + '/area-riservata/' + file;
    link.textContent = label;
    nav.append(link);
  }
  header.after(nav);
});
