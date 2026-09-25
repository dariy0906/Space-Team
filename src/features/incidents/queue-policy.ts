import type { TaskStatus } from '@prisma/client';

type QueuedTask = {
  id: string;
  status: TaskStatus;
  plannedEnd: Date | null;
  incident: { severity: string; isDemo: boolean };
};
export function isStaleTask(
  task: Pick<QueuedTask, 'status' | 'plannedEnd' | 'incident'>,
  now: number,
): boolean {
  return (
    task.incident.isDemo &&
    !!task.plannedEnd &&
    task.plannedEnd.getTime() < now &&
    !['ON_SITE', 'ON_THE_WAY'].includes(task.status)
  );
}
/** Pure scheduling policy, shared by assignment and transition validation. */
export function prioritizeTasks<T extends QueuedTask, N extends { id: string }>(
  tasks: T[],
  incoming: N,
  critical: boolean,
  now: number,
) {
  const live = tasks.filter((task) => !isStaleTask(task, now));
  const stale = tasks.filter((task) => isStaleTask(task, now));
  const protectedTask = (task: T) =>
    ['ON_SITE', 'ON_THE_WAY'].includes(task.status) || task.incident.severity === 'CRITICAL';
  const queue = critical
    ? [...live.filter(protectedTask), incoming, ...live.filter((task) => !protectedTask(task))]
    : [...live, incoming];
  return { queue, stale };
}
