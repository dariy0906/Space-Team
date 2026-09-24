import {chromium} from 'playwright';
import {PrismaClient} from '@prisma/client';
import assert from 'node:assert/strict';
const url=process.env.E2E_URL||'http://localhost:3100';
assert.match(new URL(process.env.DATABASE_URL||'').pathname,/_test$/);
const db=new PrismaClient();
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pages=[];
try{
 for(const email of ['operator@demo.kz','operator2@demo.kz']){
  const ctx=await browser.newContext({serviceWorkers:'block'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  const p=await ctx.newPage();await p.goto(url+'/login',{waitUntil:'domcontentloaded'});await p.locator('button[value="'+email+'"]').click();await p.waitForURL('**/operator',{waitUntil:'domcontentloaded'});pages.push(p);
 }
 const firstUser=await db.user.findUniqueOrThrow({where:{email:'operator@demo.kz'}});
 const secondUser=await db.user.findUniqueOrThrow({where:{email:'operator2@demo.kz'}});
 // Test fixture only, never exposed as an incident generator in the application.
 const i=await db.incident.create({data:{title:'E2E critical '+Date.now(),type:'PERSON_FALL',source:'CAMERA',severity:'CRITICAL',isDemo:true,lat:43.65,lng:51.17,address:'Тестовая камера Актау'}});
 let offered;
 for(let n=0;n<30;n++){offered=await db.incident.findUniqueOrThrow({where:{id:i.id}});if(offered.assignedOperatorId)break;await new Promise(r=>setTimeout(r,200));}
 assert.equal(offered.assignedOperatorId,firstUser.id);
 const expiry=offered.claimExpiresAt.getTime();assert.ok(expiry-Date.now()>15000);
 await Promise.all(pages.map(p=>p.goto(url+'/incidents/'+i.id,{waitUntil:'domcontentloaded'})));
 await pages[1].getByText('Обрабатывает Алия Омарова.',{exact:false}).waitFor();
 assert.equal(await pages[1].getByRole('button',{name:'Подтвердить',exact:true}).count(),0);
 await pages[1].getByRole('button',{name:'Принять в обработку',exact:true}).waitFor({timeout:30000});
 const transferred=await db.incident.findUniqueOrThrow({where:{id:i.id}});
 assert.equal(transferred.assignedOperatorId,secondUser.id);assert.ok(Date.now()>=expiry);
 await pages[1].getByRole('button',{name:'Принять в обработку',exact:true}).click();
 await pages[1].getByRole('button',{name:'Подтвердить',exact:true}).click();
 await pages[1].getByText('Принято',{exact:true}).first().waitFor();
 await pages[0].getByText('Обрабатывает Ерлан Тулеев.',{exact:false}).waitFor();
 assert.equal(await pages[0].getByRole('button',{name:'Подтвердить',exact:true}).count(),0);
 const final=await db.incident.findUniqueOrThrow({where:{id:i.id}});assert.equal(final.assignedOperatorId,secondUser.id);assert.equal(final.status,'CONFIRMED');assert.ok(final.claimedAt);assert.equal(final.claimExpiresAt,null);
 console.log('PASS real 20s timeout → second operator SSE → exclusive claim/confirm');
}finally{await browser.close();await db.$disconnect();}

