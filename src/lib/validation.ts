import { z } from 'zod';
export const location = z.object({ lat: z.coerce.number().min(42.5).max(45), lng: z.coerce.number().min(49).max(53) });
export const incidentInput = z.object({ title: z.string().trim().min(4).max(100), description: z.string().trim().max(2000), type: z.enum(['FIRE','WATER_LEAK','PERSON_FALL','WATER_RESCUE','CITIZEN_REPORT','OTHER']), severity: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']), address: z.string().trim().min(3).max(180), district: z.string().trim().max(50).optional(), ...location.shape });
