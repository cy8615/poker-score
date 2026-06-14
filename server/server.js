const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const AVATAR_DIR = path.join(__dirname, 'avatars');
const CLOSE_AGE = 24 * 60 * 60 * 1000;
const DELETE_AGE = 30 * 24 * 60 * 60 * 1000;
const ROOM_ICONS = ['♠️','♥️','♦️','♣️','🎴','🎲','🎯','👑','💰','🔥','⭐','🏆'];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

function loadRoom(id) {
  const file = path.join(DATA_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const room = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!room.members) room.members = [];
    for (let m of room.members) { if (!m.role) m.role = 'player'; }
    const age = Date.now() - room.createdAt;
    if (age > DELETE_AGE) {
      try { fs.unlinkSync(file); } catch {}
      return null;
    }
    if (age > CLOSE_AGE) { room.closed = true; room.settledAt = room.createdAt + CLOSE_AGE; room.settleDuration = CLOSE_AGE; }
    return room;
  } catch { return null; }
}

function saveRoom(room) {
  const file = path.join(DATA_DIR, `${room.id}.json`);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(room));
  fs.renameSync(tmp, file);
}

function listRooms() {
  const rooms = [];
  try {
    const files = fs.readdirSync(DATA_DIR);
    const now = Date.now();
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const file = path.join(DATA_DIR, f);
      try {
        const room = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const age = now - room.createdAt;
        if (age > DELETE_AGE) { fs.unlinkSync(file); continue; }
        rooms.push({ id: room.id, createdAt: room.createdAt, memberCount: room.members.length, icon: room.icon || '🃏', closed: age > CLOSE_AGE });
      } catch {}
    }
  } catch {}
  rooms.sort((a, b) => b.createdAt - a.createdAt);
  return rooms;
}

function cleanupExpired() {
  try {
    const files = fs.readdirSync(DATA_DIR);
    const now = Date.now();
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const file = path.join(DATA_DIR, f);
      try {
        const room = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (now - room.createdAt > DELETE_AGE) {
          fs.unlinkSync(file);
          console.log(`[cleanup] deleted expired room: ${room.id}`);
        }
      } catch {}
    }
    // cleanup old avatars (> 30 days)
    try {
      const avatars = fs.readdirSync(AVATAR_DIR);
      for (const f of avatars) {
        const fp = path.join(AVATAR_DIR, f);
        try {
          const stat = fs.statSync(fp);
          if (now - stat.mtimeMs > DELETE_AGE) {
            fs.unlinkSync(fp);
            console.log(`[cleanup] deleted old avatar: ${f}`);
          }
        } catch {}
      }
    } catch {}
  } catch {}
}

function gid() { return String(Math.floor(1000 + Math.random() * 9000)); }
function mid() { return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function tid() { return 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function json(res, data, status) {
  res.writeHead(status || 200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function parseRawBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body));
  });
}

function serveStatic(res, filePath, contentType) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = contentType || mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  try {
    // GET /api/avatars/* - serve avatar images
    if (req.method === 'GET' && pathname.startsWith('/api/avatars/')) {
      const filename = pathname.slice('/api/avatars/'.length);
      if (!filename || filename.includes('..')) { res.writeHead(400); return res.end(); }
      return serveStatic(res, path.join(AVATAR_DIR, filename));
    }

    // POST /api/upload-avatar - upload avatar image (base64)
    if (req.method === 'POST' && pathname === '/api/upload-avatar') {
      const body = await parseRawBody(req);
      let imageData;
      try {
        const parsed = JSON.parse(body);
        imageData = parsed.image || '';
      } catch {
        imageData = body;
      }
      if (!imageData) return json(res, { error: 'no image data' }, 400);
      // strip data URL prefix if present
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
      const ext = imageData.startsWith('data:image/png') ? '.png' :
                  imageData.startsWith('data:image/gif') ? '.gif' :
                  imageData.startsWith('data:image/webp') ? '.webp' : '.jpg';
      const filename = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + ext;
      const filePath = path.join(AVATAR_DIR, filename);
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      const avatarUrl = '/poker-api/avatars/' + filename;
      return json(res, { avatarUrl });
    }

    // POST /api/create {name}
    if (req.method === 'POST' && pathname === '/api/create') {
      const { name, avatarUrl } = await parseBody(req);
      if (!name) return json(res, { error: 'name required' }, 400);
      let id; do { id = gid(); } while (loadRoom(id));
      const memberId = mid();
      const room = {
        id,
        creatorId: memberId,
        icon: ROOM_ICONS[Math.floor(Math.random() * ROOM_ICONS.length)],
        members: [{ id: memberId, name, score: 0, colorIdx: 0, avatarUrl: avatarUrl || '', role: 'player' }],
        transactions: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      saveRoom(room);
      return json(res, { roomId: id, memberId, room });
    }

    // GET /api/rooms
    if (req.method === 'GET' && pathname === '/api/rooms') {
      return json(res, { rooms: listRooms() });
    }

    // GET /api/room?id=XXXX
    if (req.method === 'GET' && pathname === '/api/room') {
      const id = url.searchParams.get('id');
      if (!id) return json(res, { error: 'id required' }, 400);
      const room = loadRoom(id);
      if (!room) return json(res, { error: 'room not found' }, 404);
      return json(res, { room });
    }

    // POST /api/join {roomId, name}
    if (req.method === 'POST' && pathname === '/api/join') {
      const { roomId, name, avatarUrl } = await parseBody(req);
      if (!roomId || !name) return json(res, { error: 'roomId and name required' }, 400);
      const room = loadRoom(roomId);
      if (!room) return json(res, { error: 'room not found' }, 404);
      if (room.closed) return json(res, { error: '房间已关闭' }, 403);
      const existing = room.members.find(m => m.name === name);
      if (existing) return json(res, { memberId: existing.id, room });
      const memberId = mid();
      room.members.push({ id: memberId, name, score: 0, colorIdx: room.members.length, avatarUrl: avatarUrl || '', role: 'player' });
      room.updatedAt = Date.now();
      saveRoom(room);
      return json(res, { memberId, room });
    }

    // GET /api/chat?roomId=xxx
    if (req.method === 'GET' && pathname === '/api/chat') {
      const url = new URL(req.url, 'http://x');
      const roomId = url.searchParams.get('roomId');
      if (!roomId) return json(res, { error: 'missing fields' }, 400);
      const room = loadRoom(roomId);
      if (!room || room.closed) return json(res, { error: 'room not found' }, 404);
      const msgs = (room.recentMessages || []).map(m => ({ id: m.id, memberId: m.memberId, name: m.name, text: m.text, timestamp: m.time, colorIdx: m.colorIdx }));
      return json(res, { messages: msgs });
    }

    // POST /api/chat {roomId, memberId, text}
    if (req.method === 'POST' && pathname === '/api/chat') {
      const { roomId, memberId, text } = await parseBody(req);
      if (!roomId || !memberId || !text) return json(res, { error: 'missing fields' }, 400);
      const room = loadRoom(roomId);
      if (!room || room.closed) return json(res, { error: 'room not found' }, 404);
      if (!room.members.find(m => m.id === memberId)) return json(res, { error: 'member not found' }, 404);
      const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), memberId, text, time: Date.now() };
      if (!room.recentMessages) room.recentMessages = [];
      room.recentMessages.push(msg);
      if (room.recentMessages.length > 50) room.recentMessages = room.recentMessages.slice(-50);
      saveRoom(room);
      return json(res, { msg });
    }

    // POST /api/transfer {roomId, fromMemberId, toMemberId, amount, note}
    if (req.method === 'POST' && pathname === '/api/transfer') {
      const { roomId, fromMemberId, toMemberId, amount, note } = await parseBody(req);
      if (!roomId || !fromMemberId || !toMemberId || !amount) return json(res, { error: 'missing fields' }, 400);
      const room = loadRoom(roomId);
      if (!room) return json(res, { error: 'room not found' }, 404);
      if (room.closed) return json(res, { error: '房间已关闭' }, 403);
      const from = room.members.find(m => m.id === fromMemberId);
      const to = room.members.find(m => m.id === toMemberId);
      if (!from || !to) return json(res, { error: 'member not found' }, 404);
      from.score -= amount;
      to.score += amount;
      room.transactions.push({ id: tid(), type: 'transfer', fromMemberId, toMemberId, amount, note: note || '', timestamp: Date.now() });
      room.updatedAt = Date.now();
      saveRoom(room);
      return json(res, { room });
    }

    // POST /api/rename {roomId, memberId, name}
    if (req.method === 'POST' && pathname === '/api/rename') {
      const { roomId, memberId, name, avatarUrl } = await parseBody(req);
      if (!roomId || !memberId || !name) return json(res, { error: 'missing fields' }, 400);
      if (name.length > 8) return json(res, { error: '昵称最多8个字' }, 400);
      const room = loadRoom(roomId);
      if (!room) return json(res, { error: 'room not found' }, 404);
      const member = room.members.find(m => m.id === memberId);
      if (!member) return json(res, { error: 'member not found' }, 404);
      member.name = name;
      if (avatarUrl !== undefined) member.avatarUrl = avatarUrl;
      room.updatedAt = Date.now();
      saveRoom(room);
      return json(res, { room });
    }

    // POST /api/reset {roomId}
    if (req.method === 'POST' && pathname === '/api/reset') {
      const { roomId } = await parseBody(req);
      const room = loadRoom(roomId);
      if (!room) return json(res, { error: 'room not found' }, 404);
      room.members.forEach(m => m.score = 0);
      room.transactions = [];
      room.updatedAt = Date.now();
      saveRoom(room);
      return json(res, { room });
    }

    // POST /api/settle {roomId, memberId}
    if (req.method === 'POST' && pathname === '/api/settle') {
      const { roomId, memberId } = await parseBody(req);
      const room = loadRoom(roomId);
      if (!room) return json(res, { error: 'room not found' }, 404);
      if (room.creatorId !== memberId) return json(res, { error: '仅房主可结算' }, 403);
      if (room.closed) return json(res, { error: '房间已结算' }, 400);
      room.closed = true;
      room.settledAt = Date.now();
      room.settleDuration = Date.now() - room.createdAt;
      saveRoom(room);
      return json(res, { room });
    }

    // POST /api/delete {roomId, memberId}

    // POST /api/kick {roomId, memberId, creatorId}
    if (req.method === 'POST' && pathname === '/api/kick') {
      const { roomId, memberId } = await parseBody(req);
      if (!roomId || !memberId) return json(res, { error: 'missing fields' }, 400);
      const room = loadRoom(roomId);
      if (!room) return json(res, { error: 'room not found' }, 404);
      if (room.closed) return json(res, { error: '房间已关闭' }, 403);
      const member = room.members.find(m => m.id === memberId);
      if (!member) return json(res, { error: 'member not found' }, 404);
      if (member.score !== 0) return json(res, { error: '仅可踢出积分为0的玩家' }, 403);
      room.members = room.members.filter(m => m.id !== memberId);
      room.updatedAt = Date.now();
      saveRoom(room);
      return json(res, { room });
    }

    // POST /api/switch-role {roomId, memberId}
    if (req.method === 'POST' && pathname === '/api/switch-role') {
      const { roomId, memberId } = await parseBody(req);
      if (!roomId || !memberId) return json(res, { error: 'missing fields' }, 400);
      const room = loadRoom(roomId);
      if (!room) return json(res, { error: 'room not found' }, 404);
      if (room.closed) return json(res, { error: '房间已关闭' }, 403);
      const member = room.members.find(m => m.id === memberId);
      if (!member) return json(res, { error: 'member not found' }, 404);
      member.role = member.role === 'spectator' ? 'player' : 'spectator';
      room.updatedAt = Date.now();
      saveRoom(room);
      return json(res, { room });
    }
    if (req.method === 'POST' && pathname === '/api/delete') {
      const { roomId, memberId } = await parseBody(req);
      const room = loadRoom(roomId);
      if (!room) {
        const file = path.join(DATA_DIR, `${roomId}.json`);
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return json(res, { ok: true });
      }
      if (room.creatorId && memberId && room.creatorId !== memberId) {
        return json(res, { error: '仅房主可删除房间' }, 403);
      }
      const file = path.join(DATA_DIR, `${roomId}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      return json(res, { ok: true });
    }

    json(res, { error: 'not found' }, 404);
  } catch (e) {
    console.error(e);
    json(res, { error: e.message }, 500);
  }
});

const PORT = 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log('Poker API running on port', PORT);
});

// 每 30 分钟清理过期房间
cleanupExpired();
setInterval(cleanupExpired, 30 * 60 * 1000);
