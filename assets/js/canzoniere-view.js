(function (root) {
  "use strict";

  function lineCapacity(target) {
    if (!target.clientWidth || typeof root.getComputedStyle !== "function") return 80;
    const styles = root.getComputedStyle(target);
    const fontSize = Number.parseFloat(styles.fontSize) || 20;
    const padding = (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0);
    const width = target.clientWidth - padding;
    if (width <= 0) return 80;
    let characterWidth = fontSize * 0.6;
    const canvas = root.document.createElement("canvas");
    const context = canvas.getContext?.("2d");
    if (context) {
      context.font = styles.font || `${fontSize}px monospace`;
      const measured = context.measureText("0").width;
      if (Number.isFinite(measured) && measured > 0) characterWidth = measured;
    }
    return Math.max(12, Math.floor(width / characterWidth));
  }

  function chordGroups(chords) {
    const grouped = new Map();
    chords.forEach(({ chord, position }) => {
      const current = grouped.get(position) || [];
      current.push(chord);
      grouped.set(position, current);
    });
    return [...grouped].map(([position, values]) => ({
      position, label: values.join(" / "),
    })).sort((a, b) => a.position - b.position);
  }

  function wrapLine(lyric, chords, maxCharacters, showChords) {
    if (!lyric.length) return [{ start: 0, end: 0, nextStart: 0 }];
    const result = [];
    let start = 0;
    while (start < lyric.length) {
      let end = Math.min(lyric.length, start + maxCharacters);
      if (end < lyric.length) {
        const space = lyric.lastIndexOf(" ", end);
        if (space > start) end = space;
      }
      if (showChords) {
        for (const chord of chords) {
          if (chord.position < start || chord.position > end) continue;
          if (chord.position - start + chord.label.length > maxCharacters && chord.position > start) {
            const space = lyric.lastIndexOf(" ", chord.position - 1);
            end = space > start ? Math.min(end, space) : Math.min(end, chord.position);
          }
        }
      }
      if (end <= start) end = Math.min(lyric.length, start + maxCharacters);
      let nextStart = end;
      if (end < lyric.length && lyric[end] === " ") nextStart++;
      while (nextStart < lyric.length && lyric[nextStart] === " ") nextStart++;
      result.push({ start, end, nextStart });
      start = nextStart;
    }
    return result;
  }

  function renderScore(target, song, semitones = 0, showChords = true) {
    if (!target || typeof song?.text !== "string") throw new Error("Testo della canzone non valido.");
    const model = root.CANZONIERE_MODEL;
    const lines = model.parseChordPro(model.transposeChordPro(song.text, semitones));
    const maxCharacters = lineCapacity(target);
    target.replaceChildren();
    let rendered = 0;
    lines.forEach((line) => {
      if (line.directive) return;
      const groups = chordGroups(line.chords);
      const segments = wrapLine(line.lyric, groups, maxCharacters, showChords);
      segments.forEach((segment, segmentIndex) => {
        const row = document.createElement("div");
        row.className = "song-line";
        row.dataset.scrollFraction = String(1 / segments.length);
        const chordLine = document.createElement("div");
        chordLine.className = "chord-line";
        const lyricLine = document.createElement("div");
        lyricLine.className = "lyric-line";
        lyricLine.textContent = line.lyric.slice(segment.start, segment.end) || "\u00a0";
        if (line.chords.length) {
          row.classList.add("has-chords");
          groups.forEach((group) => {
            const inSegment = group.position >= segment.start &&
              (group.position < segment.end ||
                group.position < segment.nextStart ||
                segmentIndex === segments.length - 1 && group.position === segment.end);
            if (!inSegment) return;
            const marker = document.createElement("span");
            marker.className = "chord-marker";
            marker.textContent = group.label;
            marker.style.left = Math.max(0, group.position - segment.start) + "ch";
            chordLine.append(marker);
          });
        }
        row.append(chordLine, lyricLine);
        target.append(row);
        rendered++;
      });
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
