import { IncidentStatus, Severity } from '@prisma/client';
import { severityLabel, statusLabel } from '@/lib/labels';
export function StatusBadge({ status }: { status: IncidentStatus }) { return <span className={`badge status-${status.toLowerCase()}`}>{statusLabel[status]}</span>; }
export function SeverityBadge({ severity }: { severity: Severity }) { return <span className={`badge severity-${severity.toLowerCase()}`}><i className="badge-dot"/>{severityLabel[severity]}</span>; }
