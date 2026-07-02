// "AL-RAMLA" — a sun-baked desert village arena.
// Central fountain plaza ringed by stucco houses with rooftop perches, a climbable
// bell tower, perimeter ramparts with walkable tops, market stalls, palms and dunes.
import * as THREE from 'three';
import {
  mulberry32, sandTexture, cobbleTexture, stuccoTexture, stoneTexture, woodTexture,
  awningTexture, rockTexture, frondTexture, waterTexture, sandbagTexture, metalTexture
} from './textures.js';

const rnd = mulberry32(1337);

// ---------------------------------------------------------------- helpers
class InstancedSet {
  constructor(geo, mat) { this.geo = geo; this.mat = mat; this.mats = []; }
  add(x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(sx, sy, sz));
    this.mats.push(m);
  }
  finalize(scene, shadows = true) {
    if (!this.mats.length) return;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.mats.length);
    this.mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = shadows; im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }
}

function mergeGeoms(list) { // [{geo, matrix}] -> single non-indexed BufferGeometry
  const pos = [], nor = [], uv = [];
  const nm = new THREE.Matrix3();
  for (const { geo, matrix } of list) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    nm.getNormalMatrix(matrix);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      if (u) uv.push(u.getX(i), u.getY(i));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

export function buildMap(scene) {
  const colliders = []; // THREE.Box3, static world
  const spawns = [];
  const animated = { waterTex: null, cloudGroup: null };

  const addCollider = (cx, cy, cz, w, h, d) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - w / 2, cy, cz - d / 2),
      new THREE.Vector3(cx + w / 2, cy + h, cz + d / 2)));
  };

  // ---------------------------------------------------------------- materials
  const texSand = sandTexture(rnd); texSand.repeat.set(56, 56);
  const texCobble = cobbleTexture(rnd);
  const texStone = stoneTexture(rnd);
  const texWood = woodTexture(rnd);
  const texWoodDark = woodTexture(rnd, [96, 68, 44]);
  const texRock = rockTexture(rnd);
  const texWater = waterTexture(rnd); animated.waterTex = texWater;
  const texSandbag = sandbagTexture(rnd);
  const texMetal = metalTexture(rnd);

  const matSand = new THREE.MeshStandardMaterial({ map: texSand, roughness: 1 });
  const matCobble = new THREE.MeshStandardMaterial({ map: texCobble, roughness: 0.92 });
  const matStone = new THREE.MeshStandardMaterial({ map: texStone, roughness: 0.95 });
  const matWood = new THREE.MeshStandardMaterial({ map: texWood, roughness: 0.85 });
  const matWoodDark = new THREE.MeshStandardMaterial({ map: texWoodDark, roughness: 0.85 });
  const matRock = new THREE.MeshStandardMaterial({ map: texRock, roughness: 1 });
  const matSandbag = new THREE.MeshStandardMaterial({ map: texSandbag, roughness: 1 });
  const matMetal = new THREE.MeshStandardMaterial({ map: texMetal, roughness: 0.55, metalness: 0.55 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x17130d, roughness: 0.9 });
  const matFrame = new THREE.MeshStandardMaterial({ color: 0xcbb28e, roughness: 0.9 });
  const matWater = new THREE.MeshStandardMaterial({
    map: texWater, roughness: 0.15, metalness: 0.1,
    emissive: 0x1a4a5a, emissiveIntensity: 0.25
  });
  const stuccoMats = [
    new THREE.MeshStandardMaterial({ map: stuccoTexture(mulberry32(11), [228, 207, 170]), roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: stuccoTexture(mulberry32(22), [214, 186, 148]), roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: stuccoTexture(mulberry32(33), [232, 219, 192]), roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: stuccoTexture(mulberry32(44), [199, 168, 130]), roughness: 0.95 }),
  ];

  // ---------------------------------------------------------------- lights / sky / fog
  scene.fog = new THREE.Fog(0xe6cfa5, 130, 640);

  const hemi = new THREE.HemisphereLight(0xbdd4f2, 0xcbaa80, 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdda6, 2.9);
  sun.position.set(120, 62, 48); // late-afternoon sun: long dramatic shadows
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -100; sc.right = 100; sc.top = 100; sc.bottom = -100; sc.near = 5; sc.far = 420;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.15;
  sc.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target);

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d74c4) },
      horizon: { value: new THREE.Color(0xe9d2a3) },
      sunDir: { value: sun.position.clone().normalize() },
      sunCol: { value: new THREE.Color(0xfff2d0) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 top,horizon,sunDir,sunCol;
      void main(){
        float h=clamp(vDir.y,0.0,1.0);
        vec3 col=mix(horizon,top,pow(h,0.55));
        float s=max(dot(normalize(vDir),normalize(sunDir)),0.0);
        col+=sunCol*pow(s,600.0)*3.0;    // sun disc
        col+=sunCol*pow(s,10.0)*0.22;    // haze glow
        gl_FragColor=vec4(col,1.0);
      }`
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(880, 32, 16), skyMat));

  // soft clouds
  const cloudGroup = new THREE.Group(); animated.cloudGroup = cloudGroup;
  const cc = document.createElement('canvas'); cc.width = 256; cc.height = 128;
  const cctx = cc.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const bx = 40 + rnd() * 176, by = 40 + rnd() * 48, br = 18 + rnd() * 34;
    const g = cctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, 'rgba(255,252,246,0.55)'); g.addColorStop(1, 'rgba(255,252,246,0)');
    cctx.fillStyle = g; cctx.fillRect(0, 0, 256, 128);
  }
  const cloudTex = new THREE.CanvasTexture(cc);
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(cloudMat);
    const a = rnd() * Math.PI * 2, r = 180 + rnd() * 380;
    s.position.set(Math.cos(a) * r, 130 + rnd() * 90, Math.sin(a) * r);
    const sc2 = 120 + rnd() * 160;
    s.scale.set(sc2, sc2 * 0.42, 1);
    cloudGroup.add(s);
  }
  scene.add(cloudGroup);

  // ---------------------------------------------------------------- ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), matSand);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const slab = (x, z, w, d, mat, repU, repV, y = 0.06) => {
    const m = mat.clone(); m.map = mat.map.clone(); m.map.needsUpdate = true;
    m.map.repeat.set(repU, repV);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true; mesh.castShadow = false;
    scene.add(mesh);
  };
  slab(0, 0, 36, 36, matCobble, 9, 9);                 // plaza
  slab(0, -37.5, 8, 42, matCobble, 2, 10.5);           // north road
  slab(0, 37.5, 8, 42, matCobble, 2, 10.5);            // south road
  slab(-37.5, 0, 40, 8, matCobble, 10, 2);             // west road
  slab(37.5, 0, 40, 8, matCobble, 10, 2);              // east road

  // ---------------------------------------------------------------- instanced sets
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const setWindows = new InstancedSet(unitBox, matDark);
  const setFrames = new InstancedSet(unitBox, matFrame);
  const setSteps = new InstancedSet(unitBox, matStone);
  const setParapet = new InstancedSet(unitBox, stuccoMats[0]);
  const setCrates = new InstancedSet(unitBox, matWood);
  const setCratesD = new InstancedSet(unitBox, matWoodDark);
  const setSandbags = new InstancedSet(unitBox, matSandbag);
  const setBarrels = new InstancedSet(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10), matMetal);
  const setRocks = new InstancedSet(new THREE.IcosahedronGeometry(1, 1), matRock);
  const setDunes = new InstancedSet(new THREE.SphereGeometry(1, 12, 8), matSand);
  const setMountains = new InstancedSet(new THREE.ConeGeometry(1, 1, 7), matRock);
  const setLampPoles = new InstancedSet(new THREE.CylinderGeometry(0.09, 0.13, 3.4, 8), matMetal);
  const setLampHeads = new InstancedSet(new THREE.BoxGeometry(0.42, 0.55, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x30363c, emissive: 0xffd9a0, emissiveIntensity: 0.7, roughness: 0.6 }));

  // ---------------------------------------------------------------- buildings
  // x, z, w(x-size), d(z-size), h, stairsSide(N/S/E/W or null), awning?
  const buildings = [
    [-24, -14, 12, 10, 7.0, 'E', true],
    [-26, 2, 9, 9, 5.0, null, true],
    [24, -18, 10, 12, 8.0, 'W', false],
    [27, 10, 11, 9, 5.5, null, true],
    [25, 26, 9, 10, 7.0, 'N', false],
    [-11, -27, 14, 9, 6.0, 'W', false],
    [16, -30, 8, 8, 4.5, null, false],
    [-19, -42, 8, 8, 5.0, null, false],
    [-13, 28, 13, 10, 6.5, 'E', false],
    [-32, 30, 9, 9, 4.5, null, true],
    [10, 30, 9, 8, 5.5, null, false],
    [-38, -20, 10, 9, 5.0, null, false],
    [-42, 12, 9, 11, 6.5, 'S', false],
    [40, -8, 10, 10, 6.0, 'N', false],
    [38, 22, 8, 9, 4.5, null, false],
    [-12, 44, 10, 8, 5.0, null, false],
    [12, -44, 9, 9, 5.5, null, false],
  ];

  const awnTex1 = awningTexture(rnd), awnTex2 = awningTexture(rnd, '#3e6e8e', '#e8dcc4'), awnTex3 = awningTexture(rnd, '#7a5f9e', '#e0d6c0');
  const awnMats = [awnTex1, awnTex2, awnTex3].map(t =>
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));

  buildings.forEach(([bx, bz, w, d, h, stairSide, hasAwning], bi) => {
    const mat = stuccoMats[bi % stuccoMats.length];
    const T = 0.34;                 // wall thickness — buildings are hollow and enterable
    const DOOR_W = 1.7, DOOR_H = 2.5;

    // door faces the map center (larger offset axis)
    let doorSide;
    if (Math.abs(bx) > Math.abs(bz)) doorSide = bx > 0 ? 'W' : 'E';
    else doorSide = bz > 0 ? 'N' : 'S';

    const sideInfo = (side) => { // outward normal + tangent axis
      switch (side) {
        case 'N': return { nx: 0, nz: -1, len: w };  // face at z = bz-d/2
        case 'S': return { nx: 0, nz: 1, len: w };
        case 'E': return { nx: 1, nz: 0, len: d };
        case 'W': return { nx: -1, nz: 0, len: d };
      }
    };
    const facePos = (side, along, y, out) => {
      const { nx, nz } = sideInfo(side);
      if (nz !== 0) return [bx + along, y, bz + nz * (d / 2 + out)];
      return [bx + nx * (w / 2 + out), y, bz + along];
    };

    // hollow shell: 4 walls (door wall gets a real opening) + roof slab, merged into one mesh
    const parts = [];
    const wallPiece = (side, alongCenter, alongLen, y0, y1) => {
      const { nx, nz } = sideInfo(side);
      const cy = (y0 + y1) / 2, sy = y1 - y0;
      let px, pz, sx, sz2;
      if (nz !== 0) { px = alongCenter; pz = nz * (d / 2 - T / 2); sx = alongLen; sz2 = T; }
      else { px = nx * (w / 2 - T / 2); pz = alongCenter; sx = T; sz2 = alongLen; }
      parts.push({ geo: new THREE.BoxGeometry(sx, sy, sz2), matrix: new THREE.Matrix4().makeTranslation(px, cy, pz) });
      addCollider(bx + px, y0, bz + pz, sx, sy, sz2);
    };
    for (const side of ['N', 'S', 'E', 'W']) {
      const { len } = sideInfo(side);
      if (side === doorSide) {
        const segW = (len - DOOR_W) / 2;
        wallPiece(side, -(DOOR_W / 2 + segW / 2), segW, 0, h);
        wallPiece(side, (DOOR_W / 2 + segW / 2), segW, 0, h);
        wallPiece(side, 0, DOOR_W, DOOR_H, h);   // lintel over the doorway
      } else {
        wallPiece(side, 0, len, 0, h);
      }
    }
    // roof slab — walkable up top, ceiling inside
    parts.push({ geo: new THREE.BoxGeometry(w, T, d), matrix: new THREE.Matrix4().makeTranslation(0, h - T / 2, 0) });
    addCollider(bx, h - T, bz, w, T, d);
    const shell = new THREE.Mesh(mergeGeoms(parts), mat);
    shell.position.set(bx, 0, bz);
    shell.castShadow = true; shell.receiveShadow = true;
    scene.add(shell);

    // interior cover
    setCratesD.add(bx + w / 4 - 0.4, 0.45, bz - d / 4 + 0.4, 0.9, 0.9, 0.9, 0.4);
    addCollider(bx + w / 4 - 0.4, 0, bz - d / 4 + 0.4, 0.9, 0.9, 0.9);
    if (w >= 10) {
      setCrates.add(bx - w / 4, 0.4, bz + d / 4, 1.6, 0.8, 0.9, 0);
      addCollider(bx - w / 4, 0, bz + d / 4, 1.6, 0.8, 0.9);
    }

    // windows: recessed dark pane + protruding sill and lintel strips.
    // Depths are all distinct (pane +0.03, strips +0.12, wall 0) — no z-fighting.
    for (const side of ['N', 'S', 'E', 'W']) {
      const { nx, len } = sideInfo(side);
      const flat = nx === 0; // pane thin on z if face is N/S
      const cols = Math.max(1, Math.floor(len / 4.2));
      const rows = [];
      for (let y = 2.3; y < h - 1.2; y += 2.6) rows.push(y);
      for (const wy of rows) {
        for (let ci = 0; ci < cols; ci++) {
          const along = (ci - (cols - 1) / 2) * (len / cols) * 0.8;
          if (side === doorSide && wy < 3.2 && Math.abs(along) < 1.8) continue; // door slot
          const [qx, qy, qz] = facePos(side, along, wy - 0.65, -0.02);
          setWindows.add(qx, qy, qz, flat ? 0.92 : 0.1, 1.3, flat ? 0.1 : 0.92);
          const [ax, ay, az] = facePos(side, along, wy - 1.34, 0);
          setFrames.add(ax, ay, az, flat ? 1.16 : 0.24, 0.09, flat ? 0.24 : 1.16); // sill
          const [lx2, ly2, lz2] = facePos(side, along, wy + 0.04, 0);
          setFrames.add(lx2, ly2, lz2, flat ? 1.16 : 0.24, 0.09, flat ? 0.24 : 1.16); // lintel
        }
      }
    }
    // doorway frame strips
    {
      const flat = sideInfo(doorSide).nx === 0;
      for (const s of [-1, 1]) {
        const [fx, fy, fz] = facePos(doorSide, s * (DOOR_W / 2 + 0.07), DOOR_H / 2, 0);
        setFrames.add(fx, fy, fz, flat ? 0.14 : 0.24, DOOR_H + 0.1, flat ? 0.24 : 0.14);
      }
      const [tx2, ty2, tz2] = facePos(doorSide, 0, DOOR_H + 0.07, 0);
      setFrames.add(tx2, ty2, tz2, flat ? DOOR_W + 0.42 : 0.24, 0.14, flat ? 0.24 : DOOR_W + 0.42);
      if (hasAwning) {
        const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.0), awnMats[bi % 3]);
        const { nx, nz } = sideInfo(doorSide);
        awn.position.set(bx + nx * (w / 2 + 1.0), 2.65, bz + nz * (d / 2 + 1.0));
        awn.rotation.order = 'YXZ';
        awn.rotation.y = Math.atan2(nx, nz);
        awn.rotation.x = 0.5;
        awn.castShadow = true;
        scene.add(awn);
        // poles
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6);
        for (const s of [-1.2, 1.2]) {
          const p = new THREE.Mesh(poleGeo, matWoodDark);
          const tx = nz !== 0 ? bx + s : bx + nx * (w / 2 + 1.8);
          const tz = nz !== 0 ? bz + nz * (d / 2 + 1.8) : bz + s;
          p.position.set(tx, 1.15, tz); p.castShadow = true;
          scene.add(p);
        }
      }
    }

    // parapet (rooftop cover) — leave a gap at the stair arrival corner
    const pH = 0.78, pT = 0.28;
    const parapetSide = (side) => {
      const { nx, nz, len } = sideInfo(side);
      let segLen = len, offset = 0;
      if (side === stairSide) { segLen = len - 2.4; offset = -1.2 * ((side === 'E' || side === 'W') ? 1 : 1); }
      let cx2, cz2, sx2, sz2;
      if (nz !== 0) { cx2 = bx + offset; cz2 = bz + nz * (d / 2 - pT / 2); sx2 = segLen; sz2 = pT; }
      else { cx2 = bx + nx * (w / 2 - pT / 2); cz2 = bz + offset; sx2 = pT; sz2 = segLen; }
      setParapet.add(cx2, h + pH / 2, cz2, sx2, pH, sz2);
      addCollider(cx2, h, cz2, sx2, pH, sz2);
    };
    ['N', 'S', 'E', 'W'].forEach(parapetSide);

    // exterior stone staircase to the roof
    if (stairSide) {
      const { nx, nz, len } = sideInfo(stairSide);
      const steps = Math.ceil(h / 0.4);
      const rise = h / steps;
      const depth = Math.min(0.55, (len - 0.6) / steps);
      const stepW = 1.5;
      for (let i = 0; i < steps; i++) {
        const along = -len / 2 + 0.35 + i * depth + depth / 2;
        const topY = rise * (i + 1);
        let sx2, sz2, px3, pz3;
        if (nz !== 0) { sx2 = depth; sz2 = stepW; px3 = bx + along; pz3 = bz + nz * (d / 2 + stepW / 2); }
        else { sx2 = stepW; sz2 = depth; px3 = bx + nx * (w / 2 + stepW / 2); pz3 = bz + along; }
        const th = Math.min(0.45, topY);
        setSteps.add(px3, topY - th / 2, pz3, sx2, th, sz2);
        addCollider(px3, topY - th, pz3, sx2, th, sz2);
      }
    }

    // roof clutter on taller buildings
    if (h >= 6) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12), matMetal);
      tank.position.set(bx + w / 4, h + 0.75, bz - d / 4);
      tank.castShadow = true; scene.add(tank);
      addCollider(bx + w / 4, h, bz - d / 4, 1.5, 1.5, 1.5);
      // sandbag nest at roof edge
      const sbx = bx - w / 4, sbz = bz + d / 4;
      setSandbags.add(sbx, h + 0.19, sbz, 1.9, 0.38, 0.55);
      setSandbags.add(sbx, h + 0.55, sbz, 1.6, 0.36, 0.5);
      setSandbags.add(sbx, h + 0.89, sbz, 1.2, 0.34, 0.5);
      addCollider(sbx, h, sbz, 1.8, 1.06, 0.55);
    }
    if (h >= 5 && h < 6) {
      setCratesD.add(bx - w / 4, h + 0.45, bz + d / 4, 0.9, 0.9, 0.9, rnd() * 3);
      addCollider(bx - w / 4, h, bz + d / 4, 0.9, 0.9, 0.9);
    }
  });

  // rooftop spawns
  spawns.push(
    new THREE.Vector3(-24, 7.0, -14), new THREE.Vector3(24, 8.0, -18),
    new THREE.Vector3(25, 7.0, 26), new THREE.Vector3(-13, 6.5, 28),
    new THREE.Vector3(-42, 6.5, 12), new THREE.Vector3(40, 6.0, -8),
    new THREE.Vector3(-11, 6.0, -27),
  );

  // ---------------------------------------------------------------- bell tower
  {
    const cx = -21, cz = 14, half = 2.5, H = 16;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(half * 2, H, half * 2), matStone);
    tower.position.set(cx, H / 2, cz);
    tower.castShadow = true; tower.receiveShadow = true;
    scene.add(tower);
    addCollider(cx, 0, cz, half * 2, H, half * 2);

    // wrap-around staircase: 10 steps per side, one full loop to the top
    const stepW = 1.35, depth = 0.5, rise = 0.41; // 40 steps -> 16.4, flush with platform top
    let y = 0;
    const sides = [
      { nx: 0, nz: 1 },   // south face, walking +x
      { nx: 1, nz: 0 },   // east face, walking -z
      { nx: 0, nz: -1 },  // north face, walking -x
      { nx: -1, nz: 0 },  // west face, walking +z
    ];
    sides.forEach((s, si) => {
      for (let i = 0; i < 10; i++) {
        y += rise;
        const along = -half + 0.25 + i * depth;
        let px, pz, sx2, sz2;
        if (s.nz !== 0) {
          px = cx + (s.nz > 0 ? along : -along);
          pz = cz + s.nz * (half + stepW / 2);
          sx2 = depth; sz2 = stepW;
        } else {
          px = cx + s.nx * (half + stepW / 2);
          pz = cz + (s.nx > 0 ? -along : along);
          sx2 = stepW; sz2 = depth;
        }
        setSteps.add(px, y - 0.2, pz, sx2, 0.4, sz2);
        addCollider(px, y - 0.4, pz, sx2, 0.4, sz2);
      }
      // corner landing between sides
      if (si < 3) {
        const n2 = sides[si + 1];
        const lx = cx + (s.nx + n2.nx) * (half + stepW / 2);
        const lz = cz + (s.nz + n2.nz) * (half + stepW / 2);
        y += 0.0;
        setSteps.add(lx, y - 0.2, lz, stepW, 0.4, stepW);
        addCollider(lx, y - 0.4, lz, stepW, 0.4, stepW);
      }
    });

    // top platform (same footprint as the tower so the stairs stay head-clear)
    const platHalf = 2.5;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(platHalf * 2, 0.4, platHalf * 2), matStone);
    plat.position.set(cx, H + 0.2, cz);
    plat.castShadow = true; plat.receiveShadow = true; scene.add(plat);
    addCollider(cx, H, cz, platHalf * 2, 0.4, platHalf * 2);
    const topY = H + 0.4;
    // parapet — west side leaves a gap at the north end where the stairs arrive
    for (const [dx, dz, sx2, sz2] of [
      [0, -platHalf + 0.14, platHalf * 2, 0.28], [0, platHalf - 0.14, platHalf * 2, 0.28],
      [platHalf - 0.14, 0, 0.28, platHalf * 2 - 0.56],
      [-platHalf + 0.14, -1.1, 0.28, platHalf * 2 - 2.4]]) {
      setParapet.add(cx + dx, topY + 0.42, cz + dz, sx2, 0.84, sz2);
      addCollider(cx + dx, topY, cz + dz, sx2, 0.84, sz2);
    }
    // pavilion posts + pyramid roof + bell
    const postGeo = new THREE.BoxGeometry(0.3, 2.6, 0.3);
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const p = new THREE.Mesh(postGeo, matStone);
      p.position.set(cx + dx, topY + 1.3, cz + dz); p.castShadow = true; scene.add(p);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.7, 4), new THREE.MeshStandardMaterial({ color: 0x9a5636, roughness: 0.9 }));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(cx, topY + 3.5, cz); roof.castShadow = true; scene.add(roof);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 0.8, 10),
      new THREE.MeshStandardMaterial({ color: 0xb8923e, roughness: 0.35, metalness: 0.8 }));
    bell.position.set(cx, topY + 2.1, cz); bell.castShadow = true; scene.add(bell);

    spawns.push(new THREE.Vector3(cx, topY + 0.05, cz));
  }

  // ---------------------------------------------------------------- fountain
  {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 1.0, 8), matStone);
    basin.position.set(0, 0.5, 0); basin.castShadow = true; basin.receiveShadow = true;
    scene.add(basin);
    addCollider(0, 0, 0, 6.4, 1.0, 6.4);
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.0, 24), matWater);
    water.rotation.x = -Math.PI / 2; water.position.y = 1.02;
    scene.add(water);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 8), matStone);
    col.position.set(0, 1.9, 0); col.castShadow = true; scene.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 0.4, 10), matStone);
    bowl.position.set(0, 3.0, 0); bowl.castShadow = true; scene.add(bowl);
    addCollider(0, 1.0, 0, 1.0, 2.4, 1.0);
  }

  // ---------------------------------------------------------------- market stalls
  // near-axis rotations only, so the axis-aligned colliders stay honest
  const stallSpots = [[-9, -8, 0.12], [9, 8, -0.1], [-8, 10, 0.08], [10, -7, -0.14]];
  stallSpots.forEach(([sx, sz, ry], i) => {
    const g = new THREE.Group();
    g.position.set(sx, 0, sz); g.rotation.y = ry;
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
    for (const [dx, dz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]]) {
      const p = new THREE.Mesh(postGeo, matWoodDark);
      p.position.set(dx, 1.2, dz); p.castShadow = true; g.add(p);
    }
    const table = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.85, 1.7), matWood);
    table.position.y = 0.43; table.castShadow = true; table.receiveShadow = true; g.add(table);
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), awnMats[i % 3]);
    awning.rotation.x = -Math.PI / 2 + 0.22;
    awning.position.set(0, 2.5, 0); awning.castShadow = true; g.add(awning);
    // goods
    const goods = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5),
      new THREE.MeshStandardMaterial({ color: [0xc2703a, 0x88a04a, 0xb8402e][i % 3], roughness: 0.9 }));
    goods.position.set(0.6, 1.05, 0.2); goods.castShadow = true; g.add(goods);
    scene.add(g);
    addCollider(sx, 0, sz, 3.2, 0.9, 2.0);
  });

  // ---------------------------------------------------------------- crates / barrels / sandbags
  const crateCluster = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const s = 0.85 + rnd() * 0.5;
      const ox = (rnd() - 0.5) * 2.2, oz = (rnd() - 0.5) * 2.2;
      const set = rnd() < 0.5 ? setCrates : setCratesD;
      set.add(x + ox, s / 2, z + oz, s, s, s, rnd() * 1.5);
      addCollider(x + ox, 0, z + oz, s, s, s);
      if (rnd() < 0.4) { // stack one
        set.add(x + ox, s + s * 0.4, z + oz, s * 0.8, s * 0.8, s * 0.8, rnd() * 1.5);
        addCollider(x + ox, s, z + oz, s * 0.8, s * 0.8, s * 0.8);
      }
    }
  };
  crateCluster(-14, -20, 3); crateCluster(15, 18, 3); crateCluster(-30, 18, 2);
  crateCluster(33, -25, 3); crateCluster(6, -36, 2); crateCluster(-5, 36, 2);
  crateCluster(46, 6, 2); crateCluster(-48, -6, 2);

  const barrelSpots = [[-12, -6.5], [12.5, 5], [18, -22], [-21, 24], [4, -52], [-3, 52], [30, 2]];
  barrelSpots.forEach(([x, z]) => {
    setBarrels.add(x, 0.5, z);
    addCollider(x, 0, z, 0.85, 1.0, 0.85);
    if (rnd() < 0.5) { setBarrels.add(x + 0.8, 0.5, z + 0.3); addCollider(x + 0.8, 0, z + 0.3, 0.85, 1.0, 0.85); }
  });

  const sandbagLine = (x, z, len, ry) => {
    const horiz = Math.abs(Math.cos(ry)) > 0.5;
    setSandbags.add(x, 0.19, z, horiz ? len : 0.55, 0.38, horiz ? 0.55 : len);
    setSandbags.add(x, 0.55, z, horiz ? len - 0.4 : 0.5, 0.36, horiz ? 0.5 : len - 0.4);
    setSandbags.add(x, 0.89, z, horiz ? len - 0.8 : 0.5, 0.34, horiz ? 0.5 : len - 0.8);
    addCollider(x, 0, z, horiz ? len : 0.55, 1.06, horiz ? 0.55 : len);
  };
  sandbagLine(0, -20, 5.5, 0); sandbagLine(0, 20, 5.5, 0);
  sandbagLine(-20, 0, 5.0, Math.PI / 2); sandbagLine(20, 0, 5.0, Math.PI / 2);
  sandbagLine(0, -55, 4, 0); sandbagLine(0, 55, 4, 0);

  // street lamps
  const lampSpots = [[-5.5, -15], [5.5, -30], [-5.5, -45], [5.5, 15], [-5.5, 30], [5.5, 45],
  [-15, 5.5], [-30, -5.5], [-45, 5.5], [15, -5.5], [30, 5.5], [45, -5.5]];
  lampSpots.forEach(([x, z]) => {
    setLampPoles.add(x, 1.7, z);
    setLampHeads.add(x, 3.5, z);
    addCollider(x, 0, z, 0.3, 3.4, 0.3);
  });

  // ---------------------------------------------------------------- perimeter ramparts
  {
    const W = 58, T = 2.5, H = 5, GATE = 4; // gate half-width
    const wallMat = matStone;
    const mkWall = (cx2, cz2, sx2, sz2) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx2, H, sz2), wallMat);
      m.position.set(cx2, H / 2, cz2);
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
      addCollider(cx2, 0, cz2, sx2, H, sz2);
      // outer parapet crown
      const horiz = sx2 > sz2;
      const px = horiz ? cx2 : cx2 + Math.sign(cx2) * (T / 2 - 0.15);
      const pz = horiz ? cz2 + Math.sign(cz2) * (T / 2 - 0.15) : cz2;
      setParapet.add(px, H + 0.45, pz, horiz ? sx2 : 0.3, 0.9, horiz ? 0.3 : sz2);
      addCollider(px, H, pz, horiz ? sx2 : 0.3, 0.9, horiz ? 0.3 : sz2);
    };
    // north & south walls, split by gates at x=0
    for (const zs of [-1, 1]) {
      const z = W * zs;
      mkWall(-(GATE + (W + 3 - GATE) / 2), z, (W + 3 - GATE), T);
      mkWall((GATE + (W + 3 - GATE) / 2), z, (W + 3 - GATE), T);
      // gate arch
      const arch = new THREE.Mesh(new THREE.BoxGeometry(GATE * 2 + 1, 1.4, T), wallMat);
      arch.position.set(0, H - 0.7, z); arch.castShadow = true; scene.add(arch);
      addCollider(0, H - 1.4, z, GATE * 2 + 1, 1.4, T);
    }
    // east & west walls, full length
    for (const xs of [-1, 1]) mkWall(W * xs, 0, T, W * 2 + 3);

    // corner bastions (walk on from the wall top)
    for (const [xs, zs] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bx = W * xs, bz = W * zs, BH = 5.45, BS = 7;
      const b = new THREE.Mesh(new THREE.BoxGeometry(BS, BH, BS), wallMat);
      b.position.set(bx, BH / 2, bz); b.castShadow = true; b.receiveShadow = true;
      scene.add(b);
      addCollider(bx, 0, bz, BS, BH, BS);
      // crown parapet
      for (const [dx, dz, sx2, sz2] of [
        [0, -BS / 2 + 0.15, BS, 0.3], [0, BS / 2 - 0.15, BS, 0.3],
        [-BS / 2 + 0.15, 0, 0.3, BS - 0.6], [BS / 2 - 0.15, 0, 0.3, BS - 0.6]]) {
        setParapet.add(bx + dx, BH + 0.45, bz + dz, sx2, 0.9, sz2);
        addCollider(bx + dx, BH, bz + dz, sx2, 0.9, sz2);
      }
      spawns.push(new THREE.Vector3(bx - xs * 1.5, BH + 0.05, bz - zs * 1.5));
    }

    // stairs up to the wall walk, inside both gates
    const mkWallStairs = (gz) => {
      const steps = 13, rise = H / steps, depth = 0.55;
      for (let i = 0; i < steps; i++) {
        const x = 6 + i * depth;
        const topY = rise * (i + 1);
        const z = gz - Math.sign(gz) * (T / 2 + 0.8);
        setSteps.add(x, topY - 0.2, z, depth, 0.4, 1.6);
        addCollider(x, topY - 0.4, z, depth, 0.4, 1.6);
      }
      // landing joining the wall top
      const lx = 6 + steps * depth + 0.5;
      const z = gz - Math.sign(gz) * (T / 2 + 0.8);
      setSteps.add(lx, H - 0.2, z, 1.4, 0.4, 1.6);
      addCollider(lx, H - 0.4, z, 1.4, 0.4, 1.6);
    };
    mkWallStairs(-W); mkWallStairs(W);
    spawns.push(new THREE.Vector3(25, H + 0.05, -W), new THREE.Vector3(-25, H + 0.05, W));

    // invisible arena boundary
    const B = 74;
    addCollider(0, 0, -B, B * 2 + 10, 30, 4);
    addCollider(0, 0, B, B * 2 + 10, 30, 4);
    addCollider(-B, 0, 0, 4, 30, B * 2 + 10);
    addCollider(B, 0, 0, 4, 30, B * 2 + 10);
  }

  // ground-level spawns
  spawns.push(
    new THREE.Vector3(13, 0.05, 13), new THREE.Vector3(-13, 0.05, -13),
    new THREE.Vector3(0, 0.05, -50), new THREE.Vector3(0, 0.05, 50),
    new THREE.Vector3(34, 0.05, 3), new THREE.Vector3(-34, 0.05, -3),
    new THREE.Vector3(0, 0.05, -64), new THREE.Vector3(0, 0.05, 64),
  );

  // ---------------------------------------------------------------- palms & cypress
  const frondTex = frondTexture(rnd);
  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1
  });
  const barkMat = new THREE.MeshStandardMaterial({ map: woodTexture(mulberry32(7), [122, 92, 58]), roughness: 1 });

  // build one palm geometry (trunk + fronds), then clone it
  const trunkParts = [];
  {
    const segGeo = new THREE.CylinderGeometry(0.14, 0.19, 1.1, 7);
    let px = 0, py = 0.5, lean = 0.16;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(px, py, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -lean * (i / 6))),
        new THREE.Vector3(1 - i * 0.07, 1, 1 - i * 0.07));
      trunkParts.push({ geo: segGeo, matrix: m });
      px += Math.sin(lean) * 1.0 * (i / 4); py += 1.0;
    }
  }
  const palmTrunkGeo = mergeGeoms(trunkParts);
  const frondParts = [];
  {
    const pg = new THREE.PlaneGeometry(2.9, 1.35);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const droop = 0.55 + (i % 3) * 0.14;
      const m = new THREE.Matrix4()
        .multiply(new THREE.Matrix4().makeRotationY(a))
        .multiply(new THREE.Matrix4().makeTranslation(1.45, 0, 0))
        .multiply(new THREE.Matrix4().makeRotationZ(-droop));
      frondParts.push({ geo: pg, matrix: m });
    }
  }
  const palmFrondGeo = mergeGeoms(frondParts);

  const palmSpots = [[-14, -8], [14, 9], [-9, 15], [15, -13], [-6.5, -33], [6.5, 33],
  [-33, -7], [33, 7], [-18, 38], [20, -37], [-45, 25], [47, -18]];
  palmSpots.forEach(([x, z]) => {
    const ry = rnd() * Math.PI * 2;
    const trunk = new THREE.Mesh(palmTrunkGeo, barkMat);
    trunk.position.set(x, 0, z); trunk.rotation.y = ry;
    trunk.castShadow = true; scene.add(trunk);
    const crown = new THREE.Mesh(palmFrondGeo, frondMat);    // crown sits atop the leaned trunk
    const topX = Math.sin(0.16) * 1.0 * (5 / 4);
    crown.position.set(x + Math.cos(ry) * topX, 6.1, z - Math.sin(ry) * topX);
    crown.rotation.y = ry;
    crown.castShadow = true; scene.add(crown);
    addCollider(x, 0, z, 0.45, 5.6, 0.45);
  });

  // cypress trees
  const cypGeo = new THREE.ConeGeometry(0.9, 4.6, 8);
  const cypMat = new THREE.MeshStandardMaterial({ color: 0x33502c, roughness: 1 });
  const setCyp = new InstancedSet(cypGeo, cypMat);
  const setCypTrunk = new InstancedSet(new THREE.CylinderGeometry(0.12, 0.16, 1.0, 6), barkMat);
  [[-36, 22], [-47, -14], [44, 14], [36, -30], [-25, 47], [26, 45], [22, -48]].forEach(([x, z]) => {
    setCypTrunk.add(x, 0.5, z);
    setCyp.add(x, 3.2, z, 0.9 + rnd() * 0.4, 0.9 + rnd() * 0.5, 0.9 + rnd() * 0.4);
    addCollider(x, 0, z, 0.4, 4.5, 0.4);
  });
  setCyp.finalize(scene); setCypTrunk.finalize(scene);

  // ---------------------------------------------------------------- rocks, dunes, mountains (outside walls)
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 66 + rnd() * 30;
    const s = 0.8 + rnd() * 2.6;
    setRocks.add(Math.cos(a) * r, s * 0.3, Math.sin(a) * r, s, s * (0.6 + rnd() * 0.5), s, rnd() * 3);
  }
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2, r = 95 + rnd() * 90;
    const s = 14 + rnd() * 30;
    setDunes.add(Math.cos(a) * r, -s * 0.72, Math.sin(a) * r, s, s * 0.55, s * (0.7 + rnd() * 0.6), rnd() * 3);
  }
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2, r = 330 + rnd() * 260;
    const h = 60 + rnd() * 130, w = 90 + rnd() * 120;
    setMountains.add(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r, w, h, w, rnd() * 3);
  }

  // finalize all instanced sets
  [setWindows, setFrames, setSteps, setParapet, setCrates, setCratesD, setSandbags,
    setBarrels, setRocks, setLampPoles, setLampHeads].forEach(s => s.finalize(scene));
  setDunes.finalize(scene, false);
  setMountains.finalize(scene, false);

  return {
    colliders, spawns, sun,
    update(dt, t) {
      if (animated.waterTex) { animated.waterTex.offset.x = Math.sin(t * 0.25) * 0.03; animated.waterTex.offset.y = t * 0.012; }
      if (animated.cloudGroup) animated.cloudGroup.rotation.y = t * 0.0025;
    }
  };
}
