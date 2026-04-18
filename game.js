// ============================================
//   BRAWL CARDS — game.js
//   • Local 2P, CPU modes
//   • Online multiplayer via Supabase Realtime
//   • Mobile-responsive fixes
//   • Card sprite support (p1.png / p2.png)
//   • ACCURACY SYSTEM
//     ATK=100%, QUICK ATK=120%, HEAVY ATK=80%
//     BLOCK degrades: 100/80/50/10/1% per streak
//     COUNTER & HEAL = always 100%
//   • TRIPLE-TIMER SYSTEM
//     Move Time: 15s per turn (auto-pick ATK on expiry)
//     Player Bank: 3min chess clock per player
//     Match Clock: 6min hard ceiling
//     Sudden Death: Block/Heal locked, highest HP wins
// ============================================

// ─── SUPABASE CONFIG ───────────────────────
const SUPABASE_URL = 'https://oikumdcokfhrzuvgmxku.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pa3VtZGNva2Zocnp1dmdteGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzA2NTYsImV4cCI6MjA4ODQ0NjY1Nn0.X_PzXZswIFPKZddV24rcSql6PbVoR0vmuKdn3Xh_qAQ';
// ───────────────────────────────────────────

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ===== MOVE DEFINITIONS =====
const MOVES = {
  ATK:       { name: 'ATK',       dmg: 2,    priority: 0,  heal: 0, defence: 0, emoji: '👊' },
  QUICK_ATK: { name: 'QUICK ATK', dmg: 1,    priority: 1,  heal: 0, defence: 0, emoji: '⚡' },
  HEAVY_ATK: { name: 'HEAVY ATK', dmg: 4,    priority: -1, heal: 0, defence: 0, emoji: '💥' },
  BLOCK:     { name: 'BLOCK',     dmg: 0,    priority: 2,  heal: 0, defence: 2, emoji: '🛡️' },
  COUNTER:   { name: 'COUNTER',   dmg: 'x2', priority: -2, heal: 0, defence: 0, emoji: '🔄' },
  HEAL:      { name: 'HEAL',      dmg: 0,    priority: 2,  heal: 6, defence: 0, emoji: '💚' },
};

const MOVE_KEYS = Object.keys(MOVES);

// ===== ACCURACY SYSTEM =====
const MOVE_ACCURACY = {
  ATK:       1.00,
  QUICK_ATK: 1.20,
  HEAVY_ATK: 0.80,
  BLOCK:     1.00,
  COUNTER:   1.00,
  HEAL:      1.00,
};

const BLOCK_ACC_STEPS = [1.00, 0.80, 0.50, 0.10, 0.01];

function getBlockAccuracy(streak) {
  return BLOCK_ACC_STEPS[Math.min(streak, BLOCK_ACC_STEPS.length - 1)];
}

function getMoveAccuracy(player, moveKey) {
  if (moveKey === 'BLOCK') return getBlockAccuracy(state[player].blockStreak);
  return MOVE_ACCURACY[moveKey] || 1.0;
}

function rollAccuracy(player, moveKey) {
  const acc = getMoveAccuracy(player, moveKey);
  return acc >= 1.0 ? true : Math.random() < acc;
}

function getAccPct(player, moveKey) {
  return Math.round(getMoveAccuracy(player, moveKey) * 100);
}

// ===== TRIPLE-TIMER CONFIG =====
const TIMER_CONFIG = {
  MOVE_TIME:  15,
  SUDDEN_DEATH_MOVE_TIME: 30,
  BANK_TIME:  180,  // 3 minutes per player
  MATCH_TIME: 10,  // 6 minutes total
};

// Sudden death moves — Block and Heal are locked out
const SUDDEN_DEATH_BANNED = new Set(['BLOCK', 'HEAL']);

let timerState = {
  moveLeft:    TIMER_CONFIG.MOVE_TIME,
  p1BankLeft:  TIMER_CONFIG.BANK_TIME,
  p2BankLeft:  TIMER_CONFIG.BANK_TIME,
  matchLeft:   TIMER_CONFIG.MATCH_TIME,
  activeTimer: null,
  paused:      false,
  suddenDeath: false,
};

// ===== GAME CONFIG =====
let gameMode = '2p';

// ===== ONLINE STATE =====
let onlineRoom = null;
let onlineRole = null;
let onlineChannel = null;
let onlinePendingMoves = {};
let onlineOpponentConnected = false;
let onlineJoinTimeout = null;
let pingRetryInterval = null;

// ===== GAME STATE =====
let state = {
  p1: { hp: 20, maxHp: 20, move: null, blockStreak: 0 },
  p2: { hp: 20, maxHp: 20, move: null, blockStreak: 0 },
  round: 1,
  phase: 'p1-choose',
  p1MoveHistory: [],
  p2LastMove: null,
};

let roundBlockHit = { p1: null, p2: null };
let roundHitResult = { p1: null, p2: null };

// ===== DOM REFS =====
const screens = {
  title:  document.getElementById('screen-title'),
  rules:  document.getElementById('screen-rules'),
  game:   document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
};

const els = {
  p1HpBar:      document.getElementById('p1-hp-bar'),
  p2HpBar:      document.getElementById('p2-hp-bar'),
  p1HpText:     document.getElementById('p1-hp-text'),
  p2HpText:     document.getElementById('p2-hp-text'),
  roundNum:     document.getElementById('round-num'),
  p1Cards:      document.getElementById('p1-cards'),
  p2Cards:      document.getElementById('p2-cards'),
  p1SelDisp:    document.getElementById('p1-selected-display'),
  p2SelDisp:    document.getElementById('p2-selected-display'),
  p1Panel:      document.getElementById('p1-panel'),
  p2Panel:      document.getElementById('p2-panel'),
  p1Sprite:     document.getElementById('p1-sprite'),
  p2Sprite:     document.getElementById('p2-sprite'),
  phaseBanner:  document.getElementById('phase-banner'),
  battleLog:    document.getElementById('battle-log'),
  btnResolve:   document.getElementById('btn-resolve'),
  resultWinner: document.getElementById('result-winner'),
  resultSub:    document.getElementById('result-sub'),
  hitOverlay:   document.getElementById('hit-overlay'),
  p1Name:       document.getElementById('p1-name'),
  p2Name:       document.getElementById('p2-name'),
  p1PanelTitle: document.getElementById('p1-panel-title'),
  p2PanelTitle: document.getElementById('p2-panel-title'),
  modeBadge:    document.getElementById('mode-badge'),
  cpuThinking:  document.getElementById('cpu-thinking'),
  onlineWaiting:document.getElementById('online-waiting'),
  pokeDialog:   document.getElementById('poke-dialog'),
  pokeDialogText: document.getElementById('poke-dialog-text'),
  pokeDialogArrow:document.getElementById('poke-dialog-arrow'),
  btnCreateRoom:  document.getElementById('btn-create-room'),
  btnJoinRoom:    document.getElementById('btn-join-room'),
  joinInputWrap:  document.getElementById('join-input-wrap'),
  joinCodeInput:  document.getElementById('join-code-input'),
  btnJoinConfirm: document.getElementById('btn-join-confirm'),
  roomStatus:     document.getElementById('room-status'),
  // Triple-timer elements
  timerBar:       document.getElementById('timer-bar'),
  matchClock:     document.getElementById('match-clock'),
  moveCountdown:  document.getElementById('move-countdown'),
  moveFill:       document.getElementById('move-fill'),
  p1BankFill:     document.getElementById('p1-bank-fill'),
  p2BankFill:     document.getElementById('p2-bank-fill'),
  p1BankVal:      document.getElementById('p1-bank-val'),
  p2BankVal:      document.getElementById('p2-bank-val'),
  sdOverlay:      document.getElementById('sd-overlay'),
};

function setCardLabel(spriteEl, text) {
  const label = spriteEl.querySelector('.card-label');
  if (label) label.textContent = text;
}

// ===== SCREEN NAV =====
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  if (name === 'title') screens.title.scrollTop = 0;
}

// ===== TITLE BUTTONS =====
document.getElementById('btn-start').addEventListener('click', () => {
  gameMode = '2p'; startGame(); showScreen('game');
});
document.querySelectorAll('.btn-difficulty').forEach(btn => {
  btn.addEventListener('click', () => {
    gameMode = btn.dataset.diff; startGame(); showScreen('game');
  });
});
document.getElementById('btn-rules').addEventListener('click', () => showScreen('rules'));
document.getElementById('btn-rules-back').addEventListener('click', () => showScreen('title'));
document.getElementById('btn-title').addEventListener('click', () => { leaveOnlineRoom(); showScreen('title'); });
document.getElementById('btn-rematch').addEventListener('click', () => {
  if (gameMode === 'online') { sendOnlineEvent('rematch', {}); }
  startGame(); showScreen('game');
});

// ===== ONLINE ROOM UI =====
els.btnCreateRoom.addEventListener('click', createOnlineRoom);
els.btnJoinRoom.addEventListener('click', () => {
  els.joinInputWrap.classList.toggle('hidden');
  if (!els.joinInputWrap.classList.contains('hidden')) setTimeout(() => els.joinCodeInput.focus(), 100);
});
els.btnJoinConfirm.addEventListener('click', () => {
  const code = els.joinCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) { showRoomStatus('Enter a 4-letter room code', 'error'); return; }
  joinOnlineRoom(code);
});
els.joinCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); els.btnJoinConfirm.click(); } });
els.joinCodeInput.addEventListener('input', () => {
  els.joinCodeInput.value = els.joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

function showRoomStatus(msg, type = 'waiting') {
  els.roomStatus.textContent = msg;
  els.roomStatus.className = `room-status ${type}`;
  els.roomStatus.classList.remove('hidden');
}

// ===== ONLINE: CREATE ROOM =====
async function createOnlineRoom() {
  const code = generateRoomCode();
  onlineRoom = code;
  onlineRole = 'p1';
  showRoomStatus(`ROOM: ${code} — Share this code!`, 'waiting');
  await subscribeToRoom(code);
}

// ===== ONLINE: JOIN ROOM =====
async function joinOnlineRoom(code) {
  code = code.toUpperCase().trim();
  showRoomStatus(`Connecting to ${code}...`, 'waiting');
  onlineRoom = code;
  onlineRole = 'p2';

  await subscribeToRoom(code);

  let pingCount = 0;
  const MAX_PINGS = 20;

  pingRetryInterval = setInterval(() => {
    if (onlineOpponentConnected) {
      clearInterval(pingRetryInterval);
      pingRetryInterval = null;
      return;
    }
    if (pingCount >= MAX_PINGS) {
      clearInterval(pingRetryInterval);
      pingRetryInterval = null;
      showRoomStatus(`Room "${code}" not found or host left!`, 'error');
      leaveOnlineRoom();
      return;
    }
    sendOnlineEvent('ping', { role: 'p2' });
    pingCount++;
  }, 400);
}

// ===== SUBSCRIBE TO ROOM =====
function subscribeToRoom(code) {
  return new Promise((resolve) => {
    if (onlineChannel) { onlineChannel.unsubscribe(); onlineChannel = null; }

    onlineChannel = supabaseClient.channel(`brawl:${code}`, {
      config: { broadcast: { self: false, ack: false } }
    });

    onlineChannel
      .on('broadcast', { event: 'ping' }, () => {
        if (onlineRole !== 'p1') return;
        if (onlineOpponentConnected) return;
        onlineOpponentConnected = true;
        showRoomStatus('Opponent connected! Starting...', 'connected');
        sendOnlineEvent('pong', {});
        gameMode = 'online';
        startGame();
        showScreen('game');
      })
      .on('broadcast', { event: 'pong' }, () => {
        if (onlineRole !== 'p2') return;
        if (onlineOpponentConnected) return;
        onlineOpponentConnected = true;
        clearInterval(pingRetryInterval);
        pingRetryInterval = null;
        showRoomStatus('Connected! Starting...', 'connected');
        gameMode = 'online';
        startGame();
        showScreen('game');
      })
      .on('broadcast', { event: 'move' }, ({ payload }) => { handleOnlineMove(payload.role, payload.move, payload.hitRoll); })
      .on('broadcast', { event: 'rematch' }, () => { startGame(); showScreen('game'); })
      .subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); });
  });
}

function sendOnlineEvent(event, payload) {
  if (!onlineChannel) return;
  onlineChannel.send({ type: 'broadcast', event, payload });
}

function handleOnlineMove(role, moveKey, hitRoll) {
  onlinePendingMoves[role] = { move: moveKey, hitRoll };
  if (role !== onlineRole) {
    els.p2SelDisp.textContent = '✓ OPPONENT LOCKED IN';
    els.p2SelDisp.style.color = 'var(--online)';
  }
  if (onlinePendingMoves.p1 && onlinePendingMoves.p2) {
    state.p1.move = onlinePendingMoves.p1.move;
    state.p2.move = onlinePendingMoves.p2.move;
    state._onlineHitRolls = {
      p1: onlinePendingMoves.p1.hitRoll,
      p2: onlinePendingMoves.p2.hitRoll,
    };
    onlinePendingMoves = {};
    els.onlineWaiting.classList.add('hidden');
    showBothPanels();
    state.phase = 'both-chosen';
    setTimeout(() => resolveRound(), 300);
  }
}

function leaveOnlineRoom() {
  clearInterval(pingRetryInterval);
  pingRetryInterval = null;
  clearTimeout(onlineJoinTimeout);
  if (onlineChannel) { onlineChannel.unsubscribe(); onlineChannel = null; }
  onlineRoom = null;
  onlineRole = null;
  onlinePendingMoves = {};
  onlineOpponentConnected = false;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ===== TRIPLE-TIMER FUNCTIONS =====

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function resetTimers() {
  stopMoveTimer();
  timerState = {
    moveLeft:    TIMER_CONFIG.MOVE_TIME,
    p1BankLeft:  TIMER_CONFIG.BANK_TIME,
    p2BankLeft:  TIMER_CONFIG.BANK_TIME,
    matchLeft:   TIMER_CONFIG.MATCH_TIME,
    activeTimer: null,
    paused:      false,
    suddenDeath: false,
  };
  updateTimerHUD();
  if (timerState._matchTimer) clearInterval(timerState._matchTimer);
  timerState._matchTimer = setInterval(() => {
      timerState.matchLeft = Math.max(0, timerState.matchLeft - 0.1);
      updateTimerHUD();
      if (timerState.matchLeft <= 0) {
      clearInterval(timerState._matchTimer);
      const waitForRound = setInterval(() => {
        if (state.phase === 'p1-choose') {
          clearInterval(waitForRound);
          triggerSuddenDeath();
        }
      }, 200);
    }
    }, 100);
  }

function stopMoveTimer() {
  if (timerState.activeTimer) {
    clearInterval(timerState.activeTimer);
    timerState.activeTimer = null;
  }
}

function startMoveTimer(player) {
  stopMoveTimer();
  timerState.moveLeft = timerState.suddenDeath ? TIMER_CONFIG.SUDDEN_DEATH_MOVE_TIME : TIMER_CONFIG.MOVE_TIME;
  timerState.paused = false;

  timerState.activeTimer = setInterval(() => {
    if (timerState.paused) return;

    const dt = 0.1;
    timerState.moveLeft  = Math.max(0, timerState.moveLeft - dt);

    if (player === 'p1') timerState.p1BankLeft = Math.max(0, timerState.p1BankLeft - dt);
    else                  timerState.p2BankLeft = Math.max(0, timerState.p2BankLeft - dt);

    updateTimerHUD();

    // Match ceiling — sudden death
    if (timerState.matchLeft <= 0) {
      stopMoveTimer();
      triggerSuddenDeath();
      return;
    }

    // Move time or bank expired — auto-pick ATK
    const bankLeft = player === 'p1' ? timerState.p1BankLeft : timerState.p2BankLeft;
    if (timerState.moveLeft <= 0 || bankLeft <= 0) {
      stopMoveTimer();
      handleTimeExpiry(player);
    }
  }, 100);
}

function updateTimerHUD() {
  if (!els.timerBar) return;

  // Match clock (top bar)
  if (els.matchClock) {
    els.matchClock.textContent = fmtTime(timerState.matchLeft);
    const mpct = timerState.matchLeft / TIMER_CONFIG.MATCH_TIME;
    els.matchClock.className = 'match-clock' + (mpct > 0.3 ? '' : mpct > 0.15 ? ' warn' : ' danger');
  }

  // Move countdown (center of timer bar)
  if (els.moveCountdown) {
    const mv = Math.ceil(timerState.moveLeft);
    els.moveCountdown.textContent = mv;
    const mpct = timerState.moveLeft / TIMER_CONFIG.MOVE_TIME;
    els.moveCountdown.className = 'move-countdown' + (mpct > 0.4 ? '' : mpct > 0.2 ? ' warn' : ' danger');
  }

  // Move bar fill
  if (els.moveFill) {
    const pct = Math.max(0, timerState.moveLeft / TIMER_CONFIG.MOVE_TIME * 100);
    els.moveFill.style.width = pct + '%';
    const mpct = pct / 100;
    els.moveFill.style.background = mpct > 0.4 ? 'var(--accent)' : mpct > 0.2 ? 'var(--p1)' : 'var(--p2)';
  }

  // P1 bank
  if (els.p1BankFill && els.p1BankVal) {
    const p1pct = Math.max(0, timerState.p1BankLeft / TIMER_CONFIG.BANK_TIME * 100);
    els.p1BankFill.style.width = p1pct + '%';
    els.p1BankFill.className = 'bank-fill p1' + (p1pct > 30 ? '' : p1pct > 15 ? ' warn' : ' danger');
    els.p1BankVal.textContent = gameMode === 'online' && onlineRole === 'p2' ? 'HIDDEN' : fmtTime(timerState.p1BankLeft);
    els.p1BankVal.className = 'bank-val' + (p1pct <= 15 ? ' danger' : p1pct <= 30 ? ' warn' : '');
  }

  // P2 bank
  if (els.p2BankFill && els.p2BankVal) {
    const p2pct = Math.max(0, timerState.p2BankLeft / TIMER_CONFIG.BANK_TIME * 100);
    els.p2BankFill.style.width = p2pct + '%';
    els.p2BankFill.className = 'bank-fill p2' + (p2pct > 30 ? '' : p2pct > 15 ? ' warn' : ' danger');
    els.p2BankVal.textContent = gameMode === 'online' && onlineRole === 'p1' ? 'HIDDEN' : fmtTime(timerState.p2BankLeft);
    els.p2BankVal.className = 'bank-val right' + (p2pct <= 15 ? ' danger' : p2pct <= 30 ? ' warn' : '');
  }
}

function handleTimeExpiry(player) {
  const bankExpired = (player === 'p1' ? timerState.p1BankLeft : timerState.p2BankLeft) <= 0;
  const reason = bankExpired ? 'bank empty' : 'time expired';
  const label = player === 'p1' ? 'P1' : (gameMode !== '2p' && gameMode !== 'online' ? 'CPU' : 'P2');
  logEntry(`⏱ ${label} ${reason}! AUTO: ATK`, 'log-dmg');

  // Force ATK card selection
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  const atkCard = [...container.querySelectorAll('.card')].find(c => c.dataset.move === 'ATK');
  if (atkCard) {
    // Brief visual flash on the ATK card before selecting
    atkCard.style.outline = '2px solid var(--p2)';
    setTimeout(() => {
      atkCard.style.outline = '';
      selectMove(player, 'ATK', atkCard);
    }, 300);
  }
}

async function triggerSuddenDeath() {
  stopMoveTimer();
  timerState.suddenDeath = true;

  // If HP is not tied, highest HP wins immediately
  if (state.p1.hp !== state.p2.hp) {
    // Kill the lower HP player
    if (state.p1.hp < state.p2.hp) state.p1.hp = 0;
    else state.p2.hp = 0;
    updateHUD();
    await delay(300);
    endGame();
    return;
  }

  showSuddenDeathOverlay();
  await delay(4500);
  hideSuddenDeathOverlay();

  // Prevent match clock from triggering again
  timerState.matchLeft = 99999;

state.p1.move = null;
  state.p2.move = null;
  buildCards('p1');
  buildCards('p2');
  greyOutSuddenDeathCards('p1');
  greyOutSuddenDeathCards('p2');
  unlockCards('p1');
  unlockCards('p2');

  // Start final round
  setPhase('p1-choose');
}

function greyOutSuddenDeathCards(player) {
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  container.querySelectorAll('.card').forEach(card => {
    if (SUDDEN_DEATH_BANNED.has(card.dataset.move)) {
      card.classList.add('disabled', 'sd-banned');
    }
  });
}

function showSuddenDeathOverlay() {
  if (!els.sdOverlay) return;
  els.sdOverlay.classList.remove('hidden');
  els.sdOverlay.classList.add('active');
}

function hideSuddenDeathOverlay() {
  if (!els.sdOverlay) return;
  els.sdOverlay.classList.remove('active');
  setTimeout(() => els.sdOverlay.classList.add('hidden'), 400);
}

function showTiedOverlay() {
  if (!els.sdOverlay) return;
  const p1hp = state.p1.hp;
  const p2hp = state.p2.hp;
  if (p1hp > p2hp) {
    els.sdOverlay.querySelector('.sd-skull').textContent = '⚡';
    els.sdOverlay.querySelector('.sd-title').textContent = 'P1 WINS!';
    els.sdOverlay.querySelector('.sd-sub').textContent = `P1 HP: ${p1hp}  >  P2 HP: ${p2hp}\nPlayer 1 defeats Player 2!`;
  } else if (p2hp > p1hp) {
    els.sdOverlay.querySelector('.sd-skull').textContent = '🔥';
    els.sdOverlay.querySelector('.sd-title').textContent = 'P2 WINS!';
    els.sdOverlay.querySelector('.sd-sub').textContent = `P2 HP: ${p2hp}  >  P1 HP: ${p1hp}\nPlayer 2 defeats Player 1!`;
  } else {
    els.sdOverlay.querySelector('.sd-skull').textContent = '⚔️';
    els.sdOverlay.querySelector('.sd-title').textContent = 'STILL TIED!';
    els.sdOverlay.querySelector('.sd-sub').textContent = `P1 HP: ${p1hp}  =  P2 HP: ${p2hp}\nNeither fighter falls...\nAnother round begins!`;
  }
  els.sdOverlay.querySelector('.sd-rule-row').style.display = 'none';
  els.sdOverlay.querySelector('.sd-quick-note').style.display = 'none';
  els.sdOverlay.classList.remove('hidden');
  els.sdOverlay.classList.add('active');
}

function hideTiedOverlay() {
  if (!els.sdOverlay) return;
  els.sdOverlay.classList.remove('active');
  setTimeout(() => {
    els.sdOverlay.classList.add('hidden');
    els.sdOverlay.querySelector('.sd-skull').textContent = '💀';
    els.sdOverlay.querySelector('.sd-title').textContent = 'SUDDEN DEATH';
    els.sdOverlay.querySelector('.sd-sub').textContent = 'Time is up. One final round.\nHighest HP after resolve wins.';
    els.sdOverlay.querySelector('.sd-rule-row').style.display = '';
    els.sdOverlay.querySelector('.sd-quick-note').style.display = '';
  }, 400);
}

// ===== GAME INIT =====
function startGame() {
  state = {
    p1: { hp: 20, maxHp: 20, move: null, blockStreak: 0 },
    p2: { hp: 20, maxHp: 20, move: null, blockStreak: 0 },
    round: 1,
    phase: 'p1-choose',
    p1MoveHistory: [],
    p2LastMove: null,
  };
  roundBlockHit = { p1: null, p2: null };
  roundHitResult = { p1: null, p2: null };
  onlinePendingMoves = {};
  els.battleLog.innerHTML = '';
  buildCards('p1');
  buildCards('p2');
  updateHUD();
  updateModeUI();
  hideDialog();
  resetTimers();
  // Show timer bar during game
  if (els.timerBar) els.timerBar.classList.remove('hidden');
  hideSuddenDeathOverlay();
  setPhase('p1-choose');
}

function updateModeUI() {
  const isAI = ['easy', 'medium', 'hard'].includes(gameMode);
  const isOnline = gameMode === 'online';
  const isMobile = window.innerWidth < 400;
  const setTitle = (el, text, color = '') => { if (el) { el.textContent = text; el.style.color = color; } };

  if (isAI) {
    const label = gameMode === 'easy' ? 'CPU EASY' : gameMode === 'medium' ? 'CPU MEDIUM' : 'CPU HARD';
    const shortLabel = gameMode === 'easy' ? 'CPU — EASY' : gameMode === 'medium' ? 'CPU — MED' : 'CPU — HARD';
    els.p1Name.textContent = 'PLAYER 1'; els.p1Name.className = 'fighter-name p1-color';
    els.p2Name.textContent = isMobile ? shortLabel : label; els.p2Name.className = 'fighter-name cpu-color';
    setTitle(els.p2PanelTitle, isMobile ? '🤖 CPU' : '🤖 CPU — LOCKED IN', 'var(--cpu)');
    setTitle(els.p1PanelTitle, isMobile ? '⚡ P1 — PICK' : '⚡ PLAYER 1 — CHOOSE');
    els.p2Sprite.classList.add('cpu-sprite'); els.p2Sprite.classList.remove('online-sprite');
    setCardLabel(els.p1Sprite, 'P1'); setCardLabel(els.p2Sprite, 'CPU');
    els.modeBadge.textContent = isMobile ? `VS CPU·${gameMode.toUpperCase()}` : `VS CPU · ${gameMode.toUpperCase()}`;
    els.modeBadge.className = `mode-badge ${gameMode}`;
  } else if (isOnline) {
    const myRole = onlineRole || 'p1';
    els.p1Name.textContent = myRole === 'p1' ? (isMobile ? '⚡ YOU' : '⚡ YOU (P1)') : '⚡ OPP';
    els.p2Name.textContent = myRole === 'p2' ? (isMobile ? '🔥 YOU' : '🔥 YOU (P2)') : '🔥 OPP';
    els.p1Name.className = 'fighter-name p1-color'; els.p2Name.className = 'fighter-name online-color';
    setTitle(els.p2PanelTitle, isMobile ? '🌐 OPP' : '🌐 OPPONENT — CHOOSING', 'var(--online)');
    setTitle(els.p1PanelTitle, isMobile ? '⚡ YOU' : '⚡ YOU — CHOOSE');
    els.p2Sprite.classList.remove('cpu-sprite'); els.p2Sprite.classList.add('online-sprite');
    setCardLabel(els.p1Sprite, myRole === 'p1' ? 'YOU' : 'OPP');
    setCardLabel(els.p2Sprite, myRole === 'p2' ? 'YOU' : 'OPP');
    els.modeBadge.textContent = isMobile ? `RM:${onlineRoom}` : `ONLINE · ROOM ${onlineRoom}`;
    els.modeBadge.className = 'mode-badge online';
    applyOnlinePanelLayout();
  } else {
    els.p1Name.textContent = 'PLAYER 1'; els.p1Name.className = 'fighter-name p1-color';
    els.p2Name.textContent = 'PLAYER 2'; els.p2Name.className = 'fighter-name p2-color';
    setTitle(els.p2PanelTitle, isMobile ? '🔥 P2 — PICK' : '🔥 PLAYER 2 — CHOOSE');
    setTitle(els.p1PanelTitle, isMobile ? '⚡ P1 — PICK' : '⚡ PLAYER 1 — CHOOSE');
    els.p2Sprite.classList.remove('cpu-sprite', 'online-sprite');
    setCardLabel(els.p1Sprite, 'P1'); setCardLabel(els.p2Sprite, 'P2');
    els.modeBadge.textContent = '2 PLAYER'; els.modeBadge.className = 'mode-badge';
  }
}

function applyOnlinePanelLayout() {
  const myPanel = onlineRole === 'p1' ? els.p1Panel : els.p2Panel;
  const oppPanel = onlineRole === 'p1' ? els.p2Panel : els.p1Panel;
  myPanel.style.opacity = '1'; oppPanel.style.opacity = '0.5';
  oppPanel.querySelectorAll('.card').forEach(c => c.classList.add('online-hidden'));
}

// ===== POKÉMON DIALOGUE =====
let dialogQueue = [];
let isDialogBusy = false;
let _savedBannerState = null;

function _hideBannerForDialog() {
  _savedBannerState = {
    text: els.phaseBanner.textContent,
    className: els.phaseBanner.className,
  };
  els.phaseBanner.classList.add('hidden');
}

function _restoreBannerAfterDialog() {
  if (_savedBannerState) {
    els.phaseBanner.className = _savedBannerState.className;
    els.phaseBanner.textContent = _savedBannerState.text;
    _savedBannerState = null;
  }
}

function showDialog(text, duration = 0) {
  return new Promise(resolve => {
    dialogQueue.push({ text, duration, resolve });
    if (!isDialogBusy) processDialogQueue();
  });
}

async function processDialogQueue() {
  if (dialogQueue.length === 0) {
    isDialogBusy = false;
    _restoreBannerAfterDialog();
    return;
  }
  isDialogBusy = true;

  if (_savedBannerState === null) {
    _hideBannerForDialog();
  }

  const { text, duration, resolve } = dialogQueue.shift();
  els.pokeDialog.classList.remove('hidden');
  els.pokeDialogArrow.classList.add('hidden');
  els.pokeDialogText.textContent = '';

  for (let i = 0; i < text.length; i++) {
    els.pokeDialogText.textContent += text[i];
    await delay(22);
  }

  if (duration > 0) {
    await delay(duration);
    resolve();
    processDialogQueue();
  } else {
    els.pokeDialogArrow.classList.remove('hidden');
    const next = () => {
      els.pokeDialog.removeEventListener('click', next);
      els.pokeDialog.removeEventListener('touchend', next);
      document.removeEventListener('keydown', next);
      resolve();
      processDialogQueue();
    };
    els.pokeDialog.addEventListener('click', next);
    els.pokeDialog.addEventListener('touchend', next, { passive: true });
    document.addEventListener('keydown', next);
  }
}

function hideDialog() {
  els.pokeDialog.classList.add('hidden');
  dialogQueue = [];
  isDialogBusy = false;
  _restoreBannerAfterDialog();
}

function setDialogImmediate(text) {
  if (_savedBannerState === null) {
    _hideBannerForDialog();
  }
  els.pokeDialog.classList.remove('hidden');
  els.pokeDialogArrow.classList.add('hidden');
  els.pokeDialogText.textContent = text;
}

// ===== BUILD CARDS =====
function buildCards(player) {
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  container.innerHTML = '';
  MOVE_KEYS.forEach(key => {
    const move = MOVES[key];
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.move = key;
    card.dataset.player = player;

    // In sudden death, mark banned cards
    const banned = timerState.suddenDeath && SUDDEN_DEATH_BANNED.has(key);
    if (banned) {
      card.classList.add('disabled', 'sd-banned');
    }

    card.innerHTML = `
      <div class="card-name">${move.name}</div>
      <div class="card-stats">${buildStatLine(player, key)}</div>
      ${banned ? '<div class="sd-ban-label">BANNED</div>' : ''}
    `;
    if (!banned) {
      card.addEventListener('click', () => selectMove(player, key, card));
      card.addEventListener('touchend', (e) => { e.preventDefault(); selectMove(player, key, card); }, { passive: false });
    }
    container.appendChild(card);
  });
}

function buildStatLine(player, key) {
  const move = MOVES[key];
  const parts = [];

  if (move.dmg && move.dmg !== 'x2') parts.push(`<span class="stat-dmg">DMG:${move.dmg}</span>`);
  if (move.dmg === 'x2')             parts.push(`<span class="stat-dmg">×2</span>`);
  if (move.heal)                     parts.push(`<span class="stat-heal">+${move.heal}HP</span>`);
  if (move.defence)                  parts.push(`<span class="stat-def">DEF:${move.defence}</span>`);

  const priSign = move.priority >= 0 ? '+' : '';
  parts.push(`<span>P:${priSign}${move.priority}</span>`);

  parts.push(buildAccSpan(player, key));

  return parts.join(' ');
}

function buildAccSpan(player, key) {
  if (key === 'BLOCK') {
    const streak = state[player].blockStreak;
    const pct = Math.round(getBlockAccuracy(streak) * 100);
    const cls = pct >= 80 ? 'acc-high' : pct >= 40 ? 'acc-mid' : 'acc-low';
    const streakSuffix = streak > 0 ? ` ×${streak}` : '';
    return `<span class="stat-acc ${cls}">ACC:${pct}%${streakSuffix}</span>`;
  }
  const rawPct = Math.round((MOVE_ACCURACY[key] || 1.0) * 100);
  const cls = rawPct >= 100 ? 'acc-high' : rawPct >= 85 ? 'acc-mid' : 'acc-low';
  return `<span class="stat-acc ${cls}">ACC:${rawPct}%</span>`;
}

function refreshAccDisplay(player) {
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  container.querySelectorAll('.card').forEach(card => {
    const key = card.dataset.move;
    const statsEl = card.querySelector('.card-stats');
    if (statsEl) statsEl.innerHTML = buildStatLine(player, key);
  });
}

// ===== SELECT MOVE =====
function selectMove(player, moveKey, cardEl) {
  // Block banned moves in sudden death
  if (timerState.suddenDeath && SUDDEN_DEATH_BANNED.has(moveKey)) return;

  // Stop the timer for the choosing player
  clearInterval(timerState.activeTimer);
  timerState.activeTimer = null;

  if (gameMode === 'online') {
    const myCards = onlineRole === 'p1' ? 'p1' : 'p2';
    if (player !== myCards) return;
    if (state.phase === 'resolve') return;
    if (state[player].move !== null) return;
    const container = player === 'p1' ? els.p1Cards : els.p2Cards;
    const dispEl    = player === 'p1' ? els.p1SelDisp : els.p2SelDisp;
    container.querySelectorAll('.card').forEach(c => c.classList.remove(`selected-${player}`));
    cardEl.classList.add(`selected-${player}`);
    state[player].move = moveKey;
    dispEl.textContent = `✓ ${MOVES[moveKey].name}`;
    dispEl.style.color = player === 'p1' ? 'var(--p1)' : 'var(--p2)';
    lockCards(player);
    const myHitRoll = rollAccuracy(player, moveKey);
    sendOnlineEvent('move', { role: onlineRole, move: moveKey, hitRoll: myHitRoll });
    onlinePendingMoves[onlineRole] = { move: moveKey, hitRoll: myHitRoll };
    els.onlineWaiting.classList.remove('hidden');
    els.phaseBanner.classList.add('hidden');
    if (onlinePendingMoves.p1 && onlinePendingMoves.p2) {
      state.p1.move = onlinePendingMoves.p1.move;
      state.p2.move = onlinePendingMoves.p2.move;
      state._onlineHitRolls = { p1: onlinePendingMoves.p1.hitRoll, p2: onlinePendingMoves.p2.hitRoll };
      onlinePendingMoves = {};
      els.onlineWaiting.classList.add('hidden');
      showBothPanels(); state.phase = 'both-chosen';
      setTimeout(() => resolveRound(), 300);
    }
    return;
  }
  if (state.phase === 'p1-choose' && player !== 'p1') return;
  if (state.phase === 'p2-choose' && player !== 'p2') return;
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  const dispEl    = player === 'p1' ? els.p1SelDisp : els.p2SelDisp;
  container.querySelectorAll('.card').forEach(c => c.classList.remove(`selected-${player}`));
  cardEl.classList.add(`selected-${player}`);
  state[player].move = moveKey;
  dispEl.textContent = `✓ ${MOVES[moveKey].name}`;
  dispEl.style.color = player === 'p1' ? 'var(--p1)' : 'var(--p2)';
  if (player === 'p1') {
    state.p1MoveHistory.push(moveKey);
    if (state.p1MoveHistory.length > 5) state.p1MoveHistory.shift();
    lockCards('p1');
    if (gameMode !== '2p') setTimeout(() => triggerCpuMove(), 400);
    else setTimeout(() => setPhase('p2-choose'), 200);
  } else {
    setPhase('both-chosen');
  }
}

// ===== CPU MOVE LOGIC =====
async function triggerCpuMove() {
  els.cpuThinking.classList.remove('hidden');
  els.phaseBanner.classList.add('hidden');
  const thinkTime = gameMode === 'easy' ? 600 : gameMode === 'medium' ? 900 : 1200;
  await delay(thinkTime);
  const chosenKey = pickCpuMove();
  state.p2.move = chosenKey; state.p2LastMove = chosenKey;
  els.p2SelDisp.textContent = `✓ LOCKED`; els.p2SelDisp.style.color = 'var(--cpu)';
  els.p2Cards.querySelectorAll('.card').forEach(c => {
    if (c.dataset.move === chosenKey) c.classList.add('selected-p2');
    else c.classList.add('disabled');
  });
  els.cpuThinking.classList.add('hidden');
  state.phase = 'both-chosen';
  await delay(300);
  resolveRound();
}

function pickCpuMove() {
  if (gameMode === 'easy') return pickEasyMove();
  if (gameMode === 'medium') return pickMediumMove();
  return pickHardMove();
}

function pickEasyMove() {
  // In sudden death, CPU can't pick BLOCK or HEAL
  const banned = timerState.suddenDeath ? SUDDEN_DEATH_BANNED : new Set();
  const roll = Math.random();
  if (!banned.has('BLOCK') && roll < 0.15) return 'BLOCK';
  if (!banned.has('HEAL') && roll < 0.25) return 'HEAL';
  const attacks = ['ATK', 'QUICK_ATK', 'HEAVY_ATK', 'COUNTER'].filter(k => !banned.has(k));
  return attacks[Math.floor(Math.random() * attacks.length)];
}

function pickMediumMove() {
  const banned = timerState.suddenDeath ? SUDDEN_DEATH_BANNED : new Set();
  const cpuHp = state.p2.hp, cpuMaxHp = state.p2.maxHp, cpuHpPct = cpuHp / cpuMaxHp, p1Hp = state.p1.hp;
  if (!banned.has('HEAL') && cpuHpPct < 0.35 && cpuMaxHp > 1) return Math.random() < 0.65 ? 'HEAL' : (banned.has('BLOCK') ? 'ATK' : 'BLOCK');
  if (p1Hp <= 2) { const f = ['HEAVY_ATK','QUICK_ATK','ATK']; return f[Math.floor(Math.random()*f.length)]; }
  return weightedPick([
    { key: 'ATK', w: 20 }, { key: 'QUICK_ATK', w: 25 }, { key: 'HEAVY_ATK', w: 20 },
    ...(!banned.has('BLOCK') ? [{ key: 'BLOCK', w: 20 }] : []),
    { key: 'COUNTER', w: 10 },
    ...(!banned.has('HEAL') ? [{ key: 'HEAL', w: 5 }] : []),
  ]);
}

function pickHardMove() {
  const banned = timerState.suddenDeath ? SUDDEN_DEATH_BANNED : new Set();
  const cpuHp = state.p2.hp, cpuMaxHp = state.p2.maxHp, cpuHpPct = cpuHp / cpuMaxHp, p1Hp = state.p1.hp;
  const history = state.p1MoveHistory;
  if (!banned.has('HEAL') && cpuHpPct < 0.25 && cpuMaxHp > 1) return 'HEAL';
  const recentLen = Math.min(history.length, 4);
  const recent = history.slice(-recentLen);
  const blockCount = recent.filter(m => m === 'BLOCK').length;
  const lastMove = history[history.length - 1];
  const quickAtkCount = recent.filter(m => m === 'QUICK_ATK').length;
  const lastIsQuick = lastMove === 'QUICK_ATK';
  const nonQuickAttacks = recent.filter(m => ['ATK','HEAVY_ATK'].includes(m)).length;
  if (recentLen >= 2 && nonQuickAttacks >= recentLen - 1 && !lastIsQuick && Math.random() < 0.70) return 'COUNTER';
  if (quickAtkCount >= 2 && Math.random() < 0.6) return 'HEAVY_ATK';
  if (!banned.has('BLOCK') && blockCount >= 2 && Math.random() < 0.55) return 'HEAVY_ATK';
  if (lastMove === 'COUNTER' && Math.random() < 0.65) return 'HEAVY_ATK';
  if (!banned.has('HEAL') && lastMove === 'HEAL' && Math.random() < 0.6) return 'QUICK_ATK';
  if (p1Hp <= 3 && Math.random() < 0.5) return 'QUICK_ATK';
  return weightedPick([
    { key: 'ATK', w: 10 }, { key: 'QUICK_ATK', w: 25 }, { key: 'HEAVY_ATK', w: 20 },
    ...(!banned.has('BLOCK') ? [{ key: 'BLOCK', w: 15 }] : []),
    { key: 'COUNTER', w: 20 },
    ...(!banned.has('HEAL') ? [{ key: 'HEAL', w: cpuHpPct < 0.6 ? 15 : 5 }] : []),
  ]);
}

function weightedPick(weights) {
  const total = weights.reduce((sum, w) => sum + w.w, 0);
  let r = Math.random() * total;
  for (const item of weights) { r -= item.w; if (r <= 0) return item.key; }
  return weights[weights.length - 1].key;
}

// ===== LOCK / UNLOCK =====
function lockCards(player) {
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  container.querySelectorAll('.card').forEach(c => {
    if (!c.classList.contains(`selected-${player}`)) c.classList.add('disabled');
  });
}

function unlockCards(player) {
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  container.querySelectorAll('.card').forEach(c => {
    c.classList.remove('disabled', 'selected-p1', 'selected-p2', 'online-hidden');
    // Re-apply sudden death bans
    if (timerState.suddenDeath && SUDDEN_DEATH_BANNED.has(c.dataset.move)) {
      c.classList.add('disabled', 'sd-banned');
    }
  });
  const dispEl = player === 'p1' ? els.p1SelDisp : els.p2SelDisp;
  dispEl.textContent = '— NOT YET CHOSEN —'; dispEl.style.color = '';
  refreshAccDisplay(player);
}

function showActivePanel(player) {
  const selArea = document.getElementById('selection-area');
  selArea.classList.add('single-panel');
  els.p1Panel.classList.remove('panel-active');
  els.p2Panel.classList.remove('panel-active');
  if (player === 'p1') els.p1Panel.classList.add('panel-active');
  else els.p2Panel.classList.add('panel-active');
}

function showBothPanels() {
  document.getElementById('selection-area').classList.remove('single-panel');
  els.p1Panel.classList.remove('panel-active');
  els.p2Panel.classList.remove('panel-active');
}

// ===== SET PHASE =====
function setPhase(phase) {
  state.phase = phase;
  const banner = els.phaseBanner;
  banner.classList.remove('hidden', 'p2-turn', 'cpu-turn', 'online-wait', 'sd-phase');
  els.btnResolve.classList.add('hidden');
  els.cpuThinking.classList.add('hidden');
  els.onlineWaiting.classList.add('hidden');
  const isMobile = window.innerWidth < 400;

  _savedBannerState = null;

  if (phase === 'p1-choose') {
    hideDialog();
    if (gameMode === 'online') {
      unlockCards('p1'); unlockCards('p2');
      state.p1.move = null; state.p2.move = null;
      banner.textContent = isMobile ? '⚡ PICK SECRETLY' : '⚡ PICK YOUR MOVE — OPPONENT PICKS SECRETLY';
      banner.classList.add('online-wait');
      if (timerState.suddenDeath) { banner.textContent = '⚡ NO GUARD BRAWL — PICK!'; banner.classList.add('sd-phase'); }
      const myPanel = onlineRole === 'p1' ? 'p1' : 'p2';
      showActivePanel(myPanel);
      const oppCards = onlineRole === 'p1' ? els.p2Cards : els.p1Cards;
      oppCards.querySelectorAll('.card').forEach(c => {
        if (!c.classList.contains('sd-banned')) c.classList.add('disabled', 'online-hidden');
      });
      if (onlineRole === 'p2') {
        if (els.p2PanelTitle) { els.p2PanelTitle.textContent = isMobile ? '🔥 YOU' : '🔥 YOU — CHOOSE'; els.p2PanelTitle.style.color = 'var(--p2)'; }
      } else {
        if (els.p1PanelTitle) { els.p1PanelTitle.textContent = isMobile ? '⚡ YOU' : '⚡ YOU — CHOOSE'; els.p1PanelTitle.style.color = 'var(--p1)'; }
      }
    } else {
      if (timerState.suddenDeath) {
        banner.textContent = isMobile ? '💀 NO GUARD BRAWL!' : '💀 NO GUARD BRAWL — BLOCK & HEAL BANNED!';
        banner.classList.add('sd-phase');
      } else {
        banner.textContent = isMobile ? '⚡ P1 — CHOOSE' : '⚡ PLAYER 1 — CHOOSE YOUR MOVE';
      }
      unlockCards('p1'); unlockCards('p2');
      state.p1.move = null; state.p2.move = null;
      els.p2Cards.querySelectorAll('.card').forEach(c => {
        if (!c.classList.contains('sd-banned')) c.classList.add('disabled');
      });
      if (gameMode !== '2p') { els.p2SelDisp.textContent = '— CPU WILL CHOOSE —'; showActivePanel('p1'); }
      else showActivePanel('p1');
    }
    // Start the move timer for p1 (or the online player)
    startMoveTimer(gameMode === 'online' ? onlineRole : 'p1');

  } else if (phase === 'p2-choose') {
    if (timerState.suddenDeath) {
      banner.textContent = isMobile ? '💀 NO GUARD BRAWL!' : '💀 NO GUARD BRAWL — CHOOSE NOW!';
      banner.classList.add('p2-turn', 'sd-phase');
    } else {
      banner.textContent = isMobile ? '🔥 P2 — CHOOSE' : '🔥 PLAYER 2 — CHOOSE YOUR MOVE';
      banner.classList.add('p2-turn');
    }
    els.p2Cards.querySelectorAll('.card').forEach(c => {
      if (!c.classList.contains('sd-banned')) c.classList.remove('disabled');
    });
    showActivePanel('p2');
    startMoveTimer('p2');

  } else if (phase === 'both-chosen') {
    stopMoveTimer();
    banner.classList.add('hidden');
    if (gameMode === '2p') { showBothPanels(); els.btnResolve.classList.remove('hidden'); }
  }
}

// ===== RESOLVE ROUND =====
els.btnResolve.addEventListener('click', resolveRound);

async function resolveRound() {
  if (state.phase !== 'both-chosen') return;
  state.phase = 'resolve';
  els.btnResolve.classList.add('hidden');

  const m1 = MOVES[state.p1.move];
  const m2 = MOVES[state.p2.move];
  const p2Label = gameMode === 'online' ? 'OPP' : gameMode !== '2p' ? 'CPU' : 'P2';

  logEntry(`— TURN ${state.round} —`, 'log-info');
  logEntry(`P1: ${m1.name}  |  ${p2Label}: ${m2.name}`, 'log-info');

  const p1Hit = (gameMode === 'online' && state._onlineHitRolls)
    ? state._onlineHitRolls.p1
    : rollAccuracy('p1', state.p1.move);
  const p2Hit = (gameMode === 'online' && state._onlineHitRolls)
    ? state._onlineHitRolls.p2
    : rollAccuracy('p2', state.p2.move);
  state._onlineHitRolls = null;
  roundHitResult.p1 = p1Hit;
  roundHitResult.p2 = p2Hit;

  roundBlockHit.p1 = (state.p1.move === 'BLOCK') ? p1Hit : null;
  roundBlockHit.p2 = (state.p2.move === 'BLOCK') ? p2Hit : null;

  const p1Pct = getAccPct('p1', state.p1.move);
  const p2Pct = getAccPct('p2', state.p2.move);
  logEntry(`P1 ACC:${p1Pct}% → ${p1Hit ? 'HIT' : 'MISS'} | ${p2Label} ACC:${p2Pct}% → ${p2Hit ? 'HIT' : 'MISS'}`, 'log-info');

  updateBlockStreak('p1', state.p1.move, p1Hit);
  updateBlockStreak('p2', state.p2.move, p2Hit);

  if (gameMode === 'online') {
    els.p2SelDisp.textContent = `✓ ${m2.name}`;
    const oppCards = onlineRole === 'p1' ? els.p2Cards : els.p1Cards;
    oppCards.querySelectorAll('.card').forEach(c => {
      c.classList.remove('online-hidden');
      if (c.dataset.move === state.p2.move && onlineRole === 'p1') c.classList.add('selected-p2');
      else if (c.dataset.move === state.p1.move && onlineRole === 'p2') c.classList.add('selected-p1');
      else if (!c.classList.contains('sd-banned')) c.classList.add('disabled');
    });
  }
  if (gameMode !== '2p' && gameMode !== 'online') els.p2SelDisp.textContent = `✓ ${m2.name}`;

  const p1Priority = m1.priority;
  const p2Priority = m2.priority;
  if (p1Priority === p2Priority) {
    await applySimultaneous(m1, m2, p1Hit, p2Hit);
  } else if (p1Priority > p2Priority) {
    await applyTurn('p1', m1, 'p2', m2, false, p1Hit);
    if (!isGameOver()) await applyTurn('p2', m2, 'p1', m1, true, p2Hit);
  } else {
    await applyTurn('p2', m2, 'p1', m1, false, p2Hit);
    if (!isGameOver()) await applyTurn('p1', m1, 'p2', m2, true, p1Hit);
  }

  updateHUD();

  if (isGameOver()) {
    await delay(500);
    endGame();
    return;
  }

  // After sudden death round — highest HP wins, no more rounds
if (timerState.suddenDeath) {
    await delay(400);
    if (state.p1.hp < state.p2.hp) {
      showTiedOverlay();
      await delay(3000);
      hideTiedOverlay();
      await delay(300);
      state.p1.hp = 0;
    } else if (state.p2.hp < state.p1.hp) {
      showTiedOverlay();
      await delay(3000);
      hideTiedOverlay();
      await delay(300);
      state.p2.hp = 0;
    } else {
      showTiedOverlay();
      await delay(3000);
      hideTiedOverlay();
      state.round++;
      els.roundNum.textContent = state.round;
      await delay(200);
      setPhase('p1-choose');
      return;
    }
    updateHUD();
    await delay(500);
    endGame();
    return;
  }

  state.round++;
  els.roundNum.textContent = state.round;
  await delay(200);
  setPhase('p1-choose');
}

function updateBlockStreak(player, moveKey, hit) {
  if (moveKey === 'BLOCK') {
    if (hit) state[player].blockStreak++;
    else     state[player].blockStreak = 0;
  } else {
    state[player].blockStreak = 0;
  }
}

async function applySimultaneous(m1, m2, p1Hit = true, p2Hit = true) {
  spawnClashText(m1.name, m2.name);
  await delay(600);
  const dmg1To2 = p1Hit ? calcDamage('p1', m1, 'p2', m2) : 0;
  const dmg2To1 = p2Hit ? calcDamage('p2', m2, 'p1', m1) : 0;
  const heal1   = (p1Hit && m1.heal) ? m1.heal : 0;
  const heal2   = (p2Hit && m2.heal) ? m2.heal : 0;

  const def2 = (p2Hit && m2.defence) ? m2.defence : 0;
  const def1 = (p1Hit && m1.defence) ? m1.defence : 0;

  const actual1To2 = Math.max(0, dmg1To2 - def2);
  const actual2To1 = Math.max(0, dmg2To1 - def1);

  if (!p1Hit && m1.name === 'BLOCK') { spawnMissText('p1', 'BLOCK FAILED!'); await delay(400); }
  if (!p2Hit && m2.name === 'BLOCK') { spawnMissText('p2', 'BLOCK FAILED!'); await delay(400); }
  if (!p1Hit && m1.name !== 'BLOCK') { spawnMissText('p2', 'MISS!'); await delay(400); }
  if (!p2Hit && m2.name !== 'BLOCK') { spawnMissText('p1', 'MISS!'); await delay(400); }

  applyDamage('p2', actual1To2, 'p1', m1);
  applyDamage('p1', actual2To1, 'p2', m2);
  applyHealEffect('p1', heal1, m1);
  applyHealEffect('p2', heal2, m2);
  await animateMoves('p1', m1, 'p2', m2, actual1To2, actual2To1);
  updateHUD();
}

async function applyTurn(attacker, atkMove, defender, defMove, isSecondTurn = false, hit = true) {
  const p2Label = gameMode === 'online' ? 'Opponent' : gameMode !== '2p' ? 'CPU' : 'P2';
  const attackerLabel = attacker === 'p1' ? 'Player 1' : p2Label;
  const defenderLabel = defender === 'p1' ? 'Player 1' : p2Label;

  if (!hit) {
    let missMsg;
    if (atkMove.name === 'BLOCK') {
      missMsg = `${attackerLabel}'s BLOCK FAILED!\nToo tired to hold guard!`;
    } else if (atkMove.name === 'HEAL') {
      missMsg = `${attackerLabel}'s HEAL fizzled!\nConcentration broken!`;
    } else {
      missMsg = `${attackerLabel}'s ${atkMove.name} MISSED!\nThe attack whiffed!`;
    }
    await showDialog(missMsg, 2000);
    await animateMiss(attacker, atkMove);
    return;
  }

  const dmg = calcDamage(attacker, atkMove, defender, defMove);
  const heal = atkMove.heal || 0;

  const defenderBlockHit = roundBlockHit[defender];
  const defenderDef = (defMove.defence > 0 && defenderBlockHit === true) ? defMove.defence : 0;
  const actualDmg = Math.max(0, dmg - defenderDef);

  if (atkMove.name === 'BLOCK') {
    const streak = state[attacker].blockStreak;
    const nextAcc = Math.round(getBlockAccuracy(streak) * 100);
    await showDialog(
      `${attackerLabel} takes a defensive stance!\nDamage reduced by 2. Next: ${nextAcc}%`,
      1800
    );
  } else if (atkMove.name === 'HEAL') {
    await showDialog(`${attackerLabel} is recovering!\n+6 HP restored! (Max HP -2)`, 1600);
  } else if (atkMove.name === 'COUNTER') {
    const isDefenderAttacking = ['ATK', 'HEAVY ATK'].includes(defMove.name);
    const isQuickAtk = defMove.name === 'QUICK ATK';
    if (isQuickAtk) {
      await showDialog(`${attackerLabel}'s COUNTER failed!\nQUICK ATK was too fast!`, 2000);
    } else if (!isDefenderAttacking) {
      await showDialog(`${attackerLabel}'s COUNTER failed!\nNo attack to reflect!`, 2000);
    } else if (!roundHitResult[defender]) {
      await showDialog(`${attackerLabel}'s COUNTER failed!\nAttack missed — nothing to reflect!`, 2000);
    } else {
      await showDialog(`${attackerLabel}'s COUNTER activated!\nReflecting ${actualDmg} damage back!`, 2000);
    }
  } else {
    if (actualDmg > 0) {
      await showDialog(`${attackerLabel}'s ${atkMove.name} hits!\n${defenderLabel} takes ${actualDmg} damage!`, 1600);
    } else {
      await showDialog(`${attackerLabel}'s ${atkMove.name} blocked!\n${defenderLabel}'s guard held firm!`, 1600);
    }
  }

  applyDamage(defender, actualDmg, attacker, atkMove);
  applyHealEffect(attacker, heal, atkMove);
  await animateSingleTurn(attacker, atkMove, defender, defMove, actualDmg);
  updateHUD();
}

async function animateMiss(attacker, atkMove) {
  const atkSprite = attacker === 'p1' ? els.p1Sprite : els.p2Sprite;
  atkSprite.style.transition = 'transform 120ms ease';
  atkSprite.style.transform = 'translateX(10px) rotate(4deg)';
  await delay(120);
  atkSprite.style.transform = 'translateX(-8px) rotate(-3deg)';
  await delay(100);
  atkSprite.style.transition = 'transform 300ms ease';
  atkSprite.style.transform = '';
  await delay(200);
  atkSprite.style.filter = 'brightness(0.4) grayscale(1)';
  await delay(120);
  atkSprite.style.transition = 'filter 400ms ease';
  atkSprite.style.filter = '';
  await delay(400);
  atkSprite.style.transition = '';
  const missTarget = atkMove.name === 'BLOCK' ? attacker : (attacker === 'p1' ? 'p2' : 'p1');
  spawnMissText(missTarget, atkMove.name === 'BLOCK' ? 'BLOCK FAILED!' : 'MISS!');
  await delay(300);
}

function spawnClashText(move1, move2) {
  const arena = document.querySelector('.arena');
  const rect = arena.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const isMobile = window.innerWidth < 480;

  const el1 = document.createElement('div');
  el1.style.cssText = `
    position:fixed;left:${cx}px;top:${cy}px;
    font-family:var(--font-title);font-size:${isMobile ? '1.2rem' : '1.8rem'};
    color:#f7c948;text-shadow:2px 2px 0 #000,0 0 16px #f7c948;
    pointer-events:none;z-index:1000;transform:translate(-50%,-50%);
    animation:dmgFloat 1.1s cubic-bezier(0.2,1.4,0.4,1) forwards;
  `;
  el1.textContent = 'CLASH!';
  document.body.appendChild(el1);
  setTimeout(() => el1.remove(), 1100);

  setTimeout(() => {
    const el2 = document.createElement('div');
    el2.style.cssText = `
      position:fixed;left:${cx}px;top:${cy}px;
      font-family:var(--font-title);font-size:${isMobile ? '0.55rem' : '0.72rem'};
      color:#f7c948;text-shadow:1px 1px 0 #000,0 0 10px #f7c948;
      pointer-events:none;z-index:1000;transform:translate(-50%,-50%);
      animation:dmgFloat 1.1s cubic-bezier(0.2,1.4,0.4,1) forwards;
    `;
    el2.textContent = `${move1} vs ${move2}`;
    document.body.appendChild(el2);
    setTimeout(() => el2.remove(), 1100);
  }, 320);
}

function spawnMissText(target, label = 'MISS!') {
  const sprite = target === 'p1' ? els.p1Sprite : els.p2Sprite;
  const rect = sprite.getBoundingClientRect();
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top}px;
    font-family:var(--font-title);font-size:${window.innerWidth < 480 ? '1.1rem' : '1.6rem'};
    color:#888888;text-shadow:2px 2px 0 #000,0 0 10px #444;
    pointer-events:none;z-index:1000;transform:translate(-50%,-50%);
    animation:dmgFloat 0.9s cubic-bezier(0.2,1.4,0.4,1) forwards;
  `;
  el.textContent = label;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function calcDamage(attacker, atkMove, defender, defMove) {
  if (atkMove.name === 'COUNTER') {
    if (defMove.name === 'QUICK ATK') {
      logEntry(`${attacker.toUpperCase()} COUNTER — too slow for QUICK ATK!`, 'log-info');
      return 0;
    }
    const isDefenderAttacking = ['ATK', 'HEAVY ATK'].includes(defMove.name);
    if (!isDefenderAttacking) {
      logEntry(`${attacker.toUpperCase()} COUNTER — no attack to reflect!`, 'log-info');
      return 0;
    }
    const defenderHit = roundHitResult[defender];
    if (!defenderHit) {
      logEntry(`${attacker.toUpperCase()} COUNTER — attack missed, nothing to reflect!`, 'log-info');
      return 0;
    }
    const defDmg = defMove.dmg || 0;
    logEntry(`${attacker.toUpperCase()} COUNTERS — reflects ${defDmg * 2} dmg!`, 'log-dmg');
    return defDmg * 2;
  }
  return atkMove.dmg || 0;
}

function applyDamage(target, amount, source, srcMove) {
  if (amount <= 0) return;
  state[target].hp = Math.max(0, state[target].hp - amount);
  const p2Label = gameMode === 'online' ? 'OPP' : gameMode !== '2p' ? 'CPU' : 'P2';
  logEntry(`${source === 'p2' ? p2Label : 'P1'} hits ${target === 'p2' ? p2Label : 'P1'} for ${amount} dmg!`, 'log-dmg');
  const isCounter = srcMove && srcMove.name === 'COUNTER';
  spawnDamageNumber(target, amount, isCounter ? 'counter' : 'dmg');
}

function applyHealEffect(player, amount, move) {
  if (amount <= 0) return;
  state[player].maxHp = Math.max(1, state[player].maxHp - 2);
  state[player].hp = Math.min(state[player].maxHp, state[player].hp + amount);
  const p2Label = gameMode === 'online' ? 'OPP' : gameMode !== '2p' ? 'CPU' : 'P2';
  logEntry(`${player === 'p2' ? p2Label : 'P1'} heals! HP: ${state[player].hp}/${state[player].maxHp}`, 'log-heal');
  spawnDamageNumber(player, amount, 'heal');
}

// ===== ANIMATION ENGINE =====
let particleCanvas, particleCtx;
function initParticleCanvas() {
  if (particleCanvas) return;
  particleCanvas = document.createElement('canvas');
  particleCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:998;';
  document.body.appendChild(particleCanvas);
  particleCanvas.width = window.innerWidth; particleCanvas.height = window.innerHeight;
  particleCtx = particleCanvas.getContext('2d');
  window.addEventListener('resize', () => {
    if (particleCanvas) { particleCanvas.width = window.innerWidth; particleCanvas.height = window.innerHeight; }
  });
}

function getSpriteCenter(spriteEl) {
  const r = spriteEl.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function spawnImpactParticles(x, y, color, count = 18) {
  if (!particleCtx) return;
  const particles = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
    const speed = 3 + Math.random() * 6;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: 0.04 + Math.random() * 0.04, size: 2 + Math.random() * 4, color });
  }
  animateParticles(particles);
}

function animateParticles(particles) {
  let alive = true;
  function frame() {
    if (!alive || !particleCtx) return;
    particleCtx.fillStyle = 'rgba(0,0,0,0.25)';
    particleCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);
    alive = false;
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.96; p.life -= p.decay;
      if (p.life <= 0) continue;
      alive = true;
      particleCtx.globalAlpha = p.life;
      particleCtx.fillStyle = p.color;
      particleCtx.beginPath();
      particleCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      particleCtx.fill();
    }
    particleCtx.globalAlpha = 1;
    if (alive) requestAnimationFrame(frame);
    else particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  }
  requestAnimationFrame(frame);
}

function screenShake(intensity = 8, duration = 600) {
  const game = document.getElementById('screen-game');
  const startTime = performance.now();
  function shake(now) {
    const elapsed = now - startTime;
    if (elapsed >= duration) { game.style.transform = ''; return; }
    const damping = 1 - elapsed / duration;
    game.style.transform = `translate(${(Math.random()-0.5)*intensity*2*damping}px,${(Math.random()-0.5)*intensity*damping}px)`;
    requestAnimationFrame(shake);
  }
  requestAnimationFrame(shake);
}

function zoomPunch(spriteEl, scale = 1.35, duration = 300) {
  return new Promise(resolve => {
    spriteEl.style.transition = `transform ${duration*0.4}ms cubic-bezier(0.2,1.6,0.4,1)`;
    spriteEl.style.transform = `scale(${scale})`;
    setTimeout(() => {
      spriteEl.style.transition = `transform ${duration*0.6}ms ease`;
      spriteEl.style.transform = '';
      setTimeout(() => { spriteEl.style.transition = ''; spriteEl.style.transform = ''; resolve(); }, duration*0.6);
    }, duration*0.4);
  });
}

function hitFreeze(duration = 220) {
  return new Promise(resolve => {
    const sprites = document.querySelectorAll('.fighter-sprite');
    sprites.forEach(s => s.style.animationPlayState = 'paused');
    setTimeout(() => { sprites.forEach(s => s.style.animationPlayState = ''); resolve(); }, duration);
  });
}

function lungePunch(spriteEl, direction = 1) {
  return new Promise(resolve => {
    spriteEl.style.transition = 'transform 180ms cubic-bezier(0.2,1.4,0.4,1)';
    spriteEl.style.transform = `translateX(${direction*55}px) scale(1.15)`;
    setTimeout(() => {
      spriteEl.style.transition = 'transform 340ms ease';
      spriteEl.style.transform = '';
      setTimeout(() => { spriteEl.style.transition = ''; spriteEl.style.transform = ''; resolve(); }, 340);
    }, 180);
  });
}

function recoilHit(spriteEl, direction = -1) {
  return new Promise(resolve => {
    spriteEl.style.transition = 'transform 100ms ease';
    spriteEl.style.transform = `translateX(${direction*45}px) scale(0.9)`;
    setTimeout(() => {
      spriteEl.style.transition = 'transform 500ms cubic-bezier(0.2,1.2,0.4,1)';
      spriteEl.style.transform = '';
      setTimeout(() => { spriteEl.style.transition = ''; spriteEl.style.transform = ''; resolve(); }, 500);
    }, 100);
  });
}

function spriteFlash(spriteEl, color = '#fff', times = 3) {
  return new Promise(resolve => {
    let count = 0;
    const interval = setInterval(() => {
      spriteEl.style.filter = count % 2 === 0
        ? `brightness(4) drop-shadow(0 0 14px ${color})`
        : `brightness(1) drop-shadow(0 0 4px ${color})`;
      count++;
      if (count >= times * 2) { clearInterval(interval); spriteEl.style.filter = ''; resolve(); }
    }, 90);
  });
}

function healGlow(spriteEl) {
  return new Promise(resolve => {
    spriteEl.style.transition = 'filter 300ms ease, transform 300ms ease';
    spriteEl.style.filter = 'brightness(2.5) drop-shadow(0 0 24px #2ecc71) hue-rotate(100deg)';
    spriteEl.style.transform = 'scale(1.3)';
    const center = getSpriteCenter(spriteEl);
    spawnHealParticles(center.x, center.y);
    setTimeout(() => {
      spawnHealParticles(center.x, center.y);
      setTimeout(() => {
        spriteEl.style.transition = 'filter 500ms ease, transform 500ms ease';
        spriteEl.style.filter = ''; spriteEl.style.transform = '';
        setTimeout(() => { spriteEl.style.transition = ''; resolve(); }, 500);
      }, 300);
    }, 400);
  });
}

function spawnHealParticles(x, y) {
  if (!particleCtx) return;
  const particles = [];
  for (let i = 0; i < 24; i++) {
    particles.push({
      x: x + (Math.random()-0.5)*50, y: y + Math.random()*20,
      vx: (Math.random()-0.5)*2.5, vy: -(2.5+Math.random()*5),
      life: 1, decay: 0.018+Math.random()*0.015, size: 4+Math.random()*5,
      color: `hsl(${110+Math.random()*50},85%,60%)`,
    });
  }
  animateParticles(particles);
}

function blockFlash(spriteEl) {
  return new Promise(resolve => {
    spriteEl.style.transition = 'filter 150ms, transform 150ms';
    spriteEl.style.filter = 'brightness(2.5) drop-shadow(0 0 20px #4af0c8)';
    spriteEl.style.transform = 'scale(0.88) translateX(8px)';
    setTimeout(() => {
      spriteEl.style.transition = 'filter 400ms, transform 400ms';
      spriteEl.style.filter = ''; spriteEl.style.transform = '';
      setTimeout(() => { spriteEl.style.transition = ''; resolve(); }, 400);
    }, 250);
  });
}

async function animateSingleTurn(attacker, atkMove, defender, defMove, dmg) {
  initParticleCanvas();
  const atkSprite = attacker === 'p1' ? els.p1Sprite : els.p2Sprite;
  const defSprite = defender === 'p1' ? els.p1Sprite : els.p2Sprite;
  const moveName = atkMove.name;
  const atkDir = attacker === 'p1' ? 1 : -1;
  if (moveName === 'HEAL') { await healGlow(atkSprite); await delay(300); }
  else if (moveName === 'BLOCK') { await blockFlash(atkSprite); await delay(200); }
  else if (moveName === 'COUNTER') {
    if (dmg > 0) {
      await lungePunch(defSprite, atkDir * -1); await hitFreeze(150);
      await Promise.all([spriteFlash(atkSprite, '#b04aff', 3), recoilHit(defSprite, atkDir)]);
      await delay(200); await hitFreeze(300); await lungePunch(atkSprite, atkDir);
      const center = getSpriteCenter(defSprite);
      spawnImpactParticles(center.x, center.y, '#b04aff', 36);
      await Promise.all([hitFreeze(400), screenShake(16, 700), spriteFlash(defSprite, '#ff4444', 6), recoilHit(defSprite, atkDir * -1), flashHitCinematic(defender, '#b04aff')]);
      await delay(300);
    } else { spriteFlash(atkSprite, '#555555', 3); await delay(600); }
  } else {
    const isHeavy = moveName === 'HEAVY ATK', isQuick = moveName === 'QUICK ATK';
    if (isHeavy) { await zoomPunch(atkSprite, 1.2, 300); await hitFreeze(200); }
    await lungePunch(atkSprite, atkDir);
    if (dmg > 0) {
      const center = getSpriteCenter(defSprite);
      const impactColor = attacker === 'p1' ? '#f7c948' : '#e03c3c';
      spawnImpactParticles(center.x, center.y, impactColor, isHeavy ? 36 : isQuick ? 16 : 22);
      if (isHeavy) setTimeout(() => spawnImpactParticles(center.x, center.y, '#ff8800', 18), 120);
      await Promise.all([
        hitFreeze(isHeavy ? 400 : isQuick ? 150 : 250),
        screenShake(isHeavy ? 18 : isQuick ? 7 : 10, isHeavy ? 700 : isQuick ? 350 : 500),
        spriteFlash(defSprite, impactColor, isHeavy ? 6 : isQuick ? 3 : 4),
        recoilHit(defSprite, atkDir * -1),
        flashHitCinematic(defender, impactColor)
      ]);
      await delay(isHeavy ? 250 : 100);
    }
  }
  [atkSprite, defSprite].forEach(s => { s.style.filter = ''; s.style.transform = ''; s.style.transition = ''; });
}

async function animateMoves(p1, m1, p2, m2, dmg1, dmg2) {
  initParticleCanvas();
  const sprite1 = els.p1Sprite, sprite2 = els.p2Sprite;
  const lunges = [];
  if (m1.name !== 'BLOCK' && m1.name !== 'HEAL') lunges.push(lungePunch(sprite1, 1));
  else if (m1.name === 'BLOCK') lunges.push(blockFlash(sprite1));
  else if (m1.name === 'HEAL') lunges.push(healGlow(sprite1));
  if (m2.name !== 'BLOCK' && m2.name !== 'HEAL') lunges.push(lungePunch(sprite2, -1));
  else if (m2.name === 'BLOCK') lunges.push(blockFlash(sprite2));
  else if (m2.name === 'HEAL') lunges.push(healGlow(sprite2));
  await Promise.all(lunges);
  const impactPromises = [];
  if (dmg1 > 0) {
    const center = getSpriteCenter(sprite2);
    spawnImpactParticles(center.x, center.y, '#f7c948', 22);
    impactPromises.push(spriteFlash(sprite2, '#f7c948', 4), recoilHit(sprite2, 1), flashHitCinematic('p2', '#f7c948'));
  }
  if (dmg2 > 0) {
    const center = getSpriteCenter(sprite1);
    spawnImpactParticles(center.x, center.y, '#e03c3c', 22);
    impactPromises.push(spriteFlash(sprite1, '#e03c3c', 4), recoilHit(sprite1, -1), flashHitCinematic('p1', '#e03c3c'));
  }
  if (impactPromises.length) await Promise.all([hitFreeze(260), screenShake(10, 500), ...impactPromises]);
  await delay(200);
  [sprite1, sprite2].forEach(s => { s.style.filter = ''; s.style.transform = ''; s.style.transition = ''; });
}

function flashHitCinematic(player, color) {
  const overlay = els.hitOverlay;
  overlay.style.background = color || (player === 'p1' ? 'rgba(247,201,72,0.3)' : 'rgba(224,60,60,0.35)');
  overlay.style.opacity = '1';
  return new Promise(resolve => {
    setTimeout(() => {
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.style.transition = ''; resolve(); }, 300);
    }, 60);
  });
}

function spawnDamageNumber(target, amount, type = 'dmg') {
  const sprite = target === 'p1' ? els.p1Sprite : els.p2Sprite;
  const rect = sprite.getBoundingClientRect();
  const el = document.createElement('div');
  const colors = { dmg: '#ff4444', heal: '#2ecc71', counter: '#b04aff' };
  const symbols = { dmg: `-${amount}`, heal: `+${amount}`, counter: `-${amount}` };
  const isMobile = window.innerWidth < 480;
  el.style.cssText = `
    position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top}px;
    font-family:var(--font-title);
    font-size:${isMobile ? '1.4rem' : (type === 'counter' ? '2.2rem' : amount >= 2 ? '2rem' : '1.6rem')};
    color:${colors[type] || colors.dmg};
    text-shadow:2px 2px 0 #000,0 0 16px ${colors[type] || colors.dmg};
    pointer-events:none;z-index:1000;
    transform:translate(-50%,-50%);
    animation:dmgFloat 0.9s cubic-bezier(0.2,1.4,0.4,1) forwards;
  `;
  el.textContent = symbols[type] || symbols.dmg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function updateHUD() { updatePlayerHUD('p1'); updatePlayerHUD('p2'); }

function updatePlayerHUD(player) {
  const p = state[player];
  const pct = Math.max(0, (p.hp / p.maxHp) * 100);
  const bar = player === 'p1' ? els.p1HpBar : els.p2HpBar;
  const txt = player === 'p1' ? els.p1HpText : els.p2HpText;
  bar.style.width = pct + '%';
  bar.classList.remove('low', 'mid');
  if (pct <= 25) bar.classList.add('low');
  else if (pct <= 60) bar.classList.add('mid');
  txt.textContent = `${p.hp}/${p.maxHp}`;
}

function logEntry(msg, cls = '') {
  const div = document.createElement('div');
  div.className = `log-entry ${cls}`;
  div.textContent = msg;
  els.battleLog.appendChild(div);
  els.battleLog.scrollTop = els.battleLog.scrollHeight;
}

function isGameOver() { return state.p1.hp <= 0 || state.p2.hp <= 0; }

function endGame() {
  stopMoveTimer();
  if (timerState._matchTimer) clearInterval(timerState._matchTimer);
  if (els.timerBar) els.timerBar.classList.add('hidden');
  let winnerText, subText;
  const isAI = ['easy', 'medium', 'hard'].includes(gameMode);
  const isOnline = gameMode === 'online';
  const wasSuddenDeath = timerState.suddenDeath;
  if (state.p1.hp <= 0 && state.p2.hp <= 0) {
    winnerText = 'DOUBLE K.O. — DRAW!'; subText = wasSuddenDeath ? 'Sudden Death — nobody wins!' : 'Both fighters fall...';
  } else if (state.p1.hp <= 0) {
    if (isOnline) { winnerText = onlineRole === 'p2' ? '🔥 YOU WIN!' : '💀 YOU LOSE!'; subText = onlineRole === 'p2' ? getVictoryFlair(state.p2.hp, state.p2.maxHp, wasSuddenDeath) : 'Better luck next time!'; }
    else { winnerText = isAI ? `🤖 CPU WINS! (${gameMode.toUpperCase()})` : '🔥 PLAYER 2 WINS!'; subText = isAI ? getCpuVictoryTaunt(gameMode) : getVictoryFlair(state.p2.hp, state.p2.maxHp, wasSuddenDeath); }
  } else {
    if (isOnline) { winnerText = onlineRole === 'p1' ? '⚡ YOU WIN!' : '💀 YOU LOSE!'; subText = onlineRole === 'p1' ? getVictoryFlair(state.p1.hp, state.p1.maxHp, wasSuddenDeath) : 'Better luck next time!'; }
    else { winnerText = '⚡ PLAYER 1 WINS!'; subText = isAI ? getPlayerVictoryTaunt(gameMode) : getVictoryFlair(state.p1.hp, state.p1.maxHp, wasSuddenDeath); }
  }
  els.resultWinner.textContent = winnerText;
  els.resultSub.textContent = subText;
  showScreen('result');
}

function getVictoryFlair(hp, maxHp, wasSuddenDeath = false) {
  if (wasSuddenDeath) return '⏱ Won by Sudden Death!';
  const pct = hp / maxHp;
  if (pct >= 0.8) return 'FLAWLESS VICTORY';
  if (pct >= 0.5) return 'Dominant Victory';
  if (pct >= 0.3) return 'Hard-Fought Victory';
  return 'Barely Survived...';
}

function getCpuVictoryTaunt(diff) {
  const taunts = {
    easy:   ['EVEN EASY MODE BEAT YOU...','Rookie mistake.','Try again, champ.'],
    medium: ['The CPU learns from you.','Pattern detected. Pattern punished.','A solid defeat.'],
    hard:   ['CALCULATED.','Your moves were predictable.','Perfect read. Every round.'],
  };
  const arr = taunts[diff] || taunts.medium;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPlayerVictoryTaunt(diff) {
  const taunts = {
    easy:   ['Warm-up complete!','Nice one, now try MEDIUM.','Easy mode conquered!'],
    medium: ['Strong reads!','The CPU never saw it coming.','Solid strategy!'],
    hard:   ['IMPOSSIBLE... yet here we are.','HARD MODE DESTROYED!','Flawless tactical mastery.'],
  };
  const arr = taunts[diff] || taunts.medium;
  return arr[Math.floor(Math.random() * arr.length)];
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (screens.game.classList.contains('active')) updateModeUI(); }, 200);
});

document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - (document._lastTouch || 0) < 300) e.preventDefault();
  document._lastTouch = now;
}, { passive: false });

showScreen('title');
