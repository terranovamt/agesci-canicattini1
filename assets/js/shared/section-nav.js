(function () {
  'use strict';
  function mount(nav) {
    const buttons = [...nav.querySelectorAll('[data-section-target]')];
    const panels = buttons.map(button => document.getElementById(button.dataset.sectionTarget));
    const media = nav.hasAttribute('data-section-mobile') ? matchMedia(nav.getAttribute('data-section-mobile') || '(max-width: 760px)') : null;
    let selected = 0;
    function select(index, focus = false) {
      selected = index;
      buttons.forEach((button, i) => {
        button.setAttribute('aria-pressed', String(i === selected));
        button.setAttribute('aria-controls', panels[i].id);
        panels[i].hidden = (!media || media.matches) && i !== selected;
      });
      if (focus) buttons[selected].focus();
    }
    buttons.forEach((button, index) => {
      button.onclick = () => select(index);
    });
    let revealingInvalid = false;
    panels.forEach((panel, index) => {
      panel.addEventListener('invalid', () => {
        if (revealingInvalid) return;
        revealingInvalid = true;
        queueMicrotask(() => { revealingInvalid = false; });
        select(index);
      }, true);
    });
    if (media) media.addEventListener('change', () => select(selected));
    select(0);
    nav.hidden = false;
    nav.addEventListener('section-select', event => {
      const index = panels.findIndex(panel => panel.id === event.detail);
      if (index >= 0) select(index);
    });
  }
  document.querySelectorAll('[data-section-nav]').forEach(mount);
})();
