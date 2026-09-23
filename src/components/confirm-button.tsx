'use client';
export default function ConfirmButton({ children, message, className = 'button danger' }: { children: React.ReactNode; message: string; className?: string }) { return <button className={className} type="submit" onClick={event => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</button>; }
