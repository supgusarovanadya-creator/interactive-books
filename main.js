import * as THREE from 'three';

const canvas = document.querySelector('#gl');
const veil = document.querySelector('#veil');
const copy = document.querySelector('#copy');
const titleEl = document.querySelector('#title');
const authorEl = document.querySelector('#author');
const closeBtn = document.querySelector('#close');

const BOOKS = await fetch('./assets/books.json').then(r=>r.json());

const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000,0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, innerWidth/innerHeight, .1, 100);
camera.position.set(0,0,12);

scene.add(new THREE.HemisphereLight(0xffffff,0x665c50,2.1));
const key = new THREE.DirectionalLight(0xfff1d2,3.2);
key.position.set(-3,5,7); key.castShadow=true; scene.add(key);
const fill = new THREE.DirectionalLight(0xb9d2ff,1.0);
fill.position.set(5,1,4); scene.add(fill);

const root = new THREE.Group();
scene.add(root);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactive = [];
let active = null;
let hover = null;
let down = null;
let longPressTimer = null;
let longPressBook = null;

function worldBounds(){
  const z=0;
  const dist=camera.position.z-z;
  const h=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*dist;
  return {h,w:h*camera.aspect};
}

function bookWorld(b){
  const {w,h}=worldBounds();
  return {
    x:(b.x+b.w/2)/100*w-w/2,
    y:h/2-(b.y+b.h/2)/100*h,
    width:b.w/100*w,
    height:b.h/100*h
  };
}

function makeLabelTexture(book){
  const c=document.createElement('canvas'); c.width=768; c.height=1100;
  const g=c.getContext('2d');
  g.fillStyle=book.color; g.fillRect(0,0,c.width,c.height);
  g.fillStyle='rgba(255,255,255,.92)';
  g.font='42px Georgia'; g.textAlign='center';
  const words=book.title.split(' '); let lines=[], line='';
  for(const word of words){
    const t=line?line+' '+word:word;
    if(g.measureText(t).width>620){lines.push(line);line=word}else line=t;
  }
  if(line) lines.push(line);
  let y=390;
  lines.forEach(L=>{g.fillText(L,384,y);y+=58});
  g.font='24px Arial'; g.fillStyle='rgba(255,255,255,.68)';
  g.fillText(book.author||'',384,y+50);
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}

function makeBook(book){
  const p=bookWorld(book);
  const depth=Math.max(.16,Math.min(.30,p.width*.45));
  const geo=new THREE.BoxGeometry(p.width,p.height,depth,1,1,1);
  const paper=new THREE.MeshStandardMaterial({color:0xd8cfbd,roughness:.86,metalness:0});
  const dark=new THREE.MeshStandardMaterial({color:book.color,roughness:.7,metalness:0});
  const cover=new THREE.MeshStandardMaterial({map:makeLabelTexture(book),roughness:.78,metalness:0});
  const mats=[dark,dark,paper,paper,cover,dark];
  const mesh=new THREE.Mesh(geo,mats);
  mesh.castShadow=true; mesh.receiveShadow=true;
  mesh.position.set(p.x,p.y,.12);
  mesh.userData={book,home:mesh.position.clone(),homeRot:mesh.rotation.clone(),p,depth,state:'home',hoverT:0,openT:0};
  root.add(mesh); interactive.push(mesh);
  return mesh;
}
BOOKS.forEach(makeBook);

function resize(){
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  interactive.forEach(m=>{
    const p=bookWorld(m.userData.book);
    const old=m.userData.p;
    const sx=p.width/old.width, sy=p.height/old.height;
    m.scale.x*=sx; m.scale.y*=sy;
    m.userData.p=p;
    if(m!==active){m.position.x=p.x;m.position.y=p.y;}
    m.userData.home.set(p.x,p.y,.12);
  });
}
addEventListener('resize',resize);
resize();

function hit(clientX,clientY){
  pointer.x=clientX/innerWidth*2-1;
  pointer.y=-(clientY/innerHeight)*2+1;
  raycaster.setFromCamera(pointer,camera);
  return raycaster.intersectObjects(interactive,false)[0]?.object || null;
}

function setHover(mesh,on){
  if(active) return;
  if(on){hover=mesh;mesh.userData.state='hover';}
  else if(mesh && mesh!==active){if(hover===mesh) hover=null;mesh.userData.state='home';}
}

canvas.addEventListener('pointermove',e=>{
  if(active || e.pointerType==='touch') return;
  const h=hit(e.clientX,e.clientY);
  if(h!==hover){ if(hover)setHover(hover,false); if(h)setHover(h,true); }
});
canvas.addEventListener('pointerleave',()=>{if(hover)setHover(hover,false)});

canvas.addEventListener('pointerdown',e=>{
  if(active) return;
  down={x:e.clientX,y:e.clientY,t:performance.now(),mesh:hit(e.clientX,e.clientY)};
  if(e.pointerType==='touch' && down.mesh){
    longPressBook=down.mesh;
    clearTimeout(longPressTimer);
    longPressTimer=setTimeout(()=>setHover(longPressBook,true),120);
  }
});
canvas.addEventListener('pointermove',e=>{
  if(!down || e.pointerType!=='touch') return;
  if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>10){
    clearTimeout(longPressTimer); longPressTimer=null;
    if(longPressBook)setHover(longPressBook,false);
  }
});
canvas.addEventListener('pointerup',e=>{
  clearTimeout(longPressTimer); longPressTimer=null;
  const up=hit(e.clientX,e.clientY);
  if(down?.mesh && up===down.mesh && Math.hypot(e.clientX-down.x,e.clientY-down.y)<12){openBook(up);}
  else if(longPressBook) setHover(longPressBook,false);
  down=null; longPressBook=null;
});

function openBook(mesh){
  active=mesh; hover=null;
  mesh.userData.state='opening'; mesh.userData.openT=0;
  titleEl.textContent=mesh.userData.book.title;
  authorEl.textContent=mesh.userData.book.author || 'Автор будет указан позже';
  veil.classList.add('on');
  closeBtn.classList.add('on');
  interactive.forEach(m=>{if(m!==mesh)m.visible=false});
}

closeBtn.addEventListener('click',()=>{
  if(!active)return;
  copy.classList.remove('on');
  active.userData.state='closing';
  active.userData.openT=1;
});

function ease(t){return 1-Math.pow(1-t,4)}
function lerp(a,b,t){return a+(b-a)*t}

let last=performance.now();
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min(.033,(now-last)/1000); last=now;

  for(const m of interactive){
    const u=m.userData;
    if(m===active && u.state==='opening'){
      u.openT=Math.min(1,u.openT+dt/1.05);
      const t=ease(u.openT);
      const mobile=innerWidth<720;
      const targetX=mobile?0:-worldBounds().w*.22;
      const targetY=mobile?worldBounds().h*.16:0;
      const targetZ=4.7;
      m.position.x=lerp(u.home.x,targetX,t);
      m.position.y=lerp(u.home.y,targetY,t);
      m.position.z=lerp(u.home.z,targetZ,t);
      m.rotation.y=lerp(0,-Math.PI/2,t);
      m.rotation.z=lerp(0,mobile?-0.02:0.015,t);
      const targetH=mobile?worldBounds().h*.43:worldBounds().h*.68;
      const s=lerp(1,targetH/u.p.height,t);
      m.scale.set(s,s,1.25);
      if(u.openT>.78) copy.classList.add('on');
      if(u.openT>=1)u.state='open';
    }else if(m===active && u.state==='closing'){
      u.openT=Math.max(0,u.openT-dt/.85);
      const t=ease(u.openT);
      const mobile=innerWidth<720;
      const targetX=mobile?0:-worldBounds().w*.22;
      const targetY=mobile?worldBounds().h*.16:0;
      m.position.x=lerp(u.home.x,targetX,t);
      m.position.y=lerp(u.home.y,targetY,t);
      m.position.z=lerp(u.home.z,4.7,t);
      m.rotation.y=lerp(0,-Math.PI/2,t);
      const targetH=mobile?worldBounds().h*.43:worldBounds().h*.68;
      const s=lerp(1,targetH/u.p.height,t);
      m.scale.set(s,s,lerp(1,1.25,t));
      if(u.openT<=0){
        m.position.copy(u.home);m.rotation.set(0,0,0);m.scale.set(1,1,1);
        u.state='home';active=null;
        veil.classList.remove('on');closeBtn.classList.remove('on');
        interactive.forEach(x=>x.visible=true);
      }
    }else if(!active){
      const target=u.state==='hover'?1:0;
      u.hoverT += (target-u.hoverT)*Math.min(1,dt*10);
      const p=ease(u.hoverT);
      const side=u.book.id==='hamlet'?0.16:-0.10;
      m.position.x=u.home.x+side*p;
      m.position.y=u.home.y+0.05*p;
      m.position.z=u.home.z+0.75*p;
      m.rotation.y=-0.06*p;
      m.scale.z=1+0.45*p;
    }
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
