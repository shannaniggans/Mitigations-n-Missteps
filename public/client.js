(() => {
  const DEFAULT_CARD_SPACES = [4, 9, 13, 18, 22, 27, 33, 38, 44, 49, 55, 60, 66, 72, 78, 83, 88, 94];
  const socket = io();
  const boardEl = document.getElementById('board');
  const boardWrap = document.getElementById('board-wrap');
  const piecesLayer = document.getElementById('pieces-layer');
  const feedEl = document.getElementById('feed');
  const playersEl = document.getElementById('players');
  const rollBtn = document.getElementById('roll-btn');
  const resetBtn = document.getElementById('reset-btn');
  const joinForm = document.getElementById('join-form');
  const statusDot = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');
  const turnHint = document.getElementById('turn-hint');
  const lastRoll = document.getElementById('last-roll');
  const lastEvent = document.getElementById('last-event');
  const connectionHint = document.getElementById('connection-hint');
  const handEl = document.getElementById('hand');
  const discardEl = document.getElementById('discard');
  const cardDraw = document.getElementById('card-draw');
  const cardDrawType = document.getElementById('card-draw-type');
  const cardDrawTitle = document.getElementById('card-draw-title');
  const cardDrawDesc = document.getElementById('card-draw-desc');
  const cardDrawActions = document.getElementById('card-draw-actions');
  if (cardDraw) {
    cardDraw.addEventListener('click', (e) => {
      if (e.target === cardDraw || e.target.classList.contains('card-backdrop')) {
        hideCard();
      }
    });
  }
  if (cardDraw) {
    cardDraw.addEventListener('click', (e) => {
      if (e.target === cardDraw || e.target.classList.contains('card-backdrop')) {
        hideCard();
      }
    });
  }

  const state = {
    playerId: null,
    roomId: null,
    cardSpaces: DEFAULT_CARD_SPACES,
    lastActionId: 0,
    feed: [],
    pendingMitigation: null,
    discards: [],
    lastModalAction: 0
  };

  const cellMap = new Map();
  let lastSnapshot = null;
  let boardBuilt = false;
  let renderedCardSpaces = DEFAULT_CARD_SPACES;
  let boardSize = 100;
  let hasAnimated = false;

  const randomDefaultName = `Analyst-${Math.floor(Math.random() * 900 + 100)}`;
  const randomRoomCode = generateRoomCode();
  document.getElementById('name').value = randomDefaultName;
  const roomInput = document.getElementById('room');
  roomInput.value = randomRoomCode;
  roomInput.placeholder = randomRoomCode;

  socket.on('connect', () => {
    connectionHint.textContent = 'Connected. Join or share a room code to start.';
    statusDot.style.background = '#7cf2c9';
    statusLabel.textContent = 'Connected';
    runEntranceAnimations();
  });

  socket.on('disconnect', () => {
    connectionHint.textContent = 'Disconnected. Reconnect or refresh.';
    statusDot.style.background = '#f78f8f';
    statusLabel.textContent = 'Disconnected';
    rollBtn.disabled = true;
    boardWrap?.classList.remove('joined');
    hideModal();
  });

  socket.on('joined', ({ playerId, roomId }) => {
    state.playerId = playerId;
    state.roomId = roomId;
    state.feed = [];
    state.lastActionId = 0;
    state.lastModalAction = 0;
    renderFeed();
    connectionHint.textContent = `Joined room ${roomId}. Share the code to invite others.`;
    resetBtn.disabled = false;
    statusLabel.textContent = `In room ${roomId}`;
    statusDot.style.background = '#7cf2c9';
    boardWrap?.classList.add('joined');
    runEntranceAnimations();
  });

  socket.on('state', (snapshot) => {
    state.cardSpaces = snapshot.cardSpaces || DEFAULT_CARD_SPACES;
    boardSize = snapshot.boardSize || 100;
    state.pendingMitigation = snapshot.pendingMitigation || null;
    state.discards = snapshot.discards || [];
    lastSnapshot = snapshot;

    if (snapshot.lastAction && snapshot.lastAction.reset) {
      state.feed = [];
      state.lastActionId = 0;
      renderFeed();
    }

    if (!boardBuilt || boardNeedsRebuild(state.cardSpaces)) {
      buildBoard(state.cardSpaces);
    }
    if (boardWrap && state.playerId) {
      boardWrap.classList.add('joined');
    }
    renderTokens(snapshot);
    renderPlayers(snapshot);
    renderHand(snapshot);
    renderDiscard(snapshot);
    renderStatus(snapshot);
    maybeAddToFeed(snapshot.lastAction, snapshot.actionCounter);
    maybePromptInitialMitigation(snapshot);
    maybeShowCard(snapshot);
    maybeCelebrate(snapshot);
  });

  socket.on('toast', ({ message }) => {
    connectionHint.textContent = message;
  });

  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim() || randomDefaultName;
    const room = document.getElementById('room').value.trim() || randomRoomCode;
    socket.emit('joinRoom', { name, roomId: room });
  });

  rollBtn.addEventListener('click', () => {
    socket.emit('roll');
  });

  resetBtn.addEventListener('click', () => {
    socket.emit('reset');
  });

  window.addEventListener('resize', () => {
    if (lastSnapshot) {
      renderTokens(lastSnapshot);
    }
  });

  function buildBoard(cardSpaces) {
    boardEl.innerHTML = '';
    cellMap.clear();
    const size = boardSize || 64;
    const cols = 8;
    const rows = 8;
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    for (let cell = 1; cell <= size; cell += 1) {
      const { row, col } = toGrid(cell);
      const div = document.createElement('div');
      div.className = 'cell';
      div.style.gridRow = row;
      div.style.gridColumn = col;
      // Alternate background like the illustrated board.
      if ((row + col) % 2 === 0) {
        div.classList.add('alt');
      }
      if (cell === 1) {
        const start = document.createElement('span');
        start.className = 'badge start';
        start.textContent = 'Start Here';
        div.appendChild(start);
      }
      div.dataset.cell = cell;
      if (cell !== 1) {
        const num = document.createElement('span');
        num.textContent = cell - 1;
        div.appendChild(num);
      }

      if (cardSpaces.includes(cell)) {
        const badge = document.createElement('span');
        badge.className = 'badge card';
        badge.textContent = 'Draw';
        div.appendChild(badge);
      }

      boardEl.appendChild(div);
      cellMap.set(cell, div);
    }
    boardBuilt = true;
    renderedCardSpaces = [...cardSpaces];
  }

  function maybeCelebrate(snapshot) {
    if (!snapshot.winner || !window.confetti) return;
    const winner = snapshot.players.find((p) => p.id === snapshot.winner);
    window.confetti({
      particleCount: 160,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#e28e55', '#5da89d', '#4c8c4f', '#f4ecd7', '#ff8a00']
    });
    connectionHint.textContent = winner ? `${winner.name} wins!` : 'We have a winner!';
  }

  function boardNeedsRebuild(cardSpaces = []) {
    if (cardSpaces.length !== renderedCardSpaces.length) return true;
    const a = [...cardSpaces].sort((x, y) => x - y);
    const b = [...renderedCardSpaces].sort((x, y) => x - y);
    return a.some((cell, idx) => cell !== b[idx]);
  }

  function toGrid(cell) {
    const zeroIndexed = cell - 1;
    const cols = 8;
    const rows = 8;
    const rowFromBottom = Math.floor(zeroIndexed / cols);
    const colInRow = zeroIndexed % cols;
    const isEvenRow = rowFromBottom % 2 === 0;
    const col = isEvenRow ? colInRow + 1 : cols - colInRow;
    const row = rows - rowFromBottom;
    return { row, col };
  }

  function getCellCenter(cell) {
    const el = cellMap.get(cell);
    if (!el) return null;
    const cellRect = el.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    return {
      x: cellRect.left - boardRect.left + cellRect.width / 2,
      y: cellRect.top - boardRect.top + cellRect.height / 2
    };
  }

  function getOffboardCenter(count) {
    const boardRect = boardEl.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return null;
    const x = -24; // render just outside the left edge
    const y = boardRect.height - 24 - (count > 0 ? (count - 1) * 40 : 0);
    return { x, y };
  }

  function renderTokens(snapshot) {
    piecesLayer.innerHTML = '';
    const grouped = new Map();
    snapshot.players.forEach((p) => {
      const key = p.position || 1;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(p);
    });

    grouped.forEach((players, cell) => {
      const isOffboard = cell <= 0;
      const center = isOffboard ? getOffboardCenter(players.length) : getCellCenter(cell);
      if (!center) return;
      players.forEach((player, idx) => {
        let x = center.x;
        let y = center.y;
        if (!isOffboard && players.length > 1) {
          const angle = (idx / players.length) * Math.PI * 2;
          const radius = 18;
          x = center.x + Math.cos(angle) * radius;
          y = center.y + Math.sin(angle) * radius;
        } else if (isOffboard && players.length > 1) {
          y = center.y - idx * 40;
        }
        const token = document.createElement('div');
        token.className = 'token';
        token.style.background = player.color;
        token.style.left = `${x}px`;
        token.style.top = `${y}px`;
        token.textContent = player.name.slice(0, 2).toUpperCase();
        piecesLayer.appendChild(token);
      });
    });
  }

  function renderPlayers(snapshot) {
    playersEl.innerHTML = '';
    snapshot.players.forEach((player) => {
      const li = document.createElement('li');
      const dot = document.createElement('div');
      dot.className = 'token-dot';
      dot.style.background = player.color;
      const name = document.createElement('div');
      const handCount = Array.isArray(player.hand) ? player.hand.length : 0;
      const loc = formatSquareLabel(player.position);
      name.innerHTML = `<strong>${player.name}</strong><br><span class="muted">${loc} • ${handCount} mitigations</span>`;
      const status = document.createElement('span');
      status.className = 'tag';
      if (snapshot.winner === player.id) {
        status.textContent = 'Winner';
      } else if (snapshot.currentTurn === player.id) {
        status.textContent = 'Rolling';
      } else {
        status.textContent = 'Waiting';
      }
      li.appendChild(dot);
      li.appendChild(name);
      li.appendChild(status);
      playersEl.appendChild(li);
    });
  }

  function renderHand(snapshot) {
    handEl.innerHTML = '';
    const me = snapshot.players.find((p) => p.id === state.playerId);
    if (!me) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'Join a room to receive mitigation cards.';
      handEl.appendChild(li);
      return;
    }

    const pending = snapshot.pendingMitigation;
    if (pending && pending.playerId === state.playerId) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>Misstep drawn:</strong> ${pending.card.label}<br><span class="muted">Choose a mitigation or take the setback.</span>`;
      const actions = document.createElement('div');
      actions.style.display = 'grid';
      actions.style.gap = '0.35rem';
      actions.style.marginTop = '0.5rem';
      (pending.mitigationOptions || []).forEach((card) => {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = `Use: ${card.label}`;
        btn.onclick = () => socket.emit('useMitigation', { mitigationId: card.id });
        actions.appendChild(btn);
      });
      const skip = document.createElement('button');
      skip.className = 'btn ghost';
      skip.textContent = 'Take the misstep';
      skip.onclick = () => socket.emit('acceptMisstep');
      actions.appendChild(skip);
      li.appendChild(actions);
      handEl.appendChild(li);
    }

    if (!me.hand || !me.hand.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'No mitigation cards left.';
      handEl.appendChild(li);
      return;
    }

    me.hand.forEach((card) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${card.label}</strong><br><span class="muted">Mitigates: ${card.mitigates.join(', ')}</span>`;
      handEl.appendChild(li);
    });
  }

  function renderStatus(snapshot) {
    const isPending = snapshot.pendingMitigation && snapshot.pendingMitigation.playerId === state.playerId;
    const isYourTurn = snapshot.currentTurn === state.playerId && !snapshot.winner && !isPending;
    rollBtn.disabled = !isYourTurn;
    resetBtn.disabled = !state.playerId;

    if (snapshot.lastAction) {
      if (snapshot.lastAction.roll) {
        lastRoll.textContent = snapshot.lastAction.roll;
      }
      lastEvent.textContent = describeAction(snapshot.lastAction);
    } else {
      lastRoll.textContent = '–';
      lastEvent.textContent = '–';
    }

    if (snapshot.winner) {
      const winner = snapshot.players.find((p) => p.id === snapshot.winner);
      turnHint.textContent = winner
        ? `${winner.name} reached the top! Reset to replay.`
        : 'Someone reached the top! Reset to replay.';
    } else if (!state.playerId) {
      turnHint.textContent = 'Join a room to start rolling.';
    } else if (!snapshot.players.length) {
      turnHint.textContent = 'Waiting for players to join.';
    } else if (isPending) {
      turnHint.textContent = 'Choose a mitigation or take the misstep.';
    } else if (isYourTurn) {
      turnHint.textContent = 'Your move. Roll when ready.';
    } else {
      const current = snapshot.players.find((p) => p.id === snapshot.currentTurn);
      turnHint.textContent = current ? `${current.name} is rolling now.` : 'Waiting for turn order.';
    }

    if (statusLabel) statusLabel.textContent = snapshot.roomId ? `Room ${snapshot.roomId}` : 'Not joined';
    if (statusDot) statusDot.style.background = state.playerId ? '#7cf2c9' : '#a5adba';
  }

  function renderDiscard(snapshot) {
    discardEl.innerHTML = '';
    if (!snapshot.discards || !snapshot.discards.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'No mitigations used yet.';
      discardEl.appendChild(li);
      return;
    }
    snapshot.discards.slice().reverse().forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'used';
      li.innerHTML = `<strong>${entry.name}</strong> used <span class="muted">${entry.mitigation.label}</span>`;
      discardEl.appendChild(li);
    });
  }

  function generateRoomCode() {
    const words = [
      'shadow', 'signal', 'cipher', 'lock', 'patch', 'beacon', 'shield', 'pivot', 'trace', 'forge',
      'lattice', 'vector', 'intel', 'summit', 'rally', 'bastion', 'stack', 'delta', 'quartz', 'ember'
    ];
    const pick = () => words[Math.floor(Math.random() * words.length)];
    return `${pick()}-${pick()}`;
  }


  function describeAction(action) {
    if (!action) return '-';
    if (action.reset) return `${action.name} reset the board`;
    const name = action.name || 'Someone';
    const rollPart = action.roll ? `rolled ${action.roll}` : 'moved';
    const hasFrom = action.from !== undefined && action.from !== null;
    const fromLabel = hasFrom ? formatSquareLabel(action.from) : '';
    const toLabel = formatSquareLabel(action.to);
    const fromTo = hasFrom ? ` (${fromLabel}→${toLabel})` : ` to ${toLabel}`;
    if (action.intel) {
      if (action.success && action.card) {
        return `${name} shared intel (roll ${action.roll}) and gained ${action.card.label}`;
      }
      return `${name} shared intel (roll ${action.roll}) but gained nothing`;
    }
    if (!action.card) return `${name} ${rollPart}${fromTo}`;
    const card = action.card;
    const deltaText = card.delta ? `${card.delta > 0 ? '+' : ''}${card.delta}` : '';
    if (card.pending) {
      return `${name} drew MISSTEP: ${card.label} (choose mitigation)`;
    }
    if (card.learned && card.mitigation) {
      return `${name} drew MISSTEP: ${card.label} but auto-mitigated via prior ${card.mitigation.label}`;
    }
    if (card.noMatch) {
      return `${name} drew MISSTEP: ${card.label} (no matching mitigation) → ${toLabel}`;
    }
    if (card.type === 'control') {
      return `${name} drew CONTROL: ${card.label} (${deltaText}) → ${toLabel}`;
    }
    if (card.mitigated) {
      return `${name} drew MISSTEP: ${card.label} but mitigated with ${card.mitigation?.label || 'a card'}`;
    }
    return `${name} drew MISSTEP: ${card.label} (${deltaText}) → ${toLabel}`;
  }

  function formatSquareLabel(position) {
    if (!Number.isFinite(position) || position <= 0) return 'Off board';
    if (position === 1) return 'Start Here';
    return `Square ${position - 1}`;
  }

  function maybeAddToFeed(action, actionCounter) {
    if (!action) return;
    const desc = describeAction(action);
    const seq = Number.isFinite(actionCounter) ? actionCounter : null;
    const id = action.id ?? seq ?? Date.now();
    if (action.reset) {
      state.feed = [];
      state.lastActionId = id;
      renderFeed();
      return;
    }
    const alreadySeen = id === state.lastActionId || (state.feed[0] && state.feed[0] === desc);
    if (alreadySeen) return;

    state.lastActionId = id;
    if (desc) state.feed.unshift(desc);
    if (state.feed.length > 8) state.feed.pop();
    renderFeed();
  }

  function renderFeed() {
    feedEl.innerHTML = '';
    if (!state.feed.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'No moves yet.';
      feedEl.appendChild(li);
      return;
    }
    state.feed.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      feedEl.appendChild(li);
    });
  }

  function maybePromptInitialMitigation(snapshot) {
    const me = snapshot.players.find((p) => p.id === state.playerId);
    if (!me || !me.needsInitialMitigation) return;
    if (!Array.isArray(me.hand) || !me.hand.length) return;

    cardDraw.classList.remove('hidden');
    cardDraw.dataset.type = 'implement';
    cardDrawType.textContent = 'IMPLEMENT';
    cardDrawType.classList.remove('control', 'misstep');
    cardDrawTitle.textContent = 'Choose a mitigation to implement now';
    cardDrawDesc.textContent = 'Implemented mitigations will auto-cancel matching missteps later.';

    cardDrawActions.innerHTML = '';
    me.hand.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = c.label;
      btn.onclick = () => {
        socket.emit('selectInitialMitigation', { mitigationId: c.id });
        hideCard();
      };
      cardDrawActions.appendChild(btn);
    });
    if (window.motion?.animate) {
      window.motion.animate('.card-face', { opacity: [0, 1], transform: ['translateY(-12px) scale(0.92)', 'translateY(0) scale(1)'] }, { duration: 0.4, easing: 'ease-out' });
      window.motion.animate('.card-backdrop', { opacity: [0, 1] }, { duration: 0.2, easing: 'ease-out' });
    }
  }

  function maybeShowCard(snapshot) {
    const action = snapshot.lastAction;
    const id = action?.id || snapshot.actionCounter;
    const me = snapshot.players.find((p) => p.id === state.playerId);
    if (me?.needsInitialMitigation) return;
    if (!action || !action.card) {
      hideCard();
      return;
    }
    if (state.lastModalAction === id) return;
    state.lastModalAction = id;

    const card = action.card;
    const isControl = card.type === 'control';
    const pending = snapshot.pendingMitigation;
    const isPendingForYou = pending && pending.playerId === state.playerId;
    const desc = isControl
      ? `Move ${card.delta > 0 ? '+' : ''}${card.delta} spaces.`
      : card.pending
        ? 'Choose a mitigation or take the setback.'
        : card.mitigated
          ? 'Mitigated.'
          : card.noMatch
            ? 'No matching mitigation — setback applies.'
            : card.delta
              ? `Move ${card.delta} spaces.`
              : '';

    if (cardDraw) cardDraw.dataset.type = isControl ? 'control' : 'misstep';
    cardDrawType.textContent = isControl ? 'CONTROL' : 'MISSTEP';
    cardDrawType.classList.toggle('control', isControl);
    cardDrawType.classList.toggle('misstep', !isControl);
    cardDrawTitle.textContent = card.label;
    cardDrawDesc.textContent = desc || '';

    cardDrawActions.innerHTML = '';
    if (isPendingForYou && pending) {
      (pending.mitigationOptions || []).forEach((c) => {
        const btn = document.createElement('button');
        btn.className = 'btn primary';
        btn.textContent = `Use: ${c.label}`;
        btn.onclick = () => {
          socket.emit('useMitigation', { mitigationId: c.id });
          hideCard();
        };
        cardDrawActions.appendChild(btn);
      });
      const skip = document.createElement('button');
      skip.className = 'btn ghost';
      skip.textContent = 'Take the misstep';
      skip.onclick = () => {
        socket.emit('acceptMisstep');
        hideCard();
      };
      cardDrawActions.appendChild(skip);
    } else {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn primary';
      closeBtn.textContent = 'OK';
      closeBtn.onclick = hideCard;
      cardDrawActions.appendChild(closeBtn);
    }

    cardDraw.classList.remove('hidden');
    if (window.motion?.animate) {
      window.motion.animate('.card-face', { opacity: [0, 1], transform: ['translateY(-12px) scale(0.92)', 'translateY(0) scale(1)'] }, { duration: 0.4, easing: 'ease-out' });
      window.motion.animate('.card-backdrop', { opacity: [0, 1] }, { duration: 0.2, easing: 'ease-out' });
    }
  }

  function hideCard() {
    if (cardDraw) cardDraw.classList.add('hidden');
  }

  // Initial board render so users see the layout before joining.
  buildBoard(DEFAULT_CARD_SPACES);
  renderFeed();

  function runEntranceAnimations() {
    if (hasAnimated) return;
    if (!window.motion || !window.motion.animate) return;
    hasAnimated = true;
    const { animate, stagger } = window.motion;
    animate('.board-card', { opacity: [0, 1], y: [12, 0] }, { duration: 0.5, easing: 'ease-out' });
    animate('.panel', { opacity: [0, 1], y: [10, 0] }, { delay: stagger(0.05), duration: 0.5, easing: 'ease-out' });
  }
})();
