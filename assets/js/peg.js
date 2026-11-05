(function () {
  const links = [...document.querySelectorAll('.peg-index a')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
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
  };
  const scheduleUpdate = () => {
    if (!scheduled) {
      scheduled = true;
      window.requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('load', scheduleUpdate);
  update();
})();
