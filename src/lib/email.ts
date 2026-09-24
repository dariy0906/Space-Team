import nodemailer from 'nodemailer';
import {db} from './db';
export interface EmailProvider {invite(email:string,url:string):Promise<'smtp'|'demo-inbox'>;}
export class CameraEmailProvider implements EmailProvider {
 async invite(email:string,url:string):Promise<'smtp'|'demo-inbox'>{
  const user=await db.user.findUnique({where:{email}});
  if(!user||user.role!=='RESIDENT')throw new Error('Укажите email жителя системы');
  const body='Приглашение подключить телефон как демо-камеру. Камера включится только после вашего согласия: '+url;
  if(process.env.SMTP_URL){
   await nodemailer.createTransport(process.env.SMTP_URL).sendMail({from:process.env.SMTP_FROM||'demo@localhost',to:email,subject:'SU AQTAU: добровольное подключение камеры',text:body});
  }
  await db.notification.create({data:{userId:user.id,title:process.env.SMTP_URL?'Приглашение на камеру отправлено на email':'DEMO EMAIL: приглашение подключить камеру',href:new URL(url).pathname}});
  await db.realtimeEvent.create({data:{userId:user.id}});
  return process.env.SMTP_URL?'smtp':'demo-inbox';
 }
}

