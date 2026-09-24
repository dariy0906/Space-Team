export const demoEnabled = () => process.env.DEMO_MODE === 'true' || (process.env.DEMO_MODE !== 'false' && process.env.NODE_ENV === 'development');
export const specializations = { WATER:'Водоснабжение', FIRE:'Пожарная служба', ELECTRICITY:'Электросети', ROAD:'Дорожная служба', RESCUE:'Спасатели', SANITATION:'Благоустройство', OTHER:'Общая служба' } as const;
export const demoAccounts = [
  {email:'operator@demo.kz',name:'Алия Омарова',role:'OPERATOR'},
  {email:'operator2@demo.kz',name:'Ерлан Тулеев',role:'OPERATOR'},
  {email:'admin@demo.kz',name:'Администратор',role:'ADMIN'},
  ...['Данияр Ермеков','Аружан Садыкова','Тимур Асанов','Айгерим Нур'].map((name,i)=>({email:i===0?'resident@demo.kz':`resident${i+1}@demo.kz`,name,role:'RESIDENT'})),
  ...Object.entries(specializations).flatMap(([specialization,label],i)=>[0,1].map(n=>({email:i===0&&n===0?'worker@demo.kz':`worker-${specialization.toLowerCase()}-${n+1}@demo.kz`,name:`${label} · ${n===0?'Марат':'Асель'} ${i+1}`,role:'WORKER',specialization}))),
] as const;

