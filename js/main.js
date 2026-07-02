// LONGSHOT — online multiplayer sniper PvP.
import * as THREE from 'three';
import { buildMap } from './map.js';
import { createSoldier, createRifle, animateSoldier, PLAYER_COLORS, RIFLE_FINISHES } from './playermodel.js';
import { SFX } from './audio.js';
import { Net, makeRoomCode } from './net.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- settings
const store = {
  get name() { return localStorage.getItem('ls_name') || ''; },
  set name(v) { localStorage.setItem('ls_name', v); },
  get sens() { return parseFloat(localStorage.getItem('ls_sens') || '1'); },
  set sens(v) { localStorage.setItem('ls_sens', v); },
  get vol() { return parseFloat(localStorage.getItem('ls_vol') || '0.8'); },
  set vol(v) { localStorage.setItem('ls_vol', v); },
  get music() { return parseFloat(localStorage.getItem('ls_music') || '0.5'); },
  set music(v) { localStorage.setItem('ls_music', v); },
  get skin() { return parseInt(localStorage.getItem('ls_skin') || '0'); },
  set skin(v) { localStorage.setItem('ls_skin', v); },
  get reticle() { return localStorage.getItem('ls_reticle') || 'cross'; },
  set reticle(v) { localStorage.setItem('ls_reticle', v); },
  get retColor() { return localStorage.getItem('ls_retcolor') || '#e02020'; },
  set retColor(v) { localStorage.setItem('ls_retcolor', v); },
  get theme() { return localStorage.getItem('ls_theme') || 'gold'; },
  set theme(v) { localStorage.setItem('ls_theme', v); },
  get binds() { try { return JSON.parse(localStorage.getItem('ls_binds')) || {}; } catch (e) { return {}; } },
  set binds(v) { localStorage.setItem('ls_binds', JSON.stringify(v)); },
};

// ---------------------------------------------------------------- keybinds
const BIND_ACTIONS = [
  ['forward', 'Move forward', 'KeyW'],
  ['back', 'Move back', 'KeyS'],
  ['left', 'Strafe left', 'KeyA'],
  ['right', 'Strafe right', 'KeyD'],
  ['jump', 'Jump', 'Space'],
  ['crouch', 'Crouch (toggle)', 'KeyC'],
  ['sprint', 'Sprint / Hold breath', 'ShiftLeft'],
  ['reload', 'Reload', 'KeyR'],
  ['scoreboard', 'Scoreboard', 'Tab'],
];
const DEFAULT_BINDS = Object.fromEntries(BIND_ACTIONS.map(([a, , c]) => [a, c]));
let binds = { ...DEFAULT_BINDS, ...store.binds };
let bindListening = null;
const dn = (action) => !!keys[binds[action]];

function prettyKey(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '').replace(/^Digit/, '')
    .replace('ShiftLeft', 'L-SHIFT').replace('ShiftRight', 'R-SHIFT')
    .replace('ControlLeft', 'L-CTRL').replace('ControlRight', 'R-CTRL')
    .replace('AltLeft', 'L-ALT').replace('AltRight', 'R-ALT')
    .replace('ArrowUp', '↑').replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←').replace('ArrowRight', '→')
    .toUpperCase();
}

// ---------------------------------------------------------------- constants
const GRAV = 19, WALK = 4.6, SPRINT = 6.8, CROUCH_SPD = 2.1, SCOPED_SPD = 1.8;
const JUMP = 6.4, EYE_STAND = 1.62, EYE_CROUCH = 1.12, RADIUS = 0.38;
const H_STAND = 1.78, H_CROUCH = 1.24, STEP_UP = 0.55;
const FOV = 75, SCOPE_FOV = 11;
const MAG_SIZE = 5, RESERVE_START = 30;
const BOLT_TIME = 1.15, RELOAD_TIME = 2.65;
const DMG = { head: 110, chest: 62, legs: 45 };
const SEND_RATE = 0.08, INTERP_DELAY = 0.15;

// ---------------------------------------------------------------- three setup
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.08, 1400);
camera.rotation.order = 'YXZ';

const map = buildMap(scene);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// first-person viewmodel rifle (rebuilt when the finish changes)
const viewmodel = new THREE.Group();
let fpRifle = null;
function mountViewRifle(finishIdx) {
  if (fpRifle) viewmodel.remove(fpRifle);
  fpRifle = createRifle(finishIdx);
  fpRifle.traverse(o => { o.castShadow = false; });
  fpRifle.position.set(0.26, -0.24, -0.45);
  fpRifle.rotation.y = 0.03;
  viewmodel.add(fpRifle);
}
mountViewRifle(store.skin);
camera.add(viewmodel);
scene.add(camera);

// muzzle flash light (shared)
const flashLight = new THREE.PointLight(0xffc27a, 0, 22, 2);
scene.add(flashLight);

// ---------------------------------------------------------------- vfx pools
const tracers = []; // {mesh, life}
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffdc9a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1);
function spawnTracer(from, to) {
  const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
  const len = from.distanceTo(to);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.scale.z = len;
  mesh.lookAt(to);
  scene.add(mesh);
  tracers.push({ mesh, life: 0.12 });
}

const puffTexCanvas = document.createElement('canvas');
puffTexCanvas.width = puffTexCanvas.height = 64;
{
  const ctx = puffTexCanvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(220,205,180,0.85)');
  g.addColorStop(1, 'rgba(220,205,180,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
}
const puffTex = new THREE.CanvasTexture(puffTexCanvas);
const puffs = [];
function spawnPuff(pos, scale = 1, color = 0xffffff) {
  const m = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color });
  const s = new THREE.Sprite(m);
  s.position.copy(pos);
  s.scale.setScalar(0.4 * scale);
  scene.add(s);
  puffs.push({ s, life: 0.4, grow: 2.2 * scale });
}
function spawnBlood(pos) { spawnPuff(pos, 0.9, 0x8a1a12); }

function updateVfx(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life / 0.12);
    if (t.life <= 0) { scene.remove(t.mesh); t.mesh.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.life -= dt;
    p.s.scale.addScalar(p.grow * dt);
    p.s.material.opacity = Math.max(0, p.life / 0.4) * 0.85;
    if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); }
  }
  flashLight.intensity = Math.max(0, flashLight.intensity - dt * 320);
}

// ---------------------------------------------------------------- ray utils
const _tmpV1 = new THREE.Vector3(), _tmpV2 = new THREE.Vector3(), _tmpV3 = new THREE.Vector3();

function rayAABB(origin, dir, box, maxDist) { // slab method -> t or null
  let tmin = 0, tmax = maxDist;
  for (const ax of ['x', 'y', 'z']) {
    const o = origin[ax], d = dir[ax];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[ax] || o > box.max[ax]) return null;
    } else {
      let t1 = (box.min[ax] - o) / d, t2 = (box.max[ax] - o) / d;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function rayWorld(origin, dir, maxDist) { // nearest static-world hit
  let best = null;
  for (const box of map.colliders) {
    const t = rayAABB(origin, dir, box, maxDist);
    if (t !== null && (best === null || t < best)) best = t;
  }
  // ground plane
  if (dir.y < -1e-6) {
    const t = -origin.y / dir.y;
    if (t > 0 && t < maxDist && (best === null || t < best)) best = t;
  }
  return best;
}

function raySphere(origin, dir, center, radius, maxDist) {
  _tmpV1.subVectors(center, origin);
  const tca = _tmpV1.dot(dir);
  if (tca < 0 || tca > maxDist + radius) return null;
  const d2 = _tmpV1.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const t = tca - Math.sqrt(r2 - d2);
  return t > 0 && t < maxDist ? t : null;
}

// hit-test a humanoid at feet-position `pos` (crouch flag) -> {t, part} or null
function rayBody(origin, dir, pos, crouch, maxDist) {
  const zones = crouch
    ? [['head', 1.30, 0.21], ['chest', 0.95, 0.32], ['legs', 0.45, 0.3]]
    : [['head', 1.68, 0.21], ['chest', 1.22, 0.32], ['chest', 0.92, 0.29], ['legs', 0.5, 0.3]];
  let best = null;
  for (const [part, dy, r] of zones) {
    _tmpV2.set(pos.x, pos.y + dy, pos.z);
    const t = raySphere(origin, dir, _tmpV2, r, maxDist);
    if (t !== null && (best === null || t < best.t)) best = { t, part };
  }
  return best;
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// audio positioning relative to camera
function audioAt(pos) {
  _tmpV1.subVectors(pos, camera.position);
  const d = _tmpV1.length();
  const vol = Math.min(1, 16 / (5 + d));
  _tmpV2.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const pan = d > 0.5 ? THREE.MathUtils.clamp(_tmpV1.normalize().dot(_tmpV2), -1, 1) * 0.8 : 0;
  return { vol, pan };
}

// ---------------------------------------------------------------- game state
let mode = 'menu'; // menu | playing
let practice = false;
let net = null;
let myId = null, myName = 'GHOST', myColorIdx = 0;
let roomCode = null;
let nextColorIdx = 1, nextPlayerNum = 1; // host bookkeeping
const peerToPlayer = new Map(); // host: peerJsId -> playerId

const players = new Map(); // id -> {id, name, colorIdx, kills, deaths}
const remotes = new Map(); // id -> remote entity
const bots = [];

const player = {
  pos: new THREE.Vector3(0, 0.05, 30), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0, crouch: false, grounded: false,
  hp: 100, mag: MAG_SIZE, reserve: RESERVE_START,
  dead: false, deadT: 0, boltT: 0, reloadT: 0,
  scoped: false, scopeT: 0, breath: 1, holdingBreath: false,
  recoil: 0, lastDamageT: -99, spawnProtT: 0,
  stepT: 0, sendT: 0, walkT: 0, viewY: 0,
};

const keys = {};
let time = 0;

// ---------------------------------------------------------------- remotes
function createRemote(id, name, colorIdx, skin = 0) {
  if (remotes.has(id) || id === myId) return;
  const { group, refs } = createSoldier(PLAYER_COLORS[colorIdx % PLAYER_COLORS.length], name, skin);
  group.visible = false;
  scene.add(group);
  remotes.set(id, {
    id, name, model: group, refs,
    buf: [], lastPos: new THREE.Vector3(), speed: 0,
    crouch: false, dead: false, pitch: 0, stepT: 0,
  });
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (r) { scene.remove(r.model); remotes.delete(id); }
}

function updateRemotes(dt) {
  const renderT = time - INTERP_DELAY;
  for (const r of remotes.values()) {
    const buf = r.buf;
    while (buf.length > 2 && buf[1].t < renderT) buf.shift();
    if (!buf.length) continue;
    r.model.visible = true;
    let px, py, pz, yaw, pitch;
    if (buf.length === 1 || buf[0].t >= renderT) {
      ({ x: px, y: py, z: pz, yaw, pitch } = buf[0]);
      r.crouch = !!buf[0].cr; r.dead = !!buf[0].dead;
    } else {
      const a = buf[0], b = buf[1];
      const f = THREE.MathUtils.clamp((renderT - a.t) / Math.max(1e-3, b.t - a.t), 0, 1);
      px = a.x + (b.x - a.x) * f; py = a.y + (b.y - a.y) * f; pz = a.z + (b.z - a.z) * f;
      yaw = angleLerp(a.yaw, b.yaw, f); pitch = a.pitch + (b.pitch - a.pitch) * f;
      r.crouch = !!b.cr; r.dead = !!b.dead;
    }
    _tmpV3.set(px, py, pz);
    r.speed = r.speed * 0.85 + (_tmpV3.distanceTo(r.lastPos) / Math.max(dt, 1e-3)) * 0.15;
    r.lastPos.copy(_tmpV3);
    r.model.position.set(px, py, pz);
    r.model.rotation.y = yaw;
    r.pitch = pitch;
    animateSoldier(r.refs, dt, { speed: r.speed, crouch: r.crouch, dead: r.dead, pitch });
    if (r.refs.nameSpr) r.refs.nameSpr.visible = !r.dead;
    // faint footsteps
    if (!r.dead && r.speed > 1.5) {
      r.stepT -= dt;
      if (r.stepT <= 0) {
        r.stepT = 0.38;
        const d = r.model.position.distanceTo(camera.position);
        if (d < 26) { const { vol, pan } = audioAt(r.model.position); SFX.footstep(vol * 0.5, pan); }
      }
    }
  }
}

// ---------------------------------------------------------------- HUD
const hud = $('hud'), menuEl = $('menu'), menuHint = $('menuHint');
let centerMsgT = 0;

function setCenterMsg(msg, sub = '', dur = 3) {
  $('centerMsg').textContent = msg;
  $('subMsg').textContent = sub;
  centerMsgT = dur;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.opacity = 0; }, 2400);
}

function addKillfeed(killerName, victimName, headshot, involvesMe) {
  const kf = $('killfeed');
  const div = document.createElement('div');
  div.className = 'kf' + (involvesMe ? ' me' : '');
  div.innerHTML = `<span class="k">${esc(killerName)}</span> ${headshot ? '<span class="hs">☠ HEADSHOT</span>' : '⌖'} <span class="v">${esc(victimName)}</span>`;
  kf.appendChild(div);
  while (kf.children.length > 5) kf.removeChild(kf.firstChild);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6500);
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function updateScoreboard() {
  const rows = [...players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  $('scoreBody').innerHTML = rows.map(p =>
    `<tr${p.id === myId ? ' class="me"' : ''}><td>${esc(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('');
}

function updateHud() {
  $('hpnum').textContent = Math.ceil(Math.max(0, player.hp));
  const f = $('healthfill');
  f.style.width = Math.max(0, player.hp) + '%';
  f.style.background = player.hp > 50 ? 'linear-gradient(90deg,#8fce62,#c8e25b)'
    : player.hp > 25 ? 'linear-gradient(90deg,#d8a43c,#e2c25b)' : 'linear-gradient(90deg,#c23b2e,#e2645b)';
  $('magN').textContent = player.mag;
  $('resN').textContent = player.reserve;
  $('reloadHint').textContent = player.reloadT > 0 ? 'RELOADING…'
    : (player.mag === 0 ? (player.reserve > 0 ? 'PRESS [R] TO RELOAD' : 'OUT OF AMMO') : (player.boltT > 0 ? 'CYCLING BOLT…' : ''));
  const dmgAge = time - player.lastDamageT;
  $('vignette').style.opacity = Math.max(dmgAge < 0.5 ? (1 - dmgAge * 2) * 0.9 : 0, (1 - player.hp / 100) * 0.45);
}

function showHitmarker(head) {
  const h = $('hitmarker');
  h.className = head ? 'head show' : 'show';
  h.style.animation = 'none';
  void h.offsetWidth;
  h.style.animation = '';
}

// ---------------------------------------------------------------- protocol
function makeNet() {
  net = new Net();
  net.onData = onNetData;
  net.onPeerConnect = () => { };
  net.onPeerDisconnect = (peerJsId) => {
    const pid = peerToPlayer.get(peerJsId);
    if (pid) {
      peerToPlayer.delete(peerJsId);
      const p = players.get(pid);
      if (p) toast(p.name + ' left the match');
      players.delete(pid);
      removeRemote(pid);
      net.relay({ t: 'leave', id: pid }, peerJsId);
      broadcastScores();
      updateScoreboard();
    }
  };
  net.onDisconnected = () => {
    toast('Lost connection to host');
    leaveMatch();
  };
}

function onNetData(msg, fromPeerJsId) {
  if (!msg || typeof msg !== 'object') return;
  const isHost = net && net.isHost;

  switch (msg.t) {
    case 'hello': { // host only
      if (!isHost) return;
      const pid = 'p' + (nextPlayerNum++);
      const colorIdx = (nextColorIdx++) % PLAYER_COLORS.length;
      peerToPlayer.set(fromPeerJsId, pid);
      const name = String(msg.name || 'GHOST').slice(0, 14) || 'GHOST';
      const skin = (msg.skin | 0) % RIFLE_FINISHES.length;
      players.set(pid, { id: pid, name, colorIdx, skin, kills: 0, deaths: 0 });
      net.sendTo(fromPeerJsId, {
        t: 'welcome', id: pid, colorIdx,
        roster: [...players.values()].map(p => ({ id: p.id, name: p.name, colorIdx: p.colorIdx, skin: p.skin || 0, kills: p.kills, deaths: p.deaths })),
      });
      net.relay({ t: 'join', p: { id: pid, name, colorIdx, skin } }, fromPeerJsId);
      createRemote(pid, name, colorIdx, skin);
      toast(name + ' joined the match');
      setCenterMsg('', '');
      updateScoreboard();
      break;
    }
    case 'join': {
      players.set(msg.p.id, { ...msg.p, kills: 0, deaths: 0 });
      createRemote(msg.p.id, msg.p.name, msg.p.colorIdx, msg.p.skin);
      toast(msg.p.name + ' joined the match');
      updateScoreboard();
      break;
    }
    case 'leave': {
      const p = players.get(msg.id);
      if (p) toast(p.name + ' left the match');
      players.delete(msg.id);
      removeRemote(msg.id);
      updateScoreboard();
      break;
    }
    case 's': { // player state snapshot
      if (isHost) net.relay(msg, fromPeerJsId);
      const r = remotes.get(msg.id);
      if (r) {
        r.buf.push({ t: time, x: msg.p[0], y: msg.p[1], z: msg.p[2], yaw: msg.yaw, pitch: msg.pi, cr: msg.cr, dead: msg.dead });
        if (r.buf.length > 30) r.buf.shift();
      }
      break;
    }
    case 'shoot': {
      if (isHost) net.relay(msg, fromPeerJsId);
      handleRemoteShot(msg);
      break;
    }
    case 'hit': {
      if (isHost) net.relay(msg, fromPeerJsId);
      if (msg.to === myId) receiveDamage(msg.dmg, msg.from, msg.part);
      break;
    }
    case 'die': {
      if (isHost) {
        net.relay(msg, fromPeerJsId);
        const killer = players.get(msg.k), victim = players.get(msg.v);
        if (killer) killer.kills++;
        if (victim) victim.deaths++;
        broadcastScores();
      }
      handleDieMsg(msg);
      break;
    }
    case 'score': {
      for (const s of msg.list) {
        const p = players.get(s.id);
        if (p) { p.kills = s.k; p.deaths = s.d; }
      }
      updateScoreboard();
      break;
    }
    case 'ping': {
      if (isHost) net.sendTo(fromPeerJsId, { t: 'pong', ts: msg.ts });
      break;
    }
    case 'pong': {
      $('pingChip').textContent = 'PING ' + Math.round(performance.now() - msg.ts) + ' MS';
      break;
    }
  }
}

function broadcastScores() {
  if (!net || !net.isHost) return;
  const list = [...players.values()].map(p => ({ id: p.id, k: p.kills, d: p.deaths }));
  net.send({ t: 'score', list });
  updateScoreboard();
}

function handleDieMsg(msg) {
  const killer = players.get(msg.k), victim = players.get(msg.v);
  addKillfeed(killer ? killer.name : '?', victim ? victim.name : '?', msg.hs, msg.k === myId || msg.v === myId);
  if (msg.k === myId) {
    SFX.killConfirm();
    setCenterMsg(msg.hs ? 'HEADSHOT ELIMINATION' : 'TARGET ELIMINATED', '+1 KILL', 2.2);
    if (!net || net.isHost) { /* host already counted */ }
  }
  if (!net) { // practice: count locally
    if (killer) killer.kills++;
    if (victim) victim.deaths++;
    updateScoreboard();
  }
}

function handleRemoteShot(msg) {
  const origin = _tmpV1.set(msg.o[0], msg.o[1], msg.o[2]).clone();
  const dir = _tmpV2.set(msg.d[0], msg.d[1], msg.d[2]).clone().normalize();
  // tracer from the shooter's rifle if we can see their model
  const r = remotes.get(msg.id);
  let from = origin.clone().addScaledVector(dir, 0.8);
  if (r && r.model.visible && r.refs.muzzle) {
    r.refs.muzzle.getWorldPosition(from);
  }
  const tW = rayWorld(origin, dir, 400);
  const end = origin.clone().addScaledVector(dir, tW !== null ? tW : 400);
  spawnTracer(from, end);
  if (tW !== null) { spawnPuff(end, 1); const a = audioAt(end); SFX.impact(a.vol, a.pan); }
  const a = audioAt(origin);
  SFX.distantShot(Math.min(0.85, a.vol + 0.15), a.pan);
  // bullet whiz if it passes near my head
  if (!player.dead) {
    _tmpV3.copy(camera.position).sub(origin);
    const along = _tmpV3.dot(dir);
    if (along > 2 && (tW === null || along < tW)) {
      const closest = _tmpV3.addScaledVector(dir, -along).length();
      if (closest < 2.2) SFX.whiz(0.7, 0);
    }
  }
}

// ---------------------------------------------------------------- damage / death
function receiveDamage(dmg, fromId, part) {
  if (player.dead || mode !== 'playing') return;
  if (time < player.spawnProtT) return;
  player.hp -= dmg;
  player.lastDamageT = time;
  SFX.damaged();
  if (part === 'head') SFX.heartbeat();
  if (player.hp <= 0) dieLocal(fromId, part === 'head');
}

function dieLocal(killerId, headshot) {
  player.dead = true;
  player.deadT = 4;
  player.scoped = false; player.holdingBreath = false;
  SFX.death();
  const me = players.get(myId);
  const dieMsg = { t: 'die', v: myId, k: killerId, hs: headshot };
  if (net) {
    net.send(dieMsg);
    if (net.isHost) {
      const killer = players.get(killerId);
      if (killer) killer.kills++;
      if (me) me.deaths++;
      broadcastScores();
    }
  } else {
    handleDieMsg(dieMsg); // practice mode
  }
  if (net && !net.isHost) handleDieMsg(dieMsg); // clients see their own feed entry via local call (host relays to others)
  if (net && net.isHost) handleDieMsg(dieMsg);
  const killer = players.get(killerId);
  $('deathBy').textContent = killer ? 'Taken out by ' + killer.name : '';
  $('deathScreen').style.display = 'flex';
}

function respawn() {
  const spawn = pickSpawn();
  player.pos.copy(spawn);
  player.viewY = spawn.y;
  player.vel.set(0, 0, 0);
  player.hp = 100; player.mag = MAG_SIZE; player.reserve = RESERVE_START;
  player.dead = false; player.boltT = 0; player.reloadT = 0;
  player.scoped = false; player.breath = 1; player.recoil = 0;
  player.spawnProtT = time + 2;
  player.yaw = Math.atan2(spawn.x, spawn.z); // face map center
  player.pitch = 0;
  $('deathScreen').style.display = 'none';
  SFX.respawn();
  sendState(true);
  if (document.pointerLockElement !== canvas) {
    try { canvas.requestPointerLock(); } catch (e) { /* needs a click — pause overlay covers it */ }
  }
}

function pickSpawn() {
  const enemies = [];
  for (const r of remotes.values()) if (!r.dead && r.model.visible) enemies.push(r.model.position);
  for (const b of bots) if (!b.dead) enemies.push(b.pos);
  let best = map.spawns[0], bestScore = -1;
  for (const s of map.spawns) {
    let minD = 1e9;
    for (const e of enemies) minD = Math.min(minD, s.distanceTo(e));
    const score = minD + Math.random() * 8;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best.clone();
}

// ---------------------------------------------------------------- movement & collision
function boxOverlaps(px, py, pz, half, height, box) {
  return px + half > box.min.x && px - half < box.max.x &&
    py + height > box.min.y && py < box.max.y &&
    pz + half > box.min.z && pz - half < box.max.z;
}

function moveEntity(pos, vel, dt, height, opts = {}) {
  const half = RADIUS;
  let grounded = false;

  // Y axis — only land on tops we were above, only bonk ceilings we were below
  const prevY = pos.y;
  pos.y += vel.y * dt;
  if (pos.y < 0) { pos.y = 0; vel.y = 0; grounded = true; }
  for (const box of map.colliders) {
    if (!boxOverlaps(pos.x, pos.y, pos.z, half, height, box)) continue;
    if (vel.y <= 0 && prevY >= box.max.y - 1e-3) { pos.y = box.max.y; vel.y = 0; grounded = true; }
    else if (vel.y > 0 && prevY + height <= box.min.y + 1e-3) { pos.y = box.min.y - height; vel.y = 0; }
  }

  // X / Z axes with step-up
  for (const [ax, other] of [['x', 'z'], ['z', 'x']]) {
    const delta = vel[ax] * dt;
    if (Math.abs(delta) < 1e-9) continue;
    pos[ax] += delta;
    for (const box of map.colliders) {
      if (!boxOverlaps(pos.x, pos.y, pos.z, half, height, box)) continue;
      // try stepping up onto low obstacles
      const stepH = box.max.y - pos.y;
      if (grounded && stepH > 0 && stepH <= STEP_UP) {
        let free = true;
        for (const b2 of map.colliders) {
          if (boxOverlaps(pos.x, box.max.y + 0.01, pos.z, half, height, b2)) { free = false; break; }
        }
        if (free) { pos.y = box.max.y + 0.01; continue; }
      }
      if (delta > 0) pos[ax] = box.min[ax] - half - 0.001;
      else pos[ax] = box.max[ax] + half + 0.001;
    }
  }

  // ground stick check (walking off a step)
  if (!grounded && vel.y <= 0) {
    for (const box of map.colliders) {
      if (pos.x + half > box.min.x && pos.x - half < box.max.x &&
        pos.z + half > box.min.z && pos.z - half < box.max.z &&
        pos.y >= box.max.y - 0.08 && pos.y <= box.max.y + 0.02) {
        pos.y = box.max.y; vel.y = 0; grounded = true; break;
      }
    }
    if (pos.y <= 0.02 && pos.y >= -0.02) { pos.y = 0; grounded = true; }
  }
  return grounded;
}

function updatePlayer(dt) {
  if (player.dead) {
    player.deadT -= dt;
    $('respawnIn').textContent = 'REDEPLOYING IN ' + Math.max(0, player.deadT).toFixed(1);
    if (player.deadT <= 0) respawn();
    return;
  }

  // hp regen
  if (player.hp < 100 && time - player.lastDamageT > 6) {
    player.hp = Math.min(100, player.hp + 13 * dt);
  }

  // timers
  if (player.boltT > 0) player.boltT -= dt;
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      const need = MAG_SIZE - player.mag;
      const take = Math.min(need, player.reserve);
      player.mag += take; player.reserve -= take;
    }
  }

  // scope blend
  const wantScope = player.scoped && !player.dead && player.reloadT <= 0;
  player.scopeT += ((wantScope ? 1 : 0) - player.scopeT) * Math.min(1, dt * 10);
  const sc = player.scopeT;
  camera.fov = FOV + (SCOPE_FOV - FOV) * (sc * sc * (3 - 2 * sc));
  camera.updateProjectionMatrix();
  $('scope').style.display = sc > 0.75 ? 'block' : 'none';
  $('crosshair').style.display = sc > 0.3 ? 'none' : 'block';
  viewmodel.visible = sc < 0.65;
  $('breath').style.display = sc > 0.75 && player.breath > 0.05 && !player.holdingBreath ? 'block' : 'none';

  // breath / steadiness
  if (player.holdingBreath && player.scoped) {
    player.breath = Math.max(0, player.breath - dt / 3.2);
    if (player.breath <= 0) player.holdingBreath = false;
  } else {
    player.breath = Math.min(1, player.breath + dt / 2.2);
  }

  // movement input
  const fwd = (dn('forward') ? 1 : 0) - (dn('back') ? 1 : 0);
  const strafe = (dn('right') ? 1 : 0) - (dn('left') ? 1 : 0);
  const sprinting = dn('sprint') && fwd > 0 && !player.scoped && !player.crouch;
  let speed = player.scoped ? SCOPED_SPD : player.crouch ? CROUCH_SPD : sprinting ? SPRINT : WALK;

  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let mx = (-sin * fwd + cos * strafe);
  let mz = (-cos * fwd - sin * strafe);
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  player.vel.x = mx * speed;
  player.vel.z = mz * speed;

  // jump & gravity
  if (dn('jump') && player.grounded && !player.scoped) {
    player.vel.y = JUMP;
    player.grounded = false;
  }
  player.vel.y -= GRAV * dt;

  const height = player.crouch ? H_CROUCH : H_STAND;
  player.grounded = moveEntity(player.pos, player.vel, dt, height);
  if (player.grounded && player.vel.y < 0) player.vel.y = 0;

  // footsteps
  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded && hSpeed > 0.5) {
    player.walkT += dt * hSpeed;
    player.stepT -= dt;
    if (player.stepT <= 0) {
      player.stepT = 2.2 / hSpeed;
      SFX.footstep(player.crouch ? 0.08 : 0.2);
    }
  }

  // recoil recovery
  player.recoil = Math.max(0, player.recoil - dt * 0.35);

  // camera — the eye height is smoothed so stairs feel like a ramp, not jolts
  if (player.grounded) {
    const dy = player.pos.y - player.viewY;
    if (Math.abs(dy) > 1.6) player.viewY = player.pos.y;
    else player.viewY += dy * Math.min(1, dt * 13);
  } else {
    player.viewY = player.pos.y; // airborne: track exactly
  }
  const eye = player.crouch ? EYE_CROUCH : EYE_STAND;
  const bob = player.grounded && hSpeed > 0.5 ? Math.sin(player.walkT * 2.2) * 0.03 * Math.min(1, hSpeed / WALK) : 0;
  camera.position.set(player.pos.x, player.viewY + eye + bob, player.pos.z);

  // scope sway
  let swayY = 0, swayP = 0;
  if (sc > 0.4) {
    const steady = player.holdingBreath && player.breath > 0 ? 0.16 : 1;
    const moveP = 1 + hSpeed * 0.7;
    const amp = 0.0035 * steady * moveP;
    swayY = (Math.sin(time * 1.6) + Math.sin(time * 2.7) * 0.5) * amp;
    swayP = (Math.sin(time * 2.1 + 1.7) + Math.sin(time * 3.3) * 0.5) * amp * 0.8;
  }
  camera.rotation.y = player.yaw + swayY;
  camera.rotation.x = THREE.MathUtils.clamp(player.pitch + player.recoil + swayP, -1.55, 1.55);

  // viewmodel bob/lag
  viewmodel.position.y = Math.sin(player.walkT * 2.2) * 0.008 * Math.min(1, hSpeed / WALK) - (player.reloadT > 0 ? 0.12 : 0);
  viewmodel.rotation.x = player.reloadT > 0 ? -0.35 : (player.boltT > 0.6 ? -0.1 : 0);

  // network send
  player.sendT -= dt;
  if (player.sendT <= 0) { player.sendT = SEND_RATE; sendState(); }
}

function sendState(force) {
  if (!net) return;
  net.send({
    t: 's', id: myId,
    p: [+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)],
    yaw: +player.yaw.toFixed(3), pi: +player.pitch.toFixed(3),
    cr: player.crouch ? 1 : 0, dead: player.dead ? 1 : 0,
  });
}

// ---------------------------------------------------------------- shooting
function tryFire() {
  if (mode !== 'playing' || player.dead || player.reloadT > 0 || player.boltT > 0) return;
  if (player.mag <= 0) {
    SFX.dryFire();
    if (player.reserve > 0) startReload();
    return;
  }
  player.mag--;
  player.boltT = BOLT_TIME;
  setTimeout(() => { if (!player.dead) SFX.bolt(); }, 420);

  // direction with spread
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const spread = player.scopeT > 0.7 ? 0.0012 : 0.035;
  if (spread > 0) {
    const u = new THREE.Vector3().randomDirection().multiplyScalar(spread * Math.random());
    dir.add(u).normalize();
  }
  const origin = camera.position.clone();

  // muzzle position for the tracer
  let from;
  if (viewmodel.visible) {
    from = new THREE.Vector3();
    fpRifle.userData.muzzle.getWorldPosition(from);
  } else {
    from = origin.clone().addScaledVector(dir, 1.2).addScaledVector(new THREE.Vector3(0, -0.06, 0), 1);
  }

  // hit test: world vs bodies
  const MAXD = 400;
  const tW = rayWorld(origin, dir, MAXD);
  let bestBody = null, bestTarget = null;
  const testTarget = (id, pos, crouch, dead, isBot, bot) => {
    if (dead) return;
    const hit = rayBody(origin, dir, pos, crouch, MAXD);
    if (hit && (tW === null || hit.t < tW) && (!bestBody || hit.t < bestBody.t)) {
      bestBody = hit; bestTarget = { id, isBot, bot };
    }
  };
  for (const r of remotes.values()) {
    if (!r.model.visible) continue;
    testTarget(r.id, r.model.position, r.crouch, r.dead, false, null);
  }
  for (const b of bots) testTarget(b.id, b.pos, b.crouch, b.dead, true, b);

  const endT = bestBody ? bestBody.t : (tW !== null ? tW : MAXD);
  const end = origin.clone().addScaledVector(dir, endT);

  // effects
  SFX.shot();
  spawnTracer(from, end);
  flashLight.position.copy(from);
  flashLight.intensity = 30;
  spawnPuff(from, 0.5, 0xffd9a0);
  player.recoil += player.scopeT > 0.5 ? 0.028 : 0.045;
  player.pitch += 0.006;

  if (bestBody) {
    spawnBlood(end);
    const head = bestBody.part === 'head';
    showHitmarker(head);
    if (head) SFX.headshot(); else SFX.hitmarker();
    const dmg = DMG[bestBody.part] || DMG.chest;
    if (bestTarget.isBot) {
      damageBot(bestTarget.bot, dmg, bestBody.part);
    } else if (net) {
      net.send({ t: 'hit', from: myId, to: bestTarget.id, dmg, part: bestBody.part });
    }
  } else if (tW !== null) {
    spawnPuff(end, 1);
    const a = audioAt(end);
    SFX.impact(a.vol, a.pan);
  }

  if (net) net.send({ t: 'shoot', id: myId, o: [origin.x, origin.y, origin.z], d: [dir.x, dir.y, dir.z] });

  if (player.mag === 0 && player.reserve > 0) {
    setTimeout(() => { if (player.mag === 0 && player.reloadT <= 0 && !player.dead) startReload(); }, BOLT_TIME * 1000 + 100);
  }
}

function startReload() {
  if (player.reloadT > 0 || player.mag >= MAG_SIZE || player.reserve <= 0 || player.dead) return;
  player.reloadT = RELOAD_TIME;
  player.scoped = false;
  SFX.reload();
}

// ---------------------------------------------------------------- bots (practice)
const BOT_NAMES = ['VULTURE', 'JACKAL', 'MIRAGE', 'FENNEC', 'SIROCCO'];
function spawnBots() {
  for (let i = 0; i < 5; i++) {
    const id = 'bot' + i;
    const colorIdx = (i + 1) % PLAYER_COLORS.length;
    const { group, refs } = createSoldier(PLAYER_COLORS[colorIdx], BOT_NAMES[i], (i + 1) % RIFLE_FINISHES.length);
    scene.add(group);
    const spawn = map.spawns[(i * 3 + 4) % map.spawns.length].clone();
    players.set(id, { id, name: BOT_NAMES[i], colorIdx, kills: 0, deaths: 0 });
    bots.push({
      id, name: BOT_NAMES[i], model: group, refs,
      pos: spawn, vel: new THREE.Vector3(), yaw: 0,
      hp: 100, dead: false, respawnT: 0, crouch: false,
      target: null, waitT: 0, aimT: 0, cooldown: 2 + Math.random() * 3, speed: 0,
    });
  }
}

function groundWaypoint() {
  const g = map.spawns.filter(s => s.y < 1);
  return g[Math.floor(Math.random() * g.length)].clone();
}

function damageBot(bot, dmg, part) {
  if (bot.dead) return;
  bot.hp -= dmg;
  if (bot.hp <= 0) {
    bot.dead = true;
    bot.respawnT = 6;
    handleDieMsg({ t: 'die', v: bot.id, k: myId, hs: part === 'head' });
  }
}

function updateBots(dt) {
  for (const bot of bots) {
    if (bot.dead) {
      animateSoldier(bot.refs, dt, { speed: 0, crouch: false, dead: true, pitch: 0 });
      bot.refs.nameSpr.visible = false;
      bot.respawnT -= dt;
      if (bot.respawnT <= 0) {
        bot.dead = false; bot.hp = 100;
        bot.pos.copy(pickSpawn());
        bot.refs.nameSpr.visible = true;
      }
      continue;
    }
    // wandering
    if (!bot.target || bot.waitT > 0) {
      bot.waitT -= dt;
      if (bot.waitT <= 0) bot.target = groundWaypoint();
    }
    let moving = false;
    if (bot.target) {
      _tmpV1.subVectors(bot.target, bot.pos); _tmpV1.y = 0;
      const d = _tmpV1.length();
      if (d < 1.2) {
        bot.target = null; bot.waitT = 1 + Math.random() * 3;
        bot.vel.x = bot.vel.z = 0;
      } else {
        _tmpV1.normalize();
        const sp = 3.1;
        bot.vel.x = _tmpV1.x * sp; bot.vel.z = _tmpV1.z * sp;
        bot.yaw = Math.atan2(-_tmpV1.x, -_tmpV1.z);
        moving = true;
      }
    }
    bot.vel.y -= GRAV * dt;
    const before = bot.pos.clone();
    moveEntity(bot.pos, bot.vel, dt, H_STAND);
    if (bot.vel.y < 0) bot.vel.y = 0;
    bot.speed = before.distanceTo(bot.pos) / Math.max(dt, 1e-3);
    if (moving && bot.speed < 0.4) { bot.target = null; bot.waitT = 0.2; } // stuck

    // engage the player
    if (!player.dead) {
      const eye = _tmpV2.set(bot.pos.x, bot.pos.y + 1.6, bot.pos.z);
      _tmpV3.copy(camera.position).sub(eye);
      const dist = _tmpV3.length();
      if (dist < 90) {
        const dir = _tmpV3.clone().normalize();
        const tW = rayWorld(eye, dir, dist - 0.5);
        if (tW === null) { // clear line of sight
          bot.yaw = Math.atan2(-dir.x, -dir.z);
          bot.aimT += dt;
          bot.cooldown -= dt;
          if (bot.cooldown <= 0 && bot.aimT > 1.4) {
            bot.cooldown = 2.8 + Math.random() * 2.5;
            bot.aimT = 0;
            // fire!
            const miss = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 2.2);
            const aimPoint = camera.position.clone().add(miss);
            const fireDir = aimPoint.sub(eye).normalize();
            const from = new THREE.Vector3();
            bot.refs.muzzle.getWorldPosition(from);
            const tHit = rayWorld(eye, fireDir, 300);
            const hitMe = rayBody(eye, fireDir, player.pos, player.crouch, tHit !== null ? tHit : 300);
            const end = eye.clone().addScaledVector(fireDir, hitMe ? hitMe.t : (tHit !== null ? tHit : 300));
            spawnTracer(from, end);
            const a = audioAt(eye);
            SFX.distantShot(Math.min(0.9, a.vol + 0.2), a.pan);
            if (hitMe) {
              receiveDamage(Math.round(DMG[hitMe.part] * 0.5), bot.id, hitMe.part);
              spawnBlood(end);
            } else {
              SFX.whiz(0.6, 0);
              if (tHit !== null) spawnPuff(end, 1);
            }
          }
        } else bot.aimT = 0;
      } else bot.aimT = 0;
    }

    bot.model.position.copy(bot.pos);
    bot.model.rotation.y = bot.yaw;
    animateSoldier(bot.refs, dt, { speed: bot.speed, crouch: false, dead: false, pitch: 0 });
  }
}

function clearBots() {
  for (const b of bots) scene.remove(b.model);
  bots.length = 0;
}

// ---------------------------------------------------------------- match flow
function startMatch({ isPractice }) {
  practice = isPractice;
  mode = 'playing';
  SFX.stopMusic();
  players.clear();
  players.set(myId, { id: myId, name: myName, colorIdx: myColorIdx, skin: store.skin, kills: 0, deaths: 0 });
  updateScoreboard();
  menuEl.classList.add('hidden');
  menuHint.classList.add('hidden');
  hud.classList.remove('hidden');
  $('roomChip').classList.toggle('hidden', !roomCode);
  if (roomCode) $('roomCode').textContent = roomCode;
  if (isPractice) spawnBots();
  respawn();
  if (net && net.isHost && net.conns.size === 0) {
    setCenterMsg('WAITING FOR PLAYERS', 'Share room code ' + roomCode + ' — or warm up on the locals', 6);
  }
}

function leaveMatch() {
  if (net) { net.destroy(); net = null; }
  clearBots();
  for (const id of [...remotes.keys()]) removeRemote(id);
  players.clear();
  peerToPlayer.clear();
  nextColorIdx = 1; nextPlayerNum = 1;
  roomCode = null;
  mode = 'menu';
  player.dead = false;
  document.exitPointerLock();
  hud.classList.add('hidden');
  $('deathScreen').style.display = 'none';
  $('pauseOverlay').style.display = 'none';
  $('scoreboard').style.display = 'none';
  menuEl.classList.remove('hidden');
  menuHint.classList.remove('hidden');
  setMenuStatus('');
  SFX.setMusicVolume(store.music);
  SFX.startMusic();
}

// ---------------------------------------------------------------- menu wiring
const nameInput = $('nameInput'), codeInput = $('codeInput');
nameInput.value = store.name;
$('sensInput').value = store.sens;
$('sensVal').textContent = store.sens.toFixed(1);
$('volInput').value = store.vol * 100;
$('volVal').textContent = Math.round(store.vol * 100) + '%';
$('musInput').value = store.music * 100;
$('musVal').textContent = Math.round(store.music * 100) + '%';
SFX.volume = store.vol;
SFX.musicVolume = store.music;

$('sensInput').addEventListener('input', (e) => {
  store.sens = parseFloat(e.target.value);
  $('sensVal').textContent = store.sens.toFixed(1);
});
$('volInput').addEventListener('input', (e) => {
  store.vol = parseInt(e.target.value) / 100;
  $('volVal').textContent = e.target.value + '%';
  SFX.setVolume(store.vol);
});
$('musInput').addEventListener('input', (e) => {
  store.music = parseInt(e.target.value) / 100;
  $('musVal').textContent = e.target.value + '%';
  SFX.setMusicVolume(store.music);
});

// ---- tabs
document.querySelectorAll('.tabbtn').forEach(b => b.addEventListener('click', () => {
  SFX.uiClick();
  document.querySelectorAll('.tabbtn').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tabpage').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + b.dataset.tab));
}));

// ---- menu themes
const THEMES = {
  gold: { label: 'Desert Gold', gold: '#e8b44a', dim: '#a8823a', a: '232,180,74' },
  night: { label: 'Night Ops', gold: '#84d65c', dim: '#4f8a3a', a: '132,214,92' },
  crimson: { label: 'Crimson', gold: '#e2604a', dim: '#9a3a2e', a: '226,96,74' },
  arctic: { label: 'Arctic', gold: '#7fc9e8', dim: '#4a7f9a', a: '127,201,232' },
  nightfall: { label: 'Nightfall', gold: '#b48be8', dim: '#7a5aa8', a: '180,139,232' },
};
function applyTheme(key) {
  const t = THEMES[key] || THEMES.gold;
  const r = document.documentElement.style;
  r.setProperty('--gold', t.gold);
  r.setProperty('--gold-dim', t.dim);
  r.setProperty('--goldA', t.a);
  store.theme = key;
  renderThemeRow();
}
function renderThemeRow() {
  const row = $('themeRow');
  row.innerHTML = '';
  for (const [k, t] of Object.entries(THEMES)) {
    const s = document.createElement('button');
    s.className = 'swatch' + (store.theme === k ? ' sel' : '');
    s.style.background = `linear-gradient(135deg, ${t.gold} 50%, ${t.dim} 50%)`;
    s.innerHTML = `<small>${t.label}</small>`;
    s.addEventListener('click', () => { SFX.uiClick(); applyTheme(k); });
    row.appendChild(s);
  }
}

// ---- loadout: rifle finish
function renderFinishRow() {
  const row = $('finishRow');
  row.innerHTML = '';
  RIFLE_FINISHES.forEach((f, i) => {
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const s = document.createElement('button');
    s.className = 'swatch' + (store.skin === i ? ' sel' : '');
    s.style.background = `linear-gradient(135deg, ${hex(f.metal)} 55%, ${hex(f.wood)} 55%)`;
    s.innerHTML = `<small>${f.name}</small>`;
    s.addEventListener('click', () => {
      SFX.uiClick();
      store.skin = i;
      mountViewRifle(i);
      renderFinishRow();
    });
    row.appendChild(s);
  });
}

// ---- loadout: reticle
const RET_STYLES = [['cross', 'CROSSHAIR'], ['dot', 'FINE DOT'], ['post', 'T-POST']];
const RET_COLORS = [['#e02020', 'Red'], ['#ffb840', 'Amber'], ['#39e05c', 'Green'], ['#3fd4e8', 'Cyan']];
function applyReticle() {
  const sc = $('scope');
  sc.classList.remove('ret-dot', 'ret-post');
  if (store.reticle !== 'cross') sc.classList.add('ret-' + store.reticle);
  sc.style.setProperty('--ret', store.retColor);
}
function renderReticleRows() {
  const row = $('reticleRow');
  row.innerHTML = '';
  for (const [k, label] of RET_STYLES) {
    const b = document.createElement('button');
    b.className = 'optbtn' + (store.reticle === k ? ' sel' : '');
    b.textContent = label;
    b.addEventListener('click', () => { SFX.uiClick(); store.reticle = k; applyReticle(); renderReticleRows(); });
    row.appendChild(b);
  }
  const crow = $('retColorRow');
  crow.innerHTML = '';
  for (const [c, label] of RET_COLORS) {
    const s = document.createElement('button');
    s.className = 'swatch' + (store.retColor === c ? ' sel' : '');
    s.style.background = c;
    s.innerHTML = `<small>${label}</small>`;
    s.addEventListener('click', () => { SFX.uiClick(); store.retColor = c; applyReticle(); renderReticleRows(); });
    crow.appendChild(s);
  }
}

// ---- controls: keybinds
function renderBinds() {
  const list = $('bindList');
  list.innerHTML = '';
  for (const [action, label] of BIND_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'bindrow';
    const bl = document.createElement('span');
    bl.className = 'bl';
    bl.textContent = label;
    const btn = document.createElement('button');
    btn.className = 'keybtn' + (bindListening === action ? ' listening' : '');
    btn.textContent = bindListening === action ? 'PRESS KEY…' : prettyKey(binds[action]);
    btn.addEventListener('click', () => {
      SFX.uiClick();
      bindListening = bindListening === action ? null : action;
      renderBinds();
    });
    row.appendChild(bl);
    row.appendChild(btn);
    list.appendChild(row);
  }
}
$('resetBinds').addEventListener('click', () => {
  SFX.uiClick();
  binds = { ...DEFAULT_BINDS };
  store.binds = binds;
  bindListening = null;
  renderBinds();
  updateHint();
});

function updateHint() {
  const k = (a) => prettyKey(binds[a]);
  $('menuHint').innerHTML =
    `<b>${k('forward')}${k('left')}${k('back')}${k('right')}</b> move &nbsp;·&nbsp; <b>RMB</b> scope &nbsp;·&nbsp; <b>LMB</b> fire ` +
    `&nbsp;·&nbsp; <b>${k('sprint')}</b> sprint / breath &nbsp;·&nbsp; <b>${k('reload')}</b> reload &nbsp;·&nbsp; ` +
    `<b>${k('crouch')}</b> crouch &nbsp;·&nbsp; <b>${k('jump')}</b> jump`;
}

// ---- menu music: needs a user gesture before audio can start
document.addEventListener('pointerdown', () => {
  if (mode === 'menu') {
    SFX.init();
    SFX.setVolume(store.vol);
    SFX.startMusic();
  }
});

applyTheme(store.theme);
renderFinishRow();
renderReticleRows();
applyReticle();
renderBinds();
updateHint();

function setMenuStatus(msg, isErr) {
  const el = $('menuStatus');
  el.textContent = msg;
  el.className = isErr ? 'err' : '';
}

function grabName() {
  myName = (nameInput.value.trim() || 'GHOST-' + Math.floor(Math.random() * 90 + 10)).toUpperCase().slice(0, 14);
  store.name = myName;
  return myName;
}

let busy = false;
$('hostBtn').addEventListener('click', async () => {
  if (busy) return; busy = true;
  SFX.init(); SFX.uiClick();
  grabName();
  myId = 'p0'; myColorIdx = 0;
  setMenuStatus('Opening room…');
  try {
    makeNet();
    const code = makeRoomCode();
    await net.hostGame(code);
    roomCode = code;
    startMatch({ isPractice: false });
  } catch (err) {
    setMenuStatus(err.message, true);
    if (net) { net.destroy(); net = null; }
  }
  busy = false;
});

$('joinBtn').addEventListener('click', async () => {
  if (busy) return; busy = true;
  SFX.init(); SFX.uiClick();
  grabName();
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 5) { setMenuStatus('Enter the 5-character room code.', true); busy = false; return; }
  setMenuStatus('Connecting to ' + code + '…');
  try {
    makeNet();
    await net.joinGame(code);
    // handshake: wait for welcome
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Host did not respond.')), 10000);
      const orig = net.onData;
      net.onData = (msg, from) => {
        if (msg && msg.t === 'welcome') {
          clearTimeout(timer);
          myId = msg.id; myColorIdx = msg.colorIdx;
          roomCode = code;
          net.onData = onNetData;
          startMatch({ isPractice: false });
          for (const p of msg.roster) {
            if (p.id === myId) continue;
            players.set(p.id, { ...p });
            createRemote(p.id, p.name, p.colorIdx, p.skin);
          }
          updateScoreboard();
          resolve();
        } else orig(msg, from);
      };
      net.send({ t: 'hello', name: myName, skin: store.skin });
    });
    // ping loop
    setInterval(() => { if (net && !net.isHost) net.send({ t: 'ping', ts: performance.now() }); }, 2000);
  } catch (err) {
    setMenuStatus(err.message, true);
    if (net) { net.destroy(); net = null; }
  }
  busy = false;
});

$('practiceBtn').addEventListener('click', () => {
  SFX.init(); SFX.uiClick();
  grabName();
  myId = 'me'; myColorIdx = 0;
  roomCode = null;
  startMatch({ isPractice: true });
});

$('resumeBtn').addEventListener('click', () => {
  $('pauseOverlay').style.display = 'none';
  canvas.requestPointerLock();
});
$('leaveBtn').addEventListener('click', () => leaveMatch());
$('roomChip').addEventListener('click', () => {
  if (roomCode) { navigator.clipboard && navigator.clipboard.writeText(roomCode); toast('Room code copied'); }
});

// prefill code from #HASH links
if (location.hash && location.hash.length === 6) codeInput.value = location.hash.slice(1).toUpperCase();

// ---------------------------------------------------------------- input
document.addEventListener('keydown', (e) => {
  if (bindListening) { // capturing a new keybind from the controls tab
    e.preventDefault();
    if (e.code !== 'Escape') {
      binds[bindListening] = e.code;
      store.binds = binds;
    }
    bindListening = null;
    renderBinds();
    updateHint();
    return;
  }
  keys[e.code] = true;
  if (mode !== 'playing') return;
  if (e.code === binds.scoreboard) { e.preventDefault(); $('scoreboard').style.display = 'block'; }
  if (e.repeat) return;
  if (e.code === binds.reload) startReload();
  if (e.code === binds.crouch) player.crouch = !player.crouch;
  if (e.code === binds.sprint && player.scoped && player.breath > 0.1) {
    player.holdingBreath = true;
    SFX.breathIn();
  }
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === binds.scoreboard) $('scoreboard').style.display = 'none';
  if (e.code === binds.sprint) player.holdingBreath = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

document.addEventListener('mousemove', (e) => {
  if (mode !== 'playing' || document.pointerLockElement !== canvas || player.dead) return;
  const s = 0.0021 * store.sens * (player.scopeT > 0.5 ? 0.28 : 1);
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.53, 1.53);
});

document.addEventListener('mousedown', (e) => {
  if (mode !== 'playing') return;
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) tryFire();
  if (e.button === 2) {
    if (!player.dead && player.reloadT <= 0) {
      player.scoped = true;
      SFX.scopeIn();
    }
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 2 && player.scoped) {
    player.scoped = false;
    player.holdingBreath = false;
    SFX.scopeOut();
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('click', () => {
  if (mode === 'playing' && !player.dead && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && mode === 'playing' && !player.dead) {
    $('pauseOverlay').style.display = 'flex';
  } else {
    $('pauseOverlay').style.display = 'none';
  }
});

// ---------------------------------------------------------------- menu camera
let menuCamT = 0;
function updateMenuCamera(dt) {
  menuCamT += dt * 0.06;
  const r = 52;
  camera.position.set(Math.cos(menuCamT) * r, 24 + Math.sin(menuCamT * 0.7) * 5, Math.sin(menuCamT) * r);
  camera.lookAt(0, 5, 0);
  camera.fov = FOV;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- main loop
let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;

  map.update(dt, time);
  updateVfx(dt);

  if (mode === 'menu') {
    updateMenuCamera(dt);
  } else {
    updatePlayer(dt);
    updateRemotes(dt);
    if (practice) updateBots(dt);
    updateHud();
    if (centerMsgT > 0) {
      centerMsgT -= dt;
      if (centerMsgT <= 0) { $('centerMsg').textContent = ''; $('subMsg').textContent = ''; }
    }
  }

  renderer.render(scene, camera);
});
