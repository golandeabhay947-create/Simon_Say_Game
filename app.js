(() => {
  "use strict";

  const colors = ["red", "green", "yellow", "blue"];
  const tones = { red: 329.63, green: 392, yellow: 440, blue: 523.25 };
  const bestScoreKey = "mindplay-best-level";
  const pads = Array.from(document.querySelectorAll(".simon-pad"));
  const startButton = document.getElementById("start-button");
  const restartButton = document.getElementById("restart-button");
  const playAgainButton = document.getElementById("play-again-button");
  const exitFullscreenButton = document.getElementById("exit-fullscreen-button");
  const soundToggles = Array.from(document.querySelectorAll(".sound-toggle"));
  const message = document.getElementById("game-message");
  const statusValue = document.getElementById("status-value");
  const statusOrb = document.getElementById("status-orb");
  const levelValue = document.getElementById("level-value");
  const scoreValue = document.getElementById("score-value");
  const bestValue = document.getElementById("best-value");
  const roundNumber = document.getElementById("round-number");
  const resultCard = document.getElementById("result-card");
  const finalScore = document.getElementById("final-score");
  const finalBestScore = document.getElementById("final-best-score");
  const resultRecord = document.getElementById("result-record");
  const recordToast = document.getElementById("record-toast");
  const confettiBurst = document.getElementById("confetti-burst");
  const immersiveGame = document.getElementById("immersive-game");

  let gameSequence = [];
  let playerSequence = [];
  let score = 0;
  let bestScore = readBestScore();
  let phase = "idle";
  let soundEnabled = true;
  let audioContext;
  let timers = [];
  let celebratedRecordThisGame = false;
  let newRecordThisGame = false;

  function readBestScore() {
    try {
      const savedScore = Number.parseInt(localStorage.getItem(bestScoreKey) || "0", 10);
      return Number.isFinite(savedScore) && savedScore >= 0 ? savedScore : 0;
    } catch (error) {
      console.warn("The personal best could not be read from local storage.", error);
      return 0;
    }
  }

  function saveBestScore() {
    try {
      localStorage.setItem(bestScoreKey, String(bestScore));
    } catch (error) {
      console.warn("The personal best could not be saved to local storage.", error);
    }
  }

  function schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      timers = timers.filter((activeTimer) => activeTimer !== timer);
      callback();
    }, delay);
    timers.push(timer);
    return timer;
  }

  function clearTimers() {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
  }

  function setMessage(text) {
    message.textContent = text;
  }

  function setStatus(text, state) {
    statusValue.textContent = text;
    statusOrb.classList.toggle("is-playing", state === "playing");
    statusOrb.classList.toggle("is-error", state === "error");
  }

  function updateScoreDisplay(animate) {
    scoreValue.textContent = String(score).padStart(3, "0");
    if (!animate) return;
    scoreValue.classList.remove("is-updated");
    void scoreValue.offsetWidth;
    scoreValue.classList.add("is-updated");
    schedule(() => scoreValue.classList.remove("is-updated"), 320);
  }

  function updateBestScore() {
    if (score <= bestScore) return false;
    bestScore = score;
    bestValue.textContent = String(bestScore).padStart(3, "0");
    saveBestScore();
    return true;
  }

  function refreshControls() {
    pads.forEach((pad) => { pad.disabled = phase !== "player-turn"; });
    startButton.disabled = phase === "computer-turn" || phase === "player-turn";
    startButton.querySelector("span:last-child").textContent =
      phase === "game-over" ? "Play again" : phase === "idle" ? "Start game" : "Game in progress";
  }

  function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    audioContext = new AudioContextConstructor();
    return audioContext;
  }

  function playTone(color, duration) {
    if (!soundEnabled) return;
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(tones[color], now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function playFeedback(kind) {
    if (!soundEnabled) return;
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") context.resume();

    const isRecord = kind === "record";
    const isError = kind === "error";
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = isError ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(isError ? 190 : isRecord ? 783.99 : 659.25, now);
    oscillator.frequency.linearRampToValueAtTime(isError ? 105 : isRecord ? 1174.66 : 880, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isError ? 0.09 : 0.07, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }

  function flashPad(color, duration) {
    const pad = pads.find((button) => button.dataset.color === color);
    if (!pad) return;
    pad.classList.add("is-lit");
    playTone(color, Math.max(0.1, duration / 1000));
    schedule(() => pad.classList.remove("is-lit"), duration);
  }

  function clearCelebration() {
    recordToast.hidden = true;
    recordToast.classList.remove("is-visible");
    confettiBurst.replaceChildren();
    resultRecord.hidden = true;
  }

  function celebrateNewRecord() {
    newRecordThisGame = true;
    if (celebratedRecordThisGame) return;
    celebratedRecordThisGame = true;
    recordToast.hidden = false;
    recordToast.classList.remove("is-visible");
    void recordToast.offsetWidth;
    recordToast.classList.add("is-visible");

    const confettiColors = ["confetti-violet", "confetti-cyan", "confetti-coral", "confetti-gold", "confetti-mint"];
    confettiBurst.replaceChildren();
    for (let index = 0; index < 24; index += 1) {
      const piece = document.createElement("span");
      piece.className = `confetti-piece ${confettiColors[index % confettiColors.length]}`;
      confettiBurst.appendChild(piece);
    }

    playFeedback("record");
    schedule(() => {
      recordToast.classList.remove("is-visible");
      recordToast.hidden = true;
    }, 3600);
    schedule(() => confettiBurst.replaceChildren(), 1900);
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function enterImmersiveMode() {
    document.body.classList.add("is-immersive");
    if (getFullscreenElement()) return;
    const requestFullscreen = immersiveGame.requestFullscreen || immersiveGame.webkitRequestFullscreen;
    if (!requestFullscreen) {
      setMessage("Fullscreen is unavailable here; immersive play is ready.");
      return;
    }

    try {
      const request = requestFullscreen.call(immersiveGame);
      if (request && typeof request.catch === "function") {
        request.catch((error) => {
          console.info("Browser fullscreen was unavailable; using the immersive layout instead.", error);
          setMessage("Fullscreen is unavailable here; immersive play is ready.");
        });
      }
    } catch (error) {
      console.info("Browser fullscreen was unavailable; using the immersive layout instead.", error);
      setMessage("Fullscreen is unavailable here; immersive play is ready.");
    }
  }

  function exitImmersiveMode() {
    const fullscreenElement = getFullscreenElement();
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fullscreenElement || !exitFullscreen) {
      document.body.classList.remove("is-immersive");
      return;
    }

    try {
      const exit = exitFullscreen.call(document);
      if (exit && typeof exit.catch === "function") {
        exit.catch((error) => {
          console.warn("Browser fullscreen could not be closed.", error);
          setMessage("Use your browser's fullscreen control to exit.");
        });
      }
    } catch (error) {
      console.warn("Browser fullscreen could not be closed.", error);
      setMessage("Use your browser's fullscreen control to exit.");
    }
  }

  function syncFullscreenState() {
    document.body.classList.toggle("is-immersive", getFullscreenElement() === immersiveGame);
  }

  function beginGame(forceRestart) {
    if (!forceRestart && (phase === "computer-turn" || phase === "player-turn")) return;
    if (soundEnabled) {
      const context = getAudioContext();
      if (context && context.state === "suspended") context.resume();
    }
    clearTimers();
    clearCelebration();
    gameSequence = [];
    playerSequence = [];
    score = 0;
    celebratedRecordThisGame = false;
    newRecordThisGame = false;
    resultCard.hidden = true;
    finalScore.textContent = "0";
    finalBestScore.textContent = String(bestScore).padStart(3, "0");
    updateScoreDisplay(false);
    levelValue.textContent = "00";
    roundNumber.textContent = "00";
    pads.forEach((pad) => pad.classList.remove("is-lit"));
    enterImmersiveMode();
    startRound(true);
  }

  function startRound(isFirstRound) {
    gameSequence.push(colors[Math.floor(Math.random() * colors.length)]);
    playerSequence = [];
    phase = "computer-turn";
    levelValue.textContent = String(gameSequence.length).padStart(2, "0");
    roundNumber.textContent = String(gameSequence.length).padStart(2, "0");
    score = gameSequence.length;
    updateScoreDisplay(true);
    if (updateBestScore()) celebrateNewRecord();
    setMessage(isFirstRound ? "Watch the new color carefully!" : "Watch the new color added to your pattern.");
    setStatus("Watch the new color", "playing");
    refreshControls();
    playSequence(gameSequence[gameSequence.length - 1]);
  }

  function playSequence(newColor) {
    const flashDuration = 390;
    const flashDelay = 450;
    schedule(() => flashPad(newColor, flashDuration), flashDelay);
    schedule(() => {
      if (phase !== "computer-turn") return;
      phase = "player-turn";
      setMessage("Your turn! Repeat the complete sequence.");
      setStatus("Your turn", "playing");
      refreshControls();
    }, flashDelay + flashDuration + 180);
  }

  function pressColor(color) {
    if (phase !== "player-turn") return;
    const pad = pads.find((button) => button.dataset.color === color);
    if (pad) {
      pad.classList.add("is-lit");
      schedule(() => pad.classList.remove("is-lit"), 180);
    }
    playTone(color, 0.16);

    const position = playerSequence.length;
    playerSequence.push(color);
    if (gameSequence[position] !== color) {
      endGame();
      return;
    }

    if (playerSequence.length === gameSequence.length) {
      phase = "computer-turn";
      setMessage("Pattern complete! Get ready for the next level.");
      setStatus("Pattern complete", "playing");
      refreshControls();
      playFeedback("success");
      schedule(() => {
        if (phase === "computer-turn") startRound(false);
      }, 780);
    } else {
      setMessage("Correct. Keep going from the first color.");
    }
  }

  function endGame() {
    phase = "game-over";
    clearTimers();
    pads.forEach((pad) => pad.classList.remove("is-lit"));
    recordToast.hidden = true;
    confettiBurst.replaceChildren();
    finalScore.textContent = String(score);
    finalBestScore.textContent = String(bestScore).padStart(3, "0");
    resultRecord.hidden = !newRecordThisGame;
    setMessage("Game over! Your pattern ended here.");
    setStatus("Game over", "error");
    resultCard.hidden = false;
    refreshControls();
    playFeedback("error");
  }

  pads.forEach((pad) => {
    pad.addEventListener("click", () => pressColor(pad.dataset.color));
  });

  startButton.addEventListener("click", () => beginGame(false));
  restartButton.addEventListener("click", () => beginGame(true));
  playAgainButton.addEventListener("click", () => beginGame(true));
  exitFullscreenButton.addEventListener("click", exitImmersiveMode);

  soundToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      soundToggles.forEach((soundToggle) => {
        soundToggle.setAttribute("aria-pressed", String(soundEnabled));
        soundToggle.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
        soundToggle.querySelector(".sound-label").textContent = soundEnabled ? "Sound on" : "Sound off";
      });
      if (soundEnabled) playFeedback("success");
    });
  });

  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("webkitfullscreenchange", syncFullscreenState);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const key = event.key.toLowerCase();
    if (key === "r") {
      event.preventDefault();
      beginGame(true);
      return;
    }
    if ((key === "enter" || key === " ") && (phase === "idle" || phase === "game-over")) {
      if (target instanceof HTMLElement && target.closest("button, a")) return;
      event.preventDefault();
      beginGame(false);
      return;
    }
    const colorIndex = Number.parseInt(key, 10) - 1;
    if (colorIndex >= 0 && colorIndex < colors.length) pressColor(colors[colorIndex]);
  });

  bestValue.textContent = String(bestScore).padStart(3, "0");
  updateScoreDisplay(false);
  refreshControls();
})();
