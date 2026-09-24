import { IncidentSource, IncidentStatus, IncidentType, Severity, TaskStatus } from '@prisma/client';
export const typeLabel:Record<IncidentType,string>={FIRE:'Пожар',SMOKE:'Дым',FIGHT:'Возможная драка',STRONG_WIND:'Сильный ветер',WATER_LEAK:'Утечка воды',PERSON_FALL:'Возможное падение',WATER_RESCUE:'Происшествие на воде',CITIZEN_REPORT:'Обращение',OTHER:'Другое',ROAD:'Дорога',LIGHTING:'Освещение',SAFETY:'Безопасность',WASTE:'Мусор',POTHOLE:'Яма на дороге',WATER_OUTAGE:'Отключение воды',AIR_QUALITY:'Качество воздуха'};
export const statusLabel:Record<IncidentStatus,string>={NEW:'Новое',WAITING_OPERATOR:'Ожидает оператора',REOPENED:'На доработке',CONFIRMED:'Принято',ASSIGNED:'Назначено',IN_PROGRESS:'В работе',RESOLVED:'Решено',REJECTED:'Отклонено'};
export const severityLabel:Record<Severity,string>={LOW:'Низкий',MEDIUM:'Средний',HIGH:'Высокий',CRITICAL:'Критический'};
export const sourceLabel:Record<IncidentSource,string>={CAMERA:'Камера',SENSOR:'Датчик',DRONE:'Дрон',RESIDENT:'Житель',MANUAL:'Оператор',SYSTEM:'Система',SIMULATION:'Симуляция'};
export const taskLabel:Record<TaskStatus,string>={ASSIGNED:'Назначено',ACCEPTED:'Принято',ON_THE_WAY:'В пути',ON_SITE:'На месте',COMPLETED:'Завершено'};
export const severityColor:Record<Severity,string>={LOW:'#1fa38b',MEDIUM:'#f0ac43',HIGH:'#ed784c',CRITICAL:'#df4f62'};
// Иконки категорий — SVG из src/components/icons.tsx (typeGlyph); системные эмодзи не используются.
export const reportCategories=['POTHOLE','WATER_LEAK','ROAD','LIGHTING','WASTE','AIR_QUALITY','FIRE','SAFETY','OTHER'] as const;
// Категории, которые житель видит на карте города. Падения, драки и спасение на воде
// касаются конкретных людей и остаются только у служб.
export const publicIncidentTypes=['POTHOLE','WATER_OUTAGE','WATER_LEAK','ROAD','AIR_QUALITY','LIGHTING','WASTE','FIRE','SMOKE','STRONG_WIND','OTHER'] as const satisfies readonly IncidentType[];
