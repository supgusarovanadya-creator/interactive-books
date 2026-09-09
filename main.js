import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { PHOTO } from './assets/photo-data.js';

const BOOKS = await fetch('./assets/books.json').then(r=>r.json());
const photo = document.querySelector('#photo');
const canvas = document.querySelector('#gl');
const slot = document.querySelector('#slot');
const detail = document.querySelector('#detail');
const closeBtn = document.querySelector('#close');
photo.src = PHOTO;
await photo.decode().catch(()=>{});

const renderer = new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x000000,0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth/innerHeight, .1, 100);
camera.position.z = 12;
scene.add(new THREE.HemisphereLight(0xffffff,0x4b4037,1.8));
const key = new THREE.DirectionalLight(0xfff5df,2.4); key.position.set(-3,5,7); scene.add(key);
const rim = new THREE.DirectionalLight(0xbfd4ff,.65); rim.position.set(5,1,5); scene.add(rim);

const pointer = new THREE.Vector2();
const ray = new THREE.Raycaster();
const hitPlanes=[];
const meshes=[];
let hovered=null, active=null, down=null, holdTimer=null, held=false;

function viewWorld(){const d=camera.position.z;const h=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*d;return {w:h*camera.aspect,h}}
function coverRect(){const vw=innerWidth,vh=innerHeight;const ia=photo.naturalWidth/photo.naturalHeight,va=vw/vh;let rw,rh,ox,oy;if(va>ia){rw=vw;rh=vw/ia;ox=0;oy=(vh-rh)/2}else{rh=vh;rw=vh*ia;oy=0;ox=(vw-rw)/2}return{rw,rh,ox,oy}}
function sourceToScreen(b){const r=coverRect();return{x:r.ox+b.x/100*r.rw,y:r.oy+b.y/100*r.rh,w:b.w/100*r.rw,h:b.h/100*r.rh}}
function screenToWorld(x,y,z=0){const p=new THREE.Vector3(x/innerWidth*2-1,-(y/innerHeight)*2+1,.5).unproject(camera);const dir=p.sub(camera.position).normalize();const t=(z-camera.position.z)/dir.z;return camera.position.clone().add(dir.multiplyScalar(t))}
function worldSize(pxW,pxH){const a=screenToWorld(0,0),b=screenToWorld(pxW,pxH);return{w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)}}
function cropTexture(b){const c=document.createElement('canvas');c.width=256;c.height=1024;const g=c.getContext('2d');const sx=photo.naturalWidth*b.x/100,sy=photo.naturalHeight*b.y/100;const sw=photo.naturalWidth*b.w/100,sh=photo.naturalHeight*b.h/100;g.drawImage(photo,sx,sy,sw,sh,0,0,c.width,c.height);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
function coverTexture(b){const c=document.createElement('canvas');c.width=720;c.height=1000;const g=c.getContext('2d');g.fillStyle=b.color;g.fillRect(0,0,c.width,c.height);const grad=g.createLinearGradient(0,0,c.width,c.height);grad.addColorStop(0,'rgba(255,255,255,.16)');grad.addColorStop(.45,'rgba(255,255,255,0)');grad.addColorStop(1,'rgba(0,0,0,.12)');g.fillStyle=grad;g.fillRect(0,0,c.width,c.height);g.fillStyle=(b.color==='#171716'||b.color==='#1b1b1a')?'#f2eee6':'#1d1b18';g.font='54px Georgia';g.textAlign='left';const words=b.title.split(' ');let line='',lines=[];for(const w of words){const test=line?line+' '+w:w;if(g.measureText(test).width>560){lines.push(line);line=w}else line=test}if(line)lines.push(line);let y=260;for(const l of lines){g.fillText(l,72,y);y+=64}g.globalAlpha=.7;g.font='28px Arial';g.fillText(b.author||'',72,840);g.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function makeBook(b){const sr=sourceToScreen(b),center=screenToWorld(sr.x+sr.w/2,sr.y+sr.h/2),sz=worldSize(sr.w,sr.h);const depth=Math.max(.08,sz.w*.9);const coverW=sz.h*.64;const geo=new THREE.BoxGeometry(coverW,sz.h,depth);const paper=new THREE.MeshStandardMaterial({color:0xd7cebd,roughness:.9});const side=new THREE.MeshStandardMaterial({map:cropTexture(b),roughness:.82});const front=new THREE.MeshStandardMaterial({map:coverTexture(b),roughness:.8});const dark=new THREE.MeshStandardMaterial({color:new THREE.Color(b.color),roughness:.85});const mats=[side,dark,paper,paper,front,dark];const mesh=new THREE.Mesh(geo,mats);mesh.visible=false;mesh.castShadow=true;mesh.position.set(center.x,center.y,.12);mesh.rotation.y=Math.PI/2;mesh.userData={b,sr,home:mesh.position.clone(),state:'home',t:0,baseH:sz.h};scene.add(mesh);meshes.push(mesh);const pgeo=new THREE.PlaneGeometry(sz.w,sz.h);const pmat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});const hit=new THREE.Mesh(pgeo,pmat);hit.position.set(center.x,center.y,.2);hit.userData.mesh=mesh;scene.add(hit);hitPlanes.push(hit)}
BOOKS.forEach(makeBook);
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();meshes.forEach((m,i)=>{const b=m.userData.b,sr=sourceToScreen(b),center=screenToWorld(sr.x+sr.w/2,sr.y+sr.h/2);m.userData.sr=sr;m.userData.home.set(center.x,center.y,.12);if(m!==active)m.position.copy(m.userData.home);const hit=hitPlanes[i];const sz=worldSize(sr.w,sr.h);hit.position.set(center.x,center.y,.2);hit.scale.set(sz.w/hit.geometry.parameters.width,sz.h/hit.geometry.parameters.height,1)})}
addEventListener('resize',resize);resize();
function hitAt(x,y){pointer.set(x/innerWidth*2-1,-y/innerHeight*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(hitPlanes,false)[0]?.object?.userData.mesh||null}
function showSlot(m,on){if(!m){slot.style.opacity=0;return}const r=m.userData.sr;slot.style.left=r.x+'px';slot.style.top=r.y+'px';slot.style.width=r.w+'px';slot.style.height=r.h+'px';slot.style.opacity=on?.65:0}
function setHover(m,on){if(active)return;if(on){hovered=m;m.visible=true;m.userData.state='hover';showSlot(m,true)}else if(m){m.userData.state='home';if(hovered===m)hovered=null;showSlot(m,false)}}
canvas.addEventListener('pointermove',e=>{if(active||e.pointerType==='touch')return;const m=hitAt(e.clientX,e.clientY);if(m!==hovered){if(hovered)setHover(hovered,false);if(m)setHover(m,true)}});
canvas.addEventListener('pointerleave',()=>hovered&&setHover(hovered,false));
canvas.addEventListener('pointerdown',e=>{if(active)return;const m=hitAt(e.clientX,e.clientY);down={x:e.clientX,y:e.clientY,t:performance.now(),m};held=false;if(e.pointerType==='touch'&&m){holdTimer=setTimeout(()=>{held=true;setHover(m,true)},130)}});
canvas.addEventListener('pointermove',e=>{if(!down||e.pointerType!=='touch')return;if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>12){clearTimeout(holdTimer);if(held&&down.m)setHover(down.m,false);down=null}});
canvas.addEventListener('pointerup',e=>{clearTimeout(holdTimer);if(!down)return;const elapsed=performance.now()-down.t,up=hitAt(e.clientX,e.clientY);if(held){if(down.m)setHover(down.m,false)}else if(elapsed<350&&up&&up===down.m)openBook(up);down=null;held=false});
function detailHTML(selected){const order=[selected,...BOOKS.filter(b=>b.id!==selected.id)];return order.map(b=>`<section class="section" data-id="${b.id}"><div class="coverWrap"><div class="cover"><div class="coverInner" style="--cover:${b.color}"><div class="coverTitle">${b.title}</div><div class="coverAuthor">${b.author||''}</div></div></div></div><div class="copy"><h1>${b.title}</h1><div class="sub">${b.subtitle||''}</div><div class="by">${b.author||''}</div><div class="meta"><div><span>Edition</span>Personal collection</div><div><span>Language</span>Original edition</div><div><span>Format</span>Book</div><div><span>Notes</span>Details will be added</div></div><p>${b.desc||''}</p></div></section>`).join('')}
function openBook(m){active=m;hovered=null;m.visible=true;m.userData.state='opening';m.userData.t=0;showSlot(m,true);document.body.classList.add('detail');detail.innerHTML=detailHTML(m.userData.b);window.scrollTo(0,0)}
function closeDetail(){if(!active)return;window.scrollTo(0,0);detail.innerHTML='';document.body.classList.remove('detail');active.userData.state='closing';active.userData.t=1}
closeBtn.addEventListener('click',closeDetail);
const ease=t=>1-Math.pow(1-t,4),lerp=(a,b,t)=>a+(b-a)*t;let last=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.033,(now-last)/1000);last=now;for(const m of meshes){const u=m.userData;if(m===active&&u.state==='opening'){u.t=Math.min(1,u.t+dt/.9);const t=ease(u.t),vw=viewWorld();const mobile=innerWidth<800,targetX=mobile?0:-vw.w*.205,targetY=mobile?vw.h*.15:0,targetZ=3.7;m.position.set(lerp(u.home.x,targetX,t),lerp(u.home.y,targetY,t),lerp(u.home.z,targetZ,t));m.rotation.y=lerp(Math.PI/2,0,t);m.rotation.z=lerp(0,.015,t);const targetH=mobile?vw.h*.43:vw.h*.58;const s=lerp(1,targetH/u.baseH,t);m.scale.setScalar(s);if(u.t>.55)showSlot(m,false);if(u.t>=1){u.state='open';m.visible=false}}else if(m===active&&u.state==='closing'){m.visible=true;u.t=Math.max(0,u.t-dt/.7);const t=ease(u.t),vw=viewWorld();const mobile=innerWidth<800,targetX=mobile?0:-vw.w*.205,targetY=mobile?vw.h*.15:0,targetZ=3.7;m.position.set(lerp(u.home.x,targetX,t),lerp(u.home.y,targetY,t),lerp(u.home.z,targetZ,t));m.rotation.y=lerp(Math.PI/2,0,t);const targetH=mobile?vw.h*.43:vw.h*.58;const s=lerp(1,targetH/u.baseH,t);m.scale.setScalar(s);if(u.t<=0){m.position.copy(u.home);m.rotation.set(0,Math.PI/2,0);m.scale.setScalar(1);m.visible=false;u.state='home';active=null;showSlot(null,false)}}else if(!active){const target=u.state==='hover'?1:0;u.t+=(target-u.t)*Math.min(1,dt*11);const t=ease(u.t);if(u.t<.015&&u.state==='home'){m.visible=false;continue}else m.visible=true;m.position.set(u.home.x+lerp(0,-.04,t),u.home.y+lerp(0,.02,t),u.home.z+lerp(0,.62,t));m.rotation.y=lerp(Math.PI/2,Math.PI/2-.08,t);m.scale.setScalar(1)}}renderer.render(scene,camera)}
requestAnimationFrame(frame);
