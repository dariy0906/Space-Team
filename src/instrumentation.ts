export async function register(){
 if(process.env.NEXT_RUNTIME!=='nodejs'||process.env.NEXT_PHASE==='phase-production-build')return;
 const {dispatchCritical}=await import('./lib/dispatch');
 const {expireCameraSessions}=await import('./lib/cameras');
 const state=globalThis as typeof globalThis&{dispatchTimer?:ReturnType<typeof setInterval>};
 if(state.dispatchTimer)return;
 let running=false;
 state.dispatchTimer=setInterval(async()=>{if(running)return;running=true;try{await dispatchCritical();await expireCameraSessions();}catch(e){console.error('Dispatch tick failed:',e instanceof Error?e.message:'unknown');}finally{running=false;}},2000);
 state.dispatchTimer.unref();
}
