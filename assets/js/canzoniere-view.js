(function (root) {
  "use strict";

  function renderScore(target, song, semitones = 0, showChords = true) {
    if (!target || typeof song?.text !== "string") throw new Error("Testo della canzone non valido.");
    const model = root.CANZONIERE_MODEL;
    const lines = model.parseChordPro(model.transposeChordPro(song.text, semitones));
    target.replaceChildren();
    let rendered = 0;
    lines.forEach((line) => {
      if (line.directive) return;
      const row = document.createElement("div");
      row.className = "song-line";
      const chordLine = document.createElement("div");
      chordLine.className = "chord-line";
      const lyricLine = document.createElement("div");
      lyricLine.className = "lyric-line";
      lyricLine.textContent = line.lyric || "\u00a0";
      if (line.chords.length) {
        row.classList.add("has-chords");
        const groups = new Map();
        line.chords.forEach((chord) => {
          const current = groups.get(chord.position) || [];
          current.push(chord.chord);
          groups.set(chord.position, current);
        });
        let lineWidth = line.lyric.length;
        for (const [position, chords] of groups) {
          const marker = document.createElement("span");
          const label = chords.join(" / ");
          marker.className = "chord-marker";
          marker.textContent = label;
          marker.style.left = position + "ch";
          chordLine.append(marker);
          lineWidth = Math.max(lineWidth, position + label.length);
        }
        chordLine.style.width = Math.max(1, lineWidth) + "ch";
        lyricLine.style.width = Math.max(1, lineWidth) + "ch";
      }
      row.append(chordLine, lyricLine);
      target.append(row);
      rendered++;
    });
    if (!rendered) {
      const empty = document.createElement("p");
      empty.className = "empty-song-text";
      empty.textContent = "Testo non disponibile.";
      target.append(empty);
    }
    target.dataset.chords = showChords ? "on" : "off";
  }

  root.CANZONIERE_VIEW = Object.freeze({ renderScore });
})(typeof window === "object" ? window : globalThis);
