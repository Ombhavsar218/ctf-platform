import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, Flag, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight,
  RefreshCw, AlertTriangle, History as HistoryIcon,
} from 'lucide-react';
import { historyService } from '../services/historyService';

const PAGE_SIZE = 20;

const TABS = [
  { id: 'solves', label: 'Solves', icon: Award },
  { id: 'submissions', label: 'Submissions', icon: Flag },
];

function formatStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function challengeLink(row) {
  return `/challenges/${row.challengeId}`;
}

export default function History() {
  const [tab, setTab] = useState('solves');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const req = requestRef.current + 1;
    requestRef.current = req;
    setLoading(true);
    setError('');
    try {
      const data = tab === 'solves'
        ? await historyService.getMySolves({ page, pageSize: PAGE_SIZE })
        : await historyService.getMySubmissions({ page, pageSize: PAGE_SIZE });
      if (requestRef.current !== req) return;
      setItems(Array.isArray(data?.results) ? data.results : []);
      setCount(Number.isFinite(data?.count) ? data.count : 0);
    } catch (err) {
      if (requestRef.current !== req) return;
      setItems([]);
      setCount(0);
      setError(err?.message || 'Could not load your history.');
    } finally {
      if (requestRef.current === req) setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const switchTab = (nextTab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const activeTab = TABS.find((entry) => entry.id === tab);

  return (
    <div className="page-container">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <div className="section-title mb-1">Account</div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <HistoryIcon size={26} color="var(--accent-green)" /> History
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '8px 0 0' }}>
            Your own solve and submission record. This view is private to your account.
          </p>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 8, padding: '6px 10px',
        }}>
          {count} {count === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="d-flex gap-2 mb-4 flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = id === tab;
          return (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`btn btn-sm d-flex align-items-center gap-2 ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
              aria-pressed={active}
            >
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
          color: 'var(--accent-red)', fontSize: '0.85rem',
        }}>
          <AlertTriangle size={16} /> {error}
          <button className="btn btn-outline-secondary btn-sm ms-auto d-flex align-items-center gap-1" onClick={load}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {activeTab && <activeTab.icon size={15} color="var(--accent-cyan)" />}
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', textTransform: 'uppercase',
            letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 600,
          }}>
            {loading ? 'Loading history...' : `Page ${page} of ${totalPages}`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '44px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            Loading...
          </div>
        ) : error ? (
          <div style={{ padding: '44px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            History unavailable.
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '44px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            {tab === 'solves'
              ? 'No solves yet. Solve a challenge to start your history.'
              : 'No submissions yet. Your flag attempts will appear here.'}
          </div>
        ) : items.map((row, index) => (
          <div
            key={row.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '13px 18px',
              borderBottom: index < items.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tab === 'solves' ? 'rgba(16,185,129,0.12)' : (row.correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)'),
              border: `1px solid ${tab === 'solves' || row.correct ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.24)'}`,
              color: tab === 'solves' || row.correct ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              {tab === 'solves'
                ? <Award size={16} />
                : (row.correct ? <CheckCircle size={16} /> : <XCircle size={16} />)}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                to={challengeLink(row)}
                style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', textDecoration: 'none' }}
              >
                {row.challengeTitle}
              </Link>
              <div className="d-flex align-items-center flex-wrap gap-2" style={{ marginTop: 4 }}>
                <span className="cat-chip" style={{ fontSize: '0.62rem' }}>{row.challengeCategory}</span>
                <span className={`diff-badge diff-${String(row.challengeDifficulty || '').toLowerCase()}`} style={{ fontSize: '0.62rem' }}>
                  {row.challengeDifficulty}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                  <Clock size={11} /> {formatStamp(row.createdAt)}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {tab === 'solves' ? (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-green)' }}>
                  +{row.points}
                </span>
              ) : (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 800,
                  color: row.correct ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                  {row.correct ? 'SOLVED' : 'MISS'}
                </span>
              )}
            </div>
          </div>
        ))}

        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
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
