import type { Config } from 'tailwindcss';
export default { content: ['./src/**/*.{ts,tsx}'], darkMode: 'class', theme: { extend: { colors: { ink: '#101b2c', aqua: '#00a9b7', cloud: '#f2f6f9' }, boxShadow: { card: '0 12px 32px rgba(16,27,44,.07)' } } }, plugins: [] } satisfies Config;
