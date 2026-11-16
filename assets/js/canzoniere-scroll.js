(function (root) {
  "use strict";

  const SCROLL_KEYS = new Set([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"]);

  function createScrollPlayer({ score, button, speedControl, speedLabel, status, getSong, onEnd = async () => false }) {
    let running = false;
    let countingDown = false;
    let generation = 0;
    let lineIndex = 0;
    let timer = 0;
    let countdownTimer = 0;
    let animationFrame = null;

    function lines() {
      return [...score.querySelectorAll(".song-line")];
    }

    function setButton() {
      button.textContent = running ? "Ⅱ" : "▶";
      button.setAttribute("aria-label", running
        ? "Metti in pausa lo scorrimento automatico"
        : "Avvia lo scorrimento automatico");
      button.setAttribute("aria-pressed", String(running));
    }

    function updateSpeed() {
      const song = getSong();
      if (!song) {
        speedLabel.textContent = "";
        return;
      }
      const seconds = root.CANZONIERE_MODEL.secondsPerLine(song, Number(speedControl.value));
      speedLabel.textContent = "Una riga ogni " + seconds.toFixed(1) + " s" +
        (song.bpm === null || song.bpm === undefined ? " · velocità predefinita" : "");
    }

    function cancelTimers() {
      root.clearTimeout(timer);
      root.clearInterval(countdownTimer);
      if (animationFrame !== null) root.cancelAnimationFrame(animationFrame);
      timer = 0;
      countdownTimer = 0;
      animationFrame = null;
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

    function targetScrollTop(index) {
      const currentLines = lines();
      const line = currentLines[index];
      if (!line) return null;
      const offset = line.getBoundingClientRect().top - score.getBoundingClientRect().top;
      return Math.max(0, score.scrollTop + offset - 8);
    }

    function scrollToLine(index, duration, currentGeneration) {
      const target = targetScrollTop(index);
      if (target === null) {
        pause("Riga non disponibile per lo scorrimento.");
        return;
      }
      const reducedMotion = root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
      if (reducedMotion) {
        timer = root.setTimeout(() => {
          timer = 0;
          if (!running || currentGeneration !== generation) return;
          score.scrollTo({ top: target, behavior: "auto" });
          lineIndex = index;
          schedule(currentGeneration);
        }, duration);
        return;
      }

      const start = score.scrollTop;
      const distance = target - start;
      let startedAt = null;
      const animate = (timestamp) => {
        animationFrame = null;
        if (!running || currentGeneration !== generation) return;
        if (startedAt === null) startedAt = timestamp;
        const progress = Math.min(1, (timestamp - startedAt) / duration);
        score.scrollTo({ top: start + distance * progress, behavior: "auto" });
        if (progress >= 1) {
          lineIndex = index;
          schedule(currentGeneration);
        } else animationFrame = root.requestAnimationFrame(animate);
      };
      animationFrame = root.requestAnimationFrame(animate);
    }

    function schedule(currentGeneration) {
      if (!running || currentGeneration !== generation) return;
      const currentLines = lines();
      if (!currentLines.length) {
        pause("Testo non disponibile per lo scorrimento.");
        return;
      }
      let seconds;
      try {
        seconds = root.CANZONIERE_MODEL.secondsPerLine(getSong(), Number(speedControl.value));
        updateSpeed();
      } catch (error) {
        console.error("Velocità di scorrimento non valida", error);
        pause(error.message);
        return;
      }
      if (lineIndex + 1 < currentLines.length) {
        scrollToLine(lineIndex + 1, seconds * 1000, currentGeneration);
        return;
      }
      timer = root.setTimeout(() => {
        timer = 0;
        return advance(currentGeneration);
      }, seconds * 1000);
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
    speedControl.addEventListener("input", () => {
      try {
        updateSpeed();
        if (running && !countingDown) {
          cancelTimers();
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
