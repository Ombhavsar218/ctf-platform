import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Search, Layers, Puzzle, Pencil, Trash2, LayoutGrid, AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import CategoryGlyph from '../../components/ui/CategoryGlyph';
import Modal from '../../components/ui/Modal';
import { challengeService } from '../../services/challengeService';
import {
  EMPTY_CATEGORY_DRAFT,
  buildCategoryPayload,
  categoryFieldErrors,
  categoryToDraft,
  validateCategoryDraft,
} from '../../utils/categoryForm';

/**
 * Category administration.
 *
 * Reads use the public category list (published challenge counts) plus the
 * admin challenge list (draft-inclusive counts):
 *   GET    /api/v1/categories/
 *   GET    /api/v1/admin/challenges/
 *
 * Writes use the category endpoints:
 *   POST   /api/v1/admin/categories/
 *   PATCH  /api/v1/admin/categories/:id/
 *   DELETE /api/v1/admin/categories/:id/
 *
 * The server refuses to delete a category that is still referenced. The modal
 * then stays open with the backend's explanation, and the row remains visible.
 */
export default function AdminCategories() {
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [challenges, setChallenges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ ...EMPTY_CATEGORY_DRAFT });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      const [categoryResult, challengeResult] = await Promise.allSettled([
        challengeService.getCategories(),
        challengeService.getAllChallenges(),
      ]);

      if (cancelled) return;

      if (categoryResult.status === 'rejected') {
        setError(categoryResult.reason?.message || 'Could not load categories.');
        setCategories([]);
        setChallenges(null);
        setLoading(false);
        return;
      }

      setCategories(Array.isArray(categoryResult.value) ? categoryResult.value : []);
      setChallenges(
        challengeResult.status === 'fulfilled' && Array.isArray(challengeResult.value)
          ? challengeResult.value
          : null,
      );
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [reloadKey]);

  // Count every challenge, including drafts/scheduled rows, when the admin
  // list is available. The public category payload only counts published ones.
  const adminCounts = challenges
    ? challenges.reduce((map, challenge) => {
        const key = challenge.category;
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map())
    : null;

  const enriched = categories.map(cat => ({
    ...cat,
    challengeCount: adminCounts
      ? (adminCounts.get(cat.name) || 0)
      : (cat.count || 0),
  }));

  const filtered = enriched.filter(c => catMatches(c, search));

  const totalChallenges = challenges
    ? challenges.length
    : enriched.reduce((sum, c) => sum + c.challengeCount, 0);

  const statCards = [
    { icon: LayoutGrid, value: categories.length,  label: 'Categories',    color: 'var(--accent-cyan)' },
    { icon: Layers, value: totalChallenges,      label: 'Challenges',    color: 'var(--accent-green)' },
    { icon: Puzzle, value: enriched.reduce((s, c) => s + c.challengeCount, 0), label: 'Total Challenges', color: 'var(--accent-purple)' },
  ];

  const openCreate = () => {
    setDraft({ ...EMPTY_CATEGORY_DRAFT });
    setFieldErrors({});
    setFormError('');
    setEditing('create');
  };

  const openEdit = (category) => {
    setDraft(categoryToDraft(category));
    setFieldErrors({});
    setFormError('');
    setEditing(category);
  };

  const closeEditor = () => {
    if (savingRef.current) return;
    setEditing(null);
    setFieldErrors({});
    setFormError('');
  };

  const setDraftField = (field, value) => {
    setDraft(current => ({ ...current, [field]: value }));
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const save = async () => {
    if (savingRef.current) return;

    const localErrors = validateCategoryDraft(draft);
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setFormError('Fix the highlighted fields before saving.');
      return;
    }

    const isCreate = editing === 'create';
    const payload = buildCategoryPayload(draft);
    savingRef.current = true;
    setSaving(true);
    setFormError('');
    setFieldErrors({});

    try {
      if (isCreate) {
        await challengeService.createCategory(payload);
      } else {
        await challengeService.updateCategory(editing.id, payload);
      }
      toast.success(isCreate ? 'Category created.' : 'Category updated.');
      setEditing(null);
      setReloadKey(key => key + 1);
    } catch (err) {
      const apiFieldErrors = categoryFieldErrors(err?.data);
      setFieldErrors(apiFieldErrors);
      setFormError(
        Object.keys(apiFieldErrors).length
          ? ''
          : (err?.message || 'Could not save the category.'),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const openDelete = (category) => {
    setDeleteTarget(category);
    setDeleteError('');
  };

  const closeDelete = () => {
    if (deletingRef.current) return;
    setDeleteTarget(null);
    setDeleteError('');
  };

  const remove = async () => {
    if (deletingRef.current || !deleteTarget) return;

    deletingRef.current = true;
    setDeleting(true);
    setDeleteError('');

    try {
      await challengeService.deleteCategory(deleteTarget.id);
      toast.success('Category deleted.');
      setDeleteTarget(null);
      setReloadKey(key => key + 1);
    } catch (err) {
      // Keep the row listed and the dialog open: the backend explanation says
      // why it was refused and what still references the category.
      setDeleteError(err?.message || 'Could not delete the category.');
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <div className="section-title mb-1">Admin</div>
          <h1 style={{ margin: 0 }}>Categories</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary d-flex align-items-center gap-2"
          onClick={openCreate}
        >
          <Plus size={16} /> Create Category
        </button>
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          color: 'var(--accent-red)', fontSize: '0.85rem',
        }}>
          <AlertTriangle size={16} /> {error}
          <button className="btn btn-outline-secondary btn-sm ms-auto" onClick={() => setReloadKey(k => k + 1)}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Loading categories...
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="row g-3 mb-4">
            {statCards.map(s => (
              <div key={s.label} className="col-6 col-md-4">
                <div className="stat-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
                      <s.icon size={18} />
                    </div>
                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>{s.value}</div>
                  </div>
                  <div className="stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 400, marginBottom: 20 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-control" style={{ paddingLeft: 36 }} placeholder="Search categories..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    {['Category', 'Description', 'Challenges', 'Actions'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>No categories found</td></tr>
                  ) : (
                    filtered.map(c => {
                      const accent = categoryAccent(c.color);
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="d-flex align-items-center gap-3">
                              <div style={{
                                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                background: `${accent}1f`, border: `1px solid ${accent}40`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <CategoryGlyph name={c.name} size={17} color={accent} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ maxWidth: 380 }}>
                            <span style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.description}</span>
                          </td>
                          <td><span className="cat-chip" style={{ fontSize: '0.7rem' }}>{c.challengeCount} challenges</span></td>
                          <td>
                            <div className="d-flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(c)}
                                aria-label={`Edit ${c.name}`}
                                style={{ background: 'rgba(116,100,220,0.1)', border: '1px solid rgba(116,100,220,0.28)', color: 'var(--violet-bright)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex' }}
                                title="Edit"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDelete(c)}
                                aria-label={`Delete ${c.name}`}
                                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', color: 'var(--accent-red)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex' }}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Create / edit modal */}
      <Modal
        open={!!editing}
        onClose={closeEditor}
        title={editing === 'create' ? 'Create Category' : `Edit "${editing?.name}"`}
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={closeEditor} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary d-flex align-items-center gap-2"
              onClick={save}
              disabled={saving || !String(draft.name || '').trim()}
            >
              {saving
                ? <span className="spinner-border spinner-border-sm" />
                : <>{editing === 'create' ? 'Create Category' : 'Save Changes'}</>}
            </button>
          </>
        }
      >
        {formError && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.28)',
              borderRadius: 8, padding: '10px 12px', marginBottom: 18,
              color: 'var(--accent-red)', fontSize: '0.82rem',
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{formError}</span>
          </div>
        )}

        <div className="mb-3">
          <label className="form-label" htmlFor="category-name">Name</label>
          <input
            id="category-name"
            className={`form-control${fieldErrors.name ? ' is-invalid' : ''}`}
            value={draft.name}
            maxLength={100}
            onChange={e => setDraftField('name', e.target.value)}
            placeholder="e.g. Cloud Security"
          />
          {fieldErrors.name
            ? <div className="invalid-feedback d-block">{fieldErrors.name}</div>
            : <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                The URL slug is generated by the server and stays stable when the name changes.
              </div>}
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="category-description">Description</label>
          <textarea
            id="category-description"
            className={`form-control${fieldErrors.description ? ' is-invalid' : ''}`}
            rows={3}
            value={draft.description}
            onChange={e => setDraftField('description', e.target.value)}
            placeholder="Short description shown to players."
          />
          {fieldErrors.description && <div className="invalid-feedback d-block">{fieldErrors.description}</div>}
        </div>

        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="category-icon">Icon</label>
            <input
              id="category-icon"
              className={`form-control${fieldErrors.icon ? ' is-invalid' : ''}`}
              value={draft.icon}
              maxLength={60}
              onChange={e => setDraftField('icon', e.target.value)}
              placeholder="Optional label"
            />
            {fieldErrors.icon && <div className="invalid-feedback d-block">{fieldErrors.icon}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="category-color">Color</label>
            <input
              id="category-color"
              className={`form-control${fieldErrors.color ? ' is-invalid' : ''}`}
              value={draft.color}
              maxLength={20}
              onChange={e => setDraftField('color', e.target.value)}
              placeholder="#3DD9D0"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            {fieldErrors.color && <div className="invalid-feedback d-block">{fieldErrors.color}</div>}
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="category-order">Order</label>
            <input
              id="category-order"
              type="number"
              min={0}
              step={1}
              className={`form-control${fieldErrors.order ? ' is-invalid' : ''}`}
              value={draft.order}
              onChange={e => setDraftField('order', e.target.value)}
            />
            {fieldErrors.order
              ? <div className="invalid-feedback d-block">{fieldErrors.order}</div>
              : <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Lower numbers appear first.
                </div>}
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={closeDelete}
        title="Delete Category"
        footer={
          <>
            <button type="button" className="btn btn-outline-secondary" onClick={closeDelete} disabled={deleting}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger d-flex align-items-center gap-2" onClick={remove} disabled={deleting}>
              {deleting
                ? <span className="spinner-border spinner-border-sm" />
                : <><Trash2 size={14} /> Delete</>}
            </button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Are you sure you want to permanently remove{' '}
          <strong style={{ color: 'var(--text-primary)' }}>"{deleteTarget?.name}"</strong>?
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '12px 0 0' }}>
          Categories still used by a challenge or an achievement rule cannot be deleted.
          Challenges are never deleted or reassigned automatically.
        </p>

        {deleteError && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.28)',
              borderRadius: 8, padding: '10px 12px', marginTop: 16,
              color: 'var(--accent-red)', fontSize: '0.82rem',
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{deleteError}</span>
          </div>
        )}
      </Modal>
    </div>
  );
}

function catMatches(category, search) {
  const term = (search || '').trim().toLowerCase();
  if (!term) return true;
  return (category.name || '').toLowerCase().includes(term)
    || (category.description || '').toLowerCase().includes(term);
}

/** Only a hex value can be safely suffixed with an alpha channel. */
function categoryAccent(color) {
  return /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#3DD9D0';
}
