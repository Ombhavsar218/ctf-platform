import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Upload, CheckCircle, Globe, Server, File, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { challengeService } from '../../services/challengeService';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const DIFFICULTIES = ['Easy','Medium','Hard','Insane'];
const POINT_PRESETS = [50,75,100,125,150,200,250,300,350,400,450,500,750];

const EMPTY_MODE_CONTENT = {
  student: {
    introduction: '',
    scenario: '',
    learning_objectives: [],
    tasks: [],
    checkpoints: [],
    guidance: [],
    review_questions: [],
    common_mistakes: [],
    remediation_guidance: [],
  },
  competitor: {
    challenge_rules: [],
    objective: '',
    time_limit: { minutes: '', seconds: '', label: '' },
    submission_instructions: '',
  },
  solution: {
    explanation: '',
    walkthrough: [],
    expected_result: '',
    learning_takeaways: [],
  },
};

function cloneModeContent(mc = EMPTY_MODE_CONTENT) {
  return JSON.parse(JSON.stringify(mc));
}

function normalizeModeContentForForm(raw) {
  const base = cloneModeContent(EMPTY_MODE_CONTENT);
  if (!raw || typeof raw !== 'object') return base;
  const s = raw.student && typeof raw.student === 'object' ? raw.student : {};
  const c = raw.competitor && typeof raw.competitor === 'object' ? raw.competitor : {};
  const sol = raw.solution && typeof raw.solution === 'object' ? raw.solution : {};
  base.student.introduction = typeof s.introduction === 'string' ? s.introduction : '';
  base.student.scenario = typeof s.scenario === 'string' ? s.scenario : '';
  base.student.learning_objectives = Array.isArray(s.learning_objectives) ? s.learning_objectives.filter(x => typeof x === 'string') : [];
  base.student.tasks = Array.isArray(s.tasks) ? s.tasks.map(x => typeof x === 'string' ? { title: '', description: x } : { id: x?.id ?? '', title: x?.title ?? '', description: x?.description ?? x?.step ?? '' }) : [];
  base.student.checkpoints = Array.isArray(s.checkpoints) ? s.checkpoints.map(x => typeof x === 'string' ? { title: x, description: '' } : { id: x?.id ?? '', title: x?.title ?? x?.criteria ?? '', description: x?.description ?? '' }) : [];
  base.student.guidance = Array.isArray(s.guidance) ? s.guidance.map(x => typeof x === 'string' ? { title: '', explanation: x } : { id: x?.id ?? '', title: x?.title ?? '', explanation: x?.explanation ?? x?.text ?? '' }) : [];
  base.student.review_questions = Array.isArray(s.review_questions) ? s.review_questions.map(x => typeof x === 'string' ? { question: x, answer: '' } : { id: x?.id ?? '', question: x?.question ?? '', answer: x?.answer ?? x?.explanation ?? '' }) : [];
  base.student.common_mistakes = Array.isArray(s.common_mistakes) ? s.common_mistakes.map(x => typeof x === 'string' ? { mistake: x, description: '' } : { id: x?.id ?? '', mistake: x?.mistake ?? '', description: x?.description ?? x?.example ?? '' }) : [];
  base.student.remediation_guidance = Array.isArray(s.remediation_guidance) ? s.remediation_guidance.map(x => typeof x === 'string' ? { title: '', guidance: x } : { id: x?.id ?? '', title: x?.title ?? '', guidance: x?.guidance ?? x?.remediation ?? x?.text ?? '' }) : [];

  base.competitor.challenge_rules = Array.isArray(c.challenge_rules) ? c.challenge_rules.filter(x => typeof x === 'string') : [];
  base.competitor.objective = typeof c.objective === 'string' ? c.objective : '';
  if (typeof c.time_limit === 'string') base.competitor.time_limit = { minutes: '', seconds: '', label: c.time_limit };
  else if (c.time_limit && typeof c.time_limit === 'object') base.competitor.time_limit = { minutes: c.time_limit.minutes ?? '', seconds: c.time_limit.seconds ?? '', label: c.time_limit.label ?? '' };
  base.competitor.submission_instructions = typeof c.submission_instructions === 'string' ? c.submission_instructions : '';

  base.solution.explanation = typeof sol.explanation === 'string' ? sol.explanation : '';
  base.solution.walkthrough = Array.isArray(sol.walkthrough) ? sol.walkthrough.map(x => typeof x === 'string' ? { title: '', description: x } : { id: x?.id ?? '', title: x?.title ?? x?.step ?? '', description: x?.description ?? x?.text ?? '' }) : (typeof sol.walkthrough === 'string' ? [{ title: '', description: sol.walkthrough }] : []);
  base.solution.expected_result = typeof sol.expected_result === 'string' ? sol.expected_result : '';
  base.solution.learning_takeaways = Array.isArray(sol.learning_takeaways) ? sol.learning_takeaways.filter(x => typeof x === 'string') : [];
  return base;
}

function compactObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const inner = compactObject(v);
      if (Object.keys(inner).length > 0) out[k] = inner;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function buildModeContentPayload(mc) {
  if (!mc || typeof mc !== 'object') return {};
  const student = {};
  if (mc.student?.introduction?.trim()) student.introduction = mc.student.introduction.trim();
  if (mc.student?.scenario?.trim()) student.scenario = mc.student.scenario.trim();
  const lo = (mc.student?.learning_objectives || []).map(s => String(s).trim()).filter(Boolean);
  if (lo.length) student.learning_objectives = lo;
  const tasks = (mc.student?.tasks || []).map(t => compactObject({ title: String(t.title || '').trim(), description: String(t.description || '').trim() })).filter(o => Object.keys(o).length);
  if (tasks.length) student.tasks = tasks;
  const checkpoints = (mc.student?.checkpoints || []).map(t => compactObject({ title: String(t.title || '').trim(), description: String(t.description || '').trim() })).filter(o => Object.keys(o).length);
  if (checkpoints.length) student.checkpoints = checkpoints;
  const guidance = (mc.student?.guidance || []).map(t => compactObject({ title: String(t.title || '').trim(), explanation: String(t.explanation || '').trim() })).filter(o => Object.keys(o).length);
  if (guidance.length) student.guidance = guidance;
  const review_questions = (mc.student?.review_questions || []).map(t => compactObject({ question: String(t.question || '').trim(), answer: String(t.answer || '').trim() })).filter(o => Object.keys(o).length);
  if (review_questions.length) student.review_questions = review_questions;
  const common_mistakes = (mc.student?.common_mistakes || []).map(t => compactObject({ mistake: String(t.mistake || '').trim(), description: String(t.description || '').trim() })).filter(o => Object.keys(o).length);
  if (common_mistakes.length) student.common_mistakes = common_mistakes;
  const remediation_guidance = (mc.student?.remediation_guidance || []).map(t => compactObject({ title: String(t.title || '').trim(), guidance: String(t.guidance || '').trim() })).filter(o => Object.keys(o).length);
  if (remediation_guidance.length) student.remediation_guidance = remediation_guidance;

  const competitor = {};
  const rules = (mc.competitor?.challenge_rules || []).map(s => String(s).trim()).filter(Boolean);
  if (rules.length) competitor.challenge_rules = rules;
  if (mc.competitor?.objective?.trim()) competitor.objective = mc.competitor.objective.trim();
  const tl = mc.competitor?.time_limit || {};
  const tlObj = compactObject({
    minutes: tl.minutes !== '' && tl.minutes !== null && tl.minutes !== undefined ? Number(tl.minutes) : undefined,
    seconds: tl.seconds !== '' && tl.seconds !== null && tl.seconds !== undefined ? Number(tl.seconds) : undefined,
    label: String(tl.label || '').trim(),
  });
  if (Object.keys(tlObj).length) competitor.time_limit = tlObj;
  if (mc.competitor?.submission_instructions?.trim()) competitor.submission_instructions = mc.competitor.submission_instructions.trim();

  const solution = {};
  if (mc.solution?.explanation?.trim()) solution.explanation = mc.solution.explanation.trim();
  const walkthrough = (mc.solution?.walkthrough || []).map(t => compactObject({ title: String(t.title || '').trim(), description: String(t.description || '').trim() })).filter(o => Object.keys(o).length);
  if (walkthrough.length) solution.walkthrough = walkthrough;
  if (mc.solution?.expected_result?.trim()) solution.expected_result = mc.solution.expected_result.trim();
  const takeaways = (mc.solution?.learning_takeaways || []).map(s => String(s).trim()).filter(Boolean);
  if (takeaways.length) solution.learning_takeaways = takeaways;

  const payload = {};
  if (Object.keys(student).length) payload.student = student;
  if (Object.keys(competitor).length) payload.competitor = competitor;
  if (Object.keys(solution).length) payload.solution = solution;
  return payload;
}

const EMPTY = {
  title: '', category: '', difficulty: 'Easy', points: 100,
  challenge_mode: 'both',
  description: '', scenario: '', objectives: [''],
  instructions: '', author: '', tags: '',
  flag: '', flag_note: '',
  hints: [{ text: '', cost: 20 }],
  files: [],
  status: 'draft',
  publishAt: '',
  connectionInfo: null,
  instanceEnabled: false,
  targetType: 'Web Application',
  targetUrl: '', targetPort: '',
  // Stage 1C real Docker runtime configuration
  runtime_enabled: false,
  runtime_image: '',
  runtime_command: '',
  runtime_connection_type: 'http',
  runtime_internal_port: '',
  runtime_cpu_limit: 0.5,
  runtime_memory_mb: 256,
  runtime_pids_limit: 64,
  runtime_read_only: true,
  runtime_duration_minutes: 60,
  mode_content: cloneModeContent(EMPTY_MODE_CONTENT),
};

function Field({ label, required, children, hint }) {
  return (
    <div className="mb-3">
      <label className="form-label">{label}{required && <span style={{ color: 'var(--accent-red)', marginLeft: 4 }}>*</span>}</label>
      {children}
      {hint && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function CreateChallenge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = !!id;

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('basic');
  const [pendingFiles, setPendingFiles] = useState([]); // File objects to upload on save
  const [existingFiles, setExistingFiles] = useState([]); // attachments already on the server (edit mode)
  const [categories, setCategories] = useState([]);
  const [modeContentTouched, setModeContentTouched] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cats = await challengeService.getCategories();
        setCategories(cats || []);
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const c = await challengeService.getChallengeByIdAdmin(id);
        setForm({
          ...EMPTY, ...c,
          challenge_mode: c.challenge_mode || 'both',
          tags: c.tags?.join(', ') || '',
          objectives: c.objectives?.length ? c.objectives : [''],
          hints: c.hints?.length ? c.hints.map(h => ({ text: h.text, cost: h.cost })) : [{ text: '', cost: 20 }],
          instanceEnabled: !!c.connectionInfo,
          targetUrl: c.connectionInfo?.url || '',
          targetPort: c.connectionInfo?.port || '',
          targetType: 'Web Application',
          runtime_enabled: !!c.runtime_enabled,
          runtime_image: c.runtime_image || '',
          runtime_command: c.runtime_command || '',
          runtime_connection_type: c.runtime_connection_type || 'http',
          runtime_internal_port: c.runtime_internal_port || '',
          runtime_cpu_limit: c.runtime_cpu_limit ?? 0.5,
          runtime_memory_mb: c.runtime_memory_mb ?? 256,
          runtime_pids_limit: c.runtime_pids_limit ?? 64,
          runtime_read_only: c.runtime_read_only ?? true,
          runtime_duration_minutes: c.runtime_duration_minutes ?? 60,
          mode_content: normalizeModeContentForForm(c.mode_content),
        });
        setExistingFiles(c.files || []);
        setPendingFiles([]);
        setModeContentTouched(false);
      } catch (e) {
        toast.error(e.message || 'Failed to load challenge.');
        navigate('/admin/challenges');
      }
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  useEffect(() => {
    if (isEdit) return;
    const dup = location.state?.duplicateFrom;
    if (!dup || typeof dup !== 'object') return;
    setForm({
      ...EMPTY,
      ...dup,
      challenge_mode: dup.challenge_mode || 'both',
      title: dup.title ? `${dup.title} (Copy)` : '',
      tags: Array.isArray(dup.tags) ? dup.tags.join(', ') : (dup.tags || ''),
      objectives: dup.objectives?.length ? dup.objectives : [''],
      hints: dup.hints?.length ? dup.hints.map(h => ({ text: h.text || '', cost: h.cost ?? 20 })) : [{ text: '', cost: 20 }],
      flag: '', // never copy plaintext flag; admin must provide a new one
      flag_note: dup.flag_note || '',
      status: 'draft',
      publishAt: '',
      instanceEnabled: !!dup.connectionInfo,
      targetUrl: dup.connectionInfo?.url || '',
      targetPort: dup.connectionInfo?.port || '',
      targetType: 'Web Application',
      runtime_enabled: !!dup.runtime_enabled,
      runtime_image: dup.runtime_image || '',
      runtime_command: dup.runtime_command || '',
      runtime_connection_type: dup.runtime_connection_type || 'http',
      runtime_internal_port: dup.runtime_internal_port || '',
      runtime_cpu_limit: dup.runtime_cpu_limit ?? 0.5,
      runtime_memory_mb: dup.runtime_memory_mb ?? 256,
      runtime_pids_limit: dup.runtime_pids_limit ?? 64,
      runtime_read_only: dup.runtime_read_only ?? true,
      runtime_duration_minutes: dup.runtime_duration_minutes ?? 60,
      mode_content: normalizeModeContentForForm(dup.mode_content),
    });
    setModeContentTouched(!!(dup.mode_content && Object.keys(dup.mode_content).length));
  }, [isEdit, location.state]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setObj = (i, v) => setForm(f => { const a = [...f.objectives]; a[i] = v; return { ...f, objectives: a }; });
  const addObj = () => setForm(f => ({ ...f, objectives: [...f.objectives, ''] }));
  const delObj = (i) => setForm(f => ({ ...f, objectives: f.objectives.filter((_, j) => j !== i) }));

  const setHint = (i, k, v) => setForm(f => { const h = [...f.hints]; h[i] = { ...h[i], [k]: v }; return { ...f, hints: h }; });
  const addHint = () => setForm(f => ({ ...f, hints: [...f.hints, { text: '', cost: 20 }] }));
  const delHint = (i) => setForm(f => ({ ...f, hints: f.hints.filter((_, j) => j !== i) }));

  const touchMode = (updater) => {
    setModeContentTouched(true);
    setForm(f => ({ ...f, mode_content: typeof updater === 'function' ? updater(f.mode_content) : updater }));
  };
  const setStudentField = (k, v) => touchMode(mc => ({ ...mc, student: { ...mc.student, [k]: v } }));
  const setCompetitorField = (k, v) => touchMode(mc => ({ ...mc, competitor: { ...mc.competitor, [k]: v } }));
  const setSolutionField = (k, v) => touchMode(mc => ({ ...mc, solution: { ...mc.solution, [k]: v } }));
  const addListItem = (section, key, value) => touchMode(mc => ({ ...mc, [section]: { ...mc[section], [key]: [...(mc[section][key] || []), value] } }));
  const setListItem = (section, key, i, value) => touchMode(mc => { const arr = [...(mc[section][key] || [])]; arr[i] = value; return { ...mc, [section]: { ...mc[section], [key]: arr } }; });
  const delListItem = (section, key, i) => touchMode(mc => ({ ...mc, [section]: { ...mc[section], [key]: (mc[section][key] || []).filter((_, j) => j !== i) } }));

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    if (files.length) setPendingFiles(prev => [...prev, ...files]);
    // Allow selecting the same file again after removal.
    if (e.target) e.target.value = '';
  };

  const removeExistingFile = async (attachmentId) => {
    if (!isEdit || !id) return;
    try {
      await challengeService.deleteAttachment(id, attachmentId);
      setExistingFiles(prev => prev.filter(f => f.id !== attachmentId));
    } catch (e) {
      setError(e.message || 'Failed to delete attachment.');
      setActiveTab('files');
    }
  };

  const buildPayload = () => {
    const payload = {
      title: form.title,
      category: form.category,
      difficulty: form.difficulty,
      points: form.points,
      challenge_mode: form.challenge_mode || 'both',
      description: form.description,
      scenario: form.scenario,
      objectives: form.objectives.filter(Boolean),
      instructions: form.instructions,
      author: form.author,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      featured: !!form.featured,
      trial: !!form.trial,
      cheatsheet: form.cheatsheet || '',
      publishAt: form.publishAt || '',
      hints: form.hints.filter(h => h.text).map((h, i) => ({ id: i + 1, ...h })),
      connectionInfo: form.instanceEnabled && form.targetUrl
        ? { url: form.targetUrl, port: form.targetPort ? Number(form.targetPort) : undefined }
        : null,
      runtime_enabled: !!form.runtime_enabled,
      runtime_image: (form.runtime_image || '').trim(),
      runtime_command: form.runtime_command || '',
      runtime_connection_type: form.runtime_connection_type || 'http',
      runtime_internal_port: form.runtime_internal_port
        ? Number(form.runtime_internal_port)
        : null,
      runtime_cpu_limit: Number(form.runtime_cpu_limit) || 0.5,
      runtime_memory_mb: Number(form.runtime_memory_mb) || 256,
      runtime_pids_limit: Number(form.runtime_pids_limit) || 64,
      runtime_read_only: !!form.runtime_read_only,
      runtime_duration_minutes: Number(form.runtime_duration_minutes) || 0,
    };

    // Flag: required on create, optional on edit (blank keeps existing).
    if (form.flag.trim()) payload.flag = form.flag.trim();
    if (form.flag_note) payload.flag_note = form.flag_note;

    const modePayload = buildModeContentPayload(form.mode_content);
    if (isEdit) {
      if (modeContentTouched) payload.mode_content = modePayload;
    } else if (Object.keys(modePayload).length > 0) {
      payload.mode_content = modePayload;
    }
    return payload;
  };

  const save = async (status) => {
    setError('');
    if (!form.title.trim()) { setError('Challenge title is required.'); setActiveTab('basic'); return; }
    if (!form.flag.trim() && !isEdit) { setError('Flag is required.'); setActiveTab('flag'); return; }
    if (form.flag.trim() && !/^(CTF|FLAG)\{.+\}$/.test(form.flag.trim())) { setError('Flag must be in CTF{...} or FLAG{...} format.'); setActiveTab('flag'); return; }
    setSaving(true);
    try {
      const payload = { ...buildPayload(), status };
      let result;
      if (isEdit) {
        result = await challengeService.updateChallenge(id, payload);
      } else {
        result = await challengeService.createChallenge(payload);
      }
      // Upload any pending files
      const uploadFailures = [];
      if (pendingFiles.length > 0 && result?.id) {
        for (const file of pendingFiles) {
          try {
            await challengeService.uploadAttachment(result.id, file, file.name);
          } catch (e) {
            uploadFailures.push(`${file.name}: ${e.message || 'upload failed'}`);
          }
        }
      }
      // Never leave plaintext flag visible after a successful submission.
      setForm(f => ({ ...f, flag: '' }));
      if (uploadFailures.length) {
        setError(`Challenge saved, but some files failed to upload: ${uploadFailures.join('; ')}`);
        setActiveTab('files');
        setPendingFiles([]); // clear attempted uploads; user can re-add failed ones
        // Refresh existing files so successfully uploaded ones appear
        if (isEdit || result?.id) {
          try {
            const refreshed = await challengeService.getChallengeByIdAdmin(result.id);
            setExistingFiles(refreshed.files || []);
          } catch { /* ignore */ }
        }
        setSaving(false);
        return;
      }
      setSaved(true);
      setTimeout(() => navigate('/admin/challenges'), 1200);
    } catch (e) {
      setError(e.message || 'Failed to save challenge.');
    }
    setSaving(false);
  };

  const tabs = [
    { id: 'basic',    label: 'Basic Info' },
    { id: 'content',  label: 'Content' },
    { id: 'flag',     label: 'Flag & Hints' },
    { id: 'mode',     label: 'Mode & Solution' },
    { id: 'files',    label: 'Files' },
    { id: 'deploy',   label: 'Deployment' },
  ];

  if (loading) return <LoadingSpinner fullPage text="Loading challenge..." />;

  return (
    <div className="page-container">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <div className="section-title mb-1">Admin</div>
          <h1 style={{ margin: 0 }}>{isEdit ? 'Edit Challenge' : 'Create Challenge'}</h1>
        </div>
        {saved && (
          <div className="d-flex align-items-center gap-2" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <CheckCircle size={16} /> Saved — redirecting...
          </div>
        )}
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: 'var(--accent-red)', borderRadius: 8, padding: '12px 16px', marginBottom: 20,
          fontFamily: 'var(--font-mono)', fontSize: '0.85rem', animation: 'fadeInUp 0.2s ease',
        }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              background: 'none', border: 'none',
              padding: '14px 20px',
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600,
              color: activeTab === t.id ? 'var(--accent-green)' : 'var(--text-muted)',
              borderBottom: activeTab === t.id ? '2px solid var(--accent-green)' : '2px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '28px' }}>
          {/* ── BASIC INFO ── */}
          {activeTab === 'basic' && (
            <div className="animate-fade-in">
              <div className="row g-3">
                <div className="col-12">
                  <Field label="Challenge Name" required>
                    <input className="form-control" placeholder="e.g. SQL Injection 101" value={form.title} onChange={e => set('title', e.target.value)} />
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field label="Category" required>
                    <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
                      <option value="">Select category...</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field label="Difficulty" required>
                    <select className="form-select" value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
                      {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field label="Points" required>
                    <select className="form-select" value={form.points} onChange={e => set('points', Number(e.target.value))}>
                      {POINT_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="col-md-3">
                  <Field label="Challenge Mode" required hint="Who can see and play this challenge.">
                    <select className="form-select" value={form.challenge_mode} onChange={e => set('challenge_mode', e.target.value)}>
                      <option value="student">Student Mode</option>
                      <option value="competitor">Competitor Mode</option>
                      <option value="both">Both Modes</option>
                    </select>
                  </Field>
                </div>
                <div className="col-md-6">
                  <Field label="Author" required>
                    <input className="form-control" placeholder="Your handle" value={form.author} onChange={e => set('author', e.target.value)} />
                  </Field>
                </div>
                <div className="col-md-6">
                  <Field label="Tags" hint="Comma-separated. e.g. sql, injection, web">
                    <input className="form-control" placeholder="web, sql, authentication" value={form.tags} onChange={e => set('tags', e.target.value)} />
                  </Field>
                </div>
                <div className="col-12">
                  <Field label="Short Description" required hint="Shown on the challenge card (max 200 chars).">
                    <textarea className="form-control" rows={3} placeholder="A concise description of what this challenge is about." value={form.description} onChange={e => set('description', e.target.value)} maxLength={300} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{form.description.length}/300</div>
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* ── CONTENT ── */}
          {activeTab === 'content' && (
            <div className="animate-fade-in">
              <Field label="Scenario" hint="Set the story/context for the challenge.">
                <textarea className="form-control" rows={4} placeholder="Describe the fictional scenario..." value={form.scenario} onChange={e => set('scenario', e.target.value)} />
              </Field>
              <Field label="Instructions" hint="What the player needs to do.">
                <textarea className="form-control" rows={4} placeholder="Detailed instructions for the player." value={form.instructions} onChange={e => set('instructions', e.target.value)} />
              </Field>

              <div className="section-title mb-3">Objectives</div>
              <div className="d-flex flex-column gap-2 mb-3">
                {form.objectives.map((obj, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-green)', minWidth: 24, paddingTop: 10 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <input className="form-control" placeholder={`Objective ${i + 1}`} value={obj} onChange={e => setObj(i, e.target.value)} />
                    {form.objectives.length > 1 && (
                      <button type="button" onClick={() => delObj(i)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 6, color: 'var(--accent-red)', cursor: 'pointer', padding: '0 10px', flexShrink: 0 }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={addObj}>
                <Plus size={13} /> Add Objective
              </button>
            </div>
          )}

          {/* ── FLAG & HINTS ── */}
          {activeTab === 'flag' && (
            <div className="animate-fade-in">
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '20px', marginBottom: 24 }}>
                <Field label="Flag" required={!isEdit} hint={isEdit ? 'Leave blank to keep the current flag. Accepted formats: CTF{...} or FLAG{...}.' : 'Accepted formats: CTF{...} or FLAG{...}. Plaintext is never displayed after save.'}>
                  <input
                    className="form-control"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    placeholder="CTF{...} or FLAG{...}"
                    value={form.flag}
                    onChange={e => set('flag', e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Flag Notes" hint="Internal notes (not shown to players).">
                  <input className="form-control" placeholder="e.g. Flag is in /root/flag.txt after escalation" value={form.flag_note} onChange={e => set('flag_note', e.target.value)} />
                </Field>
              </div>

              <div className="section-title mb-3">Hints</div>
              <div className="d-flex flex-column gap-3 mb-3">
                {form.hints.map((h, i) => (
                  <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-yellow)', fontWeight: 700 }}>Hint #{i + 1}</span>
                      {form.hints.length > 1 && (
                        <button type="button" onClick={() => delHint(i)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="row g-2">
                      <div className="col-md-9">
                        <input className="form-control" placeholder="Hint text visible to players" value={h.text} onChange={e => setHint(i, 'text', e.target.value)} />
                      </div>
                      <div className="col-md-3">
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ padding: '0 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRight: 'none', borderRadius: '8px 0 0 8px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', height: 38 }}>-pts</span>
                          <input className="form-control" type="number" min={0} max={200} style={{ borderRadius: '0 8px 8px 0' }} value={h.cost} onChange={e => setHint(i, 'cost', Number(e.target.value))} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={addHint}>
                <Plus size={13} /> Add Hint
              </button>
            </div>
          )}

          {/* ── FILES ── */}
          {/* MODE & SOLUTION */}
          {activeTab === 'mode' && (
            <div className="animate-fade-in">
              <div style={{ background: 'rgba(116,100,220,0.06)', border: '1px solid rgba(116,100,220,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Mode-aware content is optional. Leave sections empty for ordinary challenges. Backend validation is authoritative. Protected solution content is submitted only through the existing admin challenge API and must never be exposed by public endpoints.
              </div>

              <div style={{ marginBottom: 28 }}>
                <div className="section-title mb-3">Student Mode</div>
                <Field label="Introduction"><textarea className="form-control" rows={3} value={form.mode_content.student.introduction} onChange={e => setStudentField('introduction', e.target.value)} /></Field>
                <Field label="Scenario"><textarea className="form-control" rows={3} value={form.mode_content.student.scenario} onChange={e => setStudentField('scenario', e.target.value)} /></Field>
                <Field label="Learning Objectives">
                  {(form.mode_content.student.learning_objectives || []).map((v, i) => (
                    <div key={i} className="d-flex gap-2 mb-2"><input className="form-control" value={v} onChange={e => setListItem('student','learning_objectives',i,e.target.value)} /><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('student','learning_objectives',i)}><Trash2 size={14}/></button></div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('student','learning_objectives','')}><Plus size={13}/> Add Objective</button>
                </Field>
                <Field label="Tasks">
                  {(form.mode_content.student.tasks || []).map((v, i) => (
                    <div key={i} style={{ border:'1px solid var(--border-color)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <input className="form-control mb-2" placeholder="Title" value={v.title || ''} onChange={e => setListItem('student','tasks',i,{...v,title:e.target.value})} />
                      <textarea className="form-control mb-2" rows={2} placeholder="Description" value={v.description || ''} onChange={e => setListItem('student','tasks',i,{...v,description:e.target.value})} />
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('student','tasks',i)}><Trash2 size={14}/> Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('student','tasks',{title:'',description:''})}><Plus size={13}/> Add Task</button>
                </Field>
                <Field label="Checkpoints">
                  {(form.mode_content.student.checkpoints || []).map((v, i) => (
                    <div key={i} style={{ border:'1px solid var(--border-color)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <input className="form-control mb-2" placeholder="Title" value={v.title || ''} onChange={e => setListItem('student','checkpoints',i,{...v,title:e.target.value})} />
                      <textarea className="form-control mb-2" rows={2} placeholder="Description" value={v.description || ''} onChange={e => setListItem('student','checkpoints',i,{...v,description:e.target.value})} />
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('student','checkpoints',i)}><Trash2 size={14}/> Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('student','checkpoints',{title:'',description:''})}><Plus size={13}/> Add Checkpoint</button>
                </Field>
                <Field label="Guidance">
                  {(form.mode_content.student.guidance || []).map((v, i) => (
                    <div key={i} style={{ border:'1px solid var(--border-color)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <input className="form-control mb-2" placeholder="Title (optional)" value={v.title || ''} onChange={e => setListItem('student','guidance',i,{...v,title:e.target.value})} />
                      <textarea className="form-control mb-2" rows={2} placeholder="Explanation" value={v.explanation || ''} onChange={e => setListItem('student','guidance',i,{...v,explanation:e.target.value})} />
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('student','guidance',i)}><Trash2 size={14}/> Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('student','guidance',{title:'',explanation:''})}><Plus size={13}/> Add Guidance</button>
                </Field>
                <Field label="Review Questions">
                  {(form.mode_content.student.review_questions || []).map((v, i) => (
                    <div key={i} style={{ border:'1px solid var(--border-color)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <input className="form-control mb-2" placeholder="Question" value={v.question || ''} onChange={e => setListItem('student','review_questions',i,{...v,question:e.target.value})} />
                      <textarea className="form-control mb-2" rows={2} placeholder="Answer (optional)" value={v.answer || ''} onChange={e => setListItem('student','review_questions',i,{...v,answer:e.target.value})} />
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('student','review_questions',i)}><Trash2 size={14}/> Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('student','review_questions',{question:'',answer:''})}><Plus size={13}/> Add Question</button>
                </Field>
                <Field label="Common Mistakes">
                  {(form.mode_content.student.common_mistakes || []).map((v, i) => (
                    <div key={i} style={{ border:'1px solid var(--border-color)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <input className="form-control mb-2" placeholder="Mistake" value={v.mistake || ''} onChange={e => setListItem('student','common_mistakes',i,{...v,mistake:e.target.value})} />
                      <textarea className="form-control mb-2" rows={2} placeholder="Description (optional)" value={v.description || ''} onChange={e => setListItem('student','common_mistakes',i,{...v,description:e.target.value})} />
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('student','common_mistakes',i)}><Trash2 size={14}/> Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('student','common_mistakes',{mistake:'',description:''})}><Plus size={13}/> Add Mistake</button>
                </Field>
                <Field label="Remediation Guidance">
                  {(form.mode_content.student.remediation_guidance || []).map((v, i) => (
                    <div key={i} style={{ border:'1px solid var(--border-color)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <input className="form-control mb-2" placeholder="Title (optional)" value={v.title || ''} onChange={e => setListItem('student','remediation_guidance',i,{...v,title:e.target.value})} />
                      <textarea className="form-control mb-2" rows={2} placeholder="Guidance" value={v.guidance || ''} onChange={e => setListItem('student','remediation_guidance',i,{...v,guidance:e.target.value})} />
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('student','remediation_guidance',i)}><Trash2 size={14}/> Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('student','remediation_guidance',{title:'',guidance:''})}><Plus size={13}/> Add Remediation</button>
                </Field>
              </div>

              <div style={{ marginBottom: 28, paddingTop: 20, borderTop: '1px solid var(--border-color)' }}>
                <div className="section-title mb-3">Competitor Mode</div>
                <Field label="Objective"><textarea className="form-control" rows={3} value={form.mode_content.competitor.objective} onChange={e => setCompetitorField('objective', e.target.value)} /></Field>
                <Field label="Challenge Rules">
                  {(form.mode_content.competitor.challenge_rules || []).map((v, i) => (
                    <div key={i} className="d-flex gap-2 mb-2"><input className="form-control" value={v} onChange={e => setListItem('competitor','challenge_rules',i,e.target.value)} /><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('competitor','challenge_rules',i)}><Trash2 size={14}/></button></div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('competitor','challenge_rules','')}><Plus size={13}/> Add Rule</button>
                </Field>
                <Field label="Time Limit" hint="Optional structured time limit. Leave empty if not used.">
                  <div className="row g-2">
                    <div className="col-md-4"><input className="form-control" type="number" min="0" placeholder="Minutes" value={form.mode_content.competitor.time_limit.minutes} onChange={e => setCompetitorField('time_limit', {...form.mode_content.competitor.time_limit, minutes: e.target.value})} /></div>
                    <div className="col-md-4"><input className="form-control" type="number" min="0" placeholder="Seconds" value={form.mode_content.competitor.time_limit.seconds} onChange={e => setCompetitorField('time_limit', {...form.mode_content.competitor.time_limit, seconds: e.target.value})} /></div>
                    <div className="col-md-4"><input className="form-control" placeholder="Label (optional)" value={form.mode_content.competitor.time_limit.label} onChange={e => setCompetitorField('time_limit', {...form.mode_content.competitor.time_limit, label: e.target.value})} /></div>
                  </div>
                </Field>
                <Field label="Submission Instructions"><textarea className="form-control" rows={3} value={form.mode_content.competitor.submission_instructions} onChange={e => setCompetitorField('submission_instructions', e.target.value)} /></Field>
              </div>

              <div style={{ paddingTop: 20, borderTop: '1px solid var(--border-color)' }}>
                <div className="section-title mb-3">Protected Solution</div>
                <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Protected solution content is for authorized admin authoring only. It must not be exposed through public challenge endpoints.
                </div>
                <Field label="Explanation"><textarea className="form-control" rows={4} value={form.mode_content.solution.explanation} onChange={e => setSolutionField('explanation', e.target.value)} /></Field>
                <Field label="Walkthrough">
                  {(form.mode_content.solution.walkthrough || []).map((v, i) => (
                    <div key={i} style={{ border:'1px solid var(--border-color)', borderRadius:8, padding:12, marginBottom:8 }}>
                      <input className="form-control mb-2" placeholder="Step title (optional)" value={v.title || ''} onChange={e => setListItem('solution','walkthrough',i,{...v,title:e.target.value})} />
                      <textarea className="form-control mb-2" rows={2} placeholder="Step description" value={v.description || ''} onChange={e => setListItem('solution','walkthrough',i,{...v,description:e.target.value})} />
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('solution','walkthrough',i)}><Trash2 size={14}/> Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('solution','walkthrough',{title:'',description:''})}><Plus size={13}/> Add Step</button>
                </Field>
                <Field label="Expected Result"><textarea className="form-control" rows={3} value={form.mode_content.solution.expected_result} onChange={e => setSolutionField('expected_result', e.target.value)} /></Field>
                <Field label="Learning Takeaways">
                  {(form.mode_content.solution.learning_takeaways || []).map((v, i) => (
                    <div key={i} className="d-flex gap-2 mb-2"><input className="form-control" value={v} onChange={e => setListItem('solution','learning_takeaways',i,e.target.value)} /><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => delListItem('solution','learning_takeaways',i)}><Trash2 size={14}/></button></div>
                  ))}
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => addListItem('solution','learning_takeaways','')}><Plus size={13}/> Add Takeaway</button>
                </Field>
              </div>
            </div>
          )}

          {/* FILES */}
          {activeTab === 'files' && (
            <div className="animate-fade-in">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                style={{
                  border: '2px dashed var(--border-bright)',
                  borderRadius: 12, padding: '40px',
                  textAlign: 'center', marginBottom: 20,
                  transition: 'all 0.2s',
                  background: 'var(--bg-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => document.getElementById('file-input').click()}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-green)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-bright)'}
              >
                <input id="file-input" type="file" multiple onChange={handleFileDrop} style={{ display: 'none' }} />
                <Upload size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop files here or click to upload</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {isEdit ? 'New files are uploaded when you save the challenge.' : 'Files are uploaded after the challenge is saved.'}
                </div>
              </div>

              {existingFiles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Uploaded files</div>
                  <div className="d-flex flex-column gap-2">
                    {existingFiles.map((f) => (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                        <File size={18} color="var(--text-muted)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{f.size || f.type || 'file'}</div>
                        </div>
                        {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--accent-green)', textDecoration: 'none' }}>Download</a>}
                        <button type="button" onClick={() => removeExistingFile(f.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }} title="Delete attachment">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pending upload (saved on submit)</div>
                  <div className="d-flex flex-column gap-2">
                    {pendingFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8 }}>
                        <File size={18} color="var(--text-muted)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{`${(f.size / 1024).toFixed(1)} KB`}</div>
                        </div>
                        <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }} title="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DEPLOYMENT ── */}
          {activeTab === 'deploy' && (
            <div className="animate-fade-in">
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <h5 style={{ fontWeight: 700, marginBottom: 4 }}>Challenge Instance</h5>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      Enable a live challenge instance with connection details.
                    </p>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.instanceEnabled} onChange={e => set('instanceEnabled', e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: 26, background: form.instanceEnabled ? 'var(--accent-green)' : 'var(--bg-elevated)', border: `1px solid ${form.instanceEnabled ? 'var(--accent-green)' : 'var(--border-bright)'}`, transition: 'all 0.25s' }}>
                      <span style={{ position: 'absolute', top: 3, left: form.instanceEnabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: form.instanceEnabled ? '#0A0917' : 'var(--text-muted)', transition: 'left 0.25s' }} />
                    </span>
                  </label>
                </div>

                {form.instanceEnabled && (
                  <div className="row g-3 animate-fade-in">
                    <div className="col-md-4">
                      <Field label="Target Type">
                        <select className="form-select" value={form.targetType} onChange={e => set('targetType', e.target.value)}>
                          {['Web Application', 'Netcat / TCP', 'SSH', 'Docker Container', 'VPN Instance'].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div className="col-md-5">
                      <Field label="Target URL / Host">
                        <input className="form-control" placeholder="http://challenge.local or nc server.local" value={form.targetUrl} onChange={e => set('targetUrl', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
                      </Field>
                    </div>
                    <div className="col-md-3">
                      <Field label="Port">
                        <input className="form-control" type="number" placeholder="8080" value={form.targetPort} onChange={e => set('targetPort', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
                      </Field>
                    </div>
                    <div className="col-12">
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(116,100,220,0.2)', borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <Server size={16} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          <strong style={{ color: 'var(--accent-cyan)' }}>Note:</strong> These are descriptive connection details shown on the Connect tab. Real containers are configured in the Docker runtime section below.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── REAL DOCKER RUNTIME (Stage 1C) ── */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(116,100,220,0.28)', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <h5 style={{ fontWeight: 700, marginBottom: 4 }}>Docker Runtime</h5>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      Start a real isolated container when a player clicks Start Instance.
                    </p>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form.runtime_enabled} onChange={e => set('runtime_enabled', e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: 26, background: form.runtime_enabled ? 'var(--accent-green)' : 'var(--bg-elevated)', border: `1px solid ${form.runtime_enabled ? 'var(--accent-green)' : 'var(--border-bright)'}`, transition: 'all 0.25s' }}>
                      <span style={{ position: 'absolute', top: 3, left: form.runtime_enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: form.runtime_enabled ? '#0A0917' : 'var(--text-muted)', transition: 'left 0.25s' }} />
                    </span>
                  </label>
                </div>

                {form.runtime_enabled && (
                  <div className="row g-3 animate-fade-in" style={{ marginTop: 16 }}>
                    <div className="col-md-8">
                      <Field label="Docker Image" required hint="Must be available to the local Docker daemon.">
                        <input className="form-control" placeholder="python:3.12-alpine" value={form.runtime_image} onChange={e => set('runtime_image', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
                      </Field>
                    </div>
                    <div className="col-md-4">
                      <Field label="Connection Type">
                        <select className="form-select" value={form.runtime_connection_type} onChange={e => set('runtime_connection_type', e.target.value)}>
                          {['http', 'https', 'tcp', 'other'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                        </select>
                      </Field>
                    </div>
                    <div className="col-md-4">
                      <Field label="Internal Port" required hint="Port inside the container. A loopback host port is assigned automatically.">
                        <input className="form-control" type="number" min={1} max={65535} placeholder="8080" value={form.runtime_internal_port} onChange={e => set('runtime_internal_port', e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
                      </Field>
                    </div>
                    <div className="col-md-4">
                      <Field label="Duration (minutes)" hint="0 uses the server default (60).">
                        <input className="form-control" type="number" min={0} max={1440} value={form.runtime_duration_minutes} onChange={e => set('runtime_duration_minutes', e.target.value)} />
                      </Field>
                    </div>
                    <div className="col-md-4">
                      <Field label="CPU Limit" hint="Fraction of one CPU core, e.g. 0.5.">
                        <input className="form-control" type="number" min={0.05} max={8} step={0.05} value={form.runtime_cpu_limit} onChange={e => set('runtime_cpu_limit', e.target.value)} />
                      </Field>
                    </div>
                    <div className="col-md-4">
                      <Field label="Memory (MB)">
                        <input className="form-control" type="number" min={64} max={4096} step={64} value={form.runtime_memory_mb} onChange={e => set('runtime_memory_mb', e.target.value)} />
                      </Field>
                    </div>
                    <div className="col-md-4">
                      <Field label="PID Limit">
                        <input className="form-control" type="number" min={16} max={1024} value={form.runtime_pids_limit} onChange={e => set('runtime_pids_limit', e.target.value)} />
                      </Field>
                    </div>
                    <div className="col-12">
                      <Field label="Container Command" hint="Optional. Use a JSON array (recommended) or a shell command. It must keep the container running.">
                        <textarea className="form-control" rows={4} placeholder='["/bin/sh", "-c", "python -m http.server 8080 --bind 0.0.0.0"]' value={form.runtime_command} onChange={e => set('runtime_command', e.target.value)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                      </Field>
                    </div>
                    <div className="col-12">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!form.runtime_read_only} onChange={e => set('runtime_read_only', e.target.checked)} />
                        Read-only root filesystem (tmpfs allowed on /tmp)
                      </label>
                    </div>
                    <div className="col-12">
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(116,100,220,0.2)', borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <Server size={16} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          The container gets a private bridge network, a loopback-only published port, CPU/memory/PID limits and no privileged access. Connection details are shown only after Docker confirms the container is running.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Scheduled Publishing ── */}
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '24px' }}>
                <div className="row g-3">
                  <div className="col-12">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <Clock size={15} color="var(--accent-orange)" />
                      <h5 style={{ fontWeight: 700, margin: 0 }}>Schedule Publish</h5>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '4px 0 14px' }}>
                      Auto-publish this challenge at a set date & time. Clearing the field returns the challenge to draft.
                    </p>
                  </div>
                  <div className="col-md-5">
                    <Field label="Publish At">
                      <input
                        className="form-control"
                        type="datetime-local"
                        value={form.publishAt}
                        onChange={e => set('publishAt', e.target.value)}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </Field>
                  </div>
                  <div className="col-md-7 d-flex align-items-end">
                    {form.publishAt ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                        color: 'var(--accent-orange)', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.28)',
                        borderRadius: 8, padding: '10px 14px', width: '100%', margin: '0 0 3px',
                      }}>
                        <Clock size={14} /> Scheduled for {new Date(form.publishAt).toLocaleString()}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 3px', padding: '10px 0' }}>
                        No schedule set — use <strong>Schedule</strong> below to arm auto-publish.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        position: 'sticky', bottom: 0, background: 'rgba(10,9,23,0.96)',
        backdropFilter: 'blur(12px)', borderTop: '1px solid var(--border-color)',
        padding: '16px 0', marginTop: 24, zIndex: 50,
      }}>
        <div className="d-flex gap-3 flex-wrap">
          <button className="btn btn-outline-secondary d-flex align-items-center gap-2" onClick={() => save('draft')} disabled={saving}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            className="btn btn-outline-primary d-flex align-items-center gap-2"
            onClick={() => save('scheduled')}
            disabled={saving || !form.publishAt}
            title={form.publishAt ? `Auto-publish at ${form.publishAt.replace('T', ' ')}` : 'Set a publish date first'}
          >
            <Clock size={15} /> {isEdit ? 'Update Schedule' : 'Save & Schedule'}
          </button>
          <button className="btn btn-primary d-flex align-items-center gap-2" onClick={() => save('published')} disabled={saving}>
            {saving ? (
              <><span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Publishing...</>
            ) : (
              <><CheckCircle size={16} /> {isEdit ? 'Update & Publish' : 'Publish Challenge'}</>
            )}
          </button>
          <button className="btn btn-outline-secondary d-flex align-items-center gap-2" onClick={() => navigate('/admin/challenges')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
