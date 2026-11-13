(function (root) {
  "use strict";

  const SCROLL_KEYS = new Set([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"]);

  function createScrollPlayer({ score, button, correction, speedLabel, status, getSong, onEnd = async () => false }) {
    let running = false;
    let countingDown = false;
    let generation = 0;
    let lineIndex = 0;
    let timer = 0;
    let countdownTimer = 0;

    function lines() {
      return [...score.querySelectorAll(".song-line")];
    }

    function setButton() {
      button.textContent = running ? "Pausa scorrimento" : "Avvia scorrimento";
      button.setAttribute("aria-pressed", String(running));
    }

    function updateSpeed() {
      const song = getSong();
      if (!song) {
        speedLabel.textContent = "";
        return;
      }
      const seconds = root.CANZONIERE_MODEL.secondsPerLine(song, Number(correction.value));
      speedLabel.textContent = "Una riga ogni " + seconds.toFixed(1) + " s" +
        (song.bpm === null || song.bpm === undefined ? " · velocità predefinita" : "");
    }

    function cancelTimers() {
      root.clearTimeout(timer);
      root.clearInterval(countdownTimer);
      timer = 0;
      countdownTimer = 0;
    }

    function pause(message = "Scorrimento in pausa.") {
      generation++;
      cancelTimers();
      running = false;
      countingDown = false;
      setButton();
      score.scrollTo({ top: score.scrollTop, behavior: "auto" });
      if (message) status.textContent = message;
    }

    function visibleLine() {
      const visibleTop = score.getBoundingClientRect().top + 8;
      const currentLines = lines();
      let index = 0;
      currentLines.forEach((line, candidate) => {
        if (line.getBoundingClientRect().top <= visibleTop + 1) index = candidate;
      });
      return index;
    }

    function scrollToLine(index) {
      const currentLines = lines();
      const line = currentLines[index];
      if (!line) return;
      const offset = line.getBoundingClientRect().top - score.getBoundingClientRect().top;
      const reducedMotion = root.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      score.scrollTo({
        top: Math.max(0, score.scrollTop + offset - 8),
        behavior: reducedMotion ? "auto" : "smooth",
      });
    }

    function schedule(currentGeneration) {
      if (!running || currentGeneration !== generation) return;
      let seconds;
      try {
        seconds = root.CANZONIERE_MODEL.secondsPerLine(getSong(), Number(correction.value));
        updateSpeed();
      } catch (error) {
        console.error("Velocità di scorrimento non valida", error);
        pause(error.message);
        return;
      }
      timer = root.setTimeout(() => advance(currentGeneration), seconds * 1000);
    }

    function countdown(currentGeneration, label) {
      cancelTimers();
      countingDown = true;
      let remaining = 3;
      status.textContent = label + " tra " + remaining + " secondi.";
      countdownTimer = root.setInterval(() => {
        if (currentGeneration !== generation) {
          root.clearInterval(countdownTimer);
          countdownTimer = 0;
          return;
        }
        remaining--;
        if (remaining > 0) {
          status.textContent = label + " tra " + remaining + " secondi.";
          return;
        }
        root.clearInterval(countdownTimer);
        countdownTimer = 0;
        countingDown = false;
        status.textContent = "Scorrimento attivo.";
        schedule(currentGeneration);
      }, 1000);
    }

    async function advance(currentGeneration) {
      if (!running || currentGeneration !== generation) return;
      const currentLines = lines();
      if (!currentLines.length) {
        pause("Testo non disponibile per lo scorrimento.");
        return;
      }
      if (lineIndex + 1 < currentLines.length) {
        lineIndex++;
        scrollToLine(lineIndex);
        schedule(currentGeneration);
        return;
      }
      try {
        const hasNextSong = await onEnd();
        if (!running || currentGeneration !== generation) return;
        if (!hasNextSong) {
          pause("Fine della canzone.");
          return;
        }
        score.scrollTop = 0;
        lineIndex = 0;
        countdown(currentGeneration, "La prossima canzone inizia");
      } catch (error) {
        console.error("Passaggio alla canzone successiva non riuscito", error);
        pause("Scorrimento interrotto: " + error.message);
      }
    }

    function start() {
      if (running) {
        pause();
        return;
      }
      if (!getSong()) {
        status.textContent = "Carica una canzone prima di avviare lo scorrimento.";
        return;
      }
      try {
        updateSpeed();
        lineIndex = visibleLine();
        running = true;
        generation++;
        setButton();
        countdown(generation, "Partenza");
      } catch (error) {
        console.error("Avvio scorrimento non riuscito", error);
        pause(error.message);
      }
    }

    function manualInput(event) {
      if (!running) return;
      if (event.type === "keydown" && !SCROLL_KEYS.has(event.key)) return;
      pause("Pausa al tocco o allo scorrimento manuale.");
    }

    button.addEventListener("click", start);
    correction.addEventListener("input", () => {
      try {
        updateSpeed();
        if (running && !countingDown) {
          root.clearTimeout(timer);
          schedule(generation);
        }
      } catch (error) {
        console.error("Correzione scorrimento non valida", error);
        pause(error.message);
      }
    });
    score.addEventListener("pointerdown", manualInput);
    score.addEventListener("touchstart", manualInput, { passive: true });
    score.addEventListener("wheel", manualInput, { passive: true });
    score.addEventListener("keydown", manualInput);

    return {
      pause,
      resetForSong() {
        score.scrollTop = 0;
        lineIndex = 0;
        updateSpeed();
      },
      updateSpeed,
    };
  }

  root.CANZONIERE_SCROLL = Object.freeze({ createScrollPlayer });
})(typeof window === "object" ? window : globalThis);
