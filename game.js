// ============================================
//   BRAWL CARDS — game.js
//   • Local 2P, CPU modes (unchanged)
//   • Online multiplayer via Supabase Realtime
// ============================================

// ─── SUPABASE CONFIG ───────────────────────
// Replace these with your own project values from supabase.com
const SUPABASE_URL = 'https://oikumdcokfhrzuvgmxku.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pa3VtZGNva2Zocnp1dmdteGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzA2NTYsImV4cCI6MjA4ODQ0NjY1Nn0.X_PzXZswIFPKZddV24rcSql6PbVoR0vmuKdn3Xh_qAQ';
// ───────────────────────────────────────────

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== MOVE DEFINITIONS =====
const MOVES = {
  ATK:       { name: 'ATK',       dmg: 2,    priority: 0,  heal: 0, defence: 0, label: 'DMG:2 | PRI:0',   emoji: '👊', desc: 'A solid straight punch! Deals 2 damage!' },
  QUICK_ATK: { name: 'QUICK ATK', dmg: 1,    priority: 1,  heal: 0, defence: 0, label: 'DMG:1 | PRI:+1',  emoji: '⚡', desc: 'Lightning-fast jab! Goes first — and CANNOT be countered!' },
  HEAVY_ATK: { name: 'HEAVY ATK', dmg: 4,    priority: -1, heal: 0, defence: 0, label: 'DMG:4 | PRI:-1',  emoji: '💥', desc: 'A bone-crushing blow! Deals 4 damage but goes last!' },
  BLOCK:     { name: 'BLOCK',     dmg: 0,    priority: 2,  heal: 0, defence: 2, label: 'DEF:2 | PRI:+2',  emoji: '🛡️', desc: 'Raises guard! Reduces incoming damage by 2!' },
  COUNTER:   { name: 'COUNTER',   dmg: 'x2', priority: -2, heal: 0, defence: 0, label: 'DMG:×2 | PRI:-2', emoji: '🔄', desc: 'Reflects enemy attack back DOUBLED! Fails vs Quick ATK!' },
  HEAL:      { name: 'HEAL',      dmg: 0,    priority: 2,  heal: 6, defence: 0, label: '+6HP | PRI:+2',   emoji: '💚', desc: 'Recovers 6 HP! But max HP drops by 2...' },
};

const MOVE_KEYS = Object.keys(MOVES);

// ===== GAME CONFIG =====
let gameMode = '2p'; // '2p' | 'easy' | 'medium' | 'hard' | 'online'

// ===== ONLINE STATE =====
let onlineRoom = null;   // current room code
let onlineRole = null;   // 'p1' or 'p2'
let onlineChannel = null;
let onlinePendingMoves = {};
let onlineOpponentConnected = false;

// ===== GAME STATE =====
let state = {
  p1: { hp: 10, maxHp: 10, move: null },
  p2: { hp: 10, maxHp: 10, move: null },
  round: 1,
  phase: 'p1-choose',
  p1MoveHistory: [],
  p2LastMove: null,
};

// ===== DOM REFS =====
const screens = {
  title:  document.getElementById('screen-title'),
  rules:  document.getElementById('screen-rules'),
  game:   document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
};

const els = {
  p1HpBar:    document.getElementById('p1-hp-bar'),
  p2HpBar:    document.getElementById('p2-hp-bar'),
  p1HpText:   document.getElementById('p1-hp-text'),
  p2HpText:   document.getElementById('p2-hp-text'),
  roundNum:   document.getElementById('round-num'),
  p1Cards:    document.getElementById('p1-cards'),
  p2Cards:    document.getElementById('p2-cards'),
  p1SelDisp:  document.getElementById('p1-selected-display'),
  p2SelDisp:  document.getElementById('p2-selected-display'),
  p1Panel:    document.getElementById('p1-panel'),
  p2Panel:    document.getElementById('p2-panel'),
  p1Sprite:   document.getElementById('p1-sprite'),
  p2Sprite:   document.getElementById('p2-sprite'),
  phaseBanner:document.getElementById('phase-banner'),
  battleLog:  document.getElementById('battle-log'),
  btnResolve: document.getElementById('btn-resolve'),
  resultWinner: document.getElementById('result-winner'),
  resultSub:    document.getElementById('result-sub'),
  hitOverlay:   document.getElementById('hit-overlay'),
  p1Name:       document.getElementById('p1-name'),
  p2Name:       document.getElementById('p2-name'),
  p2PanelTitle: document.getElementById('p2-panel-title'),
  modeBadge:    document.getElementById('mode-badge'),
  cpuThinking:  document.getElementById('cpu-thinking'),
  onlineWaiting: document.getElementById('online-waiting'),
  pokeDialog:   document.getElementById('poke-dialog'),
  pokeDialogText: document.getElementById('poke-dialog-text'),
  pokeDialogArrow: document.getElementById('poke-dialog-arrow'),
  // Online UI
  btnCreateRoom:  document.getElementById('btn-create-room'),
  btnJoinRoom:    document.getElementById('btn-join-room'),
  joinInputWrap:  document.getElementById('join-input-wrap'),
  joinCodeInput:  document.getElementById('join-code-input'),
  btnJoinConfirm: document.getElementById('btn-join-confirm'),
  roomStatus:     document.getElementById('room-status'),
};

// ===== SCREEN NAV =====
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ===== TITLE SCREEN BUTTONS =====
document.getElementById('btn-start').addEventListener('click', () => {
  gameMode = '2p';
  startGame();
  showScreen('game');
});

document.querySelectorAll('.btn-difficulty').forEach(btn => {
  btn.addEventListener('click', () => {
    gameMode = btn.dataset.diff;
    startGame();
    showScreen('game');
  });
});

document.getElementById('btn-rules').addEventListener('click', () => showScreen('rules'));
document.getElementById('btn-rules-back').addEventListener('click', () => showScreen('title'));
document.getElementById('btn-title').addEventListener('click', () => {
  leaveOnlineRoom();
  showScreen('title');
});
document.getElementById('btn-rematch').addEventListener('click', () => {
  if (gameMode === 'online') {
    // Signal rematch to opponent
    sendOnlineEvent('rematch', {});
    startGame();
    showScreen('game');
  } else {
    startGame();
    showScreen('game');
  }
});

// ===== ONLINE ROOM UI =====
els.btnCreateRoom.addEventListener('click', createOnlineRoom);
els.btnJoinRoom.addEventListener('click', () => {
  els.joinInputWrap.classList.toggle('hidden');
  els.joinCodeInput.focus();
});
els.btnJoinConfirm.addEventListener('click', () => {
  const code = els.joinCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) {
    showRoomStatus('Enter a 4-letter room code', 'error');
    return;
  }
  joinOnlineRoom(code);
});
els.joinCodeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') els.btnJoinConfirm.click();
  els.joinCodeInput.value = els.joinCodeInput.value.toUpperCase();
});

function showRoomStatus(msg, type = 'waiting') {
  els.roomStatus.textContent = msg;
  els.roomStatus.className = `room-status ${type}`;
  els.roomStatus.classList.remove('hidden');
}

// ===== CREATE ROOM =====
async function createOnlineRoom() {
  const code = generateRoomCode();
  onlineRoom = code;
  onlineRole = 'p1';
  showRoomStatus(`ROOM: ${code} — Waiting for opponent...`, 'waiting');
  await subscribeToRoom(code);
  // Insert room record so P2 can verify it exists
  await supabaseClient.from('rooms').upsert({ id: code, p1_ready: true, p2_ready: false });
}

// ===== JOIN ROOM =====
async function joinOnlineRoom(code) {
  showRoomStatus(`Connecting to ${code}...`, 'waiting');
  // Check room exists
  const { data, error } = await supabaseClient.from('rooms').select('*').eq('id', code).single();
  if (error || !data) {
    showRoomStatus(`Room "${code}" not found!`, 'error');
    return;
  }
  onlineRoom = code;
  onlineRole = 'p2';
  await subscribeToRoom(code);
  await supabaseClient.from('rooms').update({ p2_ready: true }).eq('id', code);
  sendOnlineEvent('player_joined', { role: 'p2' });
}

// ===== SUBSCRIBE TO ROOM =====
async function subscribeToRoom(code) {
  if (onlineChannel) onlineChannel.unsubscribe();

  onlineChannel = supabaseClient.channel(`room:${code}`, {
    config: { broadcast: { self: false } }
  });

  onlineChannel
    .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
      if (onlineRole === 'p1') {
        onlineOpponentConnected = true;
        showRoomStatus(`Opponent connected! Starting...`, 'connected');
        setTimeout(() => {
          gameMode = 'online';
          startGame();
          showScreen('game');
          sendOnlineEvent('game_start', {});
        }, 800);
      }
    })
    .on('broadcast', { event: 'game_start' }, () => {
      if (onlineRole === 'p2') {
        gameMode = 'online';
        startGame();
        showScreen('game');
      }
    })
    .on('broadcast', { event: 'move' }, ({ payload }) => {
      handleOnlineMove(payload.role, payload.move);
    })
    .on('broadcast', { event: 'rematch' }, () => {
      startGame();
      showScreen('game');
    })
    .subscribe();
}

// ===== SEND ONLINE EVENT =====
function sendOnlineEvent(event, payload) {
  if (!onlineChannel) return;
  onlineChannel.send({ type: 'broadcast', event, payload });
}

// ===== HANDLE INCOMING MOVE =====
function handleOnlineMove(role, moveKey) {
  onlinePendingMoves[role] = moveKey;

  if (role !== onlineRole) {
    // Opponent locked in
    els.p2SelDisp.textContent = '✓ OPPONENT LOCKED IN';
    els.p2SelDisp.style.color = 'var(--online)';
  }

  // If we have both moves, resolve
  if (onlinePendingMoves.p1 && onlinePendingMoves.p2) {
    state.p1.move = onlinePendingMoves.p1;
    state.p2.move = onlinePendingMoves.p2;
    onlinePendingMoves = {};
    els.onlineWaiting.classList.add('hidden');
    state.phase = 'both-chosen';
    setTimeout(() => resolveRound(), 300);
  }
}

// ===== LEAVE ROOM =====
function leaveOnlineRoom() {
  if (onlineChannel) {
    onlineChannel.unsubscribe();
    onlineChannel = null;
  }
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

// ===== GAME INIT =====
function startGame() {
  state = {
    p1: { hp: 10, maxHp: 10, move: null },
    p2: { hp: 10, maxHp: 10, move: null },
    round: 1,
    phase: 'p1-choose',
    p1MoveHistory: [],
    p2LastMove: null,
  };
  onlinePendingMoves = {};
  els.battleLog.innerHTML = '';
  buildCards('p1');
  buildCards('p2');
  updateHUD();
  updateModeUI();
  hideDialog();
  setPhase('p1-choose');
}

function updateModeUI() {
  const isAI = ['easy', 'medium', 'hard'].includes(gameMode);
  const isOnline = gameMode === 'online';

  els.p1Name.textContent = isOnline ? `⚡ YOU (P1)` : 'PLAYER 1';
  els.p1Name.className = 'fighter-name p1-color';

  if (isAI) {
    const label = gameMode === 'easy' ? 'CPU — EASY' : gameMode === 'medium' ? 'CPU — MEDIUM' : 'CPU — HARD';
    els.p2Name.textContent = label;
    els.p2Name.className = 'fighter-name cpu-color';
    els.p2PanelTitle.textContent = '🤖 CPU — LOCKED IN';
    els.p2PanelTitle.style.color = 'var(--cpu)';
    els.p2Sprite.classList.add('cpu-sprite');
    els.p2Sprite.classList.remove('online-sprite');
    els.modeBadge.textContent = `VS CPU · ${gameMode.toUpperCase()}`;
    els.modeBadge.className = `mode-badge ${gameMode}`;
  } else if (isOnline) {
    const myRole = onlineRole || 'p1';
    const oppLabel = myRole === 'p1' ? 'OPPONENT (P2)' : 'OPPONENT (P1)';
    els.p1Name.textContent = myRole === 'p1' ? '⚡ YOU' : '⚡ OPPONENT';
    els.p2Name.textContent = myRole === 'p2' ? '🔥 YOU' : oppLabel;
    els.p2Name.className = 'fighter-name online-color';
    els.p2PanelTitle.textContent = `🌐 OPPONENT — CHOOSING`;
    els.p2PanelTitle.style.color = 'var(--online)';
    els.p2Sprite.classList.remove('cpu-sprite');
    els.p2Sprite.classList.add('online-sprite');
    els.modeBadge.textContent = `ONLINE · ROOM ${onlineRoom}`;
    els.modeBadge.className = 'mode-badge online';
    // In online mode only show the local player's panel
    applyOnlinePanelLayout();
  } else {
    els.p2Name.textContent = 'PLAYER 2';
    els.p2Name.className = 'fighter-name p2-color';
    els.p2PanelTitle.textContent = '🔥 PLAYER 2 — CHOOSE';
    els.p2PanelTitle.style.color = '';
    els.p2Sprite.classList.remove('cpu-sprite', 'online-sprite');
    els.modeBadge.textContent = '2 PLAYER';
    els.modeBadge.className = 'mode-badge';
  }
}

// Online: grey out opponent's card panel; only show yours
function applyOnlinePanelLayout() {
  const myPanel = onlineRole === 'p1' ? els.p1Panel : els.p2Panel;
  const oppPanel = onlineRole === 'p1' ? els.p2Panel : els.p1Panel;

  myPanel.style.opacity = '1';
  oppPanel.style.opacity = '0.5';
  // Blur/hide opponent's actual cards
  const oppCards = oppPanel.querySelectorAll('.card');
  oppCards.forEach(c => c.classList.add('online-hidden'));
}

// ===== POKÉMON DIALOGUE BOX =====
let dialogQueue = [];
let isDialogBusy = false;

function showDialog(text, duration = 0) {
  return new Promise(resolve => {
    dialogQueue.push({ text, duration, resolve });
    if (!isDialogBusy) processDialogQueue();
  });
}

async function processDialogQueue() {
  if (dialogQueue.length === 0) { isDialogBusy = false; return; }
  isDialogBusy = true;
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
      document.removeEventListener('keydown', next);
      resolve();
      processDialogQueue();
    };
    els.pokeDialog.addEventListener('click', next);
    document.addEventListener('keydown', next);
  }
}

function hideDialog() {
  els.pokeDialog.classList.add('hidden');
  dialogQueue = [];
  isDialogBusy = false;
}

function setDialogImmediate(text) {
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

    let statLine = '';
    if (move.dmg && move.dmg !== 'x2') statLine += `<span class="stat-dmg">DMG:${move.dmg}</span> `;
    if (move.dmg === 'x2') statLine += `<span class="stat-dmg">DMG:×2</span> `;
    if (move.heal) statLine += `<span class="stat-heal">+${move.heal}HP</span> `;
    if (move.defence) statLine += `<span class="stat-def">DEF:${move.defence}</span> `;
    statLine += `<span>PRI:${move.priority >= 0 ? '+' : ''}${move.priority}</span>`;

    card.innerHTML = `
      <div class="card-emoji">${move.emoji}</div>
      <div class="card-name">${move.name}</div>
      <div class="card-stats">${statLine}</div>
    `;
    card.addEventListener('click', () => selectMove(player, key, card));
    container.appendChild(card);
  });
}

// ===== SELECT MOVE =====
function selectMove(player, moveKey, cardEl) {
  // Online mode: only allow clicking your own panel
  if (gameMode === 'online') {
    const myCards = onlineRole === 'p1' ? 'p1' : 'p2';
    if (player !== myCards) return;
    if (state.phase === 'resolve') return;
    if (state[player].move !== null) return; // already chose

    const container = player === 'p1' ? els.p1Cards : els.p2Cards;
    const dispEl    = player === 'p1' ? els.p1SelDisp : els.p2SelDisp;
    container.querySelectorAll('.card').forEach(c => c.classList.remove(`selected-${player}`));
    cardEl.classList.add(`selected-${player}`);
    state[player].move = moveKey;
    dispEl.textContent = `✓ ${MOVES[moveKey].name} — LOCKED`;
    dispEl.style.color = player === 'p1' ? 'var(--p1)' : 'var(--p2)';
    lockCards(player);

    // Send to opponent
    sendOnlineEvent('move', { role: onlineRole, move: moveKey });
    // Register our own move in pending
    onlinePendingMoves[onlineRole] = moveKey;

    // Show waiting indicator
    els.onlineWaiting.classList.remove('hidden');
    els.phaseBanner.classList.add('hidden');

    // Check if both moves already in (unlikely but possible if opponent was very fast)
    if (onlinePendingMoves.p1 && onlinePendingMoves.p2) {
      state.p1.move = onlinePendingMoves.p1;
      state.p2.move = onlinePendingMoves.p2;
      onlinePendingMoves = {};
      els.onlineWaiting.classList.add('hidden');
      state.phase = 'both-chosen';
      setTimeout(() => resolveRound(), 300);
    }
    return;
  }

  // Local modes
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
    if (gameMode !== '2p') {
      setTimeout(() => triggerCpuMove(), 400);
    } else {
      setTimeout(() => setPhase('p2-choose'), 200);
    }
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
  state.p2.move = chosenKey;
  state.p2LastMove = chosenKey;

  els.p2SelDisp.textContent = `✓ MOVE LOCKED`;
  els.p2SelDisp.style.color = 'var(--cpu)';

  const p2Cards = els.p2Cards.querySelectorAll('.card');
  p2Cards.forEach(c => {
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
  const roll = Math.random();
  if (roll < 0.15) return 'BLOCK';
  if (roll < 0.25) return 'HEAL';
  const attacks = ['ATK', 'QUICK_ATK', 'HEAVY_ATK', 'COUNTER'];
  return attacks[Math.floor(Math.random() * attacks.length)];
}

function pickMediumMove() {
  const cpuHp = state.p2.hp;
  const cpuMaxHp = state.p2.maxHp;
  const cpuHpPct = cpuHp / cpuMaxHp;
  const p1Hp = state.p1.hp;

  if (cpuHpPct < 0.35 && cpuMaxHp > 1) return Math.random() < 0.65 ? 'HEAL' : 'BLOCK';
  if (p1Hp <= 2) {
    const finishers = ['HEAVY_ATK', 'QUICK_ATK', 'ATK'];
    return finishers[Math.floor(Math.random() * finishers.length)];
  }
  const weights = [
    { key: 'ATK',       w: 20 },
    { key: 'QUICK_ATK', w: 25 },
    { key: 'HEAVY_ATK', w: 20 },
    { key: 'BLOCK',     w: 20 },
    { key: 'COUNTER',   w: 10 },
    { key: 'HEAL',      w: 5  },
  ];
  return weightedPick(weights);
}

function pickHardMove() {
  const cpuHp = state.p2.hp;
  const cpuMaxHp = state.p2.maxHp;
  const cpuHpPct = cpuHp / cpuMaxHp;
  const p1Hp = state.p1.hp;
  const history = state.p1MoveHistory;

  if (cpuHpPct < 0.25 && cpuMaxHp > 1) return 'HEAL';

  const recentLen = Math.min(history.length, 4);
  const recent = history.slice(-recentLen);
  const blockCount  = recent.filter(m => m === 'BLOCK').length;
  const lastMove    = history[history.length - 1];
  const quickAtkCount = recent.filter(m => m === 'QUICK_ATK').length;
  const lastIsQuick = lastMove === 'QUICK_ATK';
  const nonQuickAttacks = recent.filter(m => ['ATK','HEAVY_ATK'].includes(m)).length;

  if (recentLen >= 2 && nonQuickAttacks >= recentLen - 1 && !lastIsQuick && Math.random() < 0.70) return 'COUNTER';
  if (quickAtkCount >= 2 && Math.random() < 0.6) return 'HEAVY_ATK';
  if (blockCount >= 2 && Math.random() < 0.55) return 'HEAVY_ATK';
  if (lastMove === 'COUNTER' && Math.random() < 0.65) return 'HEAVY_ATK';
  if (lastMove === 'HEAL' && Math.random() < 0.6) return 'QUICK_ATK';
  if (p1Hp <= 3 && Math.random() < 0.5) return 'QUICK_ATK';

  const weights = [
    { key: 'ATK',       w: 10 },
    { key: 'QUICK_ATK', w: 25 },
    { key: 'HEAVY_ATK', w: 20 },
    { key: 'BLOCK',     w: 15 },
    { key: 'COUNTER',   w: 20 },
    { key: 'HEAL',      w: cpuHpPct < 0.6 ? 15 : 5 },
  ];
  return weightedPick(weights);
}

function weightedPick(weights) {
  const total = weights.reduce((sum, w) => sum + w.w, 0);
  let r = Math.random() * total;
  for (const item of weights) {
    r -= item.w;
    if (r <= 0) return item.key;
  }
  return weights[weights.length - 1].key;
}

// ===== LOCK / UNLOCK CARDS =====
function lockCards(player) {
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  container.querySelectorAll('.card').forEach(c => {
    if (!c.classList.contains(`selected-${player}`)) c.classList.add('disabled');
  });
}

function unlockCards(player) {
  const container = player === 'p1' ? els.p1Cards : els.p2Cards;
  container.querySelectorAll('.card').forEach(c => c.classList.remove('disabled', 'selected-p1', 'selected-p2', 'online-hidden'));
  const dispEl = player === 'p1' ? els.p1SelDisp : els.p2SelDisp;
  dispEl.textContent = '— NOT YET CHOSEN —';
  dispEl.style.color = '';
}

// ===== SET PHASE =====
function setPhase(phase) {
  state.phase = phase;
  const banner = els.phaseBanner;
  banner.classList.remove('hidden', 'p2-turn', 'cpu-turn', 'online-wait');
  els.btnResolve.classList.add('hidden');
  els.cpuThinking.classList.add('hidden');
  els.onlineWaiting.classList.add('hidden');

  if (phase === 'p1-choose') {
    hideDialog();

    if (gameMode === 'online') {
      unlockCards('p1');
      unlockCards('p2');
      state.p1.move = null;
      state.p2.move = null;

      // Show the correct banner based on role
      banner.textContent = '⚡ PICK YOUR MOVE — OPPONENT PICKS SECRETLY';
      banner.classList.add('online-wait');

      // Re-apply online panel layout
      applyOnlinePanelLayout();
      // Only the local player's cards are clickable
      const oppCards = onlineRole === 'p1' ? els.p2Cards : els.p1Cards;
      oppCards.querySelectorAll('.card').forEach(c => {
        c.classList.add('disabled', 'online-hidden');
      });
      if (onlineRole === 'p2') {
        // P2's display is labelled differently
        els.p2PanelTitle.textContent = '🔥 YOU — CHOOSE';
        els.p2PanelTitle.style.color = 'var(--p2)';
        els.p1PanelTitle && (els.p1PanelTitle.textContent = '⚡ OPPONENT — CHOOSING');
      }
    } else {
      banner.textContent = '⚡ PLAYER 1 — CHOOSE YOUR MOVE';
      unlockCards('p1');
      unlockCards('p2');
      state.p1.move = null;
      state.p2.move = null;
      els.p2Cards.querySelectorAll('.card').forEach(c => c.classList.add('disabled'));
      if (gameMode !== '2p') els.p2SelDisp.textContent = '— CPU WILL CHOOSE —';
    }

  } else if (phase === 'p2-choose') {
    banner.textContent = '🔥 PLAYER 2 — CHOOSE YOUR MOVE';
    banner.classList.add('p2-turn');
    els.p2Cards.querySelectorAll('.card').forEach(c => c.classList.remove('disabled'));

  } else if (phase === 'both-chosen') {
    banner.classList.add('hidden');
    if (gameMode === '2p') {
      els.btnResolve.classList.remove('hidden');
    }
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

  logEntry(`— ROUND ${state.round} —`, 'log-info');
  logEntry(`P1: ${m1.name}  |  ${p2Label}: ${m2.name}`, 'log-info');

  // Reveal moves in online mode
  if (gameMode === 'online') {
    els.p2SelDisp.textContent = `✓ ${m2.name}`;
    // Reveal opponent cards briefly
    const oppCards = onlineRole === 'p1' ? els.p2Cards : els.p1Cards;
    oppCards.querySelectorAll('.card').forEach(c => {
      c.classList.remove('online-hidden');
      if (c.dataset.move === state.p2.move && onlineRole === 'p1') c.classList.add('selected-p2');
      else if (c.dataset.move === state.p1.move && onlineRole === 'p2') c.classList.add('selected-p1');
      else c.classList.add('disabled');
    });
  }
  if (gameMode !== '2p' && gameMode !== 'online') els.p2SelDisp.textContent = `✓ ${m2.name}`;

  const p1Priority = m1.priority;
  const p2Priority = m2.priority;

  if (p1Priority === p2Priority) {
    await applySimultaneous(m1, m2);
  } else if (p1Priority > p2Priority) {
    await applyTurn('p1', m1, 'p2', m2);
    if (!isGameOver()) await applyTurn('p2', m2, 'p1', m1, true);
  } else {
    await applyTurn('p2', m2, 'p1', m1);
    if (!isGameOver()) await applyTurn('p1', m1, 'p2', m2, true);
  }

  updateHUD();

  if (isGameOver()) {
    await delay(500);
    endGame();
    return;
  }

  state.round++;
  els.roundNum.textContent = state.round;
  await delay(200);
  setPhase('p1-choose');
}

// ===== APPLY SIMULTANEOUS =====
async function applySimultaneous(m1, m2) {
  const dmg1To2 = calcDamage('p1', m1, 'p2', m2);
  const dmg2To1 = calcDamage('p2', m2, 'p1', m1);
  const heal1 = m1.heal || 0;
  const heal2 = m2.heal || 0;
  const def2 = m2.defence || 0;
  const def1 = m1.defence || 0;

  const actual1To2 = Math.max(0, dmg1To2 - def2);
  const actual2To1 = Math.max(0, dmg2To1 - def1);

  applyDamage('p2', actual1To2, 'p1', m1);
  applyDamage('p1', actual2To1, 'p2', m2);
  applyHealEffect('p1', heal1, m1);
  applyHealEffect('p2', heal2, m2);

  await animateMoves('p1', m1, 'p2', m2, actual1To2, actual2To1);
  updateHUD();
}

// ===== APPLY TURN =====
async function applyTurn(attacker, atkMove, defender, defMove, isSecondTurn = false) {
  const p2Label = gameMode === 'online' ? 'Opponent' : gameMode !== '2p' ? 'CPU' : 'P2';
  const attackerLabel = attacker === 'p1' ? 'Player 1' : p2Label;
  const defenderLabel = defender === 'p1' ? 'Player 1' : p2Label;

  const dmg = calcDamage(attacker, atkMove, defender, defMove);
  const heal = atkMove.heal || 0;
  const defenderDef = defMove.defence || 0;
  const actualDmg = Math.max(0, dmg - defenderDef);

  if (atkMove.name === 'BLOCK') {
    await showDialog(`${attackerLabel} takes a defensive stance!\nIncoming damage reduced by 2.`, 1600);
  } else if (atkMove.name === 'HEAL') {
    await showDialog(`${attackerLabel} is recovering HP!\n+6 HP restored! (Max HP -2)`, 1600);
  } else if (atkMove.name === 'COUNTER') {
    const isDefenderAttacking = ['ATK', 'HEAVY ATK'].includes(defMove.name);
    const isQuickAtk = defMove.name === 'QUICK ATK';
    if (isQuickAtk) {
      await showDialog(`${attackerLabel}'s COUNTER failed!\n${defenderLabel}'s QUICK ATK was too fast to reflect!`, 2000);
    } else if (!isDefenderAttacking) {
      await showDialog(`${attackerLabel}'s COUNTER failed!\nThere was no attack to reflect — turn wasted!`, 2000);
    } else {
      await showDialog(`${attackerLabel}'s COUNTER activated!\nReflecting ${actualDmg} damage back at ${defenderLabel}!`, 2000);
    }
  } else {
    if (actualDmg > 0) {
      await showDialog(`${attackerLabel}'s ${atkMove.name} hits!\n${defenderLabel} takes ${actualDmg} damage!`, 1600);
    } else {
      await showDialog(`${attackerLabel}'s ${atkMove.name} was blocked!\n${defenderLabel}'s guard held firm!`, 1600);
    }
  }

  applyDamage(defender, actualDmg, attacker, atkMove);
  applyHealEffect(attacker, heal, atkMove);
  await animateSingleTurn(attacker, atkMove, defender, defMove, actualDmg);
  updateHUD();
}

// ===== CALC DAMAGE =====
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
    const defDmg = defMove.dmg || 0;
    logEntry(`${attacker.toUpperCase()} COUNTERS — reflects ${defDmg * 2} dmg!`, 'log-dmg');
    return defDmg * 2;
  }
  return atkMove.dmg || 0;
}

// ===== APPLY DAMAGE =====
function applyDamage(target, amount, source, srcMove) {
  if (amount <= 0) return;
  state[target].hp = Math.max(0, state[target].hp - amount);
  const p2Label = gameMode === 'online' ? 'OPP' : gameMode !== '2p' ? 'CPU' : 'P2';
  const srcLabel = source === 'p2' ? p2Label : 'P1';
  const tgtLabel = target === 'p2' ? p2Label : 'P1';
  logEntry(`${srcLabel} hits ${tgtLabel} for ${amount} dmg!`, 'log-dmg');
  const type = srcMove && srcMove.name === 'COUNTER' ? 'counter' : 'dmg';
  spawnDamageNumber(target, amount, type);
}

// ===== APPLY HEAL =====
function applyHealEffect(player, amount, move) {
  if (amount <= 0) return;
  state[player].maxHp = Math.max(1, state[player].maxHp - 2);
  state[player].hp = Math.min(state[player].maxHp, state[player].hp + amount);
  const p2Label = gameMode === 'online' ? 'OPP' : gameMode !== '2p' ? 'CPU' : 'P2';
  const label = player === 'p2' ? p2Label : 'P1';
  logEntry(`${label} heals! HP: ${state[player].hp}/${state[player].maxHp}`, 'log-heal');
  spawnDamageNumber(player, amount, 'heal');
}

// ===== CINEMATIC ANIMATION ENGINE =====
let particleCanvas, particleCtx;
function initParticleCanvas() {
  if (particleCanvas) return;
  particleCanvas = document.createElement('canvas');
  particleCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:998;';
  document.body.appendChild(particleCanvas);
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
  particleCtx = particleCanvas.getContext('2d');
  window.addEventListener('resize', () => {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
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
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.04 + Math.random() * 0.04,
      size: 2 + Math.random() * 4,
      color,
    });
  }
  animateParticles(particles);
}

function animateParticles(particles) {
  let alive = true;
  function frame() {
    if (!alive) return;
    particleCtx.fillStyle = 'rgba(0,0,0,0.25)';
    particleCtx.fillRect(0, 0, particleCanvas.width, particleCanvas.height);
    alive = false;
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18; p.vx *= 0.96;
      p.life -= p.decay;
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
    const progress = elapsed / duration;
    const damping = 1 - progress;
    const dx = (Math.random() - 0.5) * intensity * 2 * damping;
    const dy = (Math.random() - 0.5) * intensity * damping;
    game.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(shake);
  }
  requestAnimationFrame(shake);
}

function zoomPunch(spriteEl, scale = 1.35, duration = 300) {
  return new Promise(resolve => {
    const isP2 = spriteEl.classList.contains('p2-sprite');
    const baseScale = isP2 ? 'scaleX(-1)' : '';
    spriteEl.style.transition = `transform ${duration * 0.4}ms cubic-bezier(0.2,1.6,0.4,1)`;
    spriteEl.style.transform = `${baseScale} scale(${scale})`;
    setTimeout(() => {
      spriteEl.style.transition = `transform ${duration * 0.6}ms ease`;
      spriteEl.style.transform = baseScale ? baseScale : '';
      setTimeout(() => { spriteEl.style.transition = ''; spriteEl.style.transform = ''; resolve(); }, duration * 0.6);
    }, duration * 0.4);
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
    const isP2 = spriteEl.classList.contains('p2-sprite');
    const baseFlip = isP2 ? 'scaleX(-1)' : '';
    const dist = direction * 65;
    spriteEl.style.transition = 'transform 180ms cubic-bezier(0.2,1.4,0.4,1)';
    spriteEl.style.transform = `${baseFlip} translateX(${dist}px) scale(1.18)`;
    setTimeout(() => {
      spriteEl.style.transition = 'transform 340ms ease';
      spriteEl.style.transform = baseFlip ? baseFlip : '';
      setTimeout(() => { spriteEl.style.transition = ''; spriteEl.style.transform = ''; resolve(); }, 340);
    }, 180);
  });
}

function recoilHit(spriteEl, direction = -1) {
  return new Promise(resolve => {
    const isP2 = spriteEl.classList.contains('p2-sprite');
    const baseFlip = isP2 ? 'scaleX(-1)' : '';
    const dist = direction * 50;
    spriteEl.style.transition = 'transform 100ms ease';
    spriteEl.style.transform = `${baseFlip} translateX(${dist}px) scale(0.9)`;
    setTimeout(() => {
      spriteEl.style.transition = 'transform 500ms cubic-bezier(0.2,1.2,0.4,1)';
      spriteEl.style.transform = baseFlip ? baseFlip : '';
      setTimeout(() => { spriteEl.style.transition = ''; spriteEl.style.transform = ''; resolve(); }, 500);
    }, 100);
  });
}

function spriteFlash(spriteEl, color = '#fff', times = 3) {
  return new Promise(resolve => {
    let count = 0;
    const interval = setInterval(() => {
      spriteEl.style.filter = count % 2 === 0
        ? `brightness(4) drop-shadow(0 0 18px ${color})`
        : `brightness(1) drop-shadow(0 0 4px ${color})`;
      count++;
      if (count >= times * 2) { clearInterval(interval); spriteEl.style.filter = ''; resolve(); }
    }, 90);
  });
}

function healGlow(spriteEl) {
  return new Promise(resolve => {
    spriteEl.style.transition = 'filter 300ms ease, transform 300ms ease';
    spriteEl.style.filter = 'brightness(2.5) drop-shadow(0 0 30px #2ecc71) hue-rotate(100deg)';
    spriteEl.style.transform = spriteEl.classList.contains('p2-sprite') ? 'scaleX(-1) scale(1.3)' : 'scale(1.3)';
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
  for (let i = 0; i < 28; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 50, y: y + Math.random() * 20,
      vx: (Math.random() - 0.5) * 2.5, vy: -(2.5 + Math.random() * 5),
      life: 1, decay: 0.018 + Math.random() * 0.015, size: 4 + Math.random() * 5,
      color: `hsl(${110 + Math.random() * 50}, 85%, 60%)`,
    });
  }
  animateParticles(particles);
}

function blockFlash(spriteEl) {
  return new Promise(resolve => {
    const isP2 = spriteEl.classList.contains('p2-sprite');
    const baseFlip = isP2 ? 'scaleX(-1)' : '';
    spriteEl.style.transition = 'filter 150ms, transform 150ms';
    spriteEl.style.filter = 'brightness(2.5) drop-shadow(0 0 24px #4af0c8)';
    spriteEl.style.transform = `${baseFlip} scale(0.88) translateX(${isP2 ? '-' : ''}8px)`;
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

  if (moveName === 'HEAL') {
    await healGlow(atkSprite);
    await delay(300);
  } else if (moveName === 'BLOCK') {
    await blockFlash(atkSprite);
    await delay(200);
  } else if (moveName === 'COUNTER') {
    if (dmg > 0) {
      await lungePunch(defSprite, atkDir * -1);
      await hitFreeze(150);
      await Promise.all([spriteFlash(atkSprite, '#b04aff', 3), recoilHit(defSprite, atkDir)]);
      await delay(200);
      await hitFreeze(300);
      await lungePunch(atkSprite, atkDir);
      const center = getSpriteCenter(defSprite);
      spawnImpactParticles(center.x, center.y, '#b04aff', 36);
      await Promise.all([
        hitFreeze(400), screenShake(18, 700),
        spriteFlash(defSprite, '#ff4444', 6),
        recoilHit(defSprite, atkDir * -1),
        flashHitCinematic(defender, '#b04aff'),
      ]);
      await delay(300);
    } else {
      spriteFlash(atkSprite, '#555555', 3);
      await delay(600);
    }
  } else {
    const isHeavy = moveName === 'HEAVY ATK';
    const isQuick = moveName === 'QUICK ATK';
    if (isHeavy) { await zoomPunch(atkSprite, 1.2, 300); await hitFreeze(200); }
    await lungePunch(atkSprite, atkDir);
    if (dmg > 0) {
      const center = getSpriteCenter(defSprite);
      const impactColor = attacker === 'p1' ? '#f7c948' : '#e03c3c';
      const particleCount = isHeavy ? 40 : isQuick ? 18 : 24;
      spawnImpactParticles(center.x, center.y, impactColor, particleCount);
      if (isHeavy) setTimeout(() => spawnImpactParticles(center.x, center.y, '#ff8800', 20), 120);
      const freezeDur = isHeavy ? 400 : isQuick ? 150 : 250;
      const shakeMag  = isHeavy ? 20  : isQuick ? 8   : 12;
      const shakeDur  = isHeavy ? 700 : isQuick ? 350 : 500;
      const flashTimes = isHeavy ? 7  : isQuick ? 3   : 4;
      await Promise.all([
        hitFreeze(freezeDur), screenShake(shakeMag, shakeDur),
        spriteFlash(defSprite, impactColor, flashTimes),
        recoilHit(defSprite, atkDir * -1),
        flashHitCinematic(defender, impactColor),
      ]);
      await delay(isHeavy ? 250 : 100);
    }
  }
  [atkSprite, defSprite].forEach(s => { s.style.filter = ''; s.style.transform = ''; s.style.transition = ''; });
}

async function animateMoves(p1, m1, p2, m2, dmg1, dmg2) {
  initParticleCanvas();
  const sprite1 = els.p1Sprite;
  const sprite2 = els.p2Sprite;

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
    spawnImpactParticles(center.x, center.y, '#f7c948', 24);
    impactPromises.push(spriteFlash(sprite2, '#f7c948', 4));
    impactPromises.push(recoilHit(sprite2, 1));
    impactPromises.push(flashHitCinematic('p2', '#f7c948'));
  }
  if (dmg2 > 0) {
    const center = getSpriteCenter(sprite1);
    spawnImpactParticles(center.x, center.y, '#e03c3c', 24);
    impactPromises.push(spriteFlash(sprite1, '#e03c3c', 4));
    impactPromises.push(recoilHit(sprite1, -1));
    impactPromises.push(flashHitCinematic('p1', '#e03c3c'));
  }
  if (impactPromises.length) {
    await Promise.all([hitFreeze(260), screenShake(12, 500), ...impactPromises]);
  }
  await delay(200);
  [sprite1, sprite2].forEach(s => { s.style.filter = ''; s.style.transform = ''; s.style.transition = ''; });
}

function flashHitCinematic(player, color) {
  const overlay = els.hitOverlay;
  const hex = color || (player === 'p1' ? 'rgba(247,201,72,0.3)' : 'rgba(224,60,60,0.35)');
  overlay.style.background = hex;
  overlay.style.opacity = '1';
  return new Promise(resolve => {
    setTimeout(() => {
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.style.transition = ''; resolve(); }, 300);
    }, 60);
  });
}

// ===== FLOATING DAMAGE NUMBERS =====
function spawnDamageNumber(target, amount, type = 'dmg') {
  const sprite = target === 'p1' ? els.p1Sprite : els.p2Sprite;
  const rect = sprite.getBoundingClientRect();
  const el = document.createElement('div');
  const colors = { dmg: '#ff4444', heal: '#2ecc71', counter: '#b04aff' };
  const symbols = { dmg: `-${amount}`, heal: `+${amount}`, counter: `×${amount}` };
  el.style.cssText = `
    position:fixed;
    left:${rect.left + rect.width / 2}px;
    top:${rect.top}px;
    font-family:var(--font-title);
    font-size:${type === 'counter' ? '2.2rem' : amount >= 2 ? '2rem' : '1.6rem'};
    color:${colors[type] || colors.dmg};
    text-shadow: 2px 2px 0 #000, 0 0 20px ${colors[type] || colors.dmg};
    pointer-events:none;
    z-index:1000;
    transform:translate(-50%,-50%);
    animation:dmgFloat 0.9s cubic-bezier(0.2,1.4,0.4,1) forwards;
  `;
  el.textContent = symbols[type] || symbols.dmg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function updateHUD() {
  updatePlayerHUD('p1');
  updatePlayerHUD('p2');
}

function updatePlayerHUD(player) {
  const p = state[player];
  const pct = Math.max(0, (p.hp / p.maxHp) * 100);
  const bar = player === 'p1' ? els.p1HpBar : els.p2HpBar;
  const txt = player === 'p1' ? els.p1HpText : els.p2HpText;
  bar.style.width = pct + '%';
  bar.classList.remove('low', 'mid');
  if (pct <= 25) bar.classList.add('low');
  else if (pct <= 60) bar.classList.add('mid');
  txt.textContent = `${p.hp} / ${p.maxHp}`;
}

function logEntry(msg, cls = '') {
  const div = document.createElement('div');
  div.className = `log-entry ${cls}`;
  div.textContent = msg;
  els.battleLog.appendChild(div);
  els.battleLog.scrollTop = els.battleLog.scrollHeight;
}

function isGameOver() {
  return state.p1.hp <= 0 || state.p2.hp <= 0;
}

function endGame() {
  let winnerText, subText;
  const isAI = ['easy', 'medium', 'hard'].includes(gameMode);
  const isOnline = gameMode === 'online';

  if (state.p1.hp <= 0 && state.p2.hp <= 0) {
    winnerText = 'DOUBLE K.O. — DRAW!';
    subText = 'Both fighters fall...';
  } else if (state.p1.hp <= 0) {
    if (isOnline) {
      winnerText = onlineRole === 'p2' ? '🔥 YOU WIN!' : '💀 YOU LOSE!';
      subText = onlineRole === 'p2' ? getVictoryFlair(state.p2.hp, state.p2.maxHp) : 'Better luck next time!';
    } else {
      winnerText = isAI ? `🤖 CPU WINS! (${gameMode.toUpperCase()})` : '🔥 PLAYER 2 WINS!';
      subText = isAI ? getCpuVictoryTaunt(gameMode) : getVictoryFlair(state.p2.hp, state.p2.maxHp);
    }
  } else {
    if (isOnline) {
      winnerText = onlineRole === 'p1' ? '⚡ YOU WIN!' : '💀 YOU LOSE!';
      subText = onlineRole === 'p1' ? getVictoryFlair(state.p1.hp, state.p1.maxHp) : 'Better luck next time!';
    } else {
      winnerText = '⚡ PLAYER 1 WINS!';
      subText = isAI ? getPlayerVictoryTaunt(gameMode) : getVictoryFlair(state.p1.hp, state.p1.maxHp);
    }
  }

  els.resultWinner.textContent = winnerText;
  els.resultSub.textContent = subText;
  showScreen('result');
}

function getVictoryFlair(hp, maxHp) {
  const pct = hp / maxHp;
  if (pct >= 0.8) return 'FLAWLESS VICTORY';
  if (pct >= 0.5) return 'Dominant Victory';
  if (pct >= 0.3) return 'Hard-Fought Victory';
  return 'Barely Survived...';
}

function getCpuVictoryTaunt(diff) {
  const taunts = {
    easy:   ['EVEN EASY MODE BEAT YOU...', 'Rookie mistake.', 'Try again, champ.'],
    medium: ['The CPU learns from you.', 'Pattern detected. Pattern punished.', 'A solid defeat.'],
    hard:   ['CALCULATED.', 'Your moves were predictable.', 'Perfect read. Every round.'],
  };
  const arr = taunts[diff] || taunts.medium;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPlayerVictoryTaunt(diff) {
  const taunts = {
    easy:   ['Warm-up complete!', 'Nice one, now try MEDIUM.', 'Easy mode conquered!'],
    medium: ['Strong reads!', 'The CPU never saw it coming.', 'Solid strategy!'],
    hard:   ['IMPOSSIBLE... yet here we are.', 'HARD MODE DESTROYED!', 'Flawless tactical mastery.'],
  };
  const arr = taunts[diff] || taunts.medium;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ===== UTILS =====
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== INIT =====
showScreen('title');
