/* ===================== VOXEL SIEGE - PvE Ace-of-Spades-Klon ===================== */
(function(){
'use strict';

/* ---------- Grundkonstanten ---------- */
const SIZE = 56;           // Kartenbreite/-tiefe
const HEIGHT = 26;         // Kartenhoehe
const GRAVITY = -22;
const JUMP_SPEED = 8.2;
const PLAYER_SPEED = 5.6;
const PLAYER_HALF_W = 0.32;
const PLAYER_HEIGHT = 1.75;
const EYE_OFFSET = 1.6;
const REACH = 6.2;

const BLOCK_TYPES = {
  ground:  {color:0x6f8f4a, indestructible:false},
  dirt:    {color:0x7a5c3e, indestructible:false},
  border:  {color:0x4a4a4a, indestructible:true},
  brick:   {color:0xa85c32, indestructible:false},
  wood:    {color:0x8a6a3d, indestructible:false},
  player:  {color:0x3b82c4, indestructible:false}
};

/* ---------- Voxel-Welt ---------- */
const voxels = new Map(); // key "x,y,z" -> typeName
function key(x,y,z){ return x+','+y+','+z; }
function inBounds(x,y,z){ return x>=0 && x<SIZE && y>=0 && y<HEIGHT && z>=0 && z<SIZE; }
function getVoxel(x,y,z){ if(!inBounds(x,y,z)) return null; return voxels.get(key(x,y,z)) || null; }
function isSolid(x,y,z){
  if(!inBounds(x,y,z)) return y<0; // Boden unter Karte gilt als solide-ausgeschlossen, oben offen
  return voxels.has(key(x,y,z));
}
function setVoxel(x,y,z,type){ if(inBounds(x,y,z)) voxels.set(key(x,y,z), type); }
function removeVoxel(x,y,z){ voxels.delete(key(x,y,z)); }

/* ---------- Kartenaufbau (feste, handgebaute Map) ---------- */
const enemySpawns = [];
const patrolWaypoints = [];
let playerSpawn = {x:SIZE/2, y:3, z:6};

function fillBox(x0,y0,z0,x1,y1,z1,type){
  for(let x=x0;x<=x1;x++)
   for(let y=y0;y<=y1;y++)
    for(let z=z0;z<=z1;z++) setVoxel(x,y,z,type);
}
function hollowBox(x0,y0,z0,x1,y1,z1,type,doorSide,doorWidth){
  // Waende eines Gebaeudes mit einer Tueroeffnung
  doorWidth = doorWidth||2;
  for(let x=x0;x<=x1;x++){
    for(let z=z0;z<=z1;z++){
      const edge = (x===x0||x===x1||z===z0||z===z1);
      if(!edge) continue;
      for(let y=y0;y<=y1;y++){
        let isDoor=false;
        if(doorSide==='south' && z===z1 && Math.abs(x-((x0+x1)/2))<doorWidth && y<y0+2) isDoor=true;
        if(doorSide==='north' && z===z0 && Math.abs(x-((x0+x1)/2))<doorWidth && y<y0+2) isDoor=true;
        if(doorSide==='east' && x===x1 && Math.abs(z-((z0+z1)/2))<doorWidth && y<y0+2) isDoor=true;
        if(doorSide==='west' && x===x0 && Math.abs(z-((z0+z1)/2))<doorWidth && y<y0+2) isDoor=true;
        if(!isDoor) setVoxel(x,y,z,type);
      }
    }
  }
  // Dach
  for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) setVoxel(x,y1+1,z,type);
}
function buildRamp(x0,z0,dir,length,startY,type){
  // baut eine ansteigende Treppe/Rampe aus Blockstufen
  let x=x0, z=z0, y=startY;
  for(let i=0;i<length;i++){
    setVoxel(x,y,z,type);
    setVoxel(x,y-1,z,type);
    if(dir==='x') { setVoxel(x, y, z, type); setVoxel(x, y, z+1, type); x++; }
    else { setVoxel(x, y, z, type); setVoxel(x+1, y, z, type); z++; }
    if(i%1===0) y++;
  }
}

function buildMap(){
  // Bodenplatte (2 Schichten, abbaubar)
  for(let x=0;x<SIZE;x++){
    for(let z=0;z<SIZE;z++){
      setVoxel(x,0,z,'ground');
      setVoxel(x,1,z,'dirt');
    }
  }
  // Aussenmauern (unzerstoerbar), Arena-Begrenzung
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

  // Spieler-Basis (Suedseite): kleine Festung mit Deckungsmauer
  hollowBox(SIZE/2-8,2,4, SIZE/2+8,7,14, 'brick','south',5);
  playerSpawn = {x:SIZE/2, y:3, z:9};

  // Gebaeude 1 - Nordwest Bollwerk (Gegner-Basis)
  hollowBox(6,2,SIZE-20, 18,8,SIZE-8, 'brick','south',3);
  enemySpawns.push({x:12,y:3,z:SIZE-14});
  patrolWaypoints.push({x:9,z:SIZE-16},{x:15,z:SIZE-11},{x:12,z:SIZE-9});

  // Gebaeude 2 - Nordost Bollwerk
  hollowBox(SIZE-20,2,SIZE-20, SIZE-6,9,SIZE-8, 'brick','south',3);
  enemySpawns.push({x:SIZE-13,y:3,z:SIZE-14});
  patrolWaypoints.push({x:SIZE-16,z:SIZE-16},{x:SIZE-10,z:SIZE-11},{x:SIZE-13,z:SIZE-9});

  // Zentraler Turm mit Rampe
  fillBox(SIZE/2-3,2,SIZE/2+4, SIZE/2+3,10,SIZE/2+10,'wood');
  for(let x=SIZE/2-2;x<=SIZE/2+2;x++) for(let z=SIZE/2+5;z<=SIZE/2+9;z++) removeVoxel(x,3,z); // hohl machen
  for(let x=SIZE/2-2;x<=SIZE/2+2;x++) for(let z=SIZE/2+5;z<=SIZE/2+9;z++){for(let y=4;y<=9;y++) removeVoxel(x,y,z);}
  patrolWaypoints.push({x:SIZE/2,z:SIZE/2},{x:SIZE/2-6,z:SIZE/2},{x:SIZE/2+6,z:SIZE/2});

  // Deckungsmauern quer ueber das Feld (offene Kampfzone)
  for(let i=0;i<5;i++){
    const cx = 10 + i*9;
    fillBox(cx,2,22, cx+3,4,23,'brick');
  }
  for(let i=0;i<5;i++){
    const cx = 8 + i*10;
    fillBox(cx,2,32, cx+2,5,33,'brick');
  }

  // Ostflanke Nebenbasis (weitere Feinde)
  hollowBox(SIZE-16,2,24, SIZE-6,7,34,'brick','west',3);
  enemySpawns.push({x:SIZE-11,y:3,z:29});
  patrolWaypoints.push({x:SIZE-13,z:27},{x:SIZE-9,z:31});

  // Westflanke Nebenbasis
  hollowBox(6,2,24, 16,7,34,'brick','east',3);
  enemySpawns.push({x:11,y:3,z:29});
  patrolWaypoints.push({x:9,z:27},{x:13,z:31});
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
scene.fog = new THREE.Fog(0x8fc7ef, 40, 105);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(60,90,40);
scene.add(sun);

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- Voxel-Rendering (InstancedMesh je Blocktyp, nur sichtbare Flaechen) ---------- */
const MAX_INSTANCES = 40000;
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

/* ---------- Voxel-DDA-Raycast (fuer Schuesse, Abbau, Bauen) ---------- */
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
let yaw = 0, pitch = 0;

document.addEventListener('keydown', e=>{ keys[e.code]=true; handleHotkeys(e); });
document.addEventListener('keyup', e=>{ keys[e.code]=false; });

canvas.addEventListener('click', ()=>{
  if(gameState==='playing' && !locked) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', ()=>{
  locked = document.pointerLockElement === canvas;
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

function handleHotkeys(e){
  if(gameState!=='playing') return;
  if(e.code==='Digit1') selectWeapon(0);
  if(e.code==='Digit2') selectWeapon(1);
  if(e.code==='Digit3') selectWeapon(2);
  if(e.code==='Digit4') selectWeapon(3);
  if(e.code==='Digit5') selectWeapon(4);
  if(e.code==='KeyR') startReload();
  if(e.code==='Escape'){ document.exitPointerLock(); }
}

/* ---------- Waffen / Werkzeuge ---------- */
const WEAPONS = [
  {id:'spade', name:'Spaten', type:'tool'},
  {id:'block', name:'Block', type:'tool'},
  {id:'rifle', name:'Rifle', type:'gun', damage:38, rate:520, mag:10, reserve:60, spread:0.006, pellets:1, reloadTime:2200},
  {id:'smg', name:'SMG', type:'gun', damage:17, rate:110, mag:30, reserve:150, spread:0.018, pellets:1, reloadTime:1900},
  {id:'shotgun', name:'Shotgun', type:'gun', damage:11, rate:820, mag:6, reserve:24, spread:0.09, pellets:9, reloadTime:2500}
];
const ammoState = WEAPONS.map(w=> w.type==='gun' ? {mag:w.mag, reserve:w.reserve} : null);
let currentWeaponIdx = 0;
let lastFireTime = 0;
let reloading = false;
let reloadEndTime = 0;
let playerBlocks = 50;
const MAX_BLOCKS = 50;

function selectWeapon(i){
  if(i===currentWeaponIdx) return;
  currentWeaponIdx = i;
  reloading = false;
  document.querySelectorAll('.slot').forEach((el,idx)=> el.classList.toggle('active', idx===i));
  updateHudWeapon();
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

/* ---------- Spieler-Zustand ---------- */
const player = {
  pos: new THREE.Vector3(playerSpawn.x, playerSpawn.y+EYE_OFFSET, playerSpawn.z),
  vel: new THREE.Vector3(0,0,0),
  onGround: false,
  health: 100
};
let killCount = 0;
let waveNumber = 1;
let gameState = 'menu'; // menu | playing | dead

function resetPlayer(){
  player.pos.set(playerSpawn.x, playerSpawn.y+EYE_OFFSET, playerSpawn.z);
  player.vel.set(0,0,0);
  player.health = 100;
  playerBlocks = MAX_BLOCKS;
  yaw = Math.PI; pitch = 0;
  for(let i=0;i<WEAPONS.length;i++){ if(WEAPONS[i].type==='gun'){ ammoState[i].mag = WEAPONS[i].mag; ammoState[i].reserve = WEAPONS[i].reserve; } }
  currentWeaponIdx = 0;
  killCount = 0; waveNumber = 1;
}

/* Kollisionspruefung: AABB des Spielers gegen Voxelraster */
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

function updatePlayer(dt){
  const forward = new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)); // Blickrichtung XZ (Achtung: siehe Kamera-Mapping unten)
  const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  let moveX=0, moveZ=0;
  if(keys['KeyW']){ moveX-=forward.x; moveZ-=forward.z; }
  if(keys['KeyS']){ moveX+=forward.x; moveZ+=forward.z; }
  if(keys['KeyA']){ moveX-=right.x; moveZ-=right.z; }
  if(keys['KeyD']){ moveX+=right.x; moveZ+=right.z; }
  const len = Math.hypot(moveX,moveZ);
  if(len>0){ moveX/=len; moveZ/=len; }

  const speed = PLAYER_SPEED;
  const dx = moveX*speed*dt;
  const dz = moveZ*speed*dt;

  if(!collidesAt(player.pos.x+dx, player.pos.y, player.pos.z)) player.pos.x += dx;
  if(!collidesAt(player.pos.x, player.pos.y, player.pos.z+dz)) player.pos.z += dz;

  // Schwerkraft & Sprung
  player.vel.y += GRAVITY*dt;
  const feetBelow = Math.floor(player.pos.y - EYE_OFFSET - 0.05);
  player.onGround = isSolid(Math.floor(player.pos.x), feetBelow, Math.floor(player.pos.z));
  if(player.onGround && player.vel.y<0) player.vel.y = 0;
  if(keys['Space'] && player.onGround){ player.vel.y = JUMP_SPEED; }

  const dy = player.vel.y*dt;
  if(dy<0){
    if(!collidesAt(player.pos.x, player.pos.y+dy, player.pos.z)) player.pos.y += dy;
    else { player.vel.y = 0; player.pos.y = Math.ceil(player.pos.y - EYE_OFFSET)+EYE_OFFSET; }
  } else {
    if(!collidesAt(player.pos.x, player.pos.y+dy, player.pos.z)) player.pos.y += dy;
    else player.vel.y = 0;
  }

  // In Grenzen halten
  player.pos.x = Math.max(1.5, Math.min(SIZE-1.5, player.pos.x));
  player.pos.z = Math.max(1.5, Math.min(SIZE-1.5, player.pos.z));
  if(player.pos.y < -20){ // abgestuerzt
    damagePlayer(100);
  }

  camera.position.copy(player.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
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

/* ---------- Gegner ---------- */
const enemies = [];
const ENEMY_MAX_HEALTH = 100;
const ENEMY_SPEED = 2.6;
const ENEMY_DETECT_RANGE = 26;
const ENEMY_ATTACK_RANGE = 20;
const ENEMY_DAMAGE = 9;
const ENEMY_FIRE_COOLDOWN = 1100;

function spawnEnemy(){
  const spawn = enemySpawns[Math.floor(Math.random()*enemySpawns.length)];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({color:0xb33a2e});
  const headMat = new THREE.MeshLambertMaterial({color:0xd9a066});
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7,1.1,0.4), bodyMat);
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45,0.45,0.45), headMat);
  head.position.y = 1.5;
  group.add(body); group.add(head);

  const barBg = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.09,0.05), new THREE.MeshBasicMaterial({color:0x222222}));
  barBg.position.y = 2.0;
  const barFg = new THREE.Mesh(new THREE.BoxGeometry(0.78,0.07,0.06), new THREE.MeshBasicMaterial({color:0x35c93b}));
  barFg.position.y = 2.0;
  group.add(barBg); group.add(barFg);

  group.position.set(spawn.x+0.5, spawn.y, spawn.z+0.5);
  scene.add(group);

  const wp = patrolWaypoints[Math.floor(Math.random()*patrolWaypoints.length)];
  enemies.push({
    group, barFg,
    pos: new THREE.Vector3(spawn.x+0.5, spawn.y, spawn.z+0.5),
    health: ENEMY_MAX_HEALTH,
    state: 'patrol',
    patrolTarget: {x: wp.x+0.5, z: wp.z+0.5},
    lastFire: 0,
    alive: true
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
        const wp = patrolWaypoints[Math.floor(Math.random()*patrolWaypoints.length)];
        en.patrolTarget = {x:wp.x+0.5, z:wp.z+0.5};
      }
    }

    const dx = targetX-en.pos.x, dz = targetZ-en.pos.z;
    const d = Math.hypot(dx,dz);
    const stopDist = (en.state==='chase') ? 9 : 0.5;
    if(d>stopDist){
      const nx=dx/d, nz=dz/d;
      const speed = ENEMY_SPEED*dt;
      const nxPos = en.pos.x+nx*speed, nzPos = en.pos.z+nz*speed;
      if(!isSolid(Math.floor(nxPos), Math.floor(en.pos.y), Math.floor(en.pos.z))) en.pos.x = nxPos;
      if(!isSolid(Math.floor(en.pos.x), Math.floor(en.pos.y), Math.floor(nzPos))) en.pos.z = nzPos;
    }
    en.pos.y = groundYBelow(en.pos.x, en.pos.z, en.pos.y);

    // Angriff
    if(en.state==='chase' && distToPlayer < ENEMY_ATTACK_RANGE && canSeePlayer){
      if(now - en.lastFire > ENEMY_FIRE_COOLDOWN){
        en.lastFire = now;
        const hitChance = Math.max(0.15, 0.75 - distToPlayer/ENEMY_ATTACK_RANGE*0.55);
        fireTracer(enemyEye, new THREE.Vector3().subVectors(eyePos, enemyEye).normalize(), 0xffcc33);
        if(Math.random() < hitChance){
          damagePlayer(ENEMY_DAMAGE);
        }
      }
    }

    en.group.position.set(en.pos.x, en.pos.y, en.pos.z);
    en.group.lookAt(new THREE.Vector3(targetX, en.pos.y+0.75, targetZ));
    en.barFg.scale.x = Math.max(0, en.health/ENEMY_MAX_HEALTH);
    en.barFg.position.x = -0.39*(1-en.barFg.scale.x);
  }
}

function damageEnemy(en, amount){
  en.health -= amount;
  if(en.health<=0 && en.alive){
    en.alive = false;
    scene.remove(en.group);
    killCount++;
    updateHudKills();
    setTimeout(()=>{ const idx=enemies.indexOf(en); if(idx>=0) enemies.splice(idx,1); }, 50);
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

/* ---------- Tracer / Muendungsfeuer ---------- */
const tracerMat = new THREE.LineBasicMaterial({color:0xffee88});
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

/* ---------- WebAudio Soundeffekte (prozedural, keine Assets noetig) ---------- */
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

  // Schusswaffen
  const st = ammoState[currentWeaponIdx];
  if(reloading) return;
  if(now-lastFireTime < w.rate) return;
  if(st.mag<=0){ startReload(); return; }
  lastFireTime = now;
  st.mag--;
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
      const d = closestPoint.distanceTo(center);
      if(d < 0.6 && proj < closestDist){
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
  document.querySelectorAll('.slot').forEach((el,idx)=> el.classList.toggle('active', idx===0));
  canvas.requestPointerLock();
  clearEnemies();
  startWave();
});
document.getElementById('restartBtn').addEventListener('click', ()=>{
  document.getElementById('gameOverOverlay').style.display='none';
  gameState='playing';
  resetPlayer();
  updateHudHealth(); updateHudBlocks(); updateHudWeapon(); updateHudKills(); updateHudWave();
  document.querySelectorAll('.slot').forEach((el,idx)=> el.classList.toggle('active', idx===0));
  canvas.requestPointerLock();
  clearEnemies();
  waveInProgress=false;
  startWave();
});
function clearEnemies(){
  for(const en of enemies) scene.remove(en.group);
  enemies.length = 0;
}

/* ---------- Hauptschleife ---------- */
let lastTime = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime = now;

  if(gameState==='playing'){
    updatePlayer(dt);
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
