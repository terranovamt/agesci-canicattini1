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
      const card = document.createElement('li');
      card.className = 'member-history-row';
      const link = node('a', event.title);
      link.href = 'attivita.html?event=' + event.id;
      const heading = document.createElement('h4'); heading.append(link);
      const date = new Date(event.date + 'T12:00:00').toLocaleDateString('it-IT');
      const time = node('time', date); time.dateTime = event.date;
      const status = node('span', event.status || 'Da registrare');
      status.className = 'member-history-status'; status.dataset.status = event.status || '';
      const meta = node('p', event.kind + ' · ' + event.branch + ' · '); meta.append(status);
      card.append(time, heading, meta);
      const expected = event.due ? event.feeCents : 0;
      const fee = node('p', !event.feeCents && !event.paidCents ? 'Gratuita' :
        'Quota ' + AM.money(expected) + ' · Versato ' + AM.money(event.paidCents) +
        ' · Da ricevere ' + AM.money(Math.max(0, expected - event.paidCents)) +
        (event.paidCents > expected ? ' · In più ' + AM.money(event.paidCents - expected) : ''));
      fee.className = 'member-history-fee'; card.append(fee);
      return card;
    }));
    if (!visible.length) list.append(node('li', $('member-activities-all').checked
      ? 'Nessuna attività registrata per questo socio nelle branche accessibili.'
      : 'Nessuna presenza confermata. Attiva «Anche assenze e da registrare» per vedere tutto.'));
  }
  window.MEMBER_ACTIVITIES = {
    async load(member) {
      const token = ++generation;
      panel.hidden = !member || window.SOCI_MODEL.isAdult(member);
      panel.open = true; list.replaceChildren(); feedback.textContent = ''; events = [];
      const balance = $('member-outstanding');
      balance.hidden = panel.hidden; balance.textContent = panel.hidden ? '' : 'Saldo attività · caricamento…';
      balance.dataset.outstanding = '';
      $('member-activities-all').checked = false;
      $('member-activities-summary').textContent = 'Attività e quote';
      $('member-activities-retry').hidden = true;
      if (panel.hidden) return;
      feedback.textContent = 'Caricamento partecipazioni…';
      try {
        const result = await window.ACCESSO.request('activities/members/' + member.id);
        if (token !== generation) return;
        if (!Array.isArray(result.events)) throw new Error('Storico attività non valido');
        events = [...result.events].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        const remaining = events.reduce((sum, event) =>
          sum + Math.max(0, (event.due ? event.feeCents : 0) - event.paidCents), 0);
        balance.textContent = 'Da ricevere · ' + AM.money(remaining);
        balance.dataset.outstanding = remaining ? 'yes' : 'no';
        const count = events.filter(event => event.status === 'presente').length;
        $('member-activities-summary').textContent = 'Storico attività · ' +
          count + (count === 1 ? ' partecipazione' : ' partecipazioni');
        feedback.textContent = '';
        render();
      } catch (error) {
        if (token !== generation) return;
        list.replaceChildren();
        balance.textContent = 'Saldo attività non disponibile';
        feedback.textContent = 'Storico non disponibile: ' + error.message;
        $('member-activities-retry').hidden = false;
        $('member-activities-retry').onclick = () => { window.MEMBER_ACTIVITIES.load(member).then(() => { panel.open = true; }); };
      }
    },
  };
  $('member-activities-all').onchange = render;
})();
