import * as THREE from 'three';

// ============ helpers ============
const $ = id => document.getElementById(id);
const rand = (a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist2D=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function beep(freq=440,dur=0.1,type='square',vol=0.15,slide=0){
  try{
    audioCtx.resume();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type=type;o.frequency.value=freq;
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),audioCtx.currentTime+dur);
    g.gain.value=vol;g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur);
    o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
  }catch(e){}
}
const audioCtx=new (window.AudioContext||window.webkitAudioContext)();
const sfx={
  shoot(){beep(180,0.12,'square',0.12,-120)},
  shotgun(){beep(120,0.2,'sawtooth',0.18,-80)},
  hit(){beep(1200,0.08,'square',0.12)},
  kill(){beep(600,0.25,'sawtooth',0.15,400)},
  build(){beep(320,0.1,'triangle',0.15,100)},
  pickup(){beep(700,0.12,'sine',0.15,300)},
  chest(){beep(500,0.12,'sine',0.15);setTimeout(()=>beep(750,0.12,'sine',0.15),100);setTimeout(()=>beep(1000,0.2,'sine',0.15),200)},
  hurt(){beep(150,0.2,'sawtooth',0.2,-50)},
  wood(){beep(250,0.08,'triangle',0.15)},
  heal(){beep(440,0.3,'sine',0.12,220)},
  storm(){beep(90,0.5,'sawtooth',0.12)},
  click(){beep(800,0.05,'square',0.08)},
};

// ============ weapons ============
const WEAPONS={
  pistol:{name:'Pistol',dmg:20,rpm:320,mag:15,reload:1.2,spread:0.025,auto:false,range:90,col:0xcccccc,rar:'COMMON',rarCol:'#9e9e9e'},
  rifle_c:{name:'Assault Rifle',dmg:25,rpm:360,mag:30,reload:1.8,spread:0.02,auto:true,range:120,col:0x9e9e9e,rar:'COMMON',rarCol:'#9e9e9e'},
  rifle_r:{name:'Assault Rifle',dmg:30,rpm:380,mag:30,reload:1.7,spread:0.017,auto:true,range:130,col:0x2196f3,rar:'RARE',rarCol:'#2196f3'},
  rifle_e:{name:'Scoped AR',dmg:36,rpm:340,mag:30,reload:1.6,spread:0.012,auto:true,range:150,col:0x9c27b0,rar:'EPIC',rarCol:'#ab47bc'},
  scar:{name:'SCAR Legendary',dmg:42,rpm:400,mag:30,reload:1.5,spread:0.014,auto:true,range:150,col:0xffb300,rar:'LEGENDARY',rarCol:'#ffb300'},
  shotgun:{name:'Pump Shotgun',dmg:9,pellets:8,rpm:70,mag:5,reload:2.2,spread:0.07,auto:false,range:28,col:0x795548,rar:'UNCOMMON',rarCol:'#4caf50'},
  smg:{name:'SMG',dmg:16,rpm:700,mag:30,reload:1.5,spread:0.035,auto:true,range:60,col:0x4caf50,rar:'UNCOMMON',rarCol:'#4caf50'},
};
const LOOT_TABLE=['pistol','rifle_c','rifle_c','shotgun','smg','rifle_r','rifle_e','scar'];
const BOT_NAMES=['Peely','Drift','Lynx','Raven','Jonesy','Fishstick','Midas','Skye','Meowscles','Aura','Cuddle','Renegade'];

// ============ three setup ============
const container=$('game-container');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87ceeb);
scene.fog=new THREE.Fog(0x87ceeb,80,380);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.1,1000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

scene.add(new THREE.HemisphereLight(0xbfe3ff,0x3a7d44,0.9));
const sun=new THREE.DirectionalLight(0xffffff,1.4);
sun.position.set(80,120,40);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-150;sun.shadow.camera.right=150;sun.shadow.camera.top=150;sun.shadow.camera.bottom=-150;
scene.add(sun);

const MAP=380, HALF=MAP/2;
const colliders=[]; // {x,z,r} or {x,z,hw,hd,top} boxes
const buildings=[]; // meshes for shooting + roofs
const trees=[], rocks=[], chests=[], groundLoot=[], builds=[], tracers=[];
let bots=[];

// ---- ground ----
{
  const g=new THREE.PlaneGeometry(MAP,MAP,32,32);
  const pos=g.attributes.position, cols=[];
  const c1=new THREE.Color(0x5fbf4a),c2=new THREE.Color(0x4da53d),c3=new THREE.Color(0x77d05e);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i);
    const n=Math.sin(x*0.08)*Math.cos(y*0.07)+Math.sin(x*0.02+y*0.03);
    const c=n>0.6?c3:(n<-0.4?c2:c1);
    cols.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true}));
  m.rotation.x=-Math.PI/2;m.receiveShadow=true;scene.add(m);
  // lake
  const lake=new THREE.Mesh(new THREE.CircleGeometry(34,32),new THREE.MeshLambertMaterial({color:0x2fa3d6}));
  lake.rotation.x=-Math.PI/2;lake.position.set(-90,0.05,80);scene.add(lake);
  // roads
  const roadMat=new THREE.MeshLambertMaterial({color:0x8d8d8d});
  const r1=new THREE.Mesh(new THREE.PlaneGeometry(14,MAP),roadMat);r1.rotation.x=-Math.PI/2;r1.position.y=0.06;scene.add(r1);
  const r2=new THREE.Mesh(new THREE.PlaneGeometry(MAP,14),roadMat);r2.rotation.x=-Math.PI/2;r2.position.y=0.06;scene.add(r2);
}

// ---- buildings (Tilted-style city at center + houses) ----
function addBuilding(x,z,w,h,d,color,roofColor=0x333a45){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color}));
  body.position.y=h/2;body.castShadow=true;body.receiveShadow=true;g.add(body);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(w+1,1,d+1),new THREE.MeshLambertMaterial({color:roofColor}));
  roof.position.y=h+0.5;roof.castShadow=true;g.add(roof);
  // windows
  const winMat=new THREE.MeshBasicMaterial({color:0xfff9c4});
  for(let i=0;i<Math.floor(w/3);i++)for(let j=0;j<Math.floor(h/3);j++){
    const win=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.2),winMat);
    win.position.set(-w/2+2+i*3,2.5+j*3,d/2+0.06);g.add(win);
    const win2=win.clone();win2.rotation.y=Math.PI;win2.position.z=-d/2-0.06;g.add(win2);
  }
  g.position.set(x,0,z);scene.add(g);
  const rec={mesh:body,x,z,hw:w/2,hd:d/2,top:h+1,type:'building'};
  buildings.push(rec);colliders.push(rec);
  return rec;
}
const cityColors=[0xe57373,0x64b5f6,0xffd54f,0xba68c8,0x4db6ac,0xff8a65,0x90a4ae,0xaed581];
for(let i=0;i<8;i++){
  const x=(i%4)*26-39, z=Math.floor(i/4)*30-15;
  addBuilding(x,z,rand(12,16),rand(14,26),rand(12,16),cityColors[i]);
}
addBuilding(90,-70,14,8,12,0xef9a9a);
addBuilding(-110,-80,16,10,14,0x9fa8da);
addBuilding(80,110,12,7,12,0xffcc80);
addBuilding(-60,130,15,9,13,0x80cbc4);
addBuilding(130,20,12,12,12,0xce93d8);

// ---- trees / rocks ----
const trunkMat=new THREE.MeshLambertMaterial({color:0x6d4c41});
const leafMat=new THREE.MeshLambertMaterial({color:0x2e7d32});
const leafMat2=new THREE.MeshLambertMaterial({color:0x43a047});
function addTree(x,z){
  const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.7,3,6),trunkMat);
  trunk.position.y=1.5;trunk.castShadow=true;g.add(trunk);
  const lm=Math.random()>0.5?leafMat:leafMat2;
  for(let i=0;i<3;i++){
    const cone=new THREE.Mesh(new THREE.ConeGeometry(3-i*0.7,3,7),lm);
    cone.position.y=4+i*1.8;cone.castShadow=true;g.add(cone);
  }
  g.position.set(x,0,z);scene.add(g);
  trees.push({mesh:g,x,z,hp:3,alive:true});
  colliders.push({x,z,r:1.1,type:'tree'});
}
function addRock(x,z){
  const m=new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.5,2.6)),new THREE.MeshLambertMaterial({color:0x9e9e9e}));
  m.position.set(x,1,z);m.castShadow=true;scene.add(m);
  rocks.push({mesh:m,x,z,hp:3,alive:true});
  colliders.push({x,z,r:2,type:'rock'});
}
for(let i=0;i<150;i++){
  const x=rand(-HALF+10,HALF-10),z=rand(-HALF+10,HALF-10);
  if(Math.hypot(x,z)<45) continue;
  if(Math.hypot(x+90,z-80)<40) continue;
  addTree(x,z);
}
for(let i=0;i<40;i++) addRock(rand(-HALF+10,HALF-10),rand(-HALF+10,HALF-10));

// ---- chests ----
function addChest(x,z){
  const g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.9,1.1),new THREE.MeshLambertMaterial({color:0xc6892b}));
  base.position.y=0.45;base.castShadow=true;g.add(base);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.5,1.1),new THREE.MeshLambertMaterial({color:0xffd54f,emissive:0x664400,emissiveIntensity:0.4}));
  lid.position.y=1.1;g.add(lid);
  const glow=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,0.15,16),new THREE.MeshBasicMaterial({color:0xffd54f,transparent:true,opacity:0.5}));
  glow.position.y=0.08;g.add(glow);
  const light=new THREE.PointLight(0xffd54f,8,12);light.position.y=2;g.add(light);
  g.position.set(x,0,z);scene.add(g);
  chests.push({mesh:g,lid,light,x,z,opened:false});
}
const chestSpots=[[10,10],[-14,8],[90,-70],[-110,-80],[80,110],[-60,130],[40,-60],[-50,-40],[60,40],[-30,60],[120,60],[-130,20]];
chestSpots.forEach(([x,z])=>addChest(x+rand(-4,4),z+rand(-4,4)));

// ---- ground loot ----
function spawnLoot(x,z,forceKey){
  const key=forceKey||LOOT_TABLE[randi(0,LOOT_TABLE.length-1)];
  const w=WEAPONS[key];
  const g=new THREE.Group();
  const bodyM=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.35,0.3),new THREE.MeshLambertMaterial({color:w.col}));
  bodyM.position.y=0.6;g.add(bodyM);
  const barrel=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.15,0.15),new THREE.MeshLambertMaterial({color:0x222222}));
  barrel.position.set(1,0.65,0);g.add(barrel);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,0.09,8,24),new THREE.MeshBasicMaterial({color:new THREE.Color(w.rarCol)}));
  ring.rotation.x=Math.PI/2;ring.position.y=0.12;g.add(ring);
  const light=new THREE.PointLight(new THREE.Color(w.rarCol).getHex(),4,8);light.position.y=1.5;g.add(light);
  g.position.set(x,0,z);scene.add(g);
  groundLoot.push({mesh:g,key,x,z,taken:false,phase:rand(0,6)});
}
for(let i=0;i<45;i++) spawnLoot(rand(-HALF+15,HALF-15),rand(-HALF+15,HALF-15));

// ---- battle bus ----
const bus=new THREE.Group();
{
  const b=new THREE.Mesh(new THREE.BoxGeometry(14,4,5),new THREE.MeshLambertMaterial({color:0x29b6f6}));
  bus.add(b);
  const bal=new THREE.Mesh(new THREE.SphereGeometry(6,16,12),new THREE.MeshLambertMaterial({color:0xff7043}));
  bal.position.y=8;bal.scale.set(1.4,1,1);bus.add(bal);
  for(let i=-6;i<=6;i+=3){
    const r=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,6),new THREE.MeshBasicMaterial({color:0x333}));
    r.position.set(i,4,0);bus.add(r);
  }
  bus.position.set(-250,110,-250);bus.visible=false;scene.add(bus);
}

// ============ characters ============
function makeSoldier(bodyColor,legColor){
  const g=new THREE.Group();
  const legL=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.9,0.45),new THREE.MeshLambertMaterial({color:legColor}));
  legL.position.set(-0.28,0.45,0);g.add(legL);
  const legR=legL.clone();legR.position.x=0.28;g.add(legR);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,0.6),new THREE.MeshLambertMaterial({color:bodyColor}));
  torso.position.y=1.45;torso.castShadow=true;g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.42,12,10),new THREE.MeshLambertMaterial({color:0xffcc9e}));
  head.position.y=2.35;head.castShadow=true;g.add(head);
  const gun=new THREE.Mesh(new THREE.BoxGeometry(1.3,0.25,0.25),new THREE.MeshLambertMaterial({color:0x222222}));
  gun.position.set(0.5,1.5,0.6);g.add(gun);
  const glider=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.8),new THREE.MeshLambertMaterial({color:0x7b2ff7,side:THREE.DoubleSide}));
  glider.rotation.x=Math.PI/2.3;glider.position.y=3.4;glider.visible=false;g.add(glider);
  g.userData={legL,legR,gun,glider,torso,head};
  return g;
}
function nameSprite(text,hpFrac){
  const c=document.createElement('canvas');c.width=256;c.height=80;
  const x=c.getContext('2d');
  x.fillStyle='rgba(0,0,0,0.6)';x.fillRect(40,0,176,30);
  x.fillStyle='#fff';x.font='bold 22px Arial';x.textAlign='center';x.fillText(text,128,23);
  x.fillStyle='rgba(0,0,0,0.6)';x.fillRect(48,36,160,14);
  x.fillStyle=hpFrac>0.5?'#2ecc71':'#e74c3c';x.fillRect(48,36,160*hpFrac,14);
  const t=new THREE.CanvasTexture(c);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false}));
  s.scale.set(4,1.25,1);s.position.y=3.4;return s;
}

// player state
const player={
  mesh:makeSoldier(0x1565c0,0x0d47a1),
  pos:new THREE.Vector3(rand(-60,60),110,rand(-60,60)),
  vel:new THREE.Vector3(),yaw:0,pitch:-0.15,
  hp:100,shield:50,alive:true,skydiving:true,
  slots:['rifle_c','pistol'],active:0,ammo:{},reloadT:0,lastShot:0,
  wood:100,shields:2,meds:2,buildMode:false,buildSel:0,kills:0,
  healT:0,vy:0,grounded:false,
};
player.mesh.position.copy(player.pos);scene.add(player.mesh);
for(const k of player.slots) player.ammo[k]=WEAPONS[k].mag;

// bots
function spawnBots(){
  bots=[];
  for(let i=0;i<11;i++){
    const col=new THREE.Color().setHSL(Math.random(),0.7,0.45);
    const mesh=makeSoldier(col.getHex(),0x222831);
    const p=new THREE.Vector3(rand(-120,120),105+rand(0,25),rand(-120,120));
    mesh.position.copy(p);scene.add(mesh);
    const tag=nameSprite(BOT_NAMES[i],1);mesh.add(tag);
    const key=LOOT_TABLE[randi(0,LOOT_TABLE.length-1)];
    bots.push({name:BOT_NAMES[i],mesh,tag,pos:p,vel:new THREE.Vector3(),hp:100,shield:randi(0,50),
      alive:true,skydiving:true,weapon:key,ammo:WEAPONS[key].mag,fireCd:rand(1,2.5),
      wander:new THREE.Vector3(rand(-100,100),0,rand(-100,100)),strafe:Math.random()>0.5?1:-1,vy:0,hitT:0});
  }
}
spawnBots();

// ============ storm ============
const storm={cx:0,cz:0,r:175,tx:0,tz:0,tr:175,phase:0,timer:28,shrinking:false,dmg:2};
const stormWall=new THREE.Mesh(new THREE.CylinderGeometry(1,1,120,64,1,true),
  new THREE.MeshBasicMaterial({color:0x9c27b0,transparent:true,opacity:0.28,side:THREE.DoubleSide}));
stormWall.position.y=60;scene.add(stormWall);
const zoneRing=new THREE.Mesh(new THREE.TorusGeometry(1,0.008,8,80),new THREE.MeshBasicMaterial({color:0xffffff}));
zoneRing.rotation.x=Math.PI/2;zoneRing.position.y=0.5;scene.add(zoneRing);
function updateStorm(dt){
  storm.timer-=dt;
  if(storm.timer<=0){
    if(!storm.shrinking){
      storm.shrinking=true;storm.timer=30;
      const nr=[140,95,55,28,10][Math.min(storm.phase,4)]||8;
      const ang=rand(0,Math.PI*2),d=rand(0,(storm.r-nr)*0.5);
      storm.tx=clamp(storm.cx+Math.cos(ang)*d,-HALF+20,HALF-20);
      storm.tz=clamp(storm.cz+Math.sin(ang)*d,-HALF+20,HALF-20);
      storm.tr=nr;storm.dmg=[2,5,8,12,18][Math.min(storm.phase,4)];
      $('storm-warning').classList.remove('hidden');sfx.storm();
      setTimeout(()=>$('storm-warning').classList.add('hidden'),4000);
    }else{
      storm.shrinking=false;storm.phase++;storm.timer=18;
      storm.cx=storm.tx;storm.cz=storm.tz;storm.r=storm.tr;
    }
  }
  if(storm.shrinking){
    const k=Math.min(1,dt/30);
    storm.cx+=(storm.tx-storm.cx)*k;storm.cz+=(storm.tz-storm.cz)*k;storm.r+=(storm.tr-storm.r)*k;
  }
  stormWall.position.set(storm.cx,60,storm.cz);
  stormWall.scale.set(storm.r,1,storm.r);
  zoneRing.position.set(storm.tx||storm.cx,0.5,storm.tz||storm.cz);
  zoneRing.scale.set(storm.tr||storm.r,storm.tr||storm.r,1);
  const mm=Math.ceil(storm.timer);
  $('storm-timer').textContent=(storm.shrinking?'SHRINK ':'')+mm+'s • Z'+(storm.phase+1);
}

// ============ input ============
const keys={};
addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(!started||!player.alive) return;
  if(e.code==='KeyQ'){player.buildMode=!player.buildMode;sfx.click();updateHUD();}
  if(e.code==='Digit1'){player.buildSel=0;player.buildMode=true;updateHUD();}
  if(e.code==='Digit2'){player.buildSel=1;player.buildMode=true;updateHUD();}
  if(e.code==='Digit3'){player.buildSel=2;player.buildMode=true;updateHUD();}
  if(e.code==='KeyE') tryInteract();
  if(e.code==='KeyR') startReload();
  if(e.code==='KeyF') harvest();
  if(e.code==='Digit4') useShield();
  if(e.code==='Digit5') useMed();
  if(e.code==='Tab'){e.preventDefault();cycleWeapon();}
  if(e.code==='KeyZ'){cycleWeapon();}
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('wheel',()=>{if(started&&player.alive)cycleWeapon();});
let started=false,locked=false;
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer.domElement;});
document.addEventListener('mousemove',e=>{
  if(!locked||!started) return;
  player.yaw-=e.movementX*0.0024;
  player.pitch=clamp(player.pitch-e.movementY*0.0022,-1.2,1.1);
});
document.addEventListener('mousedown',e=>{
  if(!started||!locked||!player.alive) return;
  if(e.button===0) mouseDown=true;
});
document.addEventListener('mouseup',e=>{if(e.button===0)mouseDown=false;});
let mouseDown=false;
renderer.domElement.addEventListener('click',()=>{
  if(started&&!locked) renderer.domElement.requestPointerLock();
});
$('play-btn').onclick=()=>{
  sfx.click();startGame();
};
$('again-btn').onclick=()=>location.reload();
function startGame(){
  started=true;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('crosshair').classList.remove('hidden');
  bus.visible=true;
  renderer.domElement.requestPointerLock();
  addFeed('🚌 Battle Bus launched! Press WASD to steer, you auto-land.');
}

// ============ HUD ============
function updateHUD(){
  const w=WEAPONS[player.slots[player.active]];
  $('hp-fill').style.width=player.hp+'%';$('hp-num').textContent=Math.ceil(player.hp);
  $('shield-fill').style.width=player.shield+'%';$('shield-num').textContent=Math.ceil(player.shield);
  const am=player.ammo[player.slots[player.active]];
  $('ammo-label').textContent=`🔫 ${w.name} ${am} / ${w.mag}`;
  $('mats-label').textContent=`🧱 Wood: ${player.wood} | 🛡 ${player.shields} | 💊 ${player.meds}`;
  const bl=$('build-label');
  bl.textContent=player.buildMode?`BUILD: ${['WALL','RAMP','FLOOR'][player.buildSel]} (Q off)`:'BUILD: OFF (Q)';
  bl.classList.toggle('on',player.buildMode);
  $('kill-count').textContent=player.kills;
  $('alive-count').textContent=1+bots.filter(b=>b.alive).length;
  const ws=$('weapon-slots');ws.innerHTML='';
  player.slots.forEach((k,i)=>{
    const d=document.createElement('div');d.className='wslot'+(i===player.active?' active':'');
    d.innerHTML=`<div class="rar" style="color:${WEAPONS[k].rarCol}">${WEAPONS[k].rar}</div>${WEAPONS[k].name}`;
    ws.appendChild(d);
  });
}
function addFeed(t){
  const d=document.createElement('div');d.className='feed-item';d.textContent=t;
  $('killfeed').prepend(d);
  while($('killfeed').children.length>5) $('killfeed').lastChild.remove();
  setTimeout(()=>d.remove(),6000);
}
function cycleWeapon(){player.active=(player.active+1)%player.slots.length;sfx.click();updateHUD();}

// ============ interact / loot / heal ============
let nearInteract=null;
function tryInteract(){
  // chest
  for(const c of chests){
    if(!c.opened&&Math.hypot(c.x-player.pos.x,c.z-player.pos.z)<3.5){
      c.opened=true;c.lid.rotation.x=-1.2;c.light.intensity=1;sfx.chest();
      const key=LOOT_TABLE[randi(2,LOOT_TABLE.length-1)];
      spawnLoot(c.x+rand(-1.5,1.5),c.z+rand(-1.5,1.5),key);
      spawnLoot(c.x+rand(-1.5,1.5),c.z+rand(-1.5,1.5),LOOT_TABLE[randi(0,3)]);
      player.wood+=50;player.shields=Math.min(5,player.shields+1);
      addFeed('📦 Chest opened! +50 wood');
      updateHUD();return;
    }
  }
  for(const l of groundLoot){
    if(!l.taken&&Math.hypot(l.x-player.pos.x,l.z-player.pos.z)<3){
      l.taken=true;scene.remove(l.mesh);sfx.pickup();
      // swap into active slot, drop old
      const old=player.slots[player.active];
      spawnLoot(player.pos.x+1,player.pos.z+1,old);
      player.slots[player.active]=l.key;player.ammo[l.key]=WEAPONS[l.key].mag;
      addFeed(`Picked up ${WEAPONS[l.key].rar} ${WEAPONS[l.key].name}`);
      updateHUD();return;
    }
  }
}
function startReload(){
  const key=player.slots[player.active];
  if(player.ammo[key]>=WEAPONS[key].mag||player.reloadT>0) return;
  player.reloadT=WEAPONS[key].reload;beep(400,0.2,'square',0.1);
}
function harvest(){
  if(player.healT>0) return;
  beep(300,0.08,'sawtooth',0.12);
  player.mesh.userData.gun.position.z=1.4;
  setTimeout(()=>player.mesh.userData.gun.position.z=0.6,120);
  let best=null,bd=3.8;
  for(const t of trees){if(!t.alive)continue;const d=Math.hypot(t.x-player.pos.x,t.z-player.pos.z);if(d<bd){bd=d;best=t;}}
  for(const r of rocks){if(!r.alive)continue;const d=Math.hypot(r.x-player.pos.x,r.z-player.pos.z);if(d<bd){bd=d;best=r;}}
  if(best){
    best.hp--;player.wood+=25;sfx.wood();addFeed('+25 wood 🪓');updateHUD();
    best.mesh.scale.multiplyScalar(0.85);
    if(best.hp<=0){best.alive=false;scene.remove(best.mesh);}
  }
}
function useShield(){
  if(player.shields<=0||player.shield>=100||player.healT>0) return;
  player.shields--;player.healT=2;
  setTimeout(()=>{player.shield=Math.min(100,player.shield+50);sfx.heal();updateHUD();},2000);
  addFeed('🛡 Shield up!');updateHUD();
}
function useMed(){
  if(player.meds<=0||player.hp>=100||player.healT>0) return;
  player.meds--;player.healT=3;
  setTimeout(()=>{player.hp=Math.min(100,player.hp+75);sfx.heal();updateHUD();},3000);
  addFeed('💊 Medkit!');updateHUD();
}

// ============ building ============
const ghostMat=new THREE.MeshLambertMaterial({color:0x00e676,transparent:true,opacity:0.5});
let ghost=null;
function getGhost(){
  if(ghost) return ghost;
  ghost=new THREE.Mesh(new THREE.BoxGeometry(3,2.7,0.3),ghostMat.clone());
  ghost.visible=false;scene.add(ghost);return ghost;
}
function tryBuild(){
  if(player.wood<10){addFeed('Need 10 wood! Hit trees (F)');return;}
  const g=getGhost();
  if(!g.visible||g.material.color.getHex()===0xff1744) return;
  player.wood-=10;sfx.build();
  const type=['wall','ramp','floor'][player.buildSel];
  let mesh;
  const mat=new THREE.MeshLambertMaterial({color:0xc89b62});
  if(type==='wall') mesh=new THREE.Mesh(new THREE.BoxGeometry(3,2.7,0.3),mat);
  else if(type==='floor') mesh=new THREE.Mesh(new THREE.BoxGeometry(3,0.25,3),mat);
  else{mesh=new THREE.Mesh(new THREE.BoxGeometry(3,0.25,4.2),mat);mesh.rotation.x=-0.6;}
  mesh.position.copy(g.position);mesh.rotation.y=g.rotation.y+(type==='ramp'?0:0);
  if(type==='ramp') mesh.rotation.x=-0.6;
  mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  builds.push({mesh,hp:150,type,x:mesh.position.x,z:mesh.position.z,top:mesh.position.y+1.4});
  updateHUD();
}
function updateGhost(){
  const g=getGhost();
  if(!player.buildMode||!player.alive||player.skydiving){g.visible=false;return;}
  g.visible=true;
  const names=['wall','ramp','floor'];
  // re-shape
  g.rotation.set(0,player.yaw,0);
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  g.position.set(player.pos.x+fx*3,player.pos.y+1.3,player.pos.z+fz*3);
  if(names[player.buildSel]==='floor'){g.scale.set(1,0.12,1);g.position.y=player.pos.y+0.2;}
  else if(names[player.buildSel]==='ramp'){g.scale.set(1,0.12,1.4);}
  else g.scale.set(1,1,1);
  const ok=player.wood>=10;
  g.material.color.setHex(ok?0x00e676:0xff1744);
}

// ============ shooting ============
const ray=new THREE.Raycaster();
function shoot(fromPlayer){
  const isP=fromPlayer===player;
  const wkey=isP?player.slots[player.active]:fromPlayer.weapon;
  const w=WEAPONS[wkey];
  const now=performance.now()/1000;
  if(isP){
    if(player.reloadT>0||player.healT>0) return;
    if(now-player.lastShot<60/w.rpm) return;
    if(player.ammo[wkey]<=0){startReload();return;}
    player.ammo[wkey]--;player.lastShot=now;
  }else{
    if(fromPlayer.ammo<=0){fromPlayer.ammo=w.mag;return;}
    fromPlayer.ammo--;
  }
  // origin + dir
  const o=new THREE.Vector3(),d=new THREE.Vector3();
  if(isP){
    camera.getWorldDirection(d);
    o.copy(camera.position);
    if(player.buildMode){tryBuild();return;}
  }else{
    o.copy(fromPlayer.pos).add(new THREE.Vector3(0,1.6,0));
    const t=(fromPlayer.targetIsPlayer?player.pos:fromPlayer.targetPos)||player.pos;
    const aimY=(t.y||0)+1.5;
    d.set(t.x-o.x,aimY-o.y+rand(-1,1),t.z-o.z).normalize();
    d.x+=rand(-0.05,0.05);d.y+=rand(-0.03,0.03);d.z+=rand(-0.05,0.05);d.normalize();
  }
  // spread for player
  if(isP){d.x+=rand(-w.spread,w.spread);d.y+=rand(-w.spread,w.spread);d.z+=rand(-w.spread,w.spread);d.normalize();}
  ray.set(o,d);ray.far=w.range;
  const targets=[];
  for(const b of bots) if(b.alive) targets.push(b.mesh);
  if(!isP&&player.alive) targets.push(player.mesh);
  for(const bd of builds) targets.push(bd.mesh);
  for(const bl of buildings) targets.push(bl.mesh);
  const hits=ray.intersectObjects(targets,true);
  let end=o.clone().add(d.clone().multiplyScalar(w.range));
  if(hits.length){
    const h=hits[0];end=h.point;
    // determine what hit
    let hitBot=null;
    {
      let obj=h.object;
      while(obj){
        hitBot=bots.find(b=>b.alive&&b.mesh===obj);
        if(hitBot) break;
        obj=obj.parent;
      }
    }
    const hitBuild=builds.find(b=>b.mesh===h.object);
    if(hitBot&&fromPlayer!==hitBot){
      const pellets=w.pellets||1;
      let dmg=0;
      for(let i=0;i<pellets;i++) if(Math.random()>0.15) dmg+=w.dmg*(isP?1:rand(0.5,0.8));
      // falloff
      const dist=o.distanceTo(h.point);
      if(dist>30) dmg*=0.7;
      damageChar(hitBot,dmg,isP?(isP?'YOU':fromPlayer.name):fromPlayer.name,isP);
      if(isP){$('hitmarker').classList.add('show');setTimeout(()=>$('hitmarker').classList.remove('show'),120);sfx.hit();}
    }else if(!isP&&(h.object===player.mesh||player.mesh.children.includes(h.object)||(h.object.parent&&player.mesh.children.includes(h.object.parent)))){
      let dmg=w.dmg*rand(0.5,0.85);
      if(o.distanceTo(h.point)>30) dmg*=0.7;
      damageChar(player,dmg,fromPlayer.name,false);
    }else if(hitBuild){
      hitBuild.hp-=w.dmg;
      if(hitBuild.hp<=0){scene.remove(hitBuild.mesh);builds.splice(builds.indexOf(hitBuild),1);}
    }
  }
  // tracer + sound
  const start=isP?player.mesh.position.clone().add(new THREE.Vector3(0,1.6,0)).add(d.clone().multiplyScalar(1)):o.clone();
  const geo=new THREE.BufferGeometry().setFromPoints([start,end]);
  const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:isP?0xfff176:0xff8a65,transparent:true,opacity:0.9}));
  scene.add(line);tracers.push({line,t:0.09});
  // muzzle flash light
  if(isP){wkey==='shotgun'?sfx.shotgun():sfx.shoot();updateHUD();}
  else if(o.distanceTo(player.pos)<50) beep(140,0.1,'square',0.06,-60);
  // bot return target update
  if(isP){
    for(const b of bots){
      if(!b.alive) continue;
      if(b.pos.distanceTo(player.pos)<55){b.targetIsPlayer=true;b.fireCd=Math.min(b.fireCd,0.6);}
    }
  }
}
function damageChar(ch,amt,byName,byPlayer){
  if(!ch.alive) return;
  let rem=amt;
  if(ch.shield>0){const s=Math.min(ch.shield,rem);ch.shield-=s;rem-=s;}
  ch.hp-=rem;
  if(ch===player){
    sfx.hurt();
    $('damage-vignette').style.opacity=1;
    setTimeout(()=>$('damage-vignette').style.opacity=0,250);
    updateHUD();
  }else{
    // update bot tag
    ch.mesh.remove(ch.tag);
    ch.tag=nameSprite(ch.name,Math.max(0,ch.hp/100));
    ch.mesh.add(ch.tag);
  }
  if(ch.hp<=0){
    ch.hp=0;ch.alive=false;
    if(ch===player) onDeath(byName);
    else onBotDeath(ch,byPlayer? 'YOU':byName,byPlayer);
  }
}
function onBotDeath(bot,killerName,byPlayer){
  bot.mesh.rotation.x=-Math.PI/2;bot.mesh.position.y=0.5;
  bot.tag.visible=false;
  setTimeout(()=>scene.remove(bot.mesh),8*1000);
  spawnLoot(bot.pos.x+rand(-2,2),bot.pos.z+rand(-2,2));
  if(byPlayer){player.kills++;sfx.kill();}
  addFeed(`💀 ${killerName} eliminated ${bot.name}`);
  const alive=bots.filter(b=>b.alive).length;
  if(byPlayer) addFeed(`Nice! ${alive} enemies left`);
  updateHUD();checkWin();
}
function onDeath(killer){
  player.alive=false;
  const place=bots.filter(b=>b.alive).length+1;
  showEnd(false,killer,place);
}
function checkWin(){
  if(!player.alive) return;
  if(bots.every(b=>!b.alive)) showEnd(true);
}
function showEnd(win,killer='',place=1){
  document.exitPointerLock?.();
  $('end-screen').classList.remove('hidden');
  $('crosshair').classList.add('hidden');
  if(win){
    $('end-title').textContent='#1 VICTORY ROYALE!';
    $('end-sub').textContent='Last one standing. Legendary!';
    beep(523,0.15,'sine',0.2);setTimeout(()=>beep(659,0.15,'sine',0.2),150);setTimeout(()=>beep(784,0.4,'sine',0.2),300);
  }else{
    $('end-title').textContent=`#${place} ELIMINATED`;
    $('end-title').style.color='#ff6b6b';
    $('end-sub').textContent=`Eliminated by ${killer}. GG!`;
  }
  $('end-stats').innerHTML=`<div><b>${player.kills}</b><span>eliminations</span></div><div><b>${bots.filter(b=>!b.alive).length}</b><span>bots down</span></div><div><b>${Math.floor(gameTime/60)}:${String(Math.floor(gameTime%60)).padStart(2,'0')}</b><span>survived</span></div>`;
}

// ============ physics helpers ============
function groundHeightAt(x,z,curY){
  let g=0;
  if(Math.hypot(x+90,z-80)<33) g=-0.5; // lake dip
  for(const b of buildings){
    if(Math.abs(x-b.x)<b.hw&&Math.abs(z-b.z)<b.hd){
      if(curY>=b.top-1.2) g=Math.max(g,b.top);
    }
  }
  for(const b of builds){
    if(b.type!=='wall'&&Math.abs(x-b.x)<1.8&&Math.abs(z-b.z)<1.8){
      const top=b.mesh.position.y+(b.type==='floor'?0.3:0.6);
      if(curY>=top-1.5&&top>g) g=top;
    }
  }
  return g;
}
function collide(pos,radius=0.8){
  pos.x=clamp(pos.x,-HALF+2,HALF-2);pos.z=clamp(pos.z,-HALF+2,HALF-2);
  for(const c of colliders){
    if(c.r){
      const dx=pos.x-c.x,dz=pos.z-c.z,d=Math.hypot(dx,dz);
      if(d<c.r+radius&&d>0.001){pos.x=c.x+dx/d*(c.r+radius);pos.z=c.z+dz/d*(c.r+radius);}
    }else{
      // building box, only if low
      if(pos.y<c.top-0.5){
        const nx=clamp(pos.x,c.x-c.hw,c.x+c.hw),nz=clamp(pos.z,c.z-c.hd,c.z+c.hd);
        const ox=pos.x-nx,oz=pos.z-nz;
        if(Math.abs(ox)<radius&&Math.abs(oz)<radius){
          if(Math.abs(ox)>Math.abs(oz)) pos.x=nx+(ox>=0?radius:-radius);
          else pos.z=nz+(oz>=0?radius:-radius);
        }
      }
    }
  }
  // build walls block
  for(const b of builds){
    if(b.type!=='wall') continue;
    const dx=pos.x-b.mesh.position.x,dz=pos.z-b.mesh.position.z;
    if(Math.abs(dx)<1.8&&Math.abs(dz)<1.8&&Math.abs(pos.y-b.mesh.position.y)<1.8){
      // push along wall normal
      const yaw=b.mesh.rotation.y;
      const nx=Math.sin(yaw),nz=Math.cos(yaw);
      const dot=dx*nx+dz*nz;
      pos.x+=nx*(dot>0?0.1:-0.1);pos.z+=nz*(dot>0?0.1:-0.1);
    }
  }
}

// ============ minimap ============
const mm=$('minimap').getContext('2d');
function drawMinimap(){
  mm.fillStyle='#2f7a3d';mm.fillRect(0,0,160,160);
  mm.fillStyle='#2fa3d6';mm.beginPath();mm.arc((-90+HALF)/MAP*160,(80+HALF)/MAP*160,34/MAP*160,0,7);mm.fill();
  mm.fillStyle='#888';
  for(const b of buildings) mm.fillRect((b.x-b.hw+HALF)/MAP*160,(b.z-b.hd+HALF)/MAP*160,b.hw*2/MAP*160,b.hd*2/MAP*160);
  const px=(v)=>(v+HALF)/MAP*160;
  // storm + zone
  mm.strokeStyle='#a800ff';mm.lineWidth=3;mm.beginPath();mm.arc(px(storm.cx),px(storm.cz),storm.r/MAP*160,0,7);mm.stroke();
  mm.strokeStyle='#fff';mm.lineWidth=2;mm.beginPath();mm.arc(px(storm.tx||storm.cx),px(storm.tz||storm.cz),(storm.tr||storm.r)/MAP*160,0,7);mm.stroke();
  for(const b of bots){if(!b.alive)continue;mm.fillStyle='#ff3b3b';mm.fillRect(px(b.pos.x)-2,px(b.pos.z)-2,4,4);}
  for(const c of chests){if(c.opened)continue;mm.fillStyle='#ffd32a';mm.fillRect(px(c.x)-2,px(c.z)-2,4,4);}
  // player arrow
  mm.save();mm.translate(px(player.pos.x),px(player.pos.z));mm.rotate(-player.yaw);
  mm.fillStyle='#ffe600';mm.beginPath();mm.moveTo(0,-6);mm.lineTo(4,4);mm.lineTo(-4,4);mm.closePath();mm.fill();mm.restore();
}

// ============ game loop ============
let last=performance.now(),gameTime=0,mmT=0;
const fwd=new THREE.Vector3();
function animate(){
  requestAnimationFrame(animate);
  const now=performance.now();
  let dt=Math.min(0.05,(now-last)/1000);last=now;
  if(started){gameTime+=dt;updateStorm(dt);}
  // tracers
  for(let i=tracers.length-1;i>=0;i--){tracers[i].t-=dt;if(tracers[i].t<=0){scene.remove(tracers[i].line);tracers.splice(i,1);}}
  // loot bob
  const t=now/1000;
  for(const l of groundLoot){if(!l.taken){l.mesh.position.y=Math.sin(t*2+l.phase)*0.15;l.mesh.rotation.y+=dt;}}
  for(const c of chests){if(!c.opened)c.mesh.children[2].material.opacity=0.35+Math.sin(t*3)*0.2;}
  bus.position.x+=dt*30;bus.position.z+=dt*30;
  if(bus.position.x>300) bus.visible=false;

  if(started) updatePlayer(dt,t);
  updateBots(dt,t);
  updateGhost();
  updateInteractPrompt();
  if(started&&(mmT+=dt)>0.25){mmT=0;drawMinimap();}

  // camera (third person)
  if(player.alive){
    const cd=player.skydiving?9:5.6;
    const cx=player.pos.x+Math.sin(player.yaw)*Math.cos(player.pitch)*cd;
    const cz=player.pos.z+Math.cos(player.yaw)*Math.cos(player.pitch)*cd;
    const cy=player.pos.y+2.2-Math.sin(player.pitch)*cd;
    camera.position.set(cx,Math.max(cy,groundHeightAt(cx,cz,cy)+0.5),cz);
    fwd.set(-Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch)+0.08,-Math.cos(player.yaw)*Math.cos(player.pitch));
    const look=player.pos.clone().add(new THREE.Vector3(0,1.8,0)).add(fwd.clone().multiplyScalar(10));
    camera.lookAt(look);
  }
  renderer.render(scene,camera);
  if(!started){
    // menu orbit cam
    const a=t*0.1;
    camera.position.set(Math.sin(a)*90,40,Math.cos(a)*90);
    camera.lookAt(0,8,0);
  }
}

function updatePlayer(dt,t){
  if(!player.alive) return;
  // reload timer
  if(player.reloadT>0){player.reloadT-=dt;if(player.reloadT<=0){const k=player.slots[player.active];player.ammo[k]=WEAPONS[k].mag;updateHUD();}}
  if(player.healT>0) player.healT-=dt;
  player.mesh.rotation.y=-player.yaw+Math.PI;

  if(player.skydiving){
    const sp=22;
    if(keys['KeyW']){player.pos.x+=-Math.sin(player.yaw)*sp*dt;player.pos.z+=-Math.cos(player.yaw)*sp*dt;}
    if(keys['KeyS']){player.pos.x+=Math.sin(player.yaw)*sp*dt*0.5;player.pos.z+=Math.cos(player.yaw)*sp*dt*0.5;}
    if(keys['KeyA']){player.pos.x+=-Math.cos(player.yaw)*sp*dt;player.pos.z+=Math.sin(player.yaw)*sp*dt;}
    if(keys['KeyD']){player.pos.x+=Math.cos(player.yaw)*sp*dt;player.pos.z+=-Math.sin(player.yaw)*sp*dt;}
    player.pos.y-=11*dt;
    player.mesh.userData.glider.visible=true;
    const g=groundHeightAt(player.pos.x,player.pos.z,player.pos.y);
    if(player.pos.y<=g+0.2){player.pos.y=g;player.skydiving=false;player.mesh.userData.glider.visible=false;addFeed('🪂 Landed! Find a weapon!');}
    player.mesh.position.copy(player.pos);
    return;
  }

  // storm damage
  if(Math.hypot(player.pos.x-storm.cx,player.pos.z-storm.cz)>storm.r){
    player.hp-=storm.dmg*dt;
    if(Math.floor(t*2)%2===0) $('damage-vignette').style.opacity=0.35;
    if(player.hp<=0){player.hp=0;damageChar(player,1,'The Storm',false);}
  }
  const sprint=keys['ShiftLeft']||keys['ShiftRight'];
  const sp=(sprint?9.5:6)*(player.healT>0?0.5:1);
  fwd.set(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const right=new THREE.Vector3(-fwd.z,0,fwd.x);
  const mv=new THREE.Vector3();
  if(keys['KeyW'])mv.add(fwd);if(keys['KeyS'])mv.sub(fwd);
  if(keys['KeyD'])mv.add(right);if(keys['KeyA'])mv.sub(right);
  if(mv.lengthSq()>0){mv.normalize().multiplyScalar(sp*dt);player.pos.add(mv);
    const sw=Math.sin(t*10)*0.4;
    player.mesh.userData.legL.rotation.x=sw;player.mesh.userData.legR.rotation.x=-sw;
  }else{player.mesh.userData.legL.rotation.x*=0.9;player.mesh.userData.legR.rotation.x*=0.9;}
  // jump/gravity
  const g=groundHeightAt(player.pos.x,player.pos.z,player.pos.y+0.5);
  if(keys['Space']&&player.grounded){player.vy=9;player.grounded=false;}
  player.vy-=26*dt;player.pos.y+=player.vy*dt;
  if(player.pos.y<=g){player.pos.y=g;player.vy=0;player.grounded=true;}else player.grounded=false;
  collide(player.pos);
  player.mesh.position.copy(player.pos);
  // shoot held
  const w=WEAPONS[player.slots[player.active]];
  if(mouseDown&&(w.auto||!w._clicked)){shoot(player);w._clicked=true;}
  if(!mouseDown) w._clicked=false;
}

function updateBots(dt,t){
  for(const b of bots){
    if(!b.alive) continue;
    b.mesh.rotation.y=Math.atan2(b.pos.x-player.pos.x,b.pos.z-player.pos.z)+Math.PI;
    // skydive phase
    if(b.skydiving){
      const dx=b.wander.x-b.pos.x,dz=b.wander.z-b.pos.z,d=Math.hypot(dx,dz);
      if(d>2){b.pos.x+=dx/d*18*dt;b.pos.z+=dz/d*18*dt;}
      b.pos.y-=10*dt;
      b.mesh.userData.glider.visible=true;
      const g=groundHeightAt(b.pos.x,b.pos.z,b.pos.y);
      if(b.pos.y<=g){b.pos.y=g;b.skydiving=false;b.mesh.userData.glider.visible=false;}
      b.mesh.position.copy(b.pos);
      continue;
    }
    // storm damage
    if(Math.hypot(b.pos.x-storm.cx,b.pos.z-storm.cz)>storm.r){
      b.hp-=storm.dmg*dt;
      if(b.hp<=0){onBotDeath(b,'The Storm',false);continue;}
    }
    // find target: nearest alive enemy
    let target=null,bestD=48;
    if(player.alive){
      const d=b.pos.distanceTo(player.pos);
      if(d<bestD){bestD=d;target={pos:player.pos,isPlayer:true};}
    }
    for(const o of bots){
      if(o===b||!o.alive) continue;
      const d=b.pos.distanceTo(o.pos);
      if(d<bestD){bestD=d;target={pos:o.pos,isPlayer:false,bot:o};}
    }
    const inZone=Math.hypot(b.pos.x-storm.cx,b.pos.z-storm.cz)<storm.r*0.95;
    if(target&&bestD<46){
      // face + strafe
      const ang=Math.atan2(target.pos.x-b.pos.x,target.pos.z-b.pos.z);
      b.mesh.rotation.y=ang;
      const strafeDir=Math.sin(t*0.7+b.pos.x)>0?1:-1;
      b.pos.x+=Math.cos(ang)*strafeDir*3*dt;
      b.pos.z+=-Math.sin(ang)*strafeDir*3*dt;
      if(bestD>18){b.pos.x+=(target.pos.x-b.pos.x)/bestD*4*dt;b.pos.z+=(target.pos.z-b.pos.z)/bestD*4*dt;}
      else if(bestD<8){b.pos.x-=(target.pos.x-b.pos.x)/bestD*3*dt;b.pos.z-=(target.pos.z-b.pos.z)/bestD*3*dt;}
      b.fireCd-=dt;
      if(b.fireCd<=0){
        b.targetIsPlayer=target.isPlayer;b.targetPos=target.pos;
        shoot(b);
        b.fireCd=rand(0.7,1.7);
      }
    }else{
      // move toward wander or zone
      let gx=b.wander.x,gz=b.wander.z;
      if(!inZone){gx=storm.cx+rand(-20,20);gz=storm.cz+rand(-20,20);}
      else if(Math.hypot(b.pos.x-gx,b.pos.z-gz)<5){b.wander.set(rand(-HALF+20,HALF-20),0,rand(-HALF+20,HALF-20));}
      const dx=gx-b.pos.x,dz=gz-b.pos.z,d=Math.hypot(dx,dz)||1;
      b.pos.x+=dx/d*4.5*dt;b.pos.z+=dz/d*4.5*dt;
      b.targetIsPlayer=false;
      const sw=Math.sin(t*8+b.pos.z)*0.4;
      b.mesh.userData.legL.rotation.x=sw;b.mesh.userData.legR.rotation.x=-sw;
    }
    const g=groundHeightAt(b.pos.x,b.pos.z,b.pos.y+0.5);
    if(b.pos.y>g){b.vy=(b.vy||0)-26*dt;b.pos.y+=b.vy*dt;if(b.pos.y<g){b.pos.y=g;b.vy=0;}}
    else b.pos.y=g;
    collide(b.pos);
    b.mesh.position.copy(b.pos);
  }
  // bots kill each other passively when far from player (simulate battle)
  if(started&&Math.random()<dt*0.06){
    const alive=bots.filter(b=>b.alive&&!b.skydiving);
    if(alive.length>3&&player.skydiving===false){
      const a=alive[randi(0,alive.length-1)];
      let c=alive[randi(0,alive.length-1)];
      if(c!==a&&a.pos.distanceTo(c.pos)>60){onBotDeath(c,a.name,false);}
    }
  }
}

function updateInteractPrompt(){
  if(!started||!player.alive){$('interact-prompt').classList.add('hidden');return;}
  nearInteract=null;let txt='';
  for(const c of chests){
    if(!c.opened&&Math.hypot(c.x-player.pos.x,c.z-player.pos.z)<3.5){txt=`open chest`;nearInteract=c;break;}
  }
  if(!nearInteract) for(const l of groundLoot){
    if(!l.taken&&Math.hypot(l.x-player.pos.x,l.z-player.pos.z)<3){txt=`pick up ${WEAPONS[l.key].rar} ${WEAPONS[l.key].name}`;nearInteract=l;break;}
  }
  if(nearInteract){$('interact-text').textContent=txt;$('interact-prompt').classList.remove('hidden');}
  else $('interact-prompt').classList.add('hidden');
}

updateHUD();
$('loading').style.display='none';
animate();
