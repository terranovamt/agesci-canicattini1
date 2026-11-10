(function () {
  'use strict';
  const $ = id => document.getElementById(id), AM = window.ACTIVITIES_MODEL;
  const panel = $('member-activities'), list = $('member-activities-list'), feedback = $('member-activities-status');
  let generation = 0, events = [];
  function node(tag, text) {
    const element = document.createElement(tag); element.textContent = text; return element;
  }
  function render() {
    const visible = events.filter(event => $('member-activities-all').checked || event.status === 'presente');
    list.replaceChildren(...visible.map(event => {
      const card = document.createElement('article');
      card.className = 'members-census';
      const link = node('a', event.title);
      link.href = 'attivita.html?event=' + event.id;
      const heading = document.createElement('h4'); heading.append(link);
      const date = new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT');
      card.append(heading, node('p', date + ' · ' + event.kind + ' · ' + event.branch + ' · ' + (event.status || 'Da registrare')));
      const expected = event.due ? event.feeCents : 0;
      if (event.feeCents || event.paidCents) card.append(node('p',
        'Quota attesa: ' + AM.money(expected) + ' · Versato: ' + AM.money(event.paidCents) +
        ' · Da ricevere: ' + AM.money(Math.max(0, expected - event.paidCents)) +
        (event.paidCents > expected ? ' · Versato in più: ' + AM.money(event.paidCents - expected) : '')));
      return card;
    }));
    if (!visible.length) list.append(node('p', $('member-activities-all').checked
      ? 'Nessuna attività registrata per questo socio nelle branche accessibili.'
      : 'Nessuna partecipazione registrata. Le attività senza presenza confermata sono disponibili selezionando «Mostra anche assenze e presenze da registrare».'));
  }
  window.MEMBER_ACTIVITIES = {
    async load(member) {
      const token = ++generation;
      panel.hidden = !member || window.SOCI_MODEL.isAdult(member);
      panel.open = false; list.replaceChildren(); feedback.textContent = ''; events = [];
      $('member-activities-all').checked = false;
      $('member-activities-summary').textContent = 'Attività e quote';
      $('member-activities-retry').hidden = true;
      if (panel.hidden) return;
      feedback.textContent = 'Caricamento partecipazioni…';
      try {
        const result = await window.ACCESSO.request('activities/members/' + member.id);
        if (token !== generation) return;
        if (!Array.isArray(result.events)) throw new Error('Storico attività non valido');
        events = result.events;
        const count = events.filter(event => event.status === 'presente').length;
        $('member-activities-summary').textContent = 'Attività e quote · ' +
          count + (count === 1 ? ' partecipazione' : ' partecipazioni');
        feedback.textContent = '';
        render();
      } catch (error) {
        if (token !== generation) return;
        list.replaceChildren();
        feedback.textContent = 'Storico non disponibile: ' + error.message;
        $('member-activities-retry').hidden = false;
        $('member-activities-retry').onclick = () => { window.MEMBER_ACTIVITIES.load(member).then(() => { panel.open = true; }); };
      }
    },
  };
  $('member-activities-all').onchange = render;
})();
