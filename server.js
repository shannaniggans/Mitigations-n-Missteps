const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const YAML = require('yaml');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 31337;
const BOARD_SIZE = 50;
const MAX_PLAYERS = 6;
const START_POS = 0;

const DEFAULT_CARD_LIBRARY = {
  cardSpaces: [4, 9, 13, 18, 22, 27, 33, 38, 44, 49, 55, 60, 66, 72, 78, 83, 88, 94],
  controls: [
    { id: 'ctrl-firewall-patch', label: 'Patched firewall zero-day overnight', delta: 12 },
    { id: 'ctrl-incident-drill', label: 'Quarterly incident drill paid off', delta: 9 },
    { id: 'ctrl-mfa', label: 'MFA rollout everywhere', delta: 8 },
    { id: 'ctrl-logging', label: 'Centralized logs lit up early', delta: 6 },
    { id: 'ctrl-edr', label: 'EDR auto-contained blast radius', delta: 10 },
    { id: 'ctrl-tabletop', label: 'Tabletop found gaps before go-live', delta: 7 },
    { id: 'ctrl-inventory', label: 'Asset inventory complete', delta: 5 },
    { id: 'ctrl-chaos', label: 'Chaos exercise hardened the stack', delta: 9 },
    { id: 'ctrl-champions', label: 'Security champions escalated fast', delta: 6 },
    { id: 'ctrl-waf', label: 'WAF rule blocked exploit chain', delta: 8 },
    { id: 'ctrl-runbooks', label: 'Runbooks codified and followed', delta: 5 },
    { id: 'ctrl-intel', label: 'Threat intel early warning', delta: 11 }
  ],
  missteps: [
    { id: 'mis-key-leak', label: 'Prod API key leaked in git', delta: -12, tags: ['key-leak', 'secrets'] },
    { id: 'mis-ransomware', label: 'Ransom note lands on shared drive', delta: -10, tags: ['ransomware', 'backup'] },
    { id: 'mis-s3-open', label: 'Exposed storage bucket discovered', delta: -9, tags: ['s3'] },
    { id: 'mis-vpn', label: 'Unpatched VPN exploit', delta: -11, tags: ['patch'] },
    { id: 'mis-dns', label: 'DNS hijack diverts users', delta: -8, tags: ['dns'] },
    { id: 'mis-shadow', label: 'Shadow IT reverse tunnel', delta: -7, tags: ['shadow'] },
    { id: 'mis-phish', label: 'Phish bypassed training', delta: -6, tags: ['phish'] },
    { id: 'mis-ci-secrets', label: 'CI secrets pushed to git', delta: -10, tags: ['secrets'] },
    { id: 'mis-backup', label: 'Backup restore fails audit', delta: -12, tags: ['backup'] },
    { id: 'mis-fatigue', label: 'Alert fatigue hid the signal', delta: -5, tags: ['fatigue'] },
    { id: 'mis-change', label: 'Change freeze ignored', delta: -7, tags: ['change'] },
    { id: 'mis-vendor', label: 'Third-party outage cascades', delta: -6, tags: ['vendor'] }
  ],
  mitigations: [
    { id: 'mit-key-rotation', label: 'Key rotation & token revocation', mitigates: ['key-leak', 'secrets'] },
    { id: 'mit-immutable-backups', label: 'Immutable backups & tested restores', mitigates: ['backup', 'ransomware'] },
    { id: 'mit-mfa', label: 'MFA on risky paths', mitigates: ['phish'] },
    { id: 'mit-dnssec', label: 'DNSSEC + monitoring', mitigates: ['dns'] },
    { id: 'mit-vpn-patch', label: 'Emergency VPN patch sprint', mitigates: ['patch'] },
    { id: 'mit-waf', label: 'WAF hotfix & hardening', mitigates: ['s3', 'shadow'] },
    { id: 'mit-runbook', label: 'Runbook + rotation on-call', mitigates: ['fatigue', 'change'] },
    { id: 'mit-secrets-hygiene', label: 'Secrets scanning + auto-revoke', mitigates: ['key-leak', 'secrets'] },
    { id: 'mit-drill', label: 'DR drill & vendor backup', mitigates: ['backup', 'vendor'] },
    { id: 'mit-segmentation', label: 'Segmentation + EDR isolate', mitigates: ['ransomware', 'shadow'] }
  ]
};

const { controls: CONTROL_CARDS, missteps: MISSTEP_CARDS, mitigations: MITIGATION_CARDS, cardSpaces: CARD_SPACES } =
  loadCardLibrary(DEFAULT_CARD_LIBRARY);
const MITIGATION_BY_ID = new Map(MITIGATION_CARDS.map((c) => [c.id, c]));
const CARD_SPACE_COUNT = 25;

const COLORS = ['#ff8a00', '#6c5ce7', '#00b894', '#e84393', '#0984e3', '#d63031'];

// Map roomId -> room state
const rooms = new Map();

app.use(express.static('public'));

app.get('/health', (_req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, name }) => {
    const trimmedRoom = (roomId || 'alpha').trim().slice(0, 32) || 'alpha';
    const trimmedName = (name || 'Analyst').trim().slice(0, 24) || 'Analyst';
    const room = getRoom(trimmedRoom);

      if (!room.players.has(socket.id)) {
        if (room.order.length >= MAX_PLAYERS) {
          socket.emit('toast', { type: 'error', message: `Room ${trimmedRoom} is full (${MAX_PLAYERS} players max).` });
          return;
        }
        const player = {
          id: socket.id,
          name: trimmedName,
          position: START_POS,
          color: COLORS[room.order.length % COLORS.length],
          hand: dealMitigations(room, 3),
          lastIntelAt: null,
          learnedMitigations: []
        };
      room.players.set(player.id, player);
      room.order.push(player.id);
      if (room.currentTurnIndex === null) {
        room.currentTurnIndex = 0;
      }
    }

    socket.data.roomId = trimmedRoom;
    socket.join(trimmedRoom);
    socket.emit('joined', { playerId: socket.id, roomId: trimmedRoom });
    broadcast(trimmedRoom, `${trimmedName} joined the room`);
    socket.emit('state', serializeRoom(room));
  });

  socket.on('roll', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.pendingMitigation) {
      socket.emit('toast', { type: 'info', message: 'Resolve the mitigation choice first.' });
      return;
    }
    const player = room.players.get(socket.id);
    if (!player) return;
    player.lastIntelAt = null;
    if (room.winner) {
      socket.emit('toast', { type: 'info', message: 'Game finished. Reset to play again.' });
      return;
    }

    const currentPlayerId = room.order[room.currentTurnIndex ?? 0];
    if (currentPlayerId !== socket.id) {
      socket.emit('toast', { type: 'info', message: 'Not your turn yet.' });
      return;
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    const start = player.position || START_POS;
    const rawTarget = start + roll;

    if (rawTarget > BOARD_SIZE) {
      player.position = BOARD_SIZE;
      room.lastAction = {
        id: ++room.actionCounter,
        playerId: player.id,
        name: player.name,
        roll,
        from: start,
        to: BOARD_SIZE,
        card: null
      };
      room.winner = player.id;
      broadcast(room.id, `${player.name} rolled a ${roll}`);
      return;
    }

    let target = rawTarget;
    let cardResult = null;

    if (room.cardSpaces.includes(target)) {
      const drawn = drawEventCard();
      cardResult = { ...drawn };
      if (drawn.type === 'control') {
        target = Math.min(BOARD_SIZE, target + drawn.delta);
        cardResult.resultPosition = target;
      } else if (drawn.type === 'misstep') {
        const learned = findLearnedMitigation(player, drawn.tags || []);
        if (learned) {
          cardResult.mitigated = true;
          cardResult.mitigation = learned;
          cardResult.learned = true;
          cardResult.resultPosition = target;
        } else {
          const mitigationOptions = getMitigationOptions(player.hand, drawn.tags || []);
          if (mitigationOptions.length) {
            room.pendingMitigation = {
              playerId: player.id,
              start,
              forwardTarget: target,
              card: drawn,
              roll,
              tags: drawn.tags || [],
              mitigationOptions: mitigationOptions.map((c) => c.id)
            };
            player.position = target; // show forward move while decision pending
            room.lastAction = {
              id: ++room.actionCounter,
              playerId: player.id,
              name: player.name,
              roll,
              from: start,
              to: target,
              card: { ...drawn, pending: true, mitigationOptions: mitigationOptions.map((c) => c.id) },
              pendingMitigation: true
            };
            socket.emit('toast', { type: 'info', message: 'Choose a mitigation or take the misstep.' });
            broadcast(room.id, `${player.name} drew a misstep and must choose mitigation`);
            return;
          }
          target = Math.max(START_POS, target + drawn.delta);
          cardResult.mitigated = false;
          cardResult.noMatch = true;
          cardResult.resultPosition = target;
        }
      }
    }

    player.position = target;
    room.lastAction = {
      id: ++room.actionCounter,
      playerId: player.id,
      name: player.name,
      roll,
      from: start,
      to: target,
      card: cardResult
    };

    if (target >= BOARD_SIZE) {
      room.winner = player.id;
    } else {
      advanceTurn(room);
      runShareIntel(room, player);
    }

    broadcast(room.id, `${player.name} rolled a ${roll}`);
  });

  socket.on('reset', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    if (!room.players.has(socket.id)) return;
    room.pendingMitigation = null;
    room.players.forEach((p) => {
      p.position = START_POS;
      p.hand = [];
      p.lastIntelAt = null;
      p.learnedMitigations = [];
    });
    room.winner = null;
    room.currentTurnIndex = room.order.length ? 0 : null;
    room.lastAction = {
      id: ++room.actionCounter,
      playerId: socket.id,
      name: room.players.get(socket.id)?.name || 'Someone',
      roll: null,
      from: 0,
      to: 0,
      card: null,
      reset: true
    };
    room.discards = [];
    room.mitigationDeck = buildMitigationDeck();
    room.cardSpaces = generateCardSpaces(CARD_SPACE_COUNT);
    room.players.forEach((p) => {
      p.hand = dealMitigations(room, 3);
    });
    broadcast(room.id, 'Board reset');
  });

  socket.on('useMitigation', ({ mitigationId } = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.pendingMitigation) return;
    const pending = room.pendingMitigation;
    if (pending.playerId !== socket.id) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const idx = player.hand.findIndex((c) => c.id === mitigationId);
    if (idx === -1) return;
    const mitigation = player.hand.splice(idx, 1)[0];
    rememberMitigation(player, mitigation);

    const target = Math.min(BOARD_SIZE, pending.forwardTarget);
    player.position = target;
    room.pendingMitigation = null;
    room.discards.push({
      playerId: player.id,
      name: player.name,
      mitigation
    });

    room.lastAction = {
      id: ++room.actionCounter,
      playerId: player.id,
      name: player.name,
      roll: pending.roll,
      from: pending.start,
      to: target,
      card: { ...pending.card, mitigated: true, mitigation },
      mitigationUsed: mitigation.id
    };

    if (target >= BOARD_SIZE) {
      room.winner = player.id;
    } else {
      advanceTurn(room);
    }

    broadcast(room.id, `${player.name} mitigated a misstep`);
  });

  socket.on('acceptMisstep', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.pendingMitigation) return;
    const pending = room.pendingMitigation;
    if (pending.playerId !== socket.id) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const target = Math.max(START_POS, pending.forwardTarget + (pending.card.delta || 0));
    player.position = target;
    room.pendingMitigation = null;

    room.lastAction = {
      id: ++room.actionCounter,
      playerId: player.id,
      name: player.name,
      roll: pending.roll,
      from: pending.start,
      to: target,
      card: { ...pending.card, mitigated: false, resultPosition: target }
    };

    if (target >= BOARD_SIZE) {
      room.winner = player.id;
    } else {
      advanceTurn(room);
    }

    broadcast(room.id, `${player.name} accepted the misstep`);
  });

  socket.on('shareIntel', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    runShareIntel(room, player, socket);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const wasInRoom = room.players.delete(socket.id);
    if (!wasInRoom) return;

    const idx = room.order.indexOf(socket.id);
    if (idx >= 0) {
      room.order.splice(idx, 1);
      if (room.currentTurnIndex >= room.order.length) {
        room.currentTurnIndex = room.order.length ? 0 : null;
      }
    }

    if (room.players.size === 0) {
      rooms.delete(roomId);
      return;
    }

    if (room.pendingMitigation?.playerId === socket.id) {
      room.pendingMitigation = null;
    }

    if (room.winner === socket.id) {
      room.winner = null;
    }

    broadcast(roomId, 'A player left the room');
  });
});

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      players: new Map(),
      order: [],
      currentTurnIndex: null,
      lastAction: null,
      winner: null,
      actionCounter: 0,
      pendingMitigation: null,
      discards: [],
      mitigationDeck: buildMitigationDeck(),
      cardSpaces: generateCardSpaces(CARD_SPACE_COUNT)
    });
  }
  return rooms.get(roomId);
}

function advanceTurn(room) {
  if (!room.order.length) {
    room.currentTurnIndex = null;
    return;
  }
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.order.length;
}

function drawEventCard() {
  const useControl = Math.random() < 0.5;
  const pool = useControl ? CONTROL_CARDS : MISSTEP_CARDS;
  const card = pool[Math.floor(Math.random() * pool.length)];
  return {
    id: card.id,
    label: card.label,
    delta: card.delta,
    tags: card.tags || [],
    type: useControl ? 'control' : 'misstep'
  };
}

function getMitigationOptions(hand = [], tags = []) {
  if (!hand.length || !tags.length) return [];
  return hand.filter((card) => card.mitigates.some((tag) => tags.includes(tag)));
}

function buildMitigationDeck() {
  const deck = MITIGATION_CARDS.map((c) => ({ ...c }));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealMitigations(room, count = 5) {
  const hand = [];
  while (hand.length < count && room.mitigationDeck.length) {
    hand.push(room.mitigationDeck.pop());
  }
  return hand;
}

function drawMitigation(room) {
  if (!room.mitigationDeck.length) return null;
  return room.mitigationDeck.pop();
}

function runShareIntel(room, player, socket) {
  if (!player || !room || room.winner) return false;
  if (room.pendingMitigation) {
    if (socket) socket.emit('toast', { type: 'info', message: 'Resolve the mitigation choice first.' });
    return false;
  }
  if (!canShareIntel(room, player)) {
    if (socket) socket.emit('toast', { type: 'info', message: 'Share intel only when sharing a square with someone and not already attempted here.' });
    return false;
  }
  player.lastIntelAt = player.position;
  const roll = Math.floor(Math.random() * 6) + 1;
  let card = null;
  let success = roll >= 4 && room.mitigationDeck.length > 0;
  if (success) {
    card = drawMitigation(room);
    if (!card) success = false;
    else player.hand.push(card);
  }

  room.lastAction = {
    id: ++room.actionCounter,
    playerId: player.id,
    name: player.name,
    intel: true,
    roll,
    success,
    card,
    position: player.position
  };
  broadcast(room.id, `${player.name} shared intel`);
  return true;
}

function rememberMitigation(player, mitigation) {
  if (!mitigation || !mitigation.id) return;
  if (!Array.isArray(player.learnedMitigations)) player.learnedMitigations = [];
  if (!player.learnedMitigations.includes(mitigation.id)) {
    player.learnedMitigations.push(mitigation.id);
  }
}

function findLearnedMitigation(player, tags = []) {
  if (!player || !Array.isArray(player.learnedMitigations) || !tags.length) return null;
  for (const id of player.learnedMitigations) {
    const card = MITIGATION_BY_ID.get(id);
    if (!card) continue;
    if (card.mitigates.some((t) => tags.includes(t))) {
      return { ...card };
    }
  }
  return null;
}

function canShareIntel(room, player) {
  if (player.position <= 0) return false;
  if (player.lastIntelAt === player.position) return false;
  let shared = false;
  room.players.forEach((p) => {
    if (p.id !== player.id && p.position === player.position) shared = true;
  });
  return shared;
}

function generateCardSpaces(count) {
  const spaces = new Set();
  spaces.add(BOARD_SIZE); // always draw on the last square
  const max = BOARD_SIZE;
  const target = Math.min(count, max);
  while (spaces.size < target) {
    const val = Math.floor(Math.random() * max) + 1; // 1..BOARD_SIZE
    spaces.add(val);
    if (spaces.size === max) break;
  }
  return Array.from(spaces);
}

function loadCardLibrary(fallback) {
  const libraryPath = path.join(__dirname, 'data', 'cards.md');
  try {
    const raw = fs.readFileSync(libraryPath, 'utf8');
    const yaml = extractFrontMatter(raw);
    const parsed = YAML.parse(yaml) || {};
    return normalizeCardLibrary(parsed, fallback);
  } catch (err) {
    console.warn('Using fallback card library:', err.message);
    return normalizeCardLibrary({}, fallback);
  }
}

function extractFrontMatter(content) {
  const start = content.indexOf('---');
  if (start !== 0) throw new Error('cards.md missing leading ---');
  const end = content.indexOf('---', start + 3);
  if (end === -1) throw new Error('cards.md missing closing ---');
  return content.slice(start + 3, end).trim();
}

function normalizeCardLibrary(parsed, fallback) {
  const safe = (arr) => (Array.isArray(arr) ? arr : []);
  const controls = safe(parsed.controls).map(normalizeControl);
  const missteps = safe(parsed.missteps).map(normalizeMisstep);
  const mitigations = safe(parsed.mitigations).map(normalizeMitigation);
  const cardSpaces = Array.isArray(parsed.cardSpaces) && parsed.cardSpaces.length
    ? parsed.cardSpaces.map((n) => Number(n) || 0).filter((n) => n > 0 && n <= BOARD_SIZE)
    : fallback.cardSpaces;
  return {
    controls: controls.length ? controls : fallback.controls,
    missteps: missteps.length ? missteps : fallback.missteps,
    mitigations: mitigations.length ? mitigations : fallback.mitigations,
    cardSpaces
  };
}

function normalizeControl(card) {
  return {
    id: String(card.id || ''),
    label: String(card.label || ''),
    delta: clampDelta(card.delta)
  };
}

function normalizeMisstep(card) {
  return {
    id: String(card.id || ''),
    label: String(card.label || ''),
    delta: clampDelta(card.delta),
    tags: Array.isArray(card.tags) ? card.tags.map((t) => String(t)) : []
  };
}

function normalizeMitigation(card) {
  return {
    id: String(card.id || ''),
    label: String(card.label || ''),
    mitigates: Array.isArray(card.mitigates) ? card.mitigates.map((t) => String(t)) : []
  };
}

function clampDelta(delta) {
  const n = Number(delta);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-10, Math.min(10, n));
}

function serializeRoom(room) {
  return {
    roomId: room.id,
    players: room.order
      .map((id) => room.players.get(id))
      .filter(Boolean)
      .map((p) => ({ ...p })),
    currentTurn: room.order[room.currentTurnIndex ?? 0] || null,
    lastAction: room.lastAction,
    winner: room.winner,
    actionCounter: room.actionCounter,
    boardSize: BOARD_SIZE,
    cardSpaces: room.cardSpaces,
    pendingMitigation: room.pendingMitigation
      ? {
          ...room.pendingMitigation,
          mitigationOptions: getMitigationOptions(
            room.players.get(room.pendingMitigation.playerId)?.hand || [],
            room.pendingMitigation.tags || []
          )
        }
      : null,
    discards: room.discards.slice(-10)
  };
}

function broadcast(roomId, _message) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('state', serializeRoom(room));
}

server.listen(PORT, () => {
  console.log(`Snakes and Security Missteps server running on http://localhost:${PORT}`);
});
