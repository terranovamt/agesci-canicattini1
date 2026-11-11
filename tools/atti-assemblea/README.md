# Atti dell'assemblea (verbale e deliberazioni)

I Word in `modelli/` sono la fonte: modificali (o sostituiscili con lo stesso nome) e rigenera i PDF.

```
python3 tools/atti-assemblea/genera.py [--db nas.sqlite]
```

- (generato in locale, non versionato) `pdf/Verbale-Assemblea.pdf`: il verbale.
- (generato in locale, non versionato) `pdf/Deliberazione-N-….pdf`: un PDF per ogni mozione (ogni «Assemblea di Gruppo» nel Word inizia una mozione).
- Con `--db` i conteggi SI/NO/ASTENUTI delle deliberazioni 1 (`votazione-bilancio`) e 2 (`votazione-contributo`) vengono dalle votazioni segrete; senza, restano quelli scritti nel Word.

Richiede `python-docx` (`pip install python-docx`) e Google Chrome. I PDF contengono nomi di soci: non pubblicarli sul sito.
