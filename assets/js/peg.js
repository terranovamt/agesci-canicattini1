(function () {
  const links = [...document.querySelectorAll('.peg-index a')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
  const quickLinks = [];
  let syncQuick = () => {};
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const readingLine = Math.min(180, window.innerHeight * .25);
    let active = 0;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= readingLine) active = index;
    });
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) active = links.length - 1;
    links.forEach((link, index) => {
      if (index === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    quickLinks.forEach(link => {
      if (link.hash === links[active].hash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    syncQuick();
  };
  const scheduleUpdate = () => {
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(update);
    }
  };

  // Floating index for mobile: appears once the inline index has scrolled out of view.
  const index = document.querySelector('.peg-index');
  if (index) {
    const quick = document.createElement('div');
    const panel = index.querySelector('nav').cloneNode(true);
    const toggle = document.createElement('button');
    const icon = document.createElement('i');
    quick.className = 'peg-quick';
    panel.id = 'peg-quick-panel';
    panel.classList.add('peg-quick-panel');
    panel.setAttribute('aria-label', 'Salta a un punto del progetto');
    panel.hidden = true;
    quickLinks.push(...panel.querySelectorAll('a'));
    toggle.type = 'button';
    toggle.className = 'peg-quick-toggle';
    toggle.setAttribute('aria-controls', panel.id);
    icon.setAttribute('aria-hidden', 'true');
    toggle.append(icon);
    quick.append(panel, toggle);
    document.body.append(quick);
    const setOpen = (open, focusToggle) => {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Chiudi l’indice del progetto' : 'Apri l’indice del progetto');
      icon.className = 'fa-solid ' + (open ? 'fa-xmark' : 'fa-bars');
      if (open) (panel.querySelector('[aria-current]') || quickLinks[0]).focus();
      else if (focusToggle) toggle.focus();
    };
    setOpen(false);
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    panel.addEventListener('click', event => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) setOpen(false, true);
    });
    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !quick.contains(event.target)) setOpen(false);
    });
    syncQuick = () => {
      const visible = index.getBoundingClientRect().bottom < 0;
      quick.classList.toggle('is-visible', visible);
      if (!visible && !panel.hidden) setOpen(false);
    };
  }

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('load', scheduleUpdate);
  update();
})();
