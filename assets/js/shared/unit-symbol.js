(function (root) {
  'use strict';
  const M = root.SOCI_MODEL;
  const scriptUrl = document.currentScript?.src;
  const guidoniRoot = scriptUrl
    ? new URL('../../img/guidoni/', scriptUrl).href
    : new URL(`${root.LIVE?.basePath || ''}/assets/img/guidoni/`, document.baseURI).href;
  root.SOCI_UNIT_SYMBOL = function (unit) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 220 160');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (unit.branch === 'L/C' ? 'Triangolo della sestiglia ' : 'Guidone della squadriglia ') + unit.name);
    const shape = (tag, attributes) => {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      return node;
    };
    if (unit.branch === 'L/C') {
      svg.append(shape('path', { d: 'M110 10 L190 148.564 L30 148.564 Z', fill: unit.color, stroke: '#f5cb31', 'stroke-width': '10', 'stroke-linejoin': 'round' }));
    } else {
      const outline = 'M30 20 Q155 12 205 80 Q155 148 30 140 Z';
      svg.append(shape('path', { d: 'M23 8 V153', stroke: '#76512d', 'stroke-width': '6', 'stroke-linecap': 'round' }));
      svg.append(shape('path', { d: outline, fill: '#ffffff', stroke: '#5c5660', 'stroke-width': '2' }));
      const identity = M.patrolIdentity(unit.name);
      if (identity) {
        const image = shape('image', { href: guidoniRoot + identity.image, x: 0, y: 0, width: 220, height: 160, preserveAspectRatio: 'xMidYMid meet' });
        image.addEventListener('error', () => image.remove(), { once: true });
        svg.append(image);
      }
    }
    return svg;
  };
})(window);
