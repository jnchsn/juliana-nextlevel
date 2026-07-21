/* ===================== VOXEL SIEGE - PvE Ace-of-Spades-Klon (v2) ===================== */
(function(){
'use strict';

/* ---------- Deterministischer Zufallsgenerator (fuer feste, reproduzierbare Karte) ---------- */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260721);

/* ---------- Grundkonstanten ---------- */
const SIZE = 56;
const HEIGHT = 26;
const GRAVITY = -22;
const JUMP_SPEED = 8.2;
const PLAYER_SPEED = 5.6;
const PLAYER_HALF_W = 0.32;
const PLAYER_HEIGHT = 1.75;
const EYE_OFFSET = 1.6;
const REACH = 6.2;
const STEP_HEIGHT = 1.05;

const BLOCK_TYPES = {
  ground:     {color:0x4f7a3a, indestructible:false},
  dirt:       {color:0x5b4530, indestructible:false},
  border:     {color:0x3c3c3c, indestructible:true},
  stone_ruin: {color:0x8a8a86, indestructible:false},
  moss_stone: {color:0x6f8a5e, indestructible:false},
  rubble:     {color:0x77706a, indestructible:false},
  trunk:      {color:0x5c3f24, indestructible:false},
  leaves:     {color:0x35592b, indestructible:false},
  player:     {color:0x3b82c4, indestructible:false}
};

/* ---------- Voxel-Welt ---------- */
const voxels = new Map();
function key(x,y,z){ return x+','+y+','+z; }
function inBounds(x,y,z){ return x>=0 && x<SIZE && y>=0 && y<HEIGHT && z>=0 && z<SIZE; }
function getVoxel(x,y,z){ if(!inBounds(x,y,z)) return null; return voxels.get(key(x,y,z)) || null; }
function isSolid(x,y,z){
  if(!inBounds(x,y,z)) return y<0;
  return voxels.has(key(x,y,z));
}
function setVoxel(x,y,z,type){ if(inBounds(x,y,z)) voxels.set(key(x,y,z), type); }
function removeVoxel(x,y,z){ voxels.delete(key(x,y,z)); }

/* ---------- Kartenaufbau: Wald mit alten Stadtruinen ---------- */
const enemySpawns = [];
const patrolWaypoints = [];
const structureBoxes = []; // fuer Baum-Ausschlusszonen
let playerSpawn = {x:SIZE/2, y:3, z:9};

function fillBox(x0,y0,z0,x1,y1,z1,type){
  for(let x=x0;x<=x1;x++)
   for(let y=y0;y<=y1;y++)
    for(let z=z0;z<=z1;z++) setVoxel(x,y,z,type);
}

/* Verfallene Ruinenmauer statt sauberer Ziegelwand: unregelmaessige Hoehe, Luecken, Moos */
function ruinStructure(x0,y0,z0,x1,y1,z1,doorSide,doorWidth){
  doorWidth = doorWidth||3;
  const midX=(x0+x1)/2, midZ=(z0+z1)/2;
  const fullHeight = y1-y0;
  for(let x=x0;x<=x1;x++){
    for(let z=z0;z<=z1;z++){
      const edge = (x===x0||x===x1||z===z0||z===z1);
      if(!edge) continue;
      let isDoor=false;
      if(doorSide==='south' && z===z1 && Math.abs(x-midX)<doorWidth) isDoor=true;
      if(doorSide==='north' && z===z0 && Math.abs(x-midX)<doorWidth) isDoor=true;
      if(doorSide==='east' && x===x1 && Math.abs(z-midZ)<doorWidth) isDoor=true;
      if(doorSide==='west' && x===x0 && Math.abs(z-midZ)<doorWidth) isDoor=true;
      if(isDoor) continue;

      // Manche Wandabschnitte sind komplett eingestuerzt (Luecke in der Ruine)
      if(rng() < 0.10) continue;

      // Zufaellige Resthoehe: mind. 35%, meist 55-100% der urspruenglichen Hoehe
      const heightFrac = 0.35 + rng()*rng()*0.65;
      const colTop = y0 + Math.max(1, Math.round(fullHeight*heightFrac));
      for(let y=y0;y<=colTop;y++){
        const mossy = rng()<0.3;
        setVoxel(x,y,z, mossy ? 'moss_stone' : 'stone_ruin');
      }
    }
  }
  // Bodenplatte im Inneren (etwas Schutt statt sauberem Boden)
  for(let x=x0+1;x<x1;x++){
    for(let z=z0+1;z<z1;z++){
      if(rng()<0.06) setVoxel(x,y0,z,'rubble');
    }
  }
  structureBoxes.push({x0:x0-2,z0:z0-2,x1:x1+2,z1:z1+2});

  // Schutt/Truemmer verstreut ausserhalb der Mauern
  for(let i=0;i<10;i++){
    const rx = x0-2+Math.floor(rng()*(x1-x0+5));
    const rz = z0-2+Math.floor(rng()*(z1-z0+5));
    if(rx<1||rz<1||rx>=SIZE-1||rz>=SIZE-1) continue;
    if(rx>=x0&&rx<=x1&&rz>=z0&&rz<=z1) continue;
    if(!getVoxel(rx,y0,rz)) setVoxel(rx,y0,rz,'rubble');
  }
}

function placeTree(x,z){
  if(!isSolid(x,1,z) || getVoxel(x,2,z) !== null) return; // nur auf freiem Boden pflanzen
  const groundY = 2;
  const height = 4+Math.floor(rng()*3);
  for(let i=0;i<height;i++) setVoxel(x,groundY+i,z,'trunk');
  const topY = groundY+height;
  const r = 2;
  for(let dx=-r;dx<=r;dx++){
    for(let dz=-r;dz<=r;dz++){
      for(let dy=-1;dy<=1;dy++){
        if(dx===0&&dz===0&&dy<=0) continue;
        if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy) <= 3 && rng()>0.15){
          setVoxel(x+dx, topY+dy, z+dz, 'leaves');
        }
      }
    }
  }
}

function inAnyStructure(x,z){
  for(const b of structureBoxes){ if(x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1) return true; }
  return false;
}
function nearAny(points,x,z,minDist){
  for(const p of points){ if(Math.hypot(p.x-x,p.z-z) < minDist) return true; }
  return false;
}

function scatterForest(){
  for(let x=3;x<SIZE-3;x+=3){
    for(let z=3;z<SIZE-3;z+=3){
      const jx = x + Math.floor(rng()*3)-1;
      const jz = z + Math.floor(rng()*3)-1;
      if(jx<2||jz<2||jx>=SIZE-2||jz>=SIZE-2) continue;
      if(inAnyStructure(jx,jz)) continue;
      if(nearAny(enemySpawns, jx, jz, 3.5)) continue;
      if(Math.hypot(jx-playerSpawn.x, jz-playerSpawn.z) < 5) continue;
      if(rng() < 0.55) continue; // Dichte begrenzen
      placeTree(jx,jz);
    }
  }
}

function buildMap(){
  for(let x=0;x<SIZE;x++){
    for(let z=0;z<SIZE;z++){
      setVoxel(x,0,z,'ground');
      setVoxel(x,1,z,'dirt');
    }
  }
  for(let x=0;x<SIZE;x++){
    for(let y=2;y<HEIGHT;y++){
      setVoxel(x,y,0,'border');
      setVoxel(x,y,SIZE-1,'border');
    }
  }
  for(let z=0;z<SIZE;z++){
    for(let y=2;y<HEIGHT;y++){
      setVoxel(0,y,z,'border');
      setVoxel(SIZE-1,y,z,'border');
    }
  }

  // Spieler-Basis: befestigte Ruine im Sueden
  ruinStructure(SIZE/2-8,2,4, SIZE/2+8,7,14, 'south',5);
  playerSpawn = {x:SIZE/2, y:3, z:9};

  // Ruine 1 - Nordwest
  ruinStructure(6,2,SIZE-20, 18,9,SIZE-8, 'south',3);
  enemySpawns.push({x:12,y:3,z:SIZE-14});
  patrolWaypoints.push({x:9,z:SIZE-16},{x:15,z:SIZE-11},{x:12,z:SIZE-9});

  // Ruine 2 - Nordost
  ruinStructure(SIZE-20,2,SIZE-20, SIZE-6,10,SIZE-8, 'south',3);
  enemySpawns.push({x:SIZE-13,y:3,z:SIZE-14});
  patrolWaypoints.push({x:SIZE-16,z:SIZE-16},{x:SIZE-10,z:SIZE-11},{x:SIZE-13,z:SIZE-9});

  // Zentraler Ruinenturm
  ruinStructure(SIZE/2-4,2,SIZE/2+3, SIZE/2+4,11,SIZE/2+11,'south',3);
  patrolWaypoints.push({x:SIZE/2,z:SIZE/2},{x:SIZE/2-6,z:SIZE/2},{x:SIZE/2+6,z:SIZE/2});

  // Deckungsmauern (verfallen) quer ueber das Kampffeld
  for(let i=0;i<5;i++){
    const cx = 10 + i*9;
    ruinStructure(cx,2,21, cx+3,5,24,'south',0);
  }
  for(let i=0;i<5;i++){
    const cx = 8 + i*10;
    ruinStructure(cx,2,31, cx+2,6,34,'south',0);
  }

  // Ostflanke Ruine
  ruinStructure(SIZE-16,2,24, SIZE-6,8,34,'west',3);
  enemySpawns.push({x:SIZE-11,y:3,z:29});
  patrolWaypoints.push({x:SIZE-13,z:27},{x:SIZE-9,z:31});

  // Westflanke Ruine
  ruinStructure(6,2,24, 16,8,34,'east',3);
  enemySpawns.push({x:11,y:3,z:29});
  patrolWaypoints.push({x:9,z:27},{x:13,z:31});

  scatterForest();
}
buildMap();

/* ---------- Three.js Grundgeruest ---------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc7ef);
scene.fog = new THREE.Fog(0x8fc7ef, 34, 95);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 400);
scene.add(camera); // noetig, damit an die Kamera gehaengte Waffen-Modelle mitgerendert werden

const hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(60,90,40);
scene.add(sun);

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- Voxel-Rendering ---------- */
const MAX_INSTANCES = 60000;
const boxGeo = new THREE.BoxGeometry(1,1,1);
const instMeshes = {};
const dummy = new THREE.Object3D();

for(const typeName in BLOCK_TYPES){
  const mat = new THREE.MeshLambertMaterial({color: BLOCK_TYPES[typeName].color});
  const mesh = new THREE.InstancedMesh(boxGeo, mat, MAX_INSTANCES);
  mesh.count = 0;
  scene.add(mesh);
  instMeshes[typeName] = mesh;
}

let needsRebuild = true;
function isExposed(x,y,z){
  return !isSolid(x+1,y,z) || !isSolid(x-1,y,z) || !isSolid(x,y+1,z) || !isSolid(x,y-1,z) || !isSolid(x,y,z+1) || !isSolid(x,y,z-1);
}
function rebuildVoxelMeshes(){
  const counters = {};
  for(const t in BLOCK_TYPES) counters[t]=0;
  voxels.forEach((type, k)=>{
    const parts = k.split(',');
    const x=+parts[0], y=+parts[1], z=+parts[2];
    if(!isExposed(x,y,z)) return;
    const mesh = instMeshes[type];
    const idx = counters[type]++;
    if(idx>=MAX_INSTANCES) return;
    dummy.position.set(x+0.5,y+0.5,z+0.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
  });
  for(const t in BLOCK_TYPES){
    instMeshes[t].count = counters[t];
    instMeshes[t].instanceMatrix.needsUpdate = true;
  }
  needsRebuild = false;
}

/* ---------- Voxel-DDA-Raycast ---------- */
function raycastVoxels(origin, dir, maxDist){
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const stepX = dir.x>0?1:-1, stepY = dir.y>0?1:-1, stepZ = dir.z>0?1:-1;
  const tDeltaX = dir.x!==0? Math.abs(1/dir.x): Infinity;
  const tDeltaY = dir.y!==0? Math.abs(1/dir.y): Infinity;
  const tDeltaZ = dir.z!==0? Math.abs(1/dir.z): Infinity;
  function frac(v){ return v - Math.floor(v); }
  let tMaxX = dir.x>0? (1-frac(origin.x))*tDeltaX : frac(origin.x)*tDeltaX;
  let tMaxY = dir.y>0? (1-frac(origin.y))*tDeltaY : frac(origin.y)*tDeltaY;
  let tMaxZ = dir.z>0? (1-frac(origin.z))*tDeltaZ : frac(origin.z)*tDeltaZ;
  let dist = 0;
  let lastNormal = {x:0,y:0,z:0};
  let steps=0;
  while(dist < maxDist && steps<300){
    steps++;
    if(tMaxX < tMaxY){
      if(tMaxX < tMaxZ){ x += stepX; dist = tMaxX; tMaxX += tDeltaX; lastNormal={x:-stepX,y:0,z:0}; }
      else { z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; lastNormal={x:0,y:0,z:-stepZ}; }
    } else {
      if(tMaxY < tMaxZ){ y += stepY; dist = tMaxY; tMaxY += tDeltaY; lastNormal={x:0,y:-stepY,z:0}; }
      else { z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; lastNormal={x:0,y:0,z:-stepZ}; }
    }
    if(isSolid(x,y,z)){
      return {hit:true, x,y,z, distance:dist, normal:lastNormal};
    }
  }
  return {hit:false, distance:maxDist};
}

/* ---------- Eingaben ---------- */
const keys = {};
let locked = false;
let yaw = Math.PI, pitch = 0;

document.addEventListener('keydown', e=>{ keys[e.code]=true; handleHotkeys(e); });
document.addEventListener('keyup', e=>{ keys[e.code]=false; });

canvas.addEventListener('click', ()=>{
  if(gameState==='playing' && !locked) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', ()=>{
  locked = document.pointerLockElement === canvas;
  if(!locked && gameState==='playing'){
    gameState = 'paused';
    document.getElementById('pauseOverlay').style.display = 'flex';
  }
});
document.addEventListener('mousemove', e=>{
  if(!locked) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-1.45, Math.min(1.45, pitch));
});
canvas.addEventListener('mousedown', e=>{
  if(!locked || gameState!=='playing') return;
  if(e.button===0) mouseDown = true;
});
document.addEventListener('mouseup', e=>{ if(e.button===0) mouseDown=false; });
let mouseDown = false;

document.getElementById('resumeBtn').addEventListener('click', ()=>{
  document.getElementById('pauseOverlay').style.display = 'none';
  gameState = 'playing';
  canvas.requestPointerLock();
});

function handleHotkeys(e){
  if(gameState!=='playing') return;
  if(e.code==='Digit1') selectWeapon(0);
  if(e.code==='Digit2') selectWeapon(1);
  if(e.code==='Digit3') selectWeapon(2);
  if(e.code==='Digit4') selectWeapon(3);
  if(e.code==='Digit5') selectWeapon(4);
  if(e.code==='KeyR') startReload();
}

/* ---------- Waffen / Werkzeuge ---------- */
const WEAPONS = [
  {id:'spade', name:'Spaten', type:'tool'},
  {id:'block', name:'Block', type:'tool'},
  {id:'rifle', name:'Rifle', type:'gun', damage:38, rate:520, mag:10, reserve:60, spread:0.006, pellets:1, reloadTime:2200, recoil:0.10},
  {id:'smg', name:'SMG', type:'gun', damage:17, rate:110, mag:30, reserve:150, spread:0.018, pellets:1, reloadTime:1900, recoil:0.045},
  {id:'shotgun', name:'Shotgun', type:'gun', damage:11, rate:820, mag:6, reserve:24, spread:0.09, pellets:9, reloadTime:2500, recoil:0.16}
];
const ammoState = WEAPONS.map(w=> w.type==='gun' ? {mag:w.mag, reserve:w.reserve} : null);
let currentWeaponIdx = 0;
let lastFireTime = 0;
let reloading = false;
let reloadEndTime = 0;
let playerBlocks = 50;
const MAX_BLOCKS = 50;
let recoilAmount = 0;

function selectWeapon(i){
  currentWeaponIdx = i;
  reloading = false;
  document.querySelectorAll('.slot').forEach((el,idx)=> el.classList.toggle('active', idx===i));
  updateHudWeapon();
  updateViewmodel();
}
function startReload(){
  const w = WEAPONS[currentWeaponIdx];
  if(w.type!=='gun') return;
  const st = ammoState[currentWeaponIdx];
  if(reloading || st.mag===w.mag || st.reserve<=0) return;
  reloading = true;
  reloadEndTime = performance.now() + w.reloadTime;
}
function finishReloadIfDone(now){
  if(!reloading) return;
  if(now >= reloadEndTime){
    const w = WEAPONS[currentWeaponIdx];
    const st = ammoState[currentWeaponIdx];
    const need = w.mag - st.mag;
    const take = Math.min(need, st.reserve);
    st.mag += take; st.reserve -= take;
    reloading = false;
  }
}

/* ---------- Ego-Waffenmodelle (blockig, an Kamera gehaengt) ---------- */
const weaponGroup = new THREE.Group();
weaponGroup.position.set(0.34,-0.30,-0.55);
camera.add(weaponGroup);
const viewModels = {};
function box(w,h,d,color){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshLambertMaterial({color})); }

function buildViewModels(){
  // Spaten
  { const g = new THREE.Group();
    const handle = box(0.045,0.5,0.045,0x6b4a2a); handle.position.set(0,-0.05,0); handle.rotation.x = 0.5;
    const blade = box(0.16,0.2,0.03,0x9a9a9a); blade.position.set(0,0.2,-0.14); blade.rotation.x = 0.5;
    g.add(handle); g.add(blade);
    viewModels.spade = g;
  }
  // Block (in der Hand gehaltener Wuerfel)
  { const g = new THREE.Group();
    const cube = box(0.22,0.22,0.22, BLOCK_TYPES.player.color);
    cube.position.set(0.02,-0.02,-0.05);
    g.add(cube);
    viewModels.block = g;
  }
  // Rifle
  { const g = new THREE.Group();
    const body = box(0.07,0.09,0.55,0x2b2b2b); body.position.set(0,0,-0.1);
    const stock = box(0.06,0.14,0.18,0x4a3a2a); stock.position.set(0,-0.03,0.2);
    const barrel = box(0.035,0.035,0.3,0x1a1a1a); barrel.position.set(0,0.01,-0.45);
    const mag = box(0.05,0.18,0.07,0x333333); mag.position.set(0,-0.13,-0.05);
    g.add(body); g.add(stock); g.add(barrel); g.add(mag);
    viewModels.rifle = g;
  }
  // SMG
  { const g = new THREE.Group();
    const body = box(0.08,0.11,0.34,0x333333); body.position.set(0,0,0);
    const barrel = box(0.03,0.03,0.16,0x1a1a1a); barrel.position.set(0,0.01,-0.24);
    const mag = box(0.045,0.22,0.06,0x2b2b2b); mag.position.set(0,-0.17,0.02);
    const stock = box(0.05,0.08,0.12,0x2b2b2b); stock.position.set(0,-0.01,0.2);
    g.add(body); g.add(barrel); g.add(mag); g.add(stock);
    viewModels.smg = g;
  }
  // Shotgun
  { const g = new THREE.Group();
    const body = box(0.09,0.11,0.4,0x4a3a2a); body.position.set(0,0,-0.02);
    const barrel = box(0.05,0.05,0.32,0x1a1a1a); barrel.position.set(0,0.02,-0.32);
    const pump = box(0.07,0.06,0.14,0x2b2b2b); pump.position.set(0,-0.05,-0.22);
    const stock = box(0.06,0.13,0.2,0x3a2a1a); stock.position.set(0,-0.02,0.24);
    g.add(body); g.add(barrel); g.add(pump); g.add(stock);
    viewModels.shotgun = g;
  }
  for(const k in viewModels){ viewModels[k].visible=false; weaponGroup.add(viewModels[k]); }
}
buildViewModels();
function updateViewmodel(){
  for(const k in viewModels) viewModels[k].visible=false;
  const id = WEAPONS[currentWeaponIdx].id;
  if(viewModels[id]) viewModels[id].visible=true;
}
updateViewmodel();

/* ---------- Spieler-Zustand ---------- */
const player = {
  pos: new THREE.Vector3(playerSpawn.x, playerSpawn.y+EYE_OFFSET, playerSpawn.z),
  vel: new THREE.Vector3(0,0,0),
  onGround: false,
  health: 100
};
let killCount = 0;
let waveNumber = 1;
let gameState = 'menu'; // menu | playing | paused | dead

function resetPlayer(){
  player.pos.set(playerSpawn.x, playerSpawn.y+EYE_OFFSET, playerSpawn.z);
  player.vel.set(0,0,0);
  player.health = 100;
  playerBlocks = MAX_BLOCKS;
  yaw = Math.PI; pitch = 0;
  for(let i=0;i<WEAPONS.length;i++){ if(WEAPONS[i].type==='gun'){ ammoState[i].mag = WEAPONS[i].mag; ammoState[i].reserve = WEAPONS[i].reserve; } }
  selectWeapon(0);
  killCount = 0; waveNumber = 1;
}

function collidesAt(px,py,pz){
  const minX = Math.floor(px-PLAYER_HALF_W), maxX = Math.floor(px+PLAYER_HALF_W);
  const minZ = Math.floor(pz-PLAYER_HALF_W), maxZ = Math.floor(pz+PLAYER_HALF_W);
  const feetY = Math.floor(py - EYE_OFFSET);
  const headY = Math.floor(py - EYE_OFFSET + PLAYER_HEIGHT);
  for(let x=minX;x<=maxX;x++)
    for(let z=minZ;z<=maxZ;z++)
      for(let y=feetY;y<=headY;y++)
        if(isSolid(x,y,z)) return true;
  return false;
}

function updatePlayer(dt, now){
  const forward = new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  let moveX=0, moveZ=0;
  if(keys['KeyW']){ moveX-=forward.x; moveZ-=forward.z; }
  if(keys['KeyS']){ moveX+=forward.x; moveZ+=forward.z; }
  if(keys['KeyA']){ moveX-=right.x; moveZ-=right.z; }
  if(keys['KeyD']){ moveX+=right.x; moveZ+=right.z; }
  const len = Math.hypot(moveX,moveZ);
  const isMoving = len>0.01;
  if(isMoving){ moveX/=len; moveZ/=len; }

  const dx = moveX*PLAYER_SPEED*dt;
  const dz = moveZ*PLAYER_SPEED*dt;

  // Horizontalbewegung mit einfachem Auto-Step (max. 1 Block) fuer kleine Hindernisse
  tryMoveAxis('x', dx);
  tryMoveAxis('z', dz);

  // Schwerkraft & Sprung
  player.vel.y += GRAVITY*dt;
  const feetBelow = Math.floor(player.pos.y - EYE_OFFSET - 0.05);
  player.onGround = isSolid(Math.floor(player.pos.x), feetBelow, Math.floor(player.pos.z));
  if(player.onGround && player.vel.y<0) player.vel.y = 0;
  if(keys['Space'] && player.onGround){ player.vel.y = JUMP_SPEED; }

  const dy = player.vel.y*dt;
  if(dy<0){
    if(!collidesAt(player.pos.x, player.pos.y+dy, player.pos.z)) player.pos.y += dy;
    else { player.vel.y = 0; player.pos.y = Math.ceil(player.pos.y - EYE_OFFSET - 0.001)+EYE_OFFSET; }
  } else {
    if(!collidesAt(player.pos.x, player.pos.y+dy, player.pos.z)) player.pos.y += dy;
    else player.vel.y = 0;
  }

  player.pos.x = Math.max(1.5, Math.min(SIZE-1.5, player.pos.x));
  player.pos.z = Math.max(1.5, Math.min(SIZE-1.5, player.pos.z));
  if(player.pos.y < -20){ damagePlayer(999); }

  camera.position.copy(player.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // Waffen-Bob & Ruecksto ss (Recoil)
  recoilAmount *= 0.85;
  const bob = isMoving && player.onGround ? Math.sin(now*0.012)*0.018 : 0;
  weaponGroup.position.set(0.34, -0.30+bob+recoilAmount*0.15, -0.55+recoilAmount*0.4);
  weaponGroup.rotation.x = -recoilAmount*1.4;
}

function tryMoveAxis(axis, delta){
  if(delta===0) return;
  const nx = axis==='x' ? player.pos.x+delta : player.pos.x;
  const nz = axis==='z' ? player.pos.z+delta : player.pos.z;
  if(!collidesAt(nx, player.pos.y, nz)){
    player.pos.x = nx; player.pos.z = nz;
    return;
  }
  // Auto-Step: pruefe ob ein kleiner Schritt nach oben frei waere
  if(!collidesAt(nx, player.pos.y+STEP_HEIGHT, nz) && !collidesAt(player.pos.x, player.pos.y+STEP_HEIGHT, player.pos.z)){
    player.pos.x = nx; player.pos.z = nz; player.pos.y += STEP_HEIGHT;
  }
}

function getAimDirection(){
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return dir;
}

/* ---------- Schaden / Tod ---------- */
function damagePlayer(amount){
  if(gameState!=='playing') return;
  player.health -= amount;
  flashDamage();
  if(player.health<=0){
    player.health = 0;
    onPlayerDeath();
  }
  updateHudHealth();
}
function flashDamage(){
  const el = document.getElementById('dmgFlash');
  el.style.opacity = '0.55';
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.style.opacity='0'; }, 220);
}
function onPlayerDeath(){
  gameState = 'dead';
  document.exitPointerLock();
  document.getElementById('finalWave').textContent = waveNumber;
  document.getElementById('finalKills').textContent = killCount;
  document.getElementById('gameOverOverlay').style.display = 'flex';
}

/* ---------- Gegner: Modell mit Gliedmassen, Waffe, Lauf-/Sterbeanimation ---------- */
const enemies = [];
const dyingEnemies = [];
const ENEMY_MAX_HEALTH = 100;
const ENEMY_SPEED = 2.6;
const ENEMY_DETECT_RANGE = 26;
const ENEMY_ATTACK_RANGE = 20;
const ENEMY_DAMAGE = 9;
const ENEMY_FIRE_COOLDOWN = 1100;

function makeLimb(w,h,d,mat){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  mesh.position.y = -h/2;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  return pivot;
}

function createEnemyModel(){
  const group = new THREE.Group();
  const hue = 0.0 + (rng()*0.06-0.03);
  const uniform = new THREE.Color().setHSL((hue+1)%1, 0.5, 0.32+rng()*0.08);
  const limbColor = uniform.clone().offsetHSL(0,0,-0.06);
  const torsoMat = new THREE.MeshLambertMaterial({color:uniform});
  const limbMat = new THREE.MeshLambertMaterial({color:limbColor});
  const headMat = new THREE.MeshLambertMaterial({color:0xd9a066});
  const gunMat = new THREE.MeshLambertMaterial({color:0x262626});

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.7,0.3), torsoMat);
  torso.position.y = 1.15; group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.4), headMat);
  head.position.y = 1.7; group.add(head);

  const leftArm = makeLimb(0.16,0.65,0.16, limbMat); leftArm.position.set(-0.36,1.47,0); group.add(leftArm);
  const rightArm = makeLimb(0.16,0.65,0.16, limbMat); rightArm.position.set(0.36,1.47,0); group.add(rightArm);
  const leftLeg = makeLimb(0.19,0.75,0.19, limbMat); leftLeg.position.set(-0.14,0.78,0); group.add(leftLeg);
  const rightLeg = makeLimb(0.19,0.75,0.19, limbMat); rightLeg.position.set(0.14,0.78,0); group.add(rightLeg);

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.5), gunMat);
  gun.position.set(0,-0.55,0.3);
  rightArm.add(gun);

  const barBg = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.09,0.05), new THREE.MeshBasicMaterial({color:0x222222}));
  barBg.position.y = 2.05;
  const barFg = new THREE.Mesh(new THREE.BoxGeometry(0.78,0.07,0.06), new THREE.MeshBasicMaterial({color:0x35c93b}));
  barFg.position.y = 2.05;
  group.add(barBg); group.add(barFg);

  return {group, leftArm, rightArm, leftLeg, rightLeg, barFg};
}

function spawnEnemy(){
  const spawn = enemySpawns[Math.floor(rng()*enemySpawns.length)];
  const model = createEnemyModel();
  model.group.position.set(spawn.x+0.5, spawn.y, spawn.z+0.5);
  scene.add(model.group);

  const wp = patrolWaypoints[Math.floor(rng()*patrolWaypoints.length)];
  enemies.push({
    model,
    pos: new THREE.Vector3(spawn.x+0.5, spawn.y, spawn.z+0.5),
    health: ENEMY_MAX_HEALTH,
    state: 'patrol',
    patrolTarget: {x: wp.x+0.5, z: wp.z+0.5},
    lastFire: 0,
    alive: true,
    stuckTimer: 0,
    dodgeDir: 1
  });
}

function groundYBelow(x,z, fromY){
  for(let y=Math.min(HEIGHT-1, Math.floor(fromY)+2); y>=0; y--){
    if(isSolid(Math.floor(x), y, Math.floor(z))) return y+1;
  }
  return 1;
}
function hasLineOfSight(fromPos, toPos){
  const dir = new THREE.Vector3().subVectors(toPos, fromPos);
  const dist = dir.length();
  dir.normalize();
  const res = raycastVoxels(fromPos, dir, dist);
  return !res.hit;
}

function updateEnemies(dt, now){
  const eyePos = new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z);
  for(const en of enemies){
    if(!en.alive) continue;
    const enemyEye = new THREE.Vector3(en.pos.x, en.pos.y+1.5, en.pos.z);
    const distToPlayer = enemyEye.distanceTo(eyePos);
    const canSeePlayer = distToPlayer < ENEMY_DETECT_RANGE && hasLineOfSight(enemyEye, eyePos);

    if(canSeePlayer){ en.state='chase'; en.lastSeen = {x:player.pos.x, z:player.pos.z}; }

    let targetX, targetZ;
    if(en.state==='chase' && en.lastSeen){
      targetX = en.lastSeen.x; targetZ = en.lastSeen.z;
    } else {
      en.state='patrol';
      targetX = en.patrolTarget.x; targetZ = en.patrolTarget.z;
      const dd = Math.hypot(targetX-en.pos.x, targetZ-en.pos.z);
      if(dd<1.2){
        const wp = patrolWaypoints[Math.floor(rng()*patrolWaypoints.length)];
        en.patrolTarget = {x:wp.x+0.5, z:wp.z+0.5};
      }
    }

    let dx = targetX-en.pos.x, dz = targetZ-en.pos.z;
    let d = Math.hypot(dx,dz);
    const stopDist = (en.state==='chase') ? 9 : 0.5;
    let moved = false;
    if(d>stopDist){
      let nx=dx/d, nz=dz/d;
      // Ausweichen, falls laengere Zeit blockiert (einfaches Hindernisumgehen)
      if(en.stuckTimer > 0.5){
        const perp = {x:-nz*en.dodgeDir, z:nx*en.dodgeDir};
        nx = nx*0.4 + perp.x*0.9;
        nz = nz*0.4 + perp.z*0.9;
        const l = Math.hypot(nx,nz)||1; nx/=l; nz/=l;
      }
      const speed = ENEMY_SPEED*dt;
      const nxPos = en.pos.x+nx*speed, nzPos = en.pos.z+nz*speed;
      const curY = Math.floor(en.pos.y);
      let stepped=false;
      if(!isSolid(Math.floor(nxPos), curY, Math.floor(en.pos.z)) && !isSolid(Math.floor(nxPos),curY+1,Math.floor(en.pos.z))){ en.pos.x = nxPos; moved=true; }
      else if(!isSolid(Math.floor(nxPos), curY+1, Math.floor(en.pos.z)) && !isSolid(Math.floor(nxPos),curY+2,Math.floor(en.pos.z))){ en.pos.x = nxPos; en.pos.y+=1; moved=true; stepped=true; }
      if(!isSolid(Math.floor(en.pos.x), curY, Math.floor(nzPos)) && !isSolid(Math.floor(en.pos.x),curY+1,Math.floor(nzPos))){ en.pos.z = nzPos; moved=true; }
      else if(!stepped && !isSolid(Math.floor(en.pos.x), curY+1, Math.floor(nzPos)) && !isSolid(Math.floor(en.pos.x),curY+2,Math.floor(nzPos))){ en.pos.z = nzPos; en.pos.y+=1; moved=true; }
    }
    if(!moved){ en.stuckTimer += dt; if(en.stuckTimer>1.6){ en.dodgeDir *= -1; en.stuckTimer=0; } }
    else en.stuckTimer = Math.max(0, en.stuckTimer-dt*2);

    en.pos.y = groundYBelow(en.pos.x, en.pos.z, en.pos.y);

    if(en.state==='chase' && distToPlayer < ENEMY_ATTACK_RANGE && canSeePlayer){
      if(now - en.lastFire > ENEMY_FIRE_COOLDOWN){
        en.lastFire = now;
        const hitChance = Math.max(0.15, 0.75 - distToPlayer/ENEMY_ATTACK_RANGE*0.55);
        fireTracer(enemyEye, new THREE.Vector3().subVectors(eyePos, enemyEye).normalize(), 0xffcc33);
        if(rng() < hitChance){ damagePlayer(ENEMY_DAMAGE); }
      }
    }

    en.model.group.position.set(en.pos.x, en.pos.y, en.pos.z);
    en.model.group.lookAt(new THREE.Vector3(targetX, en.pos.y+0.75, targetZ));
    en.model.barFg.scale.x = Math.max(0, en.health/ENEMY_MAX_HEALTH);
    en.model.barFg.position.x = -0.39*(1-en.model.barFg.scale.x);

    const swing = moved ? Math.sin(now*0.008)*0.6 : 0;
    en.model.leftArm.rotation.x = swing;
    en.model.rightArm.rotation.x = -swing*0.3; // rechter Arm haelt Waffe, weniger Ausschlag
    en.model.leftLeg.rotation.x = -swing;
    en.model.rightLeg.rotation.x = swing;
  }

  // Sterbeanimation
  for(let i=dyingEnemies.length-1;i>=0;i--){
    const d = dyingEnemies[i];
    const t = Math.min(1, (now-d.start)/500);
    d.group.rotation.z = t*(Math.PI/2.1);
    d.group.position.y = d.baseY - t*0.4;
    if(t>=1){ scene.remove(d.group); dyingEnemies.splice(i,1); }
  }
}

function damageEnemy(en, amount){
  en.health -= amount;
  if(en.health<=0 && en.alive){
    en.alive = false;
    killCount++;
    updateHudKills();
    dyingEnemies.push({group:en.model.group, start:performance.now(), baseY:en.model.group.position.y});
    const idx = enemies.indexOf(en);
    if(idx>=0) enemies.splice(idx,1);
  }
}

/* Wellen-System */
let enemiesToSpawnThisWave = 0;
let waveInProgress = false;
function startWave(){
  waveInProgress = true;
  enemiesToSpawnThisWave = 2 + waveNumber*2;
  showWaveBanner('WELLE ' + waveNumber);
  spawnLoop();
}
function spawnLoop(){
  if(!waveInProgress) return;
  const aliveCount = enemies.length;
  if(enemiesToSpawnThisWave>0 && aliveCount < 10){
    spawnEnemy();
    enemiesToSpawnThisWave--;
  }
  if(enemiesToSpawnThisWave>0 || enemies.length>0){
    setTimeout(spawnLoop, 1400);
  } else {
    waveInProgress = false;
    waveNumber++;
    updateHudWave();
    setTimeout(()=>{ if(gameState==='playing') startWave(); }, 4500);
  }
}
function showWaveBanner(text){
  const el = document.getElementById('waveBanner');
  el.textContent = text;
  el.style.transition = 'none';
  el.style.opacity = '1';
  requestAnimationFrame(()=>{
    el.style.transition = 'opacity 1.5s ease 1.5s';
    el.style.opacity = '0';
  });
}

/* ---------- Tracer ---------- */
function fireTracer(from, dir, color){
  const to = new THREE.Vector3().addVectors(from, dir.clone().multiplyScalar(30));
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({color: color||0xffee88, transparent:true, opacity:0.9});
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  let t=0;
  const fade = ()=>{
    t+=1;
    mat.opacity = Math.max(0, 0.9 - t*0.15);
    if(mat.opacity>0) requestAnimationFrame(fade);
    else scene.remove(line);
  };
  fade();
}

/* ---------- WebAudio Soundeffekte ---------- */
let audioCtx;
function ac(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
function playShot(kind){
  try{
    const ctx = ac();
    const dur = kind==='shotgun'?0.28:(kind==='smg'?0.09:0.14);
    const buffer = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1-i/data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = kind==='shotgun'?1400:(kind==='smg'?2600:2000);
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    noise.start();
  }catch(e){}
}
function playThud(freq){
  try{
    const ctx = ac();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type='square'; osc.frequency.value = freq||160;
    gain.gain.value = 0.25;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.18);
    osc.stop(ctx.currentTime+0.2);
  }catch(e){}
}

/* ---------- Interaktion: Schiessen / Abbauen / Bauen ---------- */
function tryUseTool(now){
  const w = WEAPONS[currentWeaponIdx];
  const dir = getAimDirection();
  const origin = camera.position;

  if(w.id==='spade'){
    if(now-lastFireTime < 260) return;
    lastFireTime = now;
    recoilAmount = 0.05;
    const res = raycastVoxels(origin, dir, 3.2);
    if(res.hit){
      const t = getVoxel(res.x,res.y,res.z);
      if(t && !BLOCK_TYPES[t].indestructible){
        removeVoxel(res.x,res.y,res.z);
        playerBlocks = Math.min(MAX_BLOCKS, playerBlocks+1);
        needsRebuild = true;
        playThud(140);
        updateHudBlocks();
      }
    }
    return;
  }

  if(w.id==='block'){
    if(now-lastFireTime < 260) return;
    lastFireTime = now;
    recoilAmount = 0.04;
    if(playerBlocks<=0) return;
    const res = raycastVoxels(origin, dir, REACH);
    if(res.hit){
      const nx = res.x+res.normal.x, ny = res.y+res.normal.y, nz = res.z+res.normal.z;
      const dist = Math.hypot(nx+0.5-player.pos.x, ny+0.5-(player.pos.y-EYE_OFFSET), nz+0.5-player.pos.z);
      if(!getVoxel(nx,ny,nz) && dist>0.9){
        setVoxel(nx,ny,nz,'player');
        playerBlocks--;
        needsRebuild = true;
        playThud(260);
        updateHudBlocks();
      }
    }
    return;
  }

  const st = ammoState[currentWeaponIdx];
  if(reloading) return;
  if(now-lastFireTime < w.rate) return;
  if(st.mag<=0){ startReload(); return; }
  lastFireTime = now;
  st.mag--;
  recoilAmount = w.recoil;
  updateHudAmmo();
  playShot(w.id);

  let anyHitEnemy = false;
  for(let p=0;p<w.pellets;p++){
    const spreadDir = dir.clone();
    spreadDir.x += (Math.random()-0.5)*w.spread;
    spreadDir.y += (Math.random()-0.5)*w.spread;
    spreadDir.z += (Math.random()-0.5)*w.spread;
    spreadDir.normalize();

    const voxelRes = raycastVoxels(origin, spreadDir, 60);
    const voxelDist = voxelRes.hit ? voxelRes.distance : 60;

    let closestEnemy=null, closestDist=voxelDist;
    for(const en of enemies){
      if(!en.alive) continue;
      const center = new THREE.Vector3(en.pos.x, en.pos.y+0.85, en.pos.z);
      const toCenter = new THREE.Vector3().subVectors(center, origin);
      const proj = toCenter.dot(spreadDir);
      if(proj<0 || proj>closestDist) continue;
      const closestPoint = origin.clone().add(spreadDir.clone().multiplyScalar(proj));
      const dd = closestPoint.distanceTo(center);
      if(dd < 0.6 && proj < closestDist){
        closestDist = proj;
        closestEnemy = en;
      }
    }
    fireTracer(origin.clone(), spreadDir, 0xfff2b0);
    if(closestEnemy){
      damageEnemy(closestEnemy, w.damage);
      anyHitEnemy = true;
    }
  }
  if(anyHitEnemy) showHitMarker();
  if(st.mag<=0) startReload();
}
function showHitMarker(){
  const hm = document.getElementById('hitmarker');
  hm.style.opacity='1';
  clearTimeout(hm._t);
  hm._t = setTimeout(()=>{hm.style.opacity='0';},140);
}

/* ---------- HUD ---------- */
function updateHudHealth(){ document.getElementById('healthBar').style.width = Math.max(0,player.health)+'%'; }
function updateHudBlocks(){
  document.getElementById('blockCount').textContent = playerBlocks;
  document.getElementById('blocksBar').style.width = (playerBlocks/MAX_BLOCKS*100)+'%';
}
function updateHudWeapon(){
  const w = WEAPONS[currentWeaponIdx];
  document.getElementById('weaponName').textContent = w.name;
  updateHudAmmo();
}
function updateHudAmmo(){
  const w = WEAPONS[currentWeaponIdx];
  const el = document.getElementById('ammo');
  if(w.type==='gun'){
    const st = ammoState[currentWeaponIdx];
    el.textContent = reloading ? 'Nachladen...' : (st.mag + ' / ' + st.reserve);
  } else if(w.id==='block'){
    el.textContent = playerBlocks + ' Bloecke';
  } else {
    el.textContent = '';
  }
}
function updateHudKills(){ document.getElementById('killCount').textContent = killCount; }
function updateHudWave(){ document.getElementById('waveCount').textContent = waveNumber; }

/* ---------- Start / Reset ---------- */
document.getElementById('startBtn').addEventListener('click', ()=>{
  document.getElementById('overlay').style.display='none';
  gameState = 'playing';
  needsRebuild = true;
  resetPlayer();
  updateHudHealth(); updateHudBlocks(); updateHudWeapon(); updateHudKills(); updateHudWave();
  canvas.requestPointerLock();
  clearEnemies();
  startWave();
});
document.getElementById('restartBtn').addEventListener('click', ()=>{
  document.getElementById('gameOverOverlay').style.display='none';
  gameState='playing';
  resetPlayer();
  updateHudHealth(); updateHudBlocks(); updateHudWeapon(); updateHudKills(); updateHudWave();
  canvas.requestPointerLock();
  clearEnemies();
  waveInProgress=false;
  startWave();
});
function clearEnemies(){
  for(const en of enemies) scene.remove(en.model.group);
  enemies.length = 0;
  for(const d of dyingEnemies) scene.remove(d.group);
  dyingEnemies.length = 0;
}

/* ---------- Hauptschleife ---------- */
let lastTime = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime = now;

  if(gameState==='playing'){
    updatePlayer(dt, now);
    updateEnemies(dt, now);
    finishReloadIfDone(now);
    if(mouseDown) tryUseTool(now);
    if(needsRebuild) rebuildVoxelMeshes();
  }
  renderer.render(scene, camera);
}
rebuildVoxelMeshes();
requestAnimationFrame(loop);

})();
