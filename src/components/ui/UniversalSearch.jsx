import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Flag, Folder, User, SearchX, AlertCircle } from 'lucide-react';
import { challengeService } from '../../services/challengeService';
import { leaderboardService } from '../../services/leaderboardService';
import { fuzzScore } from '../../utils/fuzzySearch';

const GROUP_ORDER = ['Challenges', 'Categories', 'Users'];
const GROUP_CAVEAT = {
  Users: 'Searches ranked players with public profiles only.',
};

// Simple in-memory cache shared across instances
let challengesCache = null;
let challengesCachePromise = null;
let categoriesCache = null;
let categoriesCachePromise = null;
let leaderboardCache = null;
let leaderboardCachePromise = null;

function loadAllChallenges() {
  if (challengesCache) return Promise.resolve(challengesCache);
  if (challengesCachePromise) return challengesCachePromise;
  challengesCachePromise = challengeService
    .getChallenges({})
    .then((data) => {
      challengesCache = Array.isArray(data) ? data : [];
      return challengesCache;
    })
    .catch((err) => {
      challengesCachePromise = null;
      throw err;
    });
  return challengesCachePromise;
}

function loadCategories() {
  if (categoriesCache) return Promise.resolve(categoriesCache);
  if (categoriesCachePromise) return categoriesCachePromise;
  categoriesCachePromise = challengeService
    .getCategories()
    .then((data) => {
      categoriesCache = Array.isArray(data) ? data : [];
      return categoriesCache;
    })
    .catch((err) => {
      categoriesCachePromise = null;
      throw err;
    });
  return categoriesCachePromise;
}

function loadLeaderboard() {
  if (leaderboardCache) return Promise.resolve(leaderboardCache);
  if (leaderboardCachePromise) return leaderboardCachePromise;
  leaderboardCachePromise = leaderboardService
    .getLeaderboardPage({ limit: 100 })
    .then((data) => {
      const results = data?.results ?? data ?? [];
      leaderboardCache = Array.isArray(results) ? results : [];
      return leaderboardCache;
    })
    .catch((err) => {
      leaderboardCachePromise = null;
      throw err;
    });
  return leaderboardCachePromise;
}

export default function UniversalSearch({ mobile = false, onNavigate }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep track of latest request to ignore stale results
  const requestIdRef = useRef(0);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function keyHandler(e) {
      if (e.key === 'Escape') setOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setGrouped({});
      setLoading(false);
      setError('');
      return;
    }

    const qLower = q.toLowerCase();
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    let cancelled = false;

    const run = async () => {
      try {
        // Fetch in parallel: server search for challenges, full list for tag supplement, categories, leaderboard
        const [serverResults, allChallenges, categories, leaderboard] = await Promise.all([
          challengeService.getChallenges({ search: q }).catch(() => []),
          loadAllChallenges().catch(() => null),
          loadCategories().catch(() => []),
          loadLeaderboard().catch(() => []),
        ]);

        if (cancelled || reqId !== requestIdRef.current) return;

        const byType = {};
        const challengeMap = new Map();

        // Add server results first
        (Array.isArray(serverResults) ? serverResults : []).forEach((c) => {
          if (!c || c.id == null) return;
          challengeMap.set(c.id, {
            id: `c-${c.id}`,
            type: 'Challenges',
            title: c.title,
            subtitle: `${c.category || ''}${c.category && c.difficulty ? ' · ' : ''}${c.difficulty || ''}${c.difficulty && c.points != null ? ' · ' : ''}${c.points != null ? c.points + ' pts' : ''}`,
            icon: Flag,
            iconColor: 'var(--accent-green)',
            to: `/challenges/${c.id}`,
            score: fuzzScore(q, `${c.title} ${c.category} ${c.tags?.join(' ') || ''}`),
          });
        });

        // Tag supplement from cached full list
        if (Array.isArray(allChallenges)) {
          allChallenges.forEach((c) => {
            if (!c || c.id == null) return;
            if (challengeMap.has(c.id)) return;
            const tags = Array.isArray(c.tags) ? c.tags : [];
            const tagMatch = tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(qLower));
            if (!tagMatch) return;
            challengeMap.set(c.id, {
              id: `c-${c.id}`,
              type: 'Challenges',
              title: c.title,
              subtitle: `${c.category || ''}${c.category && c.difficulty ? ' · ' : ''}${c.difficulty || ''}${c.difficulty && c.points != null ? ' · ' : ''}${c.points != null ? c.points + ' pts' : ''}`,
              icon: Flag,
              iconColor: 'var(--accent-green)',
              to: `/challenges/${c.id}`,
              score: fuzzScore(q, `${c.title} ${c.tags?.join(' ') || ''}`),
            });
          });
        }

        const challengeItems = Array.from(challengeMap.values())
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 6)
          .map(({ score, ...rest }) => rest);
        if (challengeItems.length) byType['Challenges'] = challengeItems;

        // Categories from API
        const catItems = (Array.isArray(categories) ? categories : [])
          .filter((cat) => cat && cat.name && cat.name.toLowerCase().includes(qLower))
          .slice(0, 3)
          .map((cat) => ({
            id: `cat-${cat.id || cat.name}`,
            type: 'Categories',
            title: cat.name,
            subtitle: cat.count != null ? `${cat.count} challenges` : 'Browse all challenges in this category',
            icon: Folder,
            iconColor: 'var(--accent-teal)',
            to: `/challenges?category=${encodeURIComponent(cat.name)}`,
          }));
        if (catItems.length) byType['Categories'] = catItems;

        // Users from leaderboard (real data only, public/ranked players)
        const userItems = (Array.isArray(leaderboard) ? leaderboard : [])
          .filter((u) => u && u.username && u.username.toLowerCase().includes(qLower))
          .slice(0, 4)
          .map((u) => ({
            id: `u-${u.id || u.username}`,
            type: 'Users',
            title: u.username,
            subtitle: `${u.points != null ? u.points.toLocaleString() + ' pts' : ''}${u.points != null && (u.rank != null) ? ' · ' : ''}${u.rank != null ? 'Rank #' + u.rank : ''}`,
            icon: User,
            iconColor: 'var(--text-muted)',
            to: '/leaderboard',
          }));
        if (userItems.length) byType['Users'] = userItems;

        if (cancelled || reqId !== requestIdRef.current) return;
        setGrouped(byType);
        setError('');
      } catch (e) {
        if (cancelled || reqId !== requestIdRef.current) return;
        setGrouped({});
        setError(e?.message || 'Failed to search. Please try again.');
      } finally {
        if (!cancelled && reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [query]);

  const totalHits = Object.values(grouped).reduce((n, g) => n + (Array.isArray(g) ? g.length : 0), 0);

  const go = (item) => {
    setOpen(false);
    setQuery('');
    navigate(item.to);
    onNavigate?.();
  };

  const qTrim = query.trim();

  return (
    <div ref={wrapRef} className={mobile ? 'cf-search-mobile' : 'cf-search-desktop'}>
      <div style={{ position: 'relative' }}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: 'absolute', top: '50%', left: 11, transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="form-control cf-search-input"
          placeholder="Search challenges, users, categories... (Ctrl+K)"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          style={{ paddingLeft: 36, paddingRight: 30, fontSize: '0.85rem' }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            style={searchClearStyle}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-bright)',
            borderRadius: 12,
            boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
            overflow: 'hidden',
            zIndex: 1080,
          }}
        >
          {qTrim === '' ? (
            <div
              style={{
                padding: '12px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
              }}
            >
              Type to search across the platform
            </div>
          ) : loading ? (
            <div
              style={{
                padding: '18px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
              }}
            >
              Searching...
            </div>
          ) : error ? (
            <div
              style={{
                padding: '18px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: 'var(--accent-red)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
              }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          ) : totalHits === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center' }}>
              <SearchX size={22} color="var(--text-muted)" style={{ marginBottom: 6 }} />
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                No results for &ldquo;{query}&rdquo;
              </div>
            </div>
          ) : (
            GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
              <div key={group}>
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.62rem',
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    padding: '7px 14px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span>{group}</span>
                  {GROUP_CAVEAT[group] && (
                    <span
                      style={{
                        textTransform: 'none',
                        letterSpacing: 'normal',
                        fontSize: '0.58rem',
                        opacity: 0.8,
                      }}
                    >
                      {GROUP_CAVEAT[group]}
                    </span>
                  )}
                </div>
                {grouped[group].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => go(item)}
                      className="cf-dropdown-item"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 14px' }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          flexShrink: 0,
                          background: 'var(--bg-elevated)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <Icon size={14} color={item.iconColor} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const searchClearStyle = {
  position: 'absolute',
  top: '50%',
  right: 8,
  transform: 'translateY(-50%)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-color)',
  width: 20,
  height: 20,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
};
