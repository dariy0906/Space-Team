import { IncidentSource, IncidentStatus, IncidentType, Severity, TaskStatus } from '@prisma/client';
export const typeLabel: Record<IncidentType, string> = { FIRE: 'Пожар', WATER_LEAK: 'Утечка воды', PERSON_FALL: 'Падение человека', WATER_RESCUE: 'Происшествие на воде', CITIZEN_REPORT: 'Обращение жителя', OTHER: 'Другое' };
export const statusLabel: Record<IncidentStatus, string> = { NEW: 'Новое', CONFIRMED: 'Подтверждено', ASSIGNED: 'Назначено', IN_PROGRESS: 'В работе', RESOLVED: 'Решено', REJECTED: 'Отклонено' };
export const severityLabel: Record<Severity, string> = { LOW: 'Низкий', MEDIUM: 'Средний', HIGH: 'Высокий', CRITICAL: 'Критический' };
export const sourceLabel: Record<IncidentSource, string> = { CAMERA: 'Камера', SENSOR: 'Датчик', DRONE: 'Дрон', RESIDENT: 'Житель', MANUAL: 'Оператор' };
export const taskLabel: Record<TaskStatus, string> = { ASSIGNED: 'Назначено', ACCEPTED: 'Принято', ON_THE_WAY: 'В пути', ON_SITE: 'На месте', COMPLETED: 'Завершено' };
export const severityColor: Record<Severity, string> = { LOW: '#1fa38b', MEDIUM: '#f0ac43', HIGH: '#ed784c', CRITICAL: '#df4f62' };
