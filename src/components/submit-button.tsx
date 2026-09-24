'use client';
import {useFormStatus} from 'react-dom';
export default function SubmitButton({children,className='button'}:{children:React.ReactNode;className?:string}){const {pending}=useFormStatus();return <button className={className} disabled={pending} type="submit">{pending?'Сохраняем…':children}</button>;}

