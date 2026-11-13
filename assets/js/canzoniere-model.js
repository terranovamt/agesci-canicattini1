(function (root) {
  "use strict";

  const METERS = Object.freeze({ "4/4": 4, "3/4": 3, "6/8": 6 });
  const DEFAULT_SECONDS_PER_LINE = 8;
  const DEFAULT_TAGS = Object.freeze([
    { slug: "ingresso", name: "Ingresso", category: "momento" },
    { slug: "uscita", name: "Uscita", category: "momento" },
    { slug: "fuoco-di-bivacco", name: "Fuoco di bivacco", category: "momento" },
    { slug: "marcia", name: "Marcia", category: "momento" },
    { slug: "preghiera", name: "Preghiera", category: "momento" },
    { slug: "messa", name: "Messa", category: "momento" },
    { slug: "buonanotte", name: "Buonanotte", category: "momento" },
    { slug: "giochi", name: "Giochi", category: "momento" },
    { slug: "promessa", name: "Promessa", category: "momento" },
    { slug: "chiusura", name: "Chiusura", category: "momento" },
    { slug: "lc", name: "L/C", category: "branca" },
    { slug: "eg", name: "E/G", category: "branca" },
    { slug: "rs", name: "R/S", category: "branca" },
  ].map(Object.freeze));
  const DEFAULT_PRESETS = Object.freeze([
    { slug: "uscita", title: "Uscita", tagSlugs: ["uscita"], songSlugs: [], limit: 12 },
    {
      slug: "fuoco-di-bivacco",
      title: "Fuoco di bivacco",
      tagSlugs: ["fuoco-di-bivacco"],
      songSlugs: [],
      limit: 12,
    },
  ].map((preset) => Object.freeze({ ...preset, tagSlugs: Object.freeze(preset.tagSlugs), songSlugs: Object.freeze(preset.songSlugs) })));
  const NATURAL_PITCH = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });
  const SHARP_NOTES = Object.freeze(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
  const FLAT_NOTES = Object.freeze(["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]);

  function normalizeSearch(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  function slugify(value) {
    return normalizeSearch(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function chordParts(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 32) return null;
    const chord = value.trim();
    if (/^N\.?C\.?$/i.test(chord)) return { noChord: true, chord };

    let main = chord;
    let bass = "";
    const slash = chord.lastIndexOf("/");
    if (slash > 0 && /^[A-G][#b]?$/i.test(chord.slice(slash + 1))) {
      main = chord.slice(0, slash);
      bass = chord.slice(slash + 1);
    }

    const rootMatch = /^([A-G])([#b]?)(.*)$/i.exec(main);
    if (!rootMatch || /[\[\]\r\n]/.test(rootMatch[3])) return null;
    return { chord, root: rootMatch[1].toUpperCase(), accidental: rootMatch[2], suffix: rootMatch[3], bass };
  }

  function pitch(note) {
    const match = /^([A-G])([#b]?)$/i.exec(note);
    if (!match) return null;
    return (NATURAL_PITCH[match[1].toUpperCase()] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + 12) % 12;
  }

  function noteName(value, preferFlats) {
    const index = ((value % 12) + 12) % 12;
    return (preferFlats ? FLAT_NOTES : SHARP_NOTES)[index];
  }

  function transposeChord(chord, semitones, preferFlats) {
    if (!Number.isInteger(semitones)) throw new RangeError("La trasposizione deve essere un numero intero di semitoni");
    const parts = chordParts(chord);
    if (!parts || parts.noChord || semitones === 0) return chord;
    const flats = preferFlats ?? /b/.test(chord);
    const rootPitch = pitch(parts.root + parts.accidental);
    const bassPitch = parts.bass ? pitch(parts.bass) : null;
    return noteName(rootPitch + semitones, flats) + parts.suffix +
      (parts.bass ? "/" + noteName(bassPitch + semitones, flats) : "");
  }

  function transposeKey(key, semitones, preferFlats) {
    return transposeChord(key, semitones, preferFlats);
  }

  function parseChordPro(source) {
    if (typeof source !== "string") throw new TypeError("Il testo ChordPro deve essere una stringa");
    return source.replace(/\r\n?/g, "\n").split("\n").map((line) => {
      const directive = /^\{([a-z][a-z0-9_-]*)(?::([^}]*))?\}$/i.exec(line.trim());
      if (directive) {
        return {
          lyric: "",
          chords: [],
          directive: { name: directive[1].toLowerCase(), value: (directive[2] || "").trim() },
        };
      }

      let lyric = "";
      const chords = [];
      for (let index = 0; index < line.length;) {
        if (line[index] === "[") {
          const end = line.indexOf("]", index + 1);
          if (end > index + 1) {
            const symbol = line.slice(index + 1, end).trim();
            if (chordParts(symbol)) {
              chords.push({ chord: symbol, position: lyric.length });
              index = end + 1;
              continue;
            }
          }
        }
        lyric += line[index];
        index++;
      }
      return { lyric, chords };
    });
  }

  function importChordText(source) {
    if (typeof source !== "string") throw new TypeError("Il testo da importare deve essere una stringa");
    const text = source.replace(/\r\n?/g, "\n");
    if (text.length > 100000) throw new RangeError("Il testo da importare supera 100000 caratteri");
    if (/\[[^\]\r\n]+\]/.test(text)) return text;
    const lines = text.split("\n");
    const chordLine = (line) => {
      const tokens = [...line.matchAll(/\S+/g)];
      return tokens.length > 0 && tokens.length <= 20 && tokens.every((token) => chordParts(token[0]));
    };
    const inlineChords = (chords, lyric) => {
      let output = "";
      let cursor = 0;
      for (const token of chords.matchAll(/\S+/g)) {
        const position = Math.min(token.index, lyric.length);
        output += lyric.slice(cursor, position) + "[" + token[0] + "]";
        cursor = position;
      }
      return output + lyric.slice(cursor);
    };
    const result = [];
    for (let index = 0; index < lines.length; index++) {
      if (chordLine(lines[index]) && index + 1 < lines.length && !chordLine(lines[index + 1])) {
        result.push(inlineChords(lines[index], lines[++index]));
      } else result.push(lines[index]);
    }
    return result.join("\n");
  }

  function formatChordPro(song, albumTitle = "") {
    const directiveValue = (value) => String(value ?? "").replace(/[{}\r\n]/g, " ").trim();
    const lines = [
      ["title", song.title],
      ["artist", song.author],
      ["album", albumTitle],
      ["key", song.key],
      ["tempo", song.bpm],
      ["time", song.meter],
      ["capo", song.capo],
      ["comment", song.source ? "Fonte: " + song.source : ""],
      ["comment", song.rights ? "Diritti: " + song.rights : ""],
      ["comment", song.notes ? "Note: " + song.notes : ""],
    ].filter(([, value]) => value !== undefined && value !== null && value !== "");
    const header = lines.map(([name, value]) => "{" + name + ": " + directiveValue(value) + "}");
    return header.join("\n") + "\n\n" + String(song.text || "").replace(/\r\n?/g, "\n");
  }

  function transposeChordPro(source, semitones, preferFlats) {
    if (typeof source !== "string") throw new TypeError("Il testo ChordPro deve essere una stringa");
    if (!Number.isInteger(semitones)) throw new RangeError("La trasposizione deve essere un numero intero di semitoni");
    if (semitones === 0) return source;
    return source
      .replace(/\[([^\]\r\n]+)\]/g, (marker, chord) => {
        const parsed = chordParts(chord);
        return parsed ? "[" + transposeChord(chord, semitones, preferFlats) + "]" : marker;
      })
      .replace(/\{key:\s*([^}]+)\}/gi, (directive, key) =>
        "{key: " + transposeKey(key.trim(), semitones, preferFlats) + "}");
  }

  function matchesSearch(song, query) {
    const needle = normalizeSearch(query);
    if (!needle) return true;
    return [song?.title, song?.author, song?.text]
      .some((value) => normalizeSearch(value).includes(needle));
  }

  function beatsPerBar(meter) {
    return METERS[meter] || 0;
  }

  function secondsPerLine(song, correctionPercent = 100) {
    if (!Number.isFinite(correctionPercent) || correctionPercent < 50 || correctionPercent > 200)
      throw new RangeError("La correzione deve essere tra il 50% e il 200%");
    const barsPerLine = song?.barsPerLine ?? 2;
    if (!Number.isSafeInteger(barsPerLine) || barsPerLine < 1 || barsPerLine > 16)
      throw new RangeError("Le battute per riga devono essere tra 1 e 16");

    const beats = beatsPerBar(song?.meter || "4/4");
    if (!beats) throw new RangeError("Tempo musicale non valido");
    const bpm = song?.bpm;
    const seconds = bpm === null || bpm === undefined || bpm === ""
      ? DEFAULT_SECONDS_PER_LINE
      : Number.isFinite(bpm) && bpm > 0
        ? (beats * barsPerLine * 60) / bpm
        : NaN;
    if (!Number.isFinite(seconds)) throw new RangeError("BPM non valido");
    return seconds * correctionPercent / 100;
  }

  const model = Object.freeze({
    DEFAULT_PRESETS,
    DEFAULT_SECONDS_PER_LINE,
    DEFAULT_TAGS,
    METERS,
    beatsPerBar,
    formatChordPro,
    importChordText,
    matchesSearch,
    normalizeSearch,
    parseChordPro,
    slugify,
    secondsPerLine,
    transposeChord,
    transposeChordPro,
    transposeKey,
  });

  if (typeof module === "object" && module.exports) module.exports = model;
  root.CANZONIERE_MODEL = model;
})(typeof window === "object" ? window : globalThis);
