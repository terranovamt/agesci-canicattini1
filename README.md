# agesci-canicattini1

La presentazione dell'Assemblea di Gruppo si trova in
`docs/Assemblea-di-Gruppo/`.

Per pubblicarla, in **Settings > Pages** scegliere **Deploy from a branch**,
branch `main` e cartella `/docs`, quindi salvare.

Dopo il deploy, la presentazione sara disponibile all'indirizzo
https://terranovamt.github.io/agesci-canicattini1/Assemblea-di-Gruppo/.

## Regia e spettatori

Aprire `Assemblea-di-Gruppo/?regia=LA-TUA-CHIAVE` per la regia, usando la chiave
prevista dalle regole del Realtime Database Firebase. Il parametro deve restare
nell'URL anche quando si ricarica la pagina: la chiave non viene salvata nel browser.

Condividere con gli spettatori l'indirizzo senza `?regia=...`: seguono la regia
e possono tornare indietro, ma non superare la posizione consentita da `config.js`.
Sui dispositivi mobili touch appare anche il pulsante per ruotare la presentazione.
Il ruolo nell'interfaccia non sostituisce le regole Firebase, che devono impedire
scritture senza una chiave valida.