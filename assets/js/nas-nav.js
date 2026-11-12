document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('#stage') ||
      new URLSearchParams(location.search).has('embed')) return;
  const header = document.querySelector('.reserved-header, .setup-header, .hd');
  if (!header || header.classList.contains('reserved-navbar')) return;
  const base = window.LIVE?.basePath ?? location.pathname.split('/area-riservata/')[0];
  const homePath = base + '/area-riservata/';
  const normalize = pathname => pathname.replace(/index\.html$/, '').replace(/\/$/, '');
  const linkTo = (path, label) => {
    const link = document.createElement('a');
    link.href = path;
    link.textContent = label;
    return link;
  };
  const brand = linkTo(homePath, '');
  brand.className = 'reserved-brand';
  brand.setAttribute('aria-label', 'Home capi · Canicattini 1');
  const logo = document.createElement('img');
  logo.src = header.querySelector('img')?.src || base + '/assets/img/logo-grande.webp';
  logo.alt = '';
  const heading = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = 'Canicattini 1';
  const title = header.querySelector('h1') || document.createElement('span');
  if (!title.textContent) title.textContent = document.title.split(/[·—]/)[0].trim();
  title.className = 'reserved-title';
  heading.append(name, title);
  brand.append(logo, heading);

  const toggle = document.createElement('button');
  toggle.id = 'reserved-menu-toggle';
  toggle.className = 'reserved-menu-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'reserved-menu');
  toggle.innerHTML = '<span class="reserved-menu-icon" aria-hidden="true"><span></span><span></span><span></span></span><span>Menu</span>';
  const menu = document.createElement('div');
  menu.id = 'reserved-menu';
  menu.className = 'reserved-menu';
  const links = document.createElement('nav');
  links.className = 'reserved-links';
  links.setAttribute('aria-label', 'Navigazione area riservata');
  for (const [file, label] of [['', 'Home capi'], ['attivita.html', 'Attività'], ['soci.html', 'Soci']]) {
    const link = linkTo(homePath + file, label);
    if (normalize(location.pathname) === normalize(link.pathname)) link.setAttribute('aria-current', 'page');
    links.append(link);
  }
  const actions = document.createElement('div');
  actions.className = 'reserved-actions';
  // Move the existing controls, not copies: authentication and page handlers keep their nodes.
  for (const child of [...header.children]) {
    if (child.matches('.brand, img, b, .sp')) continue;
    if (child.matches('.view-as-active')) continue;
    const nodes = child.matches('nav') ? [...child.children] : [child];
    for (const node of nodes) {
      if (node.matches('a') && normalize(node.pathname) === normalize(homePath)) continue;
      actions.append(node);
    }
  }
  const logout = document.querySelector('.dashboard-intro #esci');
  if (logout) actions.append(logout);
  const publicLink = [...actions.querySelectorAll('a')].find(link => normalize(link.pathname) === normalize(base + '/'));
  if (publicLink) publicLink.textContent = 'Sito pubblico';
  else actions.append(linkTo(base + '/', 'Sito pubblico'));
  const activeView = header.querySelector('.view-as-active');
  menu.append(links, actions);
  header.replaceChildren(brand, toggle, menu);
  if (activeView) header.append(activeView);
  header.classList.add('reserved-navbar');

  const compact = matchMedia('(max-width: 1024px)');
  function setOpen(open, restoreFocus = false) {
    const expanded = compact.matches && open;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Chiudi il menu' : 'Apri il menu');
    header.classList.toggle('reserved-menu-open', expanded);
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false, compact.matches);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
    // Nested disclosures consume Escape first (for example "Visualizza come").
    if (event.defaultPrevented) return;
    setOpen(false, true);
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) setOpen(false, menu.contains(document.activeElement));
  });
  header.addEventListener('focusout', event => {
    if (event.relatedTarget && !header.contains(event.relatedTarget)) setOpen(false);
  });
  compact.addEventListener('change', () => {
    const focused = document.activeElement;
    setOpen(false, compact.matches && menu.contains(focused));
    if (!compact.matches && focused === toggle) brand.focus();
  });
  setOpen(false);
});
