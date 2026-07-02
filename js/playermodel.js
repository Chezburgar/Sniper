// Procedural low-poly sniper operative + bolt-action rifle, with code-driven
// walk/crouch/aim/death animation. Model forward is -Z (matches camera yaw 0).
import * as THREE from 'three';

const matSkin = new THREE.MeshStandardMaterial({ color: 0xc99f78, roughness: 0.85 });
const matBoot = new THREE.MeshStandardMaterial({ color: 0x241d15, roughness: 0.9 });
const matGunMetal = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.45, metalness: 0.7 });

export const PLAYER_COLORS = [0xc8b06a, 0x7da0c4, 0xb56a5e, 0x86a86b, 0xa78bc0, 0xc4925e, 0x6fb3a8, 0xc0c0c0];

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function createRifle() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 0.65 });
  // stock
  g.add(box(0.07, 0.11, 0.34, wood, 0, -0.02, 0.28));
  g.add(box(0.07, 0.16, 0.12, wood, 0, -0.06, 0.42));
  // receiver + trigger guard
  g.add(box(0.08, 0.11, 0.5, matGunMetal, 0, 0, -0.05));
  g.add(box(0.05, 0.07, 0.12, matGunMetal, 0, -0.09, 0.02));
  // barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.85, 8), matGunMetal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.7); barrel.castShadow = true;
  g.add(barrel);
  // muzzle brake
  const mb = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.09, 8), matGunMetal);
  mb.rotation.x = Math.PI / 2; mb.position.set(0, 0.01, -1.1);
  g.add(mb);
  // scope
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.3, 10), matGunMetal);
  scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.1, -0.12); scope.castShadow = true;
  g.add(scope);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.03, 10),
    new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2, metalness: 0.4 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.1, -0.28);
  g.add(lens);
  g.add(box(0.03, 0.05, 0.06, matGunMetal, 0, 0.06, -0.12)); // mount
  // bolt handle
  g.add(box(0.09, 0.03, 0.03, matGunMetal, 0.06, 0.02, 0.08));
  // bipod (folded)
  g.add(box(0.02, 0.02, 0.22, matGunMetal, -0.03, -0.04, -0.85));
  g.add(box(0.02, 0.02, 0.22, matGunMetal, 0.03, -0.04, -0.85));
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
export function createSoldier(colorHex, name) {
  const group = new THREE.Group();
  const matUniform = new THREE.MeshStandardMaterial({ color: 0x53523f, roughness: 0.95 });
  const matVest = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 });
  const matHelmet = new THREE.MeshStandardMaterial({ color: 0x3e4034, roughness: 0.9 });

  const body = new THREE.Group(); // everything that tilts on death
  group.add(body);

  // ---- legs (pivot at hip, y = 0.95)
  const mkLeg = (side) => {
    const leg = new THREE.Group();
    leg.position.set(0.11 * side, 0.95, 0);
    leg.add(box(0.15, 0.48, 0.17, matUniform, 0, -0.24, 0));
    leg.add(box(0.13, 0.42, 0.15, matUniform, 0, -0.66, 0.01));
    leg.add(box(0.15, 0.1, 0.26, matBoot, 0, -0.9, -0.05));
    body.add(leg);
    return leg;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // ---- torso
  const torso = new THREE.Group();
  torso.position.y = 0.95;
  torso.add(box(0.44, 0.52, 0.24, matUniform, 0, 0.28, 0));
  torso.add(box(0.47, 0.34, 0.28, matVest, 0, 0.3, 0));       // plate carrier in player color
  torso.add(box(0.12, 0.1, 0.1, matVest, 0.14, 0.34, -0.16)); // chest pouch
  torso.add(box(0.12, 0.1, 0.1, matUniform, -0.14, 0.34, -0.16));
  body.add(torso);

  // ---- head (child of torso so it pitches subtly with aim)
  const head = new THREE.Group();
  head.position.y = 0.68;
  head.add(box(0.24, 0.26, 0.24, matSkin, 0, 0.12, 0));
  const helmet = box(0.28, 0.14, 0.28, matHelmet, 0, 0.26, 0);
  head.add(helmet);
  head.add(box(0.26, 0.06, 0.06, matGunMetal, 0, 0.16, -0.12)); // goggles
  torso.add(head);

  // ---- aim group: arms + rifle, pitches with view
  const aim = new THREE.Group();
  aim.position.set(0, 0.42, -0.05);
  // right arm reaching to grip
  const armR = box(0.11, 0.11, 0.42, matUniform, 0.17, -0.05, -0.22);
  armR.rotation.y = 0.25;
  aim.add(armR);
  const armL = box(0.11, 0.11, 0.5, matUniform, -0.12, -0.02, -0.32);
  armL.rotation.y = -0.35;
  aim.add(armL);
  aim.add(box(0.09, 0.09, 0.09, matSkin, -0.26, -0.02, -0.52)); // left hand
  const rifle = createRifle();
  rifle.position.set(0.12, 0.02, -0.3);
  aim.add(rifle);
  torso.add(aim);

  const nameSpr = name ? makeNameSprite(name, colorHex) : null;
  if (nameSpr) group.add(nameSpr);

  const refs = {
    body, torso, head, legL, legR, aim, rifle,
    muzzle: rifle.userData.muzzle,
    nameSpr, matVest,
    phase: Math.random() * 6, deathT: 0, crouchT: 0,
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

  // walk cycle
  const sp = Math.min(state.speed / 4.5, 1.4);
  if (sp > 0.05) {
    refs.phase += dt * (5 + sp * 5.5);
    const swing = Math.sin(refs.phase) * 0.55 * sp * (1 - cr * 0.7);
    legL.rotation.x = swing + 1.1 * cr;
    legR.rotation.x = -swing - 0.9 * cr;
    torso.position.y = 0.95 + Math.abs(Math.sin(refs.phase)) * 0.04 * sp;
  } else {
    torso.position.y = 0.95;
    if (cr < 0.05) { legL.rotation.x *= 0.85; legR.rotation.x *= 0.85; }
  }

  // aim pitch (positive = up)
  const pitch = state.pitch || 0;
  aim.rotation.x = pitch;
  head.rotation.x = pitch * 0.45;
}
