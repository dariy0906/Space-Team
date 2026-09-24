'use client';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){return <section className="panel empty-state"><h1>Не удалось загрузить данные</h1><p>Проверьте подключение к базе и повторите попытку.</p><button className="button mt-4" onClick={reset}>Повторить</button></section>;}

