import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, Upload, Edit } from 'lucide-react';
import { api, assetUrl } from '../../services/api.js';
import EmptyState from '../../components/EmptyState.jsx';

const blank = {
  admission_number: '',
  first_name: '',
  last_name: '',
  gender: 'Male',
  class_id: ''
};

const panel = 'min-w-0 rounded-lg border border-line bg-panel p-[18px] shadow-panel max-[520px]:p-3.5';
const formGrid = 'grid gap-3.5';
const twoGrid = 'grid grid-cols-2 gap-3 max-[760px]:grid-cols-1';
const primaryButton = 'flex items-center justify-center gap-2 rounded-[7px] border-0 bg-primary px-4 py-[11px] font-extrabold text-white transition hover:bg-primary-dark';
const iconButton = 'inline-grid h-[38px] w-[38px] place-items-center rounded-[7px] border border-line bg-white';

function normalizeAdmissionNumber(value = '') {
  const trimmed = value.trim();
  const match = trimmed.match(/^ana\/jss([1-3])\/(\d{3})([a-z])$/i);
  return match ? `ANA/JSS${match[1]}/${match[2]}${match[3].toLowerCase()}` : trimmed;
}

export default function Students() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(blank);
  const [passport, setPassport] = useState(null);
  const [preview, setPreview] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => students.filter((s) => `${s.first_name} ${s.last_name} ${s.admission_number}`.toLowerCase().includes(search.toLowerCase())), [students, search]);

  async function load() {
    const [studentRows, classRows] = await Promise.all([api('/students'), api('/classes')]);
    setStudents(studentRows);
    setClasses(classRows);
    setForm((current) => ({ ...current, class_id: current.class_id || classRows[0]?.id || '' }));
  }

  useEffect(() => {
    load().catch((err) => setMessage(err.message));
  }, []);

  function chooseFile(file) {
    setPassport(file);
    setPreview(file ? URL.createObjectURL(file) : '');
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      const data = new FormData();
      const payload = {
        ...form,
        admission_number: normalizeAdmissionNumber(form.admission_number),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim()
      };
      Object.entries(payload).forEach(([key, value]) => data.append(key, value));
      if (passport) data.append('passport', passport);
      if (editingId) {
        await api(`/students/${editingId}`, { method: 'PUT', body: data });
      } else {
        await api('/students', { method: 'POST', body: data });
      }
      setForm({ ...blank, class_id: classes[0]?.id || '' });
      setPassport(null);
      setPreview('');
      setMessage('Student saved successfully');
      setEditingId(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this student record?')) return;
    await api(`/students/${id}`, { method: 'DELETE' });
    await load();
  }

  async function edit(id) {
    setMessage('');
    try {
      const data = await api(`/students/${id}`);
      setForm({
        admission_number: data.admission_number || '',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        gender: data.gender || 'Male',
        class_id: data.class_id || ''
      });
      setPreview(data.passport_path ? assetUrl(data.passport_path) : '');
      setPassport(null);
      setEditingId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setMessage(err.message || 'Unable to load student');
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...blank, class_id: classes[0]?.id || '' });
    setPassport(null);
    setPreview('');
    setMessage('');
  }

  async function deletePassportAction() {
    if (!editingId) return;
    if (!confirm('Remove passport image for this student?')) return;
    try {
      await api(`/students/${editingId}/passport`, { method: 'DELETE' });
      setPreview('');
      setMessage('Passport removed');
    } catch (err) {
      setMessage(err.message || 'Unable to remove passport');
    }
  }

  return (
    <section>
      <header className="mb-5 flex items-start justify-between gap-4 max-[760px]:grid">
        <h1>Students</h1>
        <p>Add learners and passport photographs.</p>
      </header>
      <div className="grid min-w-0 grid-cols-[minmax(310px,420px)_1fr] gap-[18px] max-[1040px]:grid-cols-1">
        <form className={`${panel} ${formGrid} content-start`} onSubmit={submit}>
          <h2>Add Student</h2>
          <input
            placeholder="ANA/JSS1/001a"
            required
            pattern="[Aa][Nn][Aa]\/[Jj][Ss][Ss][1-3]\/[0-9]{3}[a-zA-Z]"
            title="Use the format ANA/JSS1/001a"
            value={form.admission_number}
            onChange={(e) => setForm({ ...form, admission_number: e.target.value })}
            onBlur={(e) => setForm({ ...form, admission_number: normalizeAdmissionNumber(e.target.value) })}
          />
          <div className={twoGrid}>
            <input placeholder="First Name" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <input placeholder="Last Name" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div className={twoGrid}>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option>Male</option>
              <option>Female</option>
            </select>
            <select required value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}
            </select>
          </div>
          <label className="grid grid-cols-[auto_1fr] place-items-center rounded-lg border border-dashed border-line p-3">
            <Upload size={18} />
            <span>Upload passport</span>
            <input className="hidden" type="file" accept="image/png,image/jpeg" onChange={(e) => chooseFile(e.target.files[0])} />
          </label>
          {preview && (
            <div className="flex items-start gap-3">
              <img className="h-24 w-24 rounded-lg border border-line object-cover" src={preview} alt="Passport preview" />
              {editingId && (
                <div className="flex flex-col gap-2">
                  <button type="button" className="rounded-[7px] border px-3 py-2 text-sm" onClick={deletePassportAction}>Remove passport</button>
                </div>
              )}
            </div>
          )}
          {message && <p className="m-0 font-bold text-primary-dark">{message}</p>}
          <div className="flex items-center gap-2">
            <button className={`${primaryButton} disabled:cursor-not-allowed disabled:opacity-70`} type="submit" disabled={saving || !classes.length}>
              <Plus size={18} /> {saving ? (editingId ? 'Updating...' : 'Saving...') : (editingId ? 'Update Student' : 'Save Student')}
            </button>
            {editingId && (
              <button type="button" className="rounded-[7px] border px-4 py-[11px]" onClick={cancelEdit} disabled={saving}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <section className={panel}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3.5 max-[760px]:grid">
            <h2>Student Records</h2>
            <label className="flex w-full max-w-[260px] items-center gap-2 rounded-[7px] border border-line pl-2.5"><Search size={17} /><input className="border-0 focus:ring-0" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          </div>
          <div className="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 sm:hidden">
            Swipe horizontally to see all columns on mobile.
          </div>
          <div className="responsive-table">
            <table>
              <thead><tr><th>Student</th><th>Admission</th><th>Class</th><th></th></tr></thead>
              <tbody>
                {filtered.map((student) => (
                  <tr key={student.id}>
                    <td data-label="Student" className="flex min-w-0 items-center gap-2 font-semibold text-sm max-[760px]:grid"><span className="flex min-w-0 items-center gap-2">{student.passport_path && <img className="h-8 w-8 rounded-lg object-cover" src={assetUrl(student.passport_path)} alt="" />}<span className="min-w-0 break-words">{student.first_name} {student.last_name}</span></span></td>
                    <td data-label="Admission" className="text-sm">{student.admission_number}</td>
                    <td data-label="Class" className="text-sm">{student.class_name}</td>
                    <td data-label="Actions" className="max-[760px]:flex max-[760px]:justify-end max-[760px]:pt-1">
                      <div className="flex items-center gap-2">
                        <button className={`${iconButton} text-primary`} onClick={() => edit(student.id)} aria-label="Edit student"><Edit size={16} /></button>
                        <button className={`${iconButton} text-accent`} onClick={() => remove(student.id)} aria-label="Delete student"><Trash2 size={17} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <EmptyState />}
          </div>
        </section>
      </div>
    </section>
  );
}
