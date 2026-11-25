import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, ScrollText, ListFilter, Download, ChevronLeft, ChevronRight,
  RefreshCw, ShieldCheck,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { downloadCsv } from '../../utils/exportUtils';

const PAGE_SIZE = 20;

const ACTION_COLORS = {
  'user.create':                  'var(--accent-green)',
  'user.update':                  'var(--accent-cyan)',
  'user.status_change':           'var(--accent-yellow)',
  'user.groups_change':           'var(--accent-purple)',
  'user.delete':                  'var(--diff-hard)',
  'user.restore':                 'var(--accent-green)',
  'challenge.create':             'var(--accent-green)',
  'challenge.update':             'var(--accent-cyan)',
  'challenge.status_change':      'var(--accent-yellow)',
  'challenge.delete':             'var(--diff-hard)',
  'challenge.attachment_add':     'var(--accent-teal)',
  'challenge.attachment_delete':  'var(--diff-hard)',
  'category.create':              'var(--accent-green)',
  'category.update':              'var(--accent-cyan)',
  'category.delete':              'var(--diff-hard)',
  'achievement.create':           'var(--accent-green)',
  'achievement.update':           'var(--accent-cyan)',
  'achievement.delete':           'var(--diff-hard)',
  'announcement.create':          'var(--accent-purple)',
  'announcement.update':          'var(--accent-teal)',
  'announcement.delete':          'var(--diff-hard)',
  'settings.update':              'var(--accent-yellow)',
};

const ACTIONS = Object.keys(ACTION_COLORS);
const TARGET_TYPES = ['user', 'challenge', 'category', 'achievement', 'announcement', 'settings'];

function actionBadge(action) {
  const color = ACTION_COLORS[action] || 'var(--accent-cyan)';
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em',
      color, background: 'rgba(255,255,255,0.035)',
      border: '1px solid var(--border-color)',
      padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap',
    }}>
      {action}
    </span>
  );
}

/** ISO timestamp -> the compact `YYYY-MM-DD HH:MM:SS` shape used elsewhere. */
function formatStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function targetLabel(log) {
  if (log.target_label) return log.target_label;
  if (log.target_id) return `${log.target_type} #${log.target_id}`;
  return '—';
}

function detailsLabel(log) {
  const meta = log.metadata || {};
  const parts = [];
  if (Array.isArray(meta.fields) && meta.fields.length) {
    parts.push(`fields: ${meta.fields.join(', ')}`);
  }
  if (meta.old_status && meta.new_status) {
    parts.push(`${meta.old_status} → ${meta.new_status}`);
  }
  if (Array.isArray(meta.added_groups) && meta.added_groups.length) {
    parts.push(`added groups: ${meta.added_groups.join(', ')}`);
  }
  if (Array.isArray(meta.removed_groups) && meta.removed_groups.length) {
    parts.push(`removed groups: ${meta.removed_groups.join(', ')}`);
  }
  if (meta.attachment_id != null) {
    parts.push(`attachment #${meta.attachment_id}`);
  }
  if (meta.publish_at) {
    parts.push(`scheduled: ${formatStamp(meta.publish_at)}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const requestRef = useRef(0);

  // Debounce typing so a search does not issue one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const req = requestRef.current + 1;
    requestRef.current = req;
    setLoading(true);
    setError('');
    try {
      const data = await adminService.listAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        search: query,
        actor,
        action,
        targetType,
        dateFrom,
        dateTo,
      });
      if (requestRef.current !== req) return;
      setLogs(Array.isArray(data?.results) ? data.results : []);
      setCount(Number.isFinite(data?.count) ? data.count : 0);
    } catch (err) {
      if (requestRef.current !== req) return;
      setLogs([]);
      setCount(0);
      setError(err?.message || 'Could not load the audit trail.');
    } finally {
      if (requestRef.current === req) setLoading(false);
    }
  }, [page, query, actor, action, targetType, dateFrom, dateTo]);

  useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setQuery('');
    setActor('');
    setAction('');
    setTargetType('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasFilters = Boolean(search || actor || action || targetType || dateFrom || dateTo);

  const exportCsv = () => {
    const rows = logs.map((log) => ({
      id: log.id,
      actor: log.actor,
      action: log.action,
      target_type: log.target_type,
      target_id: log.target_id,
      target_label: log.target_label,
      details: detailsLabel(log),
      created_at: log.created_at,
    }));
    downloadCsv({
      filename: `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
      columns: [
        'id', 'actor', 'action', 'target_type', 'target_id',
        'target_label', 'details', 'created_at',
      ],
      rows,
    });
  };

  return (
    <div className="page-container">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <div className="section-title mb-1">Admin</div>
          <h1 style={{ margin: 0 }}>Audit Logs</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '8px 0 0' }}>
            Persisted server-side for every successful administrative change. Read-only.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2"
            onClick={exportCsv}
            disabled={logs.length === 0}
          >
            <Download size={14} /> Export page
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-yellow)' }}>
            <ListFilter size={14} /> {count} entries
          </span>
        </div>
      </div>

      {/* Server-side filters */}
      <div
        className="d-flex flex-wrap gap-2 align-items-center mb-3"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 14 }}
      >
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-control form-control-sm"
            style={{ paddingLeft: 36 }}
            placeholder="Search actor, action or target..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          className="form-control form-control-sm"
          style={{ flex: '0 1 170px', minWidth: 140 }}
          placeholder="Actor username"
          value={actor}
          onChange={changeFilter(setActor)}
          aria-label="Filter by actor"
          title="Exact actor username"
        />
        <select
          className="form-select form-select-sm"
          style={{ flex: '0 1 210px', minWidth: 190 }}
          value={action}
          onChange={changeFilter(setAction)}
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {ACTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select
          className="form-select form-select-sm"
          style={{ flex: '0 1 150px', minWidth: 130 }}
          value={targetType}
          onChange={changeFilter(setTargetType)}
          aria-label="Filter by target type"
        >
          <option value="">All targets</option>
          {TARGET_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input
          className="form-control form-control-sm"
          style={{ flex: '0 1 150px', minWidth: 130 }}
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={changeFilter(setDateFrom)}
          aria-label="From date"
          title="From date"
        />
        <input
          className="form-control form-control-sm"
          style={{ flex: '0 1 150px', minWidth: 130 }}
          type="date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={changeFilter(setDateTo)}
          aria-label="To date"
          title="To date"
        />
        {hasFilters && (
          <button className="btn btn-outline-secondary btn-sm" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          color: 'var(--accent-red)', fontSize: '0.85rem',
        }}>
          <ShieldCheck size={16} /> {error}
          <button className="btn btn-outline-secondary btn-sm ms-auto d-flex align-items-center gap-1" onClick={load}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ScrollText size={15} color="var(--violet-bright)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 600 }}>
            {loading ? 'Loading audit trail...' : `Page ${page} of ${totalPages}`}
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                {['Actor', 'Action', 'Target', 'Details', 'Timestamp'].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Audit trail unavailable.</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {hasFilters ? 'No audit entries match these filters.' : 'No administrative actions recorded yet.'}
                </td></tr>
              ) : logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{log.actor}</span>
                  </td>
                  <td>{actionBadge(log.action)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {targetLabel(log)}
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: '0.68rem' }}>
                      {log.target_type}{log.target_id ? `#${log.target_id}` : ''}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', maxWidth: 280 }}>
                    {detailsLabel(log)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{formatStamp(log.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {count === 0 ? '0 entries' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, count)} of ${count}`}
          </span>
          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
