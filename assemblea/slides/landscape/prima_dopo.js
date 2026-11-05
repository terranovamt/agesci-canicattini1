/* usa slides/landscape/modifiche_documento.js */
/* ---- slide_prima_dopo: come era / come diventa. Al click si evidenziano le parti tolte (rosso) e aggiunte (verde) ---- */
const primaDopo = x => modifiche({ ...x, modalita: 'affiancato' });

LANDSCAPE.slide_prima_dopo = primaDopo;
