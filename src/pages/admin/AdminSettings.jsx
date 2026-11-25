import React, { useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon, Globe, UserPlus, Lock, Wrench, Bell, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  loadPlatformSettings,
  savePlatformSettings,
} from '../../services/platformSettingsService';
import {
  DEFAULT_PLATFORM_SETTINGS,
  platformSettingsFieldErrors,
} from '../../utils/adminSettingsForm';

const UNSUPPORTED_NOTE = 'Not configurable in this build.';

function Switch({ label, desc, state, onToggle, disabled = false, note = '', error = '' }) {
  return (
    <div className="d-flex align-items-center justify-content-between py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ maxWidth: '78%' }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>}
        {note && <div style={{ fontSize: '0.76rem', color: 'var(--accent-yellow)', marginTop: 3 }}>{note}</div>}
        {error && (
          <div role="alert" style={{ fontSize: '0.78rem', color: 'var(--diff-hard)', marginTop: 4 }}>
            {error}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        aria-label={label}
        aria-pressed={state}
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          color: state ? 'var(--accent-green)' : 'var(--text-muted)',
          display: 'flex',
        }}
        title={disabled ? note || 'Not configurable' : (state ? 'On' : 'Off')}
      >
        {state ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      </button>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children, right }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div className="d-flex align-items-center gap-2">
          <Icon size={16} color="var(--violet-bright)" />
          <span className="section-title" style={{ fontSize: '0.7rem' }}>{title}</span>
        </div>
        {right}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

function Feedback({ type, message }) {
  const success = type === 'success';
  return (
    <div className="mb-4" role={success ? 'status' : 'alert'} style={{
      background: success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
      border: success ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
      color: success ? 'var(--diff-easy)' : 'var(--diff-hard)',
      fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
      borderRadius: 10, padding: '12px 18px',
    }}>
      {message}
    </div>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState({ ...DEFAULT_PLATFORM_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadAttempt, setLoadAttempt] = useState(0);
  const savingRef = useRef(false);

  const platform = {
    name: 'FlagHunt',
    tagline: 'Break. Learn. Capture the Flag.',
    domain: 'cyberforge.io',
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        const data = await loadPlatformSettings();
        if (!cancelled) {
          setSettings(data);
          setFeedback(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || 'Could not load platform settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const toggle = (field) => {
    if (loading || saving || loadError) return;
    setFeedback(null);
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    setSettings((current) => ({ ...current, [field]: !current[field] }));
  };

  const save = async () => {
    if (savingRef.current || loading || loadError) return;
    savingRef.current = true;
    setSaving(true);
    setFeedback(null);
    setFieldErrors({});

    try {
      // Resolves only after a follow-up read confirms the saved values.
      const confirmed = await savePlatformSettings(settings);
      setSettings(confirmed);
      setFeedback({ type: 'success', message: 'Settings saved successfully.' });
    } catch (error) {
      setFieldErrors(platformSettingsFieldErrors(error));
      setFeedback({
        type: 'error',
        message: error?.message || 'Could not save settings.',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <div className="section-title mb-1">Admin</div>
          <h1 style={{ margin: 0 }}>Admin Settings</h1>
        </div>
        <button
          className="btn btn-primary d-flex align-items-center gap-2"
          onClick={save}
          disabled={loading || saving || Boolean(loadError)}
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {loadError && (
        <div className="mb-4" role="alert" style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          color: 'var(--diff-hard)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
          borderRadius: 10, padding: '12px 18px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <span>{loadError}</span>
          <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setLoadAttempt((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      {feedback && <Feedback type={feedback.type} message={feedback.message} />}

      {/* General */}
      <SectionCard icon={Globe} title="General" right={<SettingsIcon size={14} color="var(--text-muted)" />}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Platform Name</label>
            <input className="form-control" value={platform.name} disabled readOnly />
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>Branding is currently fixed in the frontend.</div>
          </div>
          <div className="col-md-6">
            <label className="form-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Domain</label>
            <input className="form-control" value={platform.domain} disabled readOnly />
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>Managed by deployment environment configuration.</div>
          </div>
          <div className="col-12">
            <label className="form-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Tagline</label>
            <input className="form-control" value={platform.tagline} disabled readOnly />
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 4 }}>Display-only until public branding is configurable.</div>
          </div>
        </div>
      </SectionCard>

      {/* Registration */}
      <SectionCard icon={UserPlus} title="Registration & Access" right={<Lock size={14} color="var(--text-muted)" />}>
        <Switch
          label="Allow new registrations"
          desc="Enable public signup on the platform"
          state={settings.allow_registration}
          onToggle={() => toggle('allow_registration')}
          error={fieldErrors.allow_registration}
        />
        <Switch
          label="Require admin approval"
          desc="New accounts must be approved before login"
          state={false}
          disabled
          note={`${UNSUPPORTED_NOTE} There is no account-approval workflow.`}
        />
        <Switch
          label="Public leaderboard"
          desc="Expose the leaderboard to unauthenticated users"
          state={settings.public_leaderboard}
          onToggle={() => toggle('public_leaderboard')}
          error={fieldErrors.public_leaderboard}
        />
      </SectionCard>

      {/* Gameplay */}
      <SectionCard icon={Wrench} title="Gameplay" right={<SettingsIcon size={14} color="var(--text-muted)" />}>
        <Switch
          label="Allow hints"
          desc="Let participants unlock hints for challenges"
          state={settings.allow_hints}
          onToggle={() => toggle('allow_hints')}
          error={fieldErrors.allow_hints}
        />
        <div className="py-3">
          <label className="form-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Hint cost (% of challenge points)
          </label>
          <input type="range" className="form-range" min={0} max={50} defaultValue={25} disabled />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: 4 }}>
            {UNSUPPORTED_NOTE} Hint prices are stored per challenge.
          </div>
        </div>
      </SectionCard>

      {/* Maintenance */}
      <SectionCard icon={Wrench} title="Notifications & Maintenance" right={<Bell size={14} color="var(--text-muted)" />}>
        <Switch
          label="Email notifications"
          desc="Send automated notification emails to admins"
          state={false}
          disabled
          note={`${UNSUPPORTED_NOTE} No email delivery subsystem is configured.`}
        />
        <Switch
          label="Maintenance mode"
          desc="Temporarily take the platform offline for updates"
          state={false}
          disabled
          note={`${UNSUPPORTED_NOTE} Maintenance is handled operationally.`}
        />
      </SectionCard>
    </div>
  );
}
