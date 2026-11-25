import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Flag, Users, CheckCircle, XCircle, Download,
  ExternalLink, Copy, ChevronRight, Tag, Clock, User, Globe,
  File, FileText, FileCode, FileImage, FileTerminal, Package, Smartphone, Activity,
  Power, Server, Loader, Square, AlertTriangle, TerminalSquare
} from 'lucide-react';
import HintCard from '../components/ui/HintCard';
import CheatsheetTab from '../components/ui/CheatsheetTab';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import InteractiveTerminal from '../components/ui/InteractiveTerminal';
import { challengeService } from '../services/challengeService';
import { tokenStore } from '../services/api';
import { useApp } from '../context/AppContext';

const diffClass = { Easy: 'diff-easy', Medium: 'diff-medium', Hard: 'diff-hard', Insane: 'diff-insane' };

const fileIcons = {
  zip: Package, txt: FileText, pdf: FileText, png: FileImage, jpg: FileImage, py: FileCode,
  c: FileCode, binary: FileTerminal, pcap: Activity, apk: Smartphone, default: File,
};

const MODE_LABELS = {
  student: {
    introduction: 'Introduction',
    scenario: 'Scenario',
    learning_objectives: 'Objectives',
    tasks: 'Tasks',
    checkpoints: 'Checkpoints',
    guidance: 'Guidance',
    review_questions: 'Review',
    common_mistakes: 'Common Mistakes',
    remediation_guidance: 'Remediation',
  },
  competitor: {
    challenge_rules: 'Rules',
    objective: 'Objective',
    time_limit: 'Time Limit',
    submission_instructions: 'Submission Instructions',
  },
};

function renderModeValue(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {String(value)}
      </div>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <div className="d-flex flex-column gap-2">
        {value.map((item, i) => {
          if (item == null) return null;
          if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
            return (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-green)', fontWeight: 700, minWidth: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{String(item)}</span>
              </div>
            );
          }
          if (typeof item === 'object') {
            const title = item.title ?? item.name ?? item.label ?? `Item ${i + 1}`;
            const body = item.description ?? item.text ?? item.content ?? item.detail ?? item.value ?? null;
            const rest = Object.entries(item).filter(([k]) => !['title', 'name', 'label', 'description', 'text', 'content', 'detail', 'value', 'id', 'order'].includes(k));
            return (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: body != null ? 6 : 0 }}>{String(title)}</div>
                {body != null && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{String(body)}</div>}
                {rest.length > 0 && (
                  <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                    {rest.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <div className="d-flex flex-column gap-2">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{k.replace(/_/g, ' ')}</div>
            {renderModeValue(v)}
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function ChallengeDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addPoints, refreshStats, refreshUnreadCount, user } = useApp();

  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flag, setFlag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('description');

  const [instance, setInstance] = useState(null);
  const [instanceState, setInstanceState] = useState('idle');
  const [instanceError, setInstanceError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [instCopied, setInstCopied] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const [modeContent, setModeContent] = useState(null); // { mode, challenge_id, content, solution_available }
  const [modeContentLoading, setModeContentLoading] = useState(false);
  const [modeContentError, setModeContentError] = useState('');
  const modeContentReqRef = useRef(0);
  const challengeReqRef = useRef(0);

  const [solution, setSolution] = useState(null); // backend solution payload
  const [solutionLoading, setSolutionLoading] = useState(false);
  const [solutionError, setSolutionError] = useState('');
  const [solutionVisible, setSolutionVisible] = useState(false);
  const solutionReqRef = useRef(0);

  const learningMode = user?.learning_mode ?? user?.learningMode ?? user?.userType ?? null;
  const userId = user?.id ?? null;

  const applyInstance = useCallback((inst) => {
    setInstance(inst);
    setInstanceState(inst ? inst.status : 'idle');
    setInstanceError(inst?.failureReason || '');
    setTimeLeft(inst?.remainingSeconds ?? 0);
  }, []);

  const handleDownloadFile = useCallback(async (file) => {
    try {
      const headers = {};
      const token = tokenStore.getAccess();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(file.url, { headers });
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'File not found or access denied.' : `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      alert(e.message || 'Failed to download file.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inst = await challengeService.getInstance(id);
        if (!cancelled) applyInstance(inst);
      } catch (e) {
        if (!cancelled) setInstanceError(e.message || 'Could not load instance state.');
      }
    })();
    return () => { cancelled = true; };
  }, [id, applyInstance]);

  // Poll while Docker is provisioning, tearing down, or an interactive
  // terminal is open (so a stopped/expired instance is noticed promptly).
  useEffect(() => {
    const status = instance?.status;
    const transitional = ['requested', 'starting', 'stopping'].includes(status);
    if (!status || (!transitional && !terminalOpen)) return;
    const poll = setInterval(async () => {
      try {
        applyInstance(await challengeService.getInstance(id));
      } catch (e) {
        setInstanceError(e.message || 'Could not refresh instance state.');
      }
    }, 1500);
    return () => clearInterval(poll);
  }, [instance?.status, id, applyInstance, terminalOpen]);

  useEffect(() => {
    if (!instance?.expiresAt) return;
    const tick = () => setTimeLeft(
      Math.max(0, Math.floor((instance.expiresAt - Date.now()) / 1000))
    );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [instance?.expiresAt]);

  const loadChallenge = useCallback(async () => {
    const reqId = ++challengeReqRef.current;
    setLoading(true);
    setError('');
    try {
      const c = await challengeService.getChallengeById(id);
      if (reqId !== challengeReqRef.current) return;
      setChallenge(c);
    } catch (e) {
      if (reqId !== challengeReqRef.current) return;
      setError(e.message || 'Challenge not found.');
      setChallenge(null);
    } finally {
      if (reqId === challengeReqRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Clear stale challenge/hint/submission UI on identity changes.
    setChallenge(null);
    setFlag('');
    setResult(null);
    setSubmitting(false);
    setShowComplete(false);
    setActiveTab('description');
    loadChallenge();
  }, [id, userId, learningMode, loadChallenge]);

  useEffect(() => {
    setModeContent(null);
    setModeContentError('');
    setModeContentLoading(false);
    modeContentReqRef.current += 1; // invalidate in-flight
  }, [id, userId]);

  useEffect(() => {
    solutionReqRef.current += 1;
    setSolution(null);
    setSolutionError('');
    setSolutionLoading(false);
    setSolutionVisible(false);
  }, [id, userId, learningMode]);

  useEffect(() => {
    const reqId = ++modeContentReqRef.current;
    setModeContent(null);
    setModeContentError('');

    if (!challenge || String(challenge.id) !== String(id)) {
      setModeContentLoading(false);
      return;
    }

    const indicator = challenge.has_mode_content;
    if (indicator === false) {
      setModeContentLoading(false);
      return;
    }
    if (indicator !== true) {
      setModeContentLoading(false);
      console.warn('[ChallengeDetails] Missing or invalid has_mode_content indicator; preserving ordinary challenge experience.', {
        challengeId: id,
        has_mode_content: indicator,
      });
      return;
    }

    let cancelled = false;
    setModeContentLoading(true);
    (async () => {
      try {
        const res = await challengeService.getChallengeContent(id);
        if (cancelled || reqId !== modeContentReqRef.current) return;
        if (res?.challenge_id != null && String(res.challenge_id) !== String(id)) return;
        setModeContent(res);
      } catch (e) {
        if (cancelled || reqId !== modeContentReqRef.current) return;
        setModeContent(null);
        setModeContentError(e?.message || 'Could not load mode-specific content.');
      } finally {
        if (!cancelled && reqId === modeContentReqRef.current) {
          setModeContentLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [id, userId, learningMode, challenge?.id, challenge?.has_mode_content]);  const handleSubmit = async (e) => {
    e.preventDefault();
    const submitted = flag.trim();
    if (!submitted || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await challengeService.submitFlag(id, submitted);
      setResult(res);
      if (res.correct) {
        setChallenge(prev => ({ ...prev, solved: true }));
        if (!res.alreadySolved) {
          addPoints(res.points);
          setShowComplete(true);
          // A first solve is the one action that creates a notification, so
          // pull the fresh unread total (a single request, not polling). A
          // repeat submission creates nothing, hence the alreadySolved guard.
          refreshUnreadCount();
        }
        // Solved count, category progress and recent activity all changed
        // server-side; refetch so the dashboard/profile stay authoritative.
        refreshStats();
      }
    } catch (err) {
      // 400 validation, 401 session, 404 hidden/removed, 429 throttled, or a
      // network failure. `api.js` has already turned the body into a readable
      // message, so surface it verbatim.
      setResult({
        correct: false,
        error: true,
        message: err?.message || 'Could not submit your flag. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyUrl = () => {
    if (challenge?.connectionInfo?.url) {
      navigator.clipboard.writeText(challenge.connectionInfo.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Called by HintCard after the server confirms (and charges for) an unlock.
  // Marks the hint revealed in page state so its text survives a re-render;
  // the server payload is authoritative for both the text and the balance.
  const handleHintUnlocked = (hintId, res) => {
    setChallenge(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        hints: (prev.hints || []).map(h =>
          h.id === hintId
            ? { ...h, revealed: true, text: res.hint?.text ?? h.text }
            : h
        ),
      };
    });
  };

  const handleViewSolution = async () => {
    if (solutionLoading) return;
    const reqId = ++solutionReqRef.current;
    setSolutionLoading(true);
    setSolutionError('');
    setSolution(null);
    setSolutionVisible(true);
    try {
      const res = await challengeService.getChallengeSolution(id);
      if (reqId !== solutionReqRef.current) return;
      if (res?.challenge_id != null && String(res.challenge_id) !== String(id)) return;
      if (res?.solution_available !== true || !res?.solution) {
        setSolution(null);
        setSolutionError(res?.detail || 'Solution content is not available.');
        return;
      }
      setSolution(res);
    } catch (e) {
      if (reqId !== solutionReqRef.current) return;
      setSolution(null);
      // Keep message from backend when useful; never expose raw sensitive details.
      setSolutionError(e?.message || 'Could not load solution.');
    } finally {
      if (reqId === solutionReqRef.current) setSolutionLoading(false);
    }
  };

  const handleStartInstance = async () => {
    setInstanceError('');
    setInstanceState('starting');
    try {
      applyInstance(await challengeService.startInstance(id));
    } catch (e) {
      setInstanceState('idle');
      setInstanceError(e.message || 'Could not start the challenge instance.');
    }
  };

  const handleStopInstance = async () => {
    setTerminalOpen(false);
    setInstanceError('');
    setInstanceState('stopping');
    try {
      applyInstance(await challengeService.stopInstance(id));
    } catch (e) {
      setInstanceState(instance?.status || 'idle');
      setInstanceError(e.message || 'Could not stop the challenge instance.');
    }
  };

  const copyInstance = () => {
    const value = instance?.connection?.url || instance?.connection?.target || instance?.command;
    if (value) {
      navigator.clipboard.writeText(value);
      setInstCopied(true);
      setTimeout(() => setInstCopied(false), 2000);
    }
  };

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const instanceStatus = instance?.status || instanceState;
  const isBusy = ['requested', 'starting', 'stopping'].includes(instanceStatus)
    || instanceState === 'starting' || instanceState === 'stopping';
  const isTerminal = !instance || ['stopped', 'expired', 'failed'].includes(instanceStatus);
  const statusLabel = {
    requested: 'REQUESTED', starting: 'STARTING', running: 'RUNNING',
    stopping: 'STOPPING', stopped: 'STOPPED', expired: 'EXPIRED', failed: 'FAILED',
  }[instanceStatus] || instanceStatus.toUpperCase();
  const statusColor = instanceStatus === 'running' ? 'var(--accent-green)'
    : instanceStatus === 'failed' || instanceStatus === 'expired' ? '#ef4444'
      : isBusy ? 'var(--accent-yellow)' : 'var(--text-muted)';

  // `isTerminal` above means a terminal *state*; this is terminal access mode.
  const terminalMode = String(
    challenge?.instanceMode || challenge?.instance_mode || ''
  ).toLowerCase() === 'terminal';

  const handleTerminalInstanceUnavailable = useCallback(() => {
    setTerminalOpen(false);
    challengeService.getInstance(id)
      .then(applyInstance)
      .catch(() => applyInstance(null));
  }, [id, applyInstance]);

  if (loading) return <LoadingSpinner fullPage text="Loading challenge..." />;

  if (error && !challenge) {
    return (
      <div className="page-container">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 20,
          color: 'var(--accent-red)', fontSize: '0.9rem',
        }}>
          <AlertTriangle size={18} /> {error}
        </div>
        <button
          onClick={() => navigate('/challenges')}
          className="d-flex align-items-center gap-2 mb-4"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
        >
          <ArrowLeft size={16} /> Back to Challenges
        </button>
      </div>
    );
  }

  if (!challenge) return null;

  const isModeAware = challenge.has_mode_content === true;
  const effectiveMode = modeContent?.mode || learningMode || 'competitor';
  const isStudentMode = effectiveMode === 'student';
  const showHints = !isModeAware || isStudentMode;
  const visibleHints = showHints ? (challenge.hints || []) : [];
  const tabs = [
    { id: 'description', label: 'Description' },
    { id: 'objectives', label: 'Objectives' },
    ...(isModeAware ? [{ id: 'mode', label: (effectiveMode === 'student') ? 'Learning Guide' : 'Mission Brief' }] : []),
    { id: 'cheatsheet', label: 'Cheatsheet' },
    ...(showHints ? [{ id: 'hints', label: `Hints (${visibleHints.length})` }] : []),
    ...(challenge.files?.length ? [{ id: 'files', label: `Files (${challenge.files.length})` }] : []),
    ...(challenge.connectionInfo ? [{ id: 'connect', label: 'Connect' }] : []),
  ];

  return (
    <div className="page-container">
      {/* Back */}
      <button
        onClick={() => navigate('/challenges')}
        className="d-flex align-items-center gap-2 mb-4"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
      >
        <ArrowLeft size={16} /> Back to Challenges
      </button>

      <div className="row g-4">
        {/* Main */}
        <div className="col-lg-8">
          {/* Challenge header */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '28px', marginBottom: 20, animation: 'fadeInUp 0.4s ease' }}>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-4">
              <span className="cat-chip">{challenge.category}</span>
              <span className={`diff-badge ${diffClass[challenge.difficulty]}`}>{challenge.difficulty}</span>
              {challenge.trial && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 20, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(139,92,246,0.15)', color: 'var(--diff-insane)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                  Trial
                </span>
              )}
              {challenge.solved && (
                <span className="solved-tag">
                  <CheckCircle size={12} /> Solved
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, marginBottom: 16 }}>
              {challenge.title}
            </h1>

            <div className="d-flex flex-wrap gap-4 mb-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(116,100,220,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Flag size={16} color="var(--accent-green)" />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-green)', lineHeight: 1 }}>{challenge.points}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>points</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(116,100,220,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={16} color="var(--accent-cyan)" />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-cyan)', lineHeight: 1 }}>{challenge.solves?.toLocaleString()}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>solves</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={16} color="var(--accent-green)" />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{challenge.author}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>author</div>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="d-flex flex-wrap gap-2">
              {challenge.tags?.map(t => <span key={t} className="tag-chip"><Tag size={10} style={{ marginRight: 3 }} />{t}</span>)}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, overflow: 'hidden', animation: 'fadeInUp 0.4s ease 0.1s both' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
              {tabs.map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  background: 'none', border: 'none',
                  padding: '14px 20px',
                  fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600,
                  color: activeTab === t.id ? 'var(--accent-green)' : 'var(--text-muted)',
                  borderBottom: activeTab === t.id ? '2px solid var(--accent-green)' : '2px solid transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: '24px' }}>
              {activeTab === 'description' && (
                <div className="animate-fade-in">
                  <div className="section-title mb-3">Scenario</div>
                  <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderLeft: '3px solid var(--accent-cyan)',
                    borderRadius: '0 8px 8px 0',
                    padding: '16px 20px',
                    marginBottom: 20,
                    fontStyle: 'italic',
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {challenge.scenario}
                  </div>
                  <div className="section-title mb-3">Description</div>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{challenge.description}</p>
                  {challenge.instructions && (
                    <>
                      <div className="section-title mb-3">Instructions</div>
                      <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 20px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {challenge.instructions}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'objectives' && (
                <div className="animate-fade-in">
                  <div className="section-title mb-3">Objectives</div>
                  <div className="d-flex flex-column gap-2">
                    {challenge.objectives?.map((obj, i) => (
                      <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-green)', fontWeight: 700, minWidth: 24 }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{obj}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'mode' && (
                <div className="animate-fade-in">
                  <div className="d-flex align-items-center justify-content-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <div className="section-title">
                      {modeContent?.mode === 'student' ? 'Student Learning Guide' : modeContent?.mode === 'competitor' ? 'Competitor Mission Brief' : 'Mode Content'}
                    </div>
                    {modeContent?.mode && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Backend mode: {modeContent.mode}
                      </span>
                    )}
                  </div>

                  {modeContentLoading && (
                    <div style={{ padding: '20px 0' }}>
                      <LoadingSpinner text="Loading mode content..." />
                    </div>
                  )}

                  {!modeContentLoading && modeContentError && (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '14px 16px', color: 'var(--accent-red)', fontSize: '0.875rem' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Mode content unavailable</div>
                      <div style={{ opacity: 0.9 }}>{modeContentError}</div>
                    </div>
                  )}

                  {!modeContentLoading && !modeContentError && modeContent && (() => {
                    const content = modeContent.content && typeof modeContent.content === 'object' ? modeContent.content : {};
                    const entries = Object.entries(content).filter(([, v]) => (
                      v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'string' && v.trim() === '')
                    ));
                    if (entries.length === 0) {
                      return (
                        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', padding: '16px 0' }}>
                          No mode-specific content is available for this challenge.
                        </div>
                      );
                    }
                    const labels = MODE_LABELS[modeContent.mode] || {};
                    return (
                      <div className="d-flex flex-column gap-4">
                        {entries.map(([key, value]) => {
                          const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                          const rendered = renderModeValue(value);
                          if (!rendered) return null;
                          return (
                            <div key={key}>
                              <div className="section-title mb-2">{label}</div>
                              {rendered}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {isModeAware && isStudentMode && (
                    <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border-color)' }}>
                      <div className="d-flex align-items-center justify-content-between mb-3" style={{ gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div className="section-title">Solution &amp; Walkthrough</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Learning/review action. Available only when backend authorization allows access.
                          </div>
                        </div>
                        <div className="d-flex gap-2">
                          {solutionVisible && !solutionLoading && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => { solutionReqRef.current += 1; setSolution(null); setSolutionError(''); setSolutionLoading(false); setSolutionVisible(false); }}
                            >
                              Hide Solution
                            </button>
                          )}
                          {!solutionLoading && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={handleViewSolution}
                              disabled={solutionLoading}
                            >
                              {solutionError ? 'Retry Solution' : solutionVisible ? 'Refresh Solution' : 'View Solution'}
                            </button>
                          )}
                        </div>
                      </div>

                      {solutionVisible && (
                        <div style={{ background: 'rgba(116,100,220,0.04)', border: '1px solid rgba(116,100,220,0.2)', borderRadius: 12, padding: '18px' }}>
                          {solutionLoading && <LoadingSpinner text="Checking solution access..." />}
                          {!solutionLoading && solutionError && (
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '14px 16px', color: 'var(--accent-red)', fontSize: '0.875rem' }}>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>Solution unavailable</div>
                              <div style={{ opacity: 0.9 }}>{solutionError}</div>
                            </div>
                          )}
                          {!solutionLoading && !solutionError && solution?.solution && (() => {
                            const sol = solution.solution && typeof solution.solution === 'object' ? solution.solution : {};
                            const labels = {
                              explanation: 'Explanation',
                              walkthrough: 'Walkthrough',
                              expected_result: 'Expected Result',
                              learning_takeaways: 'Takeaways',
                            };
                            const entries = Object.entries(sol).filter(([, v]) => (
                              v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'string' && v.trim() === '')
                            ));
                            if (entries.length === 0) {
                              return <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>No solution content is available.</div>;
                            }
                            return (
                              <div className="d-flex flex-column gap-4">
                                {entries.map(([key, value]) => {
                                  const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                                  const rendered = renderModeValue(value);
                                  if (!rendered) return null;
                                  return (
                                    <div key={key}>
                                      <div className="section-title mb-2">{label}</div>
                                      {rendered}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'cheatsheet' && (
                <CheatsheetTab cheatsheet={challenge.cheatsheet} />
              )}

              {activeTab === 'hints' && showHints && (
                <div className="animate-fade-in">
                  <div className="section-title mb-3">Hints</div>
                  {visibleHints.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      No hints available for this challenge.
                    </div>
                  ) : (
                    [...visibleHints]
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.id ?? 0) - (b.id ?? 0))
                      .map((h, i, arr) => {
                        const prevUnrevealed = arr.slice(0, i).some((p) => !p.revealed);
                        const progressionLocked = isModeAware && isStudentMode && !h.revealed && prevUnrevealed;
                        return (
                          <HintCard
                            key={h.id}
                            hint={h}
                            challengeId={challenge.id}
                            index={i}
                            onUnlocked={handleHintUnlocked}
                            progressionLocked={progressionLocked}
                          />
                        );
                      })
                  )}
                </div>
              )}

              {activeTab === 'files' && (
                <div className="animate-fade-in">
                  <div className="section-title mb-3">Challenge Files</div>
                  <div className="d-flex flex-column gap-2">
                    {challenge.files?.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <span style={{ display: 'inline-flex' }}>{(() => { const Icon = fileIcons[f.type] || fileIcons.default; return <Icon size={22} color="var(--text-muted)" />; })()}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{f.size}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadFile(f)}
                          className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                        >
                          <Download size={13} /> Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'connect' && challenge.connectionInfo && (
                <div className="animate-fade-in">
                  <div className="section-title mb-3">Connection Info</div>
                  <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <Globe size={16} color="var(--accent-cyan)" />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        Challenge Instance
                      </span>
                      <span className="status-dot green" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--terminal-bg)', border: '1px solid rgba(116,100,220,0.2)', borderRadius: 8, padding: '12px 16px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', color: 'var(--accent-green)', flex: 1 }}>
                        {challenge.connectionInfo.url}
                        {challenge.connectionInfo.port && ` :${challenge.connectionInfo.port}`}
                      </span>
                      <button onClick={copyUrl} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Copy size={14} />
                      </button>
                    </div>
                    {copied && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-green)', marginTop: 8 }}>Copied!</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — flag submission */}
        <div className="col-lg-4">
          <div style={{ position: 'sticky', top: 80 }}>
            {/* Challenge instance */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '24px', marginBottom: 16, animation: 'fadeInUp 0.4s ease 0.15s both' }}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <div className="section-title">Challenge Instance</div>
                {instance && <span className={`status-dot ${instanceStatus === 'running' ? 'green' : ''}`} />}
              </div>

              {(instanceError || instance?.failureReason) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, color: '#ef4444', fontSize: '0.78rem', lineHeight: 1.5 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{instanceError || instance.failureReason}</span>
                </div>
              )}

              {isBusy && (
                <div style={{ textAlign: 'center', padding: '22px 0', color: 'var(--text-secondary)' }}>
                  <Loader size={28} color={statusColor} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: statusColor }}>
                    {instanceStatus === 'stopping' || instanceState === 'stopping' ? 'Stopping instance...' : 'Deploying instance...'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Docker is confirming the container state
                  </div>
                </div>
              )}

              {!isBusy && isTerminal && (
                <>
                  {instance && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: statusColor, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>
                      {statusLabel}
                    </div>
                  )}
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: 16 }}>
                    {instanceStatus === 'expired'
                      ? 'Your previous instance expired and was removed. Start a new one to continue.'
                      : instanceStatus === 'failed'
                        ? 'The previous start attempt failed. You can try again.'
                        : 'This challenge runs on a live environment. Start your own private instance and connect to it to capture the flag.'}
                  </p>
                  <button
                    onClick={handleStartInstance}
                    className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                    style={{ padding: '12px' }}
                  >
                    <Power size={15} /> Start Instance
                  </button>
                </>
              )}

              {!isBusy && instance?.status === 'running' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Server size={15} color={statusColor} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: statusColor, fontWeight: 700, letterSpacing: '0.1em' }}>
                        {statusLabel}
                      </span>
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-yellow)', fontWeight: 700 }}>
                      <Clock size={13} /> {fmtTime(timeLeft)}
                    </span>
                  </div>

                  {terminalMode ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--terminal-bg)', border: '1px solid rgba(116,100,220,0.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                      <TerminalSquare size={15} color={statusColor} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent-green)', flex: 1 }}>
                        Interactive shell access
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--terminal-bg)', border: '1px solid rgba(116,100,220,0.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent-green)', flex: 1, wordBreak: 'break-all' }}>
                          {instance.command || 'Connection details are being prepared...'}
                        </span>
                        <button onClick={copyInstance} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                          <Copy size={14} />
                        </button>
                      </div>
                      {instCopied && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent-green)', marginBottom: 12 }}>Copied to clipboard!</div>}
                    </>
                  )}

                  <div className="d-flex gap-2">
                    {terminalMode ? (
                      <button
                        onClick={() => setTerminalOpen(true)}
                        disabled={terminalOpen}
                        className="btn btn-outline-primary d-flex align-items-center justify-content-center gap-2 flex-fill"
                        style={{ padding: '10px' }}
                      >
                        <TerminalSquare size={14} /> {terminalOpen ? 'Terminal Open' : 'Open Terminal'}
                      </button>
                    ) : instance.connection?.url && (
                      <a
                        href={instance.connection.url} target="_blank" rel="noreferrer"
                        className="btn btn-outline-primary d-flex align-items-center justify-content-center gap-2 flex-fill"
                      >
                        <ExternalLink size={14} /> Open
                      </a>
                    )}
                    <button
                      onClick={handleStopInstance}
                      className="btn btn-danger d-flex align-items-center justify-content-center gap-2 flex-fill"
                      style={{ padding: '10px' }}
                    >
                      <Square size={13} /> Stop
                    </button>
                  </div>

                  {terminalMode && terminalOpen && (
                    <InteractiveTerminal
                      challengeId={id}
                      instance={instance}
                      onClose={() => setTerminalOpen(false)}
                      onInstanceUnavailable={handleTerminalInstanceUnavailable}
                    />
                  )}
                </>
              )}
            </div>

            {/* Flag submission */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '24px', marginBottom: 16, animation: 'fadeInUp 0.4s ease 0.2s both' }}>
              <div className="section-title mb-3">Submit Flag</div>

              {challenge.solved ? (
                <div style={{ background: 'rgba(116,100,220,0.06)', border: '1px solid rgba(116,100,220,0.25)', borderRadius: 10, padding: '20px', textAlign: 'center' }}>
                  <CheckCircle size={36} color="var(--accent-green)" style={{ marginBottom: 12 }} />
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent-green)', marginBottom: 4 }}>Challenge Completed!</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>You already captured this flag.</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label className="form-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      Enter Flag
                    </label>
                    <input
                        className="form-control flag-input"
                        placeholder="CTF{...} or FLAG{...}"
                        value={flag}
                        onChange={e => setFlag(e.target.value)}
                        disabled={submitting}
                      />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      Format: CTF{`{...}`} or FLAG{`{...}`}
                    </div>
                  </div>

                  {result && (
                    <div className={`flag-submit-result ${result.correct ? 'success' : 'error'} mb-3`}>
                      {result.error ? (
                        <div>
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <XCircle size={16} />
                            <span style={{ fontWeight: 700 }}>Submission Failed</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>{result.message}</div>
                        </div>
                      ) : result.correct && result.alreadySolved ? (
                        <div>
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <CheckCircle size={16} />
                            <span style={{ fontWeight: 700 }}>Already Solved</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                            {result.message || 'You have already captured this flag.'}
                          </div>
                        </div>
                      ) : result.correct ? (
                        <div>
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <CheckCircle size={16} />
                            <span style={{ fontWeight: 700 }}>Correct Flag!</span>
                          </div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>+{result.netPoints ?? result.points} Points</div>
                          {result.hintCost > 0 && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                              {result.points} − {result.hintCost} spent on hints
                            </div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: 'var(--accent-green)', opacity: 0.7, marginTop: 2 }}>Challenge Completed</div>
                        </div>
                      ) : (
                        <div>
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <XCircle size={16} />
                            <span style={{ fontWeight: 700 }}>Incorrect Flag</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                            {result.message || 'Keep investigating.'}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit" className="btn btn-primary w-100" disabled={submitting || !flag.trim()}
                    style={{ padding: '12px' }}>
                    {submitting ? (
                      <span className="d-flex align-items-center justify-content-center gap-2">
                        <span style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                        Checking...
                      </span>
                    ) : (
                      <span className="d-flex align-items-center justify-content-center gap-2">
                        <Flag size={16} /> Submit Flag
                      </span>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Challenge info summary */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '18px', animation: 'fadeInUp 0.4s ease 0.3s both' }}>
              <div className="section-title mb-3" style={{ fontSize: '0.65rem' }}>Challenge Info</div>
              {[
                { label: 'Category', value: challenge.category },
                { label: 'Difficulty', value: challenge.difficulty },
                { label: 'Points', value: `${challenge.points} pts` },
                { label: 'Solves', value: challenge.solves?.toLocaleString() },
                { label: 'Author', value: challenge.author },
                { label: 'Added', value: challenge.createdAt },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showComplete && result && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(4, 12, 12, 0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', animation: 'fadeIn 0.25s ease',
        }} onClick={() => setShowComplete(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(116,100,220,0.35)',
              borderRadius: 18,
              padding: '36px 40px',
              maxWidth: 420,
              width: '100%',
              textAlign: 'center',
              boxShadow: 'var(--glow-green), var(--shadow-lg)',
              animation: 'fadeInUp 0.35s ease',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{
              width: 84, height: 84, margin: '0 auto 18px',
              borderRadius: '50%',
              background: 'rgba(116,100,220,0.12)',
              border: '2px solid var(--accent-green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--glow-green)',
            }}>
              <CheckCircle size={44} color="var(--accent-green)" style={{ animation: 'pop-in 0.4s ease' }} />
            </div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-green)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6 }}>
              Flag Accepted
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 6 }}>Challenge Completed!</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 20 }}>
              You captured <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{challenge.title}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '14px', marginBottom: result.hintCost > 0 ? 8 : 24 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reward</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-green)' }}>+{result.netPoints ?? result.points}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>points</span>
            </div>
            {result.hintCost > 0 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 24 }}>
                {result.points} − {result.hintCost} spent on hints
              </div>
            )}

            <div className="d-flex flex-column gap-2">
              <button
                className="btn btn-primary"
                style={{ padding: '12px' }}
                onClick={() => { setShowComplete(false); navigate('/challenges'); }}
              >
                Back to Challenges
              </button>
              <button
                className="btn btn-outline-secondary"
                style={{ padding: '12px' }}
                onClick={() => setShowComplete(false)}
              >
                Stay on Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
