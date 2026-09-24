import {chromium} from 'playwright';
import {PrismaClient} from '@prisma/client';
import {createHash, randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

assert.match(new URL(process.env.DATABASE_URL||'').pathname,/_test$/,'fall E2E requires a *_test database');
const origin=process.env.E2E_URL||'http://localhost:3100';
const standPath=process.env.FALL_STAND_IMAGE||'/tmp/aqtau-runtime/pose.jpg';
const stand=Buffer.from(await readFile(standPath)).toString('base64');
const db=new PrismaClient();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const hash=t=>createHash('sha256').update(t).digest('hex');

async function newSession(cameraId,adminId){
 const token=randomBytes(32).toString('hex');
 const s=await db.cameraSession.create({data:{cameraId,tokenHash:hash(token),invitedBy:adminId,status:'INVITED',expiresAt:new Date(Date.now()+30*60000)}});
 return {token,id:s.id};
}
async function postFrames(page,{token,rotate,frames,gap=700}){
 const body=await page.evaluate(async ({token,b64,rotate,frames,gap})=>{
  const img=new Image();img.src='data:image/jpeg;base64,'+b64;await img.decode();
  const base=640;
  const canvas=document.createElement('canvas');
  if(rotate){canvas.width=Math.round(base*img.naturalHeight/img.naturalWidth);canvas.height=base;}
  else{canvas.width=base;canvas.height=Math.round(base*img.naturalHeight/img.naturalWidth);}
  const ctx=canvas.getContext('2d');
  if(rotate){ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(Math.PI/2);ctx.drawImage(img,-base/2,-base/2,base,base);}
  else ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const statuses=[];
  for(let i=0;i<frames;i++){
   const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.8));
   const res=await fetch('/api/camera/'+token+'/frame',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});
   statuses.push(res.status);
   await new Promise(r=>setTimeout(r,gap));
  }
  return statuses;
 },{token,b64:stand,rotate,frames,gap});
 return body;
}
async function until(fn,timeout=30000){const start=Date.now();for(;;){const v=await fn();if(v)return v;if(Date.now()-start>timeout)throw new Error('poll timeout');await new Promise(r=>setTimeout(r,300));}}
async function login(email,role){
 const ctx=await browser.newContext({serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const p=await ctx.newPage();p.setDefaultTimeout(30000);
 await p.goto(origin+'/login',{waitUntil:'domcontentloaded'});
 const btn=p.locator('button[name=email][value="'+email+'"]');await btn.evaluate(el=>el.closest('details').open=true);await btn.click();
 await p.waitForURL('**/'+role,{waitUntil:'domcontentloaded'});
 await p.getByText('● Live',{exact:true}).waitFor();
 return {ctx,p};
}

try{
 const admin=await db.user.findUniqueOrThrow({where:{email:'admin@demo.kz'}});
 const camera=await db.camera.findFirstOrThrow();
 const {p:operator}=await login('operator@demo.kz','operator');
 // same-origin context for driving frame uploads
 const drive=await browser.newContext({serviceWorkers:'block'});
 await drive.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await drive.newPage();await page.goto(origin+'/login',{waitUntil:'domcontentloaded'});

 // --- negative: no standing baseline → horizontal frames must NOT create an incident ---
 const neg=await newSession(camera.id,admin.id);
 await page.evaluate(({token})=>fetch('/api/camera/'+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'consent'})}).then(r=>r.status),{token:neg.token});
 const negStatuses=await postFrames(page,{token:neg.token,rotate:true,frames:8});
 assert.ok(negStatuses.every(s=>s===200),'frame gateway must accept frames: '+negStatuses.join(','));
 const negInc=await db.incident.count({where:{cameraId:camera.id,type:'PERSON_FALL',source:'CAMERA',isDemo:false,createdAt:{gt:new Date(Date.now()-60000)}}});
 assert.equal(negInc,0,'horizontal-without-standing must not raise a fall');
 console.log('PASS no false positive without standing baseline');

 // --- positive: standing baseline then lying frames + dwell → PERSON_FALL ---
 const pos=await newSession(camera.id,admin.id);
 await page.evaluate(({token})=>fetch('/api/camera/'+token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'consent'})}).then(r=>r.status),{token:pos.token});
 await postFrames(page,{token:pos.token,rotate:false,frames:2,gap:700});
 await postFrames(page,{token:pos.token,rotate:true,frames:14,gap:700});
 const incident=await until(async()=>db.incident.findFirst({where:{cameraId:camera.id,type:'PERSON_FALL',source:'CAMERA',isDemo:false,createdAt:{gt:new Date(Date.now()-120000)}}}),20000);
 assert.equal(incident.severity,'CRITICAL');
 assert.ok(incident.confidence>0,'heuristic score stored');
 assert.ok(incident.metadata&&incident.metadata.poseVisibility!=null,'pose visibility stored separately');
 await operator.getByText('Возможное падение человека',{exact:true}).first().waitFor({timeout:20000});
 console.log('PASS stand→lie→dwell → PERSON_FALL/CRITICAL → SSE operator (score '+incident.confidence+'%, pose '+incident.metadata.poseVisibility+'%)');
}catch(e){console.error('FALL E2E FAILED',e);throw e;}finally{await browser.close();await db.$disconnect();}
