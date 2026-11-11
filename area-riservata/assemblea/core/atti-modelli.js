/* Testi di verbale e deliberazioni (dai modelli Word in tools/atti-assemblea/modelli), con i campi compilati dalla regia. */
window.ATTI_MODELLI = (function () {
  const unanime = e => e.no === 0 && e.ast === 0;
  const esito = e => unanime(e) ? 'con esito positivo all’unanimità' : `con ${e.si} favorevoli, ${e.no} contrari e ${e.ast} astenuti`;
  const approvata = e => e.si > e.no;
  const ora = t => String(t || '').replace(':', '.');
  const luogo = c => `L’Assemblea del Gruppo Agesci Canicattini 1 riunita in sessione ordinaria il ${c.data} presso i locali dell’Oratorio San Filippo Neri sito in Via Magenta 467 in Canicattini Bagni.`;
  const voto = e => [{ t: 'voto', x: 'Voto:' }, { t: 'p', align: 'right', x: `n.   **${e.si}** SI,   n.   **${e.no}** NO,   n.   **${e.ast}** ASTENUTI` }, { t: 'voto', x: 'Presidente:' }];
  const az = (t, x) => [{ t: 'az', x: t }, ...x.split('\n').map(r => ({ t: 'p', x: r }))];

  function verbale(c) {
    const e = c.esiti;
    const B = [{ t: 'h2', x: `VERBALE Assemblea di gruppo ${c.annoScout}` }, { t: 'p', bold: true, x: c.dataBreve }];
    const P = x => B.push({ t: 'p', giust: true, align: 'justify', x });
    P(`L’Assemblea del Gruppo Agesci Canicattini 1 si è riunita in sessione ordinaria il ${c.data} presso i locali dell’Oratorio San Filippo Neri sito in Via Magenta 467 in Canicattini Bagni. La prima convocazione non ha raggiunto il quorum, perciò, l’assemblea ha inizio alle ore ${ora(c.oraInizio)} in seconda convocazione. I capi gruppo danno il benvenuto a tutti i presenti, i genitori presenti all’assemblea sono equivalenti a ${c.genitori} associati con diritto di voto. Considerando anche soci maggiorenni e i partecipanti della comunità capi i presenti sono ${c.presenti}.`);
    P(`I lavori assembleari iniziano con i consueti saluti da parte del capo gruppo ${c.capoGruppo} e con la proposta a presidente di ${c.presidente}, dopo votazione palese il Presidente ${c.presidente} nomina come scrutatori ${c.scrutatori}, e come segretario ${c.segretario}, membro della Co.Ca., ambo votati con votazione palese dall’assemblea.`);
    P(`Il presidente prende la parola e inizia la lettura dei punti fondamentali del regolamento assembleare, art. 1.1, 4, 5, 6.2, 8.2, 11.1, 15.1. L’approvazione del regolamento dell’assemblea di gruppo prima esposto non deve essere nuovamente approvata poiché non sono state proposte né tantomeno apportate modifiche dalla sua ultima approvazione all’assemblea di gruppo ${c.regolamento}.`);
    P(`Il presidente decide di trattare come primo punto all’ordine del giorno “L’attribuzione alla Comunità Capi della responsabilità educativa” e passa la parola a tutta la comunità capi che presenta i vari Staff per l’anno ${c.annoScoutEsteso}. ${c.staff} Si procede quindi alla votazione della mozione per l’attribuzione della responsabilità educativa, conclusa ${esito(e[3])}, ${c.annoScoutEsteso}.`);
    P(`Il presidente cede la parola al segretario ${c.segretarioNome} che procede alla spiegazione del bilancio consuntivo di gruppo a nome di tutta la comunità capi. Dopo l’intervento non essendo pervenute richieste di chiarimenti si procede con la votazione.`);
    P(`Il presidente procede con la votazione che si conclude ${esito(e[1])}, ${approvata(e[1]) ? 'approvando' : 'non approvando'} la mozione${unanime(e[1]) && approvata(e[1]) ? ' all’unanimità' : ''}.`);
    P(`Per la discussione del terzo punto, quota integrativa di gruppo, su concessione del presidente la parola viene passata al capo gruppo ${c.capoGruppo} che spiega l’importanza della quota integrativa e la sua utilità per le varie branche, inoltre informa l’assemblea che da quest’anno la quota associativa da versare al nazionale è di ${c.quotaNaz}€. I genitori ${approvata(e[2]) ? 'approvano' : 'non approvano'} la proposta della Comunità Capi e la quota integrativa fissata a ${c.quota}€. La quota finale complessiva è fissata a ${Number(c.quota) + Number(c.quotaNaz)}€ suddivisi in: ${c.quotaNaz}€ censimento Agesci, ${c.quota}€ quota integrativa di gruppo, devoluta direttamente alle branche in maniera proporzionale al numero di censiti nella branca comprese le quote dei capi. Il presidente procede alla votazione ${esito(e[2])}.`);
    P('Prima di procedere alla lettura delle deliberazioni il presidente chiede se ci sono delle incomprensioni da parte dell’assemblea sui lavori appena svolti, non essendoci interventi si procede alla lettura e alla firma delle deliberazioni da parte del presidente e dei capi gruppo.');
    P('Prima dello scioglimento dell’assemblea i capi gruppo e gli altri capi hanno dato alcune comunicazioni, tra queste:');
    c.comunicazioni.split('\n').filter(x => x.trim()).forEach(x => B.push({ t: 'p', x: '- ' + x.trim() }));
    P(`L’assemblea è conclusa alle ore ${ora(c.oraFine)} dopo la preghiera finale.`);
    B.push({ t: 'voto', x: 'Il presidente:' }, { t: 'voto', prima: -20, x: 'Il segretario:' }, { t: 'voto', prima: -20, x: 'I capi gruppo:' });
    return B;
  }

  function deliberazioni(c) {
    const e = c.esiti, t = (n, ogg) => [{ t: 'h1', x: 'Assemblea di Gruppo ' + c.anno }, { t: 'h2', x: 'Deliberazione n. ' + n }, { t: 'p', align: 'center', x: 'Oggetto: ' + ogg }, { t: 'p', giust: true, align: 'justify', x: luogo(c) }];
    const d1 = [...t(1, 'APPROVAZIONE BILANCIO D’ESERCIZIO DI GRUPPO'),
      ...az('VISTO', '- L’art. 23 e l’art.29, 55 dello Statuto AGESCI;'), ...az('ESAMINATO', `Il bilancio d’esercizio ${c.annoScoutPrec} nel testo giunto tramite e-mail a tutti i soci`),
      ...az('UDITA', 'La presentazione dei Capi Gruppo e degli altri membri della Comunità Capi;'),
      ...az(approvata(e[1]) ? 'APPROVA' : 'NON APPROVA', `Lo stralcio di verbale per l’approvazione del bilancio d’esercizio dell’anno scout ${c.annoScoutPrec}, facente parte integrante della presente deliberazione, da depositare all’interno del Registro Unico Nazionale del Terzo settore, attraverso il supporto informatico predisposto dal Comitato nazionale.`),
      ...voto(e[1])];
    const d2 = [...t(2, 'APPROVAZIONE QUOTA ASSOCIATIVA INTEGRATIVA DI GRUPPO'),
      ...az('VISTO', '- L’art. 54 dello Statuto AGESCI;\n- L’art. 101 del Regolamento associativo;'),
      ...az('CONSIDERATE', `Le attività associative previste per l’anno scout ${c.annoScoutEsteso}, presentate dai Capi Gruppo e dagli altri membri della Comunità Capi, e le relative esigenze di natura economica;`),
      ...az(approvata(e[2]) ? 'DELIBERA' : 'NON DELIBERA', `di fissare per l’anno scout ${c.annoScoutEsteso} la quota associativa di Gruppo pari a euro ${c.quota}. L’entità della quota associativa di Gruppo verrà portata a conoscenza del Comitato di Zona. Tale quota, unitamente alla quota associativa nazionale (pari a euro ${c.quotaNaz}), dovrà essere corrisposta da ciascun socio del Gruppo entro il ${c.scadenza}. Il pagamento del censimento (${c.quotaNaz}€) avviene tramite Pago-Pa, la quota integrativa va consegnata ai capi unità di riferimento.`),
      { t: 'voto', x: 'Proponenti: la Comunità Capi' }, { t: 'p', align: 'right', x: 'I Capi Gruppo  _______ , _______' }, ...voto(e[2])];
    const nomi = c.capi.split('\n').map(x => x.trim()).filter(Boolean), righe = [];
    for (let i = 0; i < nomi.length; i += 3) righe.push([nomi[i], nomi[i + 1] || '', nomi[i + 2] || '']);
    const d3 = [...t(3, 'ELEZIONE DELL’ORGANO ESECUTIVO E DI AMMINISTRAZIONE DEL GRUPPO'),
      ...az('UDITA', 'La presentazione dei Capi Gruppo e gli interventi degli altri membri della Comunità Capi'),
      ...az('CONDIVISO', `Le indicazioni circa gli obiettivi educativi per l’anno scout ${c.annoScoutEsteso} e le altre valutazioni offerte`),
      ...az('DELIBERA', 'Di attribuire alla Comunità Capi la responsabilità di organo esecutivo e di amministrazione del Gruppo. Risulta pertanto eletta la Comunità Capi nel suo insieme, composta da:'),
      { t: 'tab', righe }, ...voto(e[3])];
    return [d1, d2, d3];
  }
  return { verbale, deliberazioni };
})();
