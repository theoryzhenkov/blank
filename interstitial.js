import { WORDS } from './words.js';
import { PASTEL_COLORS } from './color.js';
import { loadSettings, saveSettings, applyTheme } from './settings.js';
import { playClick, warmupAudio } from './click.js';
import { initWaveform } from './waveform.js';

const params = new URLSearchParams(window.location.search);
const originalUrl = params.get('url');

let selectedWords = [];
let currentColor = '';
let isCompleted = false;

/** @type {(() => void) | null} */
let stopWaveform = null;

/** @type {{ soundEnabled: boolean, wordCount: 3|5|7, hasTypedBefore: boolean }} */
let settings;

initializePage();

async function initializePage() {
  settings = await loadSettings();
  applyTheme(settings.theme);
  selectedWords = getRandomWords(settings.wordCount);
  currentColor = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];

  document.documentElement.style.setProperty('--accent-color', currentColor);
  renderWords();
  document.getElementById('words').focus();

  if (!settings.hasTypedBefore) {
    renderTypingHint();
  }

  if (settings.soundEnabled) warmupAudio();
  setupKeyboardListener();

  const canvas = document.getElementById('calmWaveform');
  stopWaveform = initWaveform(canvas);

  // Fade in
  requestAnimationFrame(() => {
    document.querySelector('.column-container').style.opacity = '1';
  });
}

function renderWords() {
  const wordsContainer = document.getElementById('words');
  wordsContainer.innerHTML = '';

  selectedWords.forEach((word, index) => {
    const wordElement = document.createElement('div');
    wordElement.className = 'word';
    wordElement.dataset.word = word;
    wordElement.dataset.index = index;

    [...word].forEach((letter) => {
      const span = document.createElement('span');
      span.textContent = letter;
      span.className = 'letter';
      wordElement.appendChild(span);
    });

    wordsContainer.appendChild(wordElement);
  });
}

function renderTypingHint() {
  const hint = document.createElement('div');
  hint.id = 'typingHint';
  hint.textContent = 'type to continue';
  document.getElementById('words').after(hint);
}

function getRandomWords(count) {
  const pool = [...WORDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Toggles `.current` class on the letter at the given position. */
function markCurrentLetter(wordIndex, letterIndex) {
  document.querySelectorAll('.letter.current').forEach((el) => el.classList.remove('current'));
  const word = document.querySelectorAll('.word')[wordIndex];
  if (!word) return;
  const letters = word.querySelectorAll('.letter');
  // Clamp to last letter if index is past the end (e.g. backspacing into a completed word)
  const idx = Math.min(letterIndex, letters.length - 1);
  if (letters[idx]) letters[idx].classList.add('current');
}

function setupKeyboardListener() {
  let currentWordIndex = 0;
  let currentLetterIndex = 0;
  let typedWords = Array(selectedWords.length).fill('');
  let hintDismissed = false;

  // Init cursor on first letter
  markCurrentLetter(0, 0);

  const handleKeyPress = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
      return;
    }

    if (
      ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Tab', 'Escape', 'F5', 'F12'].includes(
        e.key,
      )
    )
      return;

    if (isCompleted) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('confirmHint').classList.add('active');
        if (settings.soundEnabled) playClick();
        proceedToSite();
      }
      return;
    }

    if (e.key === 'Enter') return;

    const container = document.getElementById('words');
    if (!container) return;

    e.preventDefault();
    e.stopPropagation();

    const words = document.querySelectorAll('.word');
    if (!words || words.length === 0) return;

    const currentWord = words[currentWordIndex];
    const targetWord = selectedWords[currentWordIndex];
    const letters = currentWord.querySelectorAll('.letter');

    if (e.key === 'Backspace') {
      if (currentLetterIndex > 0) {
        if (settings.soundEnabled) playClick();
        currentLetterIndex--;
        letters[currentLetterIndex].classList.remove('active');
        typedWords[currentWordIndex] = typedWords[currentWordIndex].slice(0, -1);
      } else if (currentWordIndex > 0) {
        currentWordIndex--;
        const prevLetters = words[currentWordIndex].querySelectorAll('.letter');
        if (typedWords[currentWordIndex].length > 0) {
          if (settings.soundEnabled) playClick();
          currentLetterIndex = typedWords[currentWordIndex].length - 1;
          prevLetters[currentLetterIndex].classList.remove('active');
          typedWords[currentWordIndex] = typedWords[currentWordIndex].slice(0, -1);
        } else {
          currentLetterIndex = 0;
        }
      }
      markCurrentLetter(currentWordIndex, currentLetterIndex);
    } else if (e.key.length === 1) {
      if (
        currentLetterIndex < targetWord.length &&
        e.key.toLowerCase() === targetWord[currentLetterIndex].toLowerCase()
      ) {
        // Dismiss typing hint on first valid keypress
        if (!hintDismissed) {
          hintDismissed = true;
          const hint = document.getElementById('typingHint');
          if (hint) {
            hint.style.opacity = '0';
            hint.addEventListener('transitionend', () => hint.remove(), { once: true });
          }
          if (!settings.hasTypedBefore) {
            saveSettings({ hasTypedBefore: true }); // fire-and-forget
          }
        }

        if (settings.soundEnabled) {
          playClick();
        }

        letters[currentLetterIndex].classList.add('active');
        typedWords[currentWordIndex] += e.key;
        currentLetterIndex++;

        if (currentLetterIndex === targetWord.length && currentWordIndex < selectedWords.length - 1) {
          currentWordIndex++;
          currentLetterIndex = 0;
          const status = document.getElementById('a11yStatus');
          if (status) status.textContent = `Word ${currentWordIndex} of ${selectedWords.length}`;
        } else if (
          currentLetterIndex === targetWord.length &&
          currentWordIndex === selectedWords.length - 1
        ) {
          const allCorrect = typedWords.every(
            (typed, i) => typed.toLowerCase() === selectedWords[i].toLowerCase(),
          );
          if (allCorrect) {
            showConfirmation();
            return;
          }
        }

        markCurrentLetter(currentWordIndex, currentLetterIndex);
      } else {
        // Wrong key — shake feedback
        const letter = letters[currentLetterIndex];
        if (letter) {
          letter.classList.remove('wrong');
          void letter.offsetWidth; // reflow trick to restart animation
          letter.classList.add('wrong');
          letter.addEventListener('animationend', () => letter.classList.remove('wrong'), { once: true });
        }
      }
    }
  };

  document.addEventListener('keydown', handleKeyPress, true);
}

function showConfirmation() {
  if (isCompleted) return;
  isCompleted = true;

  // Remove cursor indicator
  document.querySelectorAll('.letter.current').forEach((el) => el.classList.remove('current'));

  // Fade in enter glyph after a short pause
  setTimeout(() => {
    document.getElementById('confirmHint').classList.add('visible');
  }, 400);

  const status = document.getElementById('a11yStatus');
  if (status) status.textContent = 'Press Enter to continue';

  // Click handler on the glyph
  document.getElementById('confirmHint').addEventListener('click', () => {
    document.getElementById('confirmHint').classList.add('active');
    if (settings.soundEnabled) playClick();
    proceedToSite();
  });
}

let choiceMade = false;

async function proceedToSite() {
  if (choiceMade) return;
  choiceMade = true;

  if (stopWaveform) stopWaveform();

  const container = document.querySelector('.column-container');
  if (container) {
    container.style.opacity = '0';
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 800);
      container.addEventListener('transitionend', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }

  if (originalUrl) {
    // Background sets the bypass token AND navigates in one step,
    // so the token is guaranteed to exist when onBeforeNavigate fires.
    await chrome.runtime.sendMessage({ type: 'proceed', url: originalUrl });
  } else {
    console.error('No original URL to redirect to!');
  }
}
