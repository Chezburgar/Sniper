// Procedural sniper operative + bolt-action rifle, with code-driven
// walk/crouch/aim/death animation. Model forward is -Z (matches camera yaw 0).
import * as THREE from 'three';

const matSkin = new THREE.MeshStandardMaterial({ color: 0xc99f78, roughness: 0.85 });
const matBoot = new THREE.MeshStandardMaterial({ color: 0x241d15, roughness: 0.9 });
const matDarkGear = new THREE.MeshStandardMaterial({ color: 0x2c2a24, roughness: 0.9 });

export const PLAYER_COLORS = [0xc8b06a, 0x7da0c4, 0xb56a5e, 0x86a86b, 0xa78bc0, 0xc4925e, 0x6fb3a8, 0xc0c0c0];

// ---- rifle finishes (customizable in the menu) ----
export const RIFLE_FINISHES = [
  { name: 'MIDNIGHT', metal: 0x23262a, wood: 0x33363c, metalness: 0.7, rough: 0.45 },
  { name: 'DESERT FANG', metal: 0x5c5244, wood: 0xa8825a, metalness: 0.5, rough: 0.6 },
  { name: 'JUNGLE VIPER', metal: 0x39413a, wood: 0x55663f, metalness: 0.5, rough: 0.65 },
  { name: 'ARCTIC GHOST', metal: 0xaeb8bf, wood: 0xdde3e7, metalness: 0.6, rough: 0.35 },
  { name: 'GILDED KING', metal: 0xc9a23e, wood: 0x2c2417, metalness: 0.95, rough: 0.22 },
];

// desert camo for the uniform (shared)
let _camoTex = null;
function camoTexture() {
  if (_camoTex) return _camoTex;
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#77704f'; ctx.fillRect(0, 0, S, S);
  const tones = ['#5c563f', '#8a8161', '#4a4636', '#938a68'];
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = tones[i % 4];
    const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 11;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, 7);
    ctx.fill();
  }
  _camoTex = new THREE.CanvasTexture(c);
  _camoTex.wrapS = _camoTex.wrapT = THREE.RepeatWrapping;
  _camoTex.colorSpace = THREE.SRGBColorSpace;
  return _camoTex;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createRifle(finishIdx = 0) {
  const fin = RIFLE_FINISHES[finishIdx % RIFLE_FINISHES.length];
  const matMetal = new THREE.MeshStandardMaterial({
    color: fin.metal, roughness: fin.rough, metalness: fin.metalness
  });
  const matWood = new THREE.MeshStandardMaterial({
    color: fin.wood, roughness: Math.min(0.85, fin.rough + 0.2), metalness: fin.metalness * 0.3
  });
  const g = new THREE.Group();
  // stock with cheek riser
  g.add(box(0.07, 0.11, 0.34, matWood, 0, -0.02, 0.28));
  g.add(box(0.07, 0.16, 0.12, matWood, 0, -0.06, 0.42));
  g.add(box(0.055, 0.045, 0.16, matWood, 0, 0.055, 0.33));
  // receiver + trigger guard + magazine
  g.add(box(0.08, 0.11, 0.5, matMetal, 0, 0, -0.05));
  g.add(box(0.05, 0.07, 0.12, matMetal, 0, -0.09, 0.02));
  g.add(box(0.055, 0.09, 0.14, matMetal, 0, -0.1, -0.12));
  // barrel + muzzle brake
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.85, 8), matMetal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.7); barrel.castShadow = true;
  g.add(barrel);
  const mb = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.09, 8), matMetal);
  mb.rotation.x = Math.PI / 2; mb.position.set(0, 0.01, -1.1);
  g.add(mb);
  // scope + lens
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.3, 10), matMetal);
  scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.1, -0.12); scope.castShadow = true;
  g.add(scope);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.03, 10),
    new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2, metalness: 0.4 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.1, -0.28);
  g.add(lens);
  g.add(box(0.03, 0.05, 0.06, matMetal, 0, 0.06, -0.12)); // mount
  // bolt handle
  g.add(box(0.09, 0.03, 0.03, matMetal, 0.06, 0.02, 0.08));
  // bipod (folded)
  g.add(box(0.02, 0.02, 0.22, matMetal, -0.03, -0.04, -0.85));
  g.add(box(0.02, 0.02, 0.22, matMetal, 0.03, -0.04, -0.85));
  // muzzle marker for tracers / flash
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -1.16);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

function makeNameSprite(name, colorHex) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '700 52px Rajdhani, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#' + new THREE.Color(colorHex).getHexString();
  ctx.fillText(name.toUpperCase(), 256, 48);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(2.4, 0.45, 1);
  spr.position.y = 2.15;
  return spr;
}

// Returns { group, refs } — group origin is at the FEET.
export function createSoldier(colorHex, name, skinIdx = 0) {
  const group = new THREE.Group();
  const matUniform = new THREE.MeshStandardMaterial({ map: camoTexture(), roughness: 0.95 });
  const matVest = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 });
  const matHelmet = new THREE.MeshStandardMaterial({ color: 0x4a4a3c, roughness: 0.9 });

  const body = new THREE.Group(); // everything that tilts on death
  group.add(body);

  // ---- legs (pivot at hip, y = 0.95)
  const mkLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(0.11 * side, 0.95, 0);
    leg.add(box(0.16, 0.48, 0.18, matUniform, 0, -0.24, 0));       // thigh
    leg.add(box(0.13, 0.42, 0.15, matUniform, 0, -0.66, 0.01));    // calf
    leg.add(box(0.12, 0.1, 0.06, matDarkGear, 0, -0.48, -0.09));   // kneepad
    leg.add(box(0.15, 0.11, 0.27, matBoot, 0, -0.9, -0.05));       // boot
    leg.add(box(0.16, 0.05, 0.16, matBoot, 0, -0.82, 0));          // boot cuff
    body.add(leg);
    return leg;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // drop-leg pouch on the right thigh
  legR.add(box(0.08, 0.16, 0.12, matVest, 0.1, -0.22, 0.02));

  // ---- torso
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  torso.add(box(0.44, 0.52, 0.24, matUniform, 0, 0.28, 0));        // chest
  torso.add(box(0.4, 0.14, 0.23, matUniform, 0, -0.02, 0));        // hips
  torso.add(box(0.46, 0.07, 0.27, matDarkGear, 0, 0.05, 0));       // belt
  torso.add(box(0.47, 0.32, 0.3, matVest, 0, 0.32, 0));            // plate carrier
  // mag pouches across the chest
  for (const px of [-0.13, 0, 0.13]) {
    torso.add(box(0.1, 0.12, 0.05, matDarkGear, px, 0.28, -0.175));
  }
  torso.add(box(0.1, 0.07, 0.05, matVest, 0.15, 0.44, -0.16));     // radio
  torso.add(box(0.34, 0.4, 0.16, matUniform, 0, 0.3, 0.21));       // backpack
  torso.add(box(0.26, 0.1, 0.1, matDarkGear, 0, 0.5, 0.2));        // bedroll
  // shoulder pads
  torso.add(box(0.13, 0.1, 0.2, matVest, -0.28, 0.5, 0));
  torso.add(box(0.13, 0.1, 0.2, matVest, 0.28, 0.5, 0));
  body.add(torso);

  // ---- head (child of torso so it pitches subtly with aim)
  const head = new THREE.Group();
  head.position.y = 0.68;
  head.add(box(0.23, 0.25, 0.23, matSkin, 0, 0.12, 0));
  head.add(box(0.25, 0.08, 0.25, matUniform, 0, 0.0, 0));          // scarf/shemagh
  // dome helmet + brim
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), matHelmet);
  dome.position.y = 0.24; dome.scale.set(1, 0.85, 1); dome.castShadow = true;
  head.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.19, 0.03, 10), matHelmet);
  brim.position.y = 0.235; brim.castShadow = true;
  head.add(brim);
  head.add(box(0.24, 0.06, 0.06, matDarkGear, 0, 0.16, -0.11));    // goggles
  head.add(box(0.06, 0.03, 0.02, matVest, 0.09, 0.24, -0.14));     // helmet marker
  torso.add(head);

  // ---- aim group: arms + rifle, pitches with view
  const aim = new THREE.Group();
  aim.position.set(0, 0.42, -0.05);
  const armR = box(0.11, 0.11, 0.42, matUniform, 0.17, -0.05, -0.22);
  armR.rotation.y = 0.25;
  aim.add(armR);
  aim.add(box(0.09, 0.09, 0.09, matSkin, 0.1, -0.06, -0.4));       // right hand at grip
  const armL = box(0.11, 0.11, 0.5, matUniform, -0.12, -0.02, -0.32);
  armL.rotation.y = -0.35;
  aim.add(armL);
  aim.add(box(0.09, 0.09, 0.09, matSkin, -0.26, -0.02, -0.52));    // left hand at forend
  const rifle = createRifle(skinIdx);
  rifle.position.set(0.12, 0.02, -0.3);
  aim.add(rifle);
  torso.add(aim);

  const nameSpr = name ? makeNameSprite(name, colorHex) : null;
  if (nameSpr) group.add(nameSpr);

  const refs = {
    body, torso, head, legL, legR, aim, rifle,
    muzzle: rifle.userData.muzzle,
    nameSpr, matVest,
    phase: Math.random() * 6, idleT: Math.random() * 6, deathT: 0, crouchT: 0,
  };
  group.userData.refs = refs;
  return { group, refs };
}

// dt seconds; state: {speed (m/s horizontal), crouch, dead, pitch, scoped}
export function animateSoldier(refs, dt, state) {
  const { body, torso, legL, legR, aim, head } = refs;

  // death: keel over
  if (state.dead) {
    refs.deathT = Math.min(1, refs.deathT + dt * 2.6);
    const t = refs.deathT;
    body.rotation.x = -Math.PI / 2 * t * t;
    body.position.y = -0.25 * t;
    return;
  }
  refs.deathT = 0;
  body.rotation.x = 0; body.position.y = 0;

  // crouch blend
  const target = state.crouch ? 1 : 0;
  refs.crouchT += (target - refs.crouchT) * Math.min(1, dt * 10);
  const cr = refs.crouchT;
  body.position.y = -0.34 * cr;
  legL.rotation.x = 1.1 * cr;
  legR.rotation.x = -0.9 * cr;
  legL.position.z = 0.12 * cr;
  legR.position.z = -0.1 * cr;
  torso.rotation.x = 0.12 * cr;

  // walk cycle / idle breathing
  const sp = Math.min(state.speed / 4.5, 1.4);
  refs.idleT += dt;
  if (sp > 0.05) {
    refs.phase += dt * (5 + sp * 5.5);
    const swing = Math.sin(refs.phase) * 0.55 * sp * (1 - cr * 0.7);
    legL.rotation.x = swing + 1.1 * cr;
    legR.rotation.x = -swing - 0.9 * cr;
    torso.position.y = 0.95 + Math.abs(Math.sin(refs.phase)) * 0.04 * sp;
    torso.rotation.z = Math.sin(refs.phase) * 0.02 * sp;
  } else {
    torso.position.y = 0.95 + Math.sin(refs.idleT * 1.7) * 0.006; // breathing
    torso.rotation.z = 0;
    if (cr < 0.05) { legL.rotation.x *= 0.85; legR.rotation.x *= 0.85; }
  }

  // aim pitch (positive = up)
  const pitch = state.pitch || 0;
  aim.rotation.x = pitch;
  head.rotation.x = pitch * 0.45;
}
