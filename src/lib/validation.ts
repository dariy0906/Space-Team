import { z } from 'zod';
export const location = z.object({ lat: z.coerce.number().min(43.57).max(43.78), lng: z.coerce.number().min(51.08).max(51.30) });
export const incidentInput = z.object({ title: z.string().trim().min(4).max(100), description: z.string().trim().min(5).max(2000), type: z.enum(['FIRE','WATER_LEAK','ROAD','LIGHTING','SAFETY','WASTE','OTHER']), severity: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']), address: z.string().trim().min(3).max(180), district: z.string().trim().max(50).optional(), ...location.shape });
