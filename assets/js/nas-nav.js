document.addEventListener('DOMContentLoaded', () => {
  if (!window.LIVE?.nas || document.querySelector('.reserved-header, .setup-header')) return;
  const base = window.LIVE.basePath || '';
  const header = document.createElement('header');
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
});
