import {statusInfo} from '@/lib/status';
export function StatusBadge({status}){const s=statusInfo(status);return <span className="status-badge" style={{'--status-color':s.color,'--status-bg':s.background}}><i aria-hidden="true"/>{s.label}</span>}
