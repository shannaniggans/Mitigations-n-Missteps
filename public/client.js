(() => {
  const DEFAULT_CARD_SPACES = [4, 9, 13, 18, 22, 27, 33, 38, 44, 49, 55, 60, 66, 72, 78, 83, 88, 94];
  const socket = io();
  const boardEl = document.getElementById('board');
  const piecesLayer = document.getElementById('pieces-layer');
  const feedEl = document.getElementById('feed');
  const playersEl = document.getElementById('players');
  const discardEl = document.getElementById('discard');
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

  const state = {
    playerId: null,
    roomId: null,
    cardSpaces: DEFAULT_CARD_SPACES,
    lastActionId: 0,
    feed: [],
    pendingMitigation: null,
    discards: []
  };

  const cellMap = new Map();
  let lastSnapshot = null;
  let boardBuilt = false;
  let renderedCardSpaces = DEFAULT_CARD_SPACES;
  let boardSize = 100;

  const randomDefaultName = `Analyst-${Math.floor(Math.random() * 900 + 100)}`;
  document.getElementById('name').value = randomDefaultName;
  document.getElementById('room').value = 'alpha';

  socket.on('connect', () => {
    connectionHint.textContent = 'Connected. Join or share a room code to start.';
    statusDot.style.background = '#7cf2c9';
    statusLabel.textContent = 'Connected';
  });

  socket.on('disconnect', () => {
    connectionHint.textContent = 'Disconnected. Reconnect or refresh.';
    statusDot.style.background = '#f78f8f';
    statusLabel.textContent = 'Disconnected';
    rollBtn.disabled = true;
  });

  socket.on('joined', ({ playerId, roomId }) => {
    state.playerId = playerId;
    state.roomId = roomId;
    state.feed = [];
    state.lastActionId = 0;
    renderFeed();
    connectionHint.textContent = `Joined room ${roomId}. Share the code to invite others.`;
    resetBtn.disabled = false;
    statusLabel.textContent = `In room ${roomId}`;
    statusDot.style.background = '#7cf2c9';
  });

  socket.on('state', (snapshot) => {
    state.cardSpaces = snapshot.cardSpaces || DEFAULT_CARD_SPACES;
    boardSize = snapshot.boardSize || 100;
    state.pendingMitigation = snapshot.pendingMitigation || null;
    state.discards = snapshot.discards || [];
    lastSnapshot = snapshot;
    if (!boardBuilt || boardNeedsRebuild(state.cardSpaces)) {
      buildBoard(state.cardSpaces);
    }
    renderTokens(snapshot);
    renderPlayers(snapshot);
    renderHand(snapshot);
    renderDiscard(snapshot);
    renderStatus(snapshot);
    maybeAddToFeed(snapshot.lastAction, snapshot.actionCounter);
  });

  socket.on('toast', ({ message }) => {
    connectionHint.textContent = message;
  });

  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim() || randomDefaultName;
    const room = document.getElementById('room').value.trim() || 'alpha';
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
    const size = boardSize || 100;
    const cols = 10;
    const rows = Math.ceil(size / cols);
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    for (let cell = 1; cell <= size; cell += 1) {
      const { row, col } = toGrid(cell);
      const div = document.createElement('div');
      div.className = 'cell';
      div.style.gridRow = row;
      div.style.gridColumn = col;
      div.dataset.cell = cell;
      const num = document.createElement('span');
      num.textContent = cell;
      div.appendChild(num);

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

  function boardNeedsRebuild(cardSpaces = []) {
    if (cardSpaces.length !== renderedCardSpaces.length) return true;
    const a = [...cardSpaces].sort((x, y) => x - y);
    const b = [...renderedCardSpaces].sort((x, y) => x - y);
    return a.some((cell, idx) => cell !== b[idx]);
  }

  function toGrid(cell) {
    const zeroIndexed = cell - 1;
    const cols = 10;
    const rows = Math.ceil((boardSize || 100) / cols);
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
      const loc = player.position > 0 ? `Square ${player.position}` : 'Off board';
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
        ? `${winner.name} reached 100! Reset to replay.`
        : 'Someone reached 100! Reset to replay.';
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

    statusLabel.textContent = snapshot.roomId ? `Room ${snapshot.roomId}` : 'Not joined';
    statusDot.style.background = state.playerId ? '#7cf2c9' : '#a5adba';
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


  function describeAction(action) {
    if (!action) return '–';
    if (action.reset) return `${action.name} reset the board`;
    const name = action.name || 'Someone';
    const rollPart = action.roll ? `rolled ${action.roll}` : 'moved';
    const fromTo = action.from ? ` (${action.from}→${action.to})` : ` to ${action.to}`;
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
      return `${name} drew MISSTEP: ${card.label} (no matching mitigation) → ${action.to}`;
    }
    if (card.type === 'control') {
      return `${name} drew CONTROL: ${card.label} (${deltaText}) → ${action.to}`;
    }
    if (card.mitigated) {
      return `${name} drew MISSTEP: ${card.label} but mitigated with ${card.mitigation?.label || 'a card'}`;
    }
    return `${name} drew MISSTEP: ${card.label} (${deltaText}) → ${action.to}`;
  }

  function maybeAddToFeed(action, actionCounter) {
    if (!action || !actionCounter || actionCounter === state.lastActionId) return;
    state.lastActionId = actionCounter;
    state.feed.unshift(describeAction(action));
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

  // Initial board render so users see the layout before joining.
  buildBoard(DEFAULT_CARD_SPACES);
  renderFeed();
})();
