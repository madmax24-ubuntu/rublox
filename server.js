import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const server = createServer(app);

// Custom static file handler with no-cache
const serveStatic = express.static(__dirname, {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-store');
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'text/javascript; charset=UTF-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    }
  }
});

// Serve HTML with explicit no-cache headers and cache-busting timestamp
app.get('/', async (req, res) => {
  const html = await readFile(path.join(__dirname, 'index.html'), 'utf-8');
  const now = Date.now();
  // Inject cache-busting into all script src attributes with .js
  const cacheBustRe = /(src=['"])([^'"]*\.js)([?&]v=[^'"]*)?(['"])/g;
  let htmlWithVersion = html.replace(cacheBustRe, '$1$2?v=' + now + '$4');
  // Also inject version into body
  htmlWithVersion = htmlWithVersion.replace(
    '<body>',
    `<body data-version="${now}">`
  );
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Last-Modified', new Date(now).toUTCString());
  res.set('ETag', `"${now}"`);
  res.send(htmlWithVersion);
});

// Serve all other static files with cache-busting for JS
app.use((req, res, next) => {
  if (req.path === '/') {
    next();
  } else if (req.path.endsWith('.js')) {
    // Add cache-busting query param to JS files
    const url = new URL(req.url, 'http://localhost');
    url.searchParams.set('v', Date.now());
    req.url = url.pathname + url.search;
    serveStatic(req, res, next);
  } else {
    serveStatic(req, res, next);
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const roomSeed = (roomId) => {
  let h = 2166136261;
  for (let i = 0; i < roomId.length; i++) {
    h ^= roomId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
};

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Map(), seed: roomSeed(roomId) });
  }
  return rooms.get(roomId);
}

function removeRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.clients.size === 0) {
    rooms.delete(roomId);
  }
}

function send(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function broadcast(room, payload, exceptId = null) {
  const data = JSON.stringify(payload);
  for (const [id, peer] of room.clients) {
    if (exceptId && id === exceptId) continue;
    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(data);
    }
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = (url.searchParams.get('room') || 'global').trim().slice(0, 32) || 'global';
  const name = (url.searchParams.get('name') || 'Player').trim().slice(0, 24) || 'Player';
  const id = uid();
  const room = getRoom(roomId);

  const peer = {
    id,
    name,
    state: {
      x: 0, y: 0, z: 0,
      ry: 0, rx: 0,
      hp: 100,
      weapon: 'fists',
      t: Date.now()
    },
    ws
  };

  room.clients.set(id, peer);

  const peers = [...room.clients.values()]
    .filter((p) => p.id !== id)
    .map((p) => ({ id: p.id, name: p.name, state: p.state }));

  send(ws, { type: 'init', id, room: roomId, seed: room.seed, peers });
  broadcast(room, { type: 'peer_join', id, name, state: peer.state }, id);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'state' && msg.state) {
      const s = msg.state;
      peer.state = {
        x: Number.isFinite(s.x) ? s.x : peer.state.x,
        y: Number.isFinite(s.y) ? s.y : peer.state.y,
        z: Number.isFinite(s.z) ? s.z : peer.state.z,
        ry: Number.isFinite(s.ry) ? s.ry : peer.state.ry,
        rx: Number.isFinite(s.rx) ? s.rx : peer.state.rx,
        hp: Number.isFinite(s.hp) ? s.hp : peer.state.hp,
        weapon: typeof s.weapon === 'string' ? s.weapon : peer.state.weapon,
        t: Date.now()
      };
      broadcast(room, { type: 'state', id, state: peer.state }, id);
    } else if (msg.type === 'hit') {
      const targetId = typeof msg.targetId === 'string' ? msg.targetId : null;
      const damage = Math.max(1, Math.min(120, Number(msg.damage) || 0));
      if (!targetId || targetId === id) return;
      const target = room.clients.get(targetId);
      if (!target) return;
      send(target.ws, { type: 'hit', from: id, damage, weapon: msg.weapon || 'unknown' });
      send(ws, { type: 'hit_ack', targetId, damage });
    } else if (msg.type === 'ping') {
      send(ws, { type: 'pong', t: Date.now() });
    }
  });

  ws.on('close', () => {
    room.clients.delete(id);
    broadcast(room, { type: 'peer_leave', id });
    removeRoomIfEmpty(roomId);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
