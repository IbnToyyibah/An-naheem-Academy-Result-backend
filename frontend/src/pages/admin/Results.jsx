import { useEffect, useMemo, useState } from 'react';
import { Edit3, Save } from 'lucide-react';
import { api } from '../../services/api.js';

const panel = 'min-w-0 rounded-lg border border-line bg-panel p-[18px] shadow-panel max-[520px]:p-3.5';
const formGrid = 'grid gap-3.5';
const primaryButton = 'flex items-center justify-center gap-2 rounded-[7px] border-0 bg-primary px-4 py-[11px] font-extrabold text-white transition hover:bg-primary-dark';

export default function Results() {
  const [lookups, setLookups] = useState({ students: [], subjects: [], sessions: [], terms: [] });
  const [filters, setFilters] = useState({ studentId: '', sessionId: '', termId: '', attendance: '', principalRemark: '' });
  const [scores, setScores] = useState({});
  const [message, setMessage] = useState('');
  const [loadingSavedResults, setLoadingSavedResults] = useState(false);
  const [hasSavedResults, setHasSavedResults] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api('/students'), api('/subjects'), api('/sessions'), api('/terms')])
      .then(([students, subjects, sessions, terms]) => {
        setLookups({ students, subjects, sessions, terms });
        setFilters({
          studentId: students[0]?.id || '',
          sessionId: sessions.find((s) => s.is_current)?.id || sessions[0]?.id || '',
          termId: terms[0]?.id || '',
          attendance: '',
          principalRemark: ''
        });
      })
      .catch((err) => {
        setMessage(err.message || 'Unable to load students, subjects, sessions, and terms.');
      });
  }, []);

  useEffect(() => {
    const loadSavedResults = async () => {
      if (!filters.studentId || !filters.sessionId || !filters.termId || !lookups.subjects.length) {
        return;
      }

      setLoadingSavedResults(true);
      try {
        const rows = await api(`/results/student/${filters.studentId}?sessionId=${filters.sessionId}&termId=${filters.termId}`);
        const nextScores = {};

        rows.forEach((row) => {
          const subjectId = row.subject_id?.id || row.subject_id || lookups.subjects.find((subject) => subject.subject_name === row.subject_name)?.id;
          if (!subjectId) return;

          nextScores[subjectId] = {
            firstCa: row.first_ca ?? '',
            secondCa: row.second_ca ?? '',
            exam: row.exam ?? ''
          };
        });

        setScores(nextScores);
        setHasSavedResults(rows.length > 0);
        setFilters((current) => ({
          ...current,
          attendance: rows[0]?.attendance ?? '',
          principalRemark: rows[0]?.principal_remark ?? ''
        }));
        setMessage(rows.length ? 'Loaded saved results. You can edit and save changes.' : 'No saved results found for this selection.');
      } catch (err) {
        setHasSavedResults(false);
        setScores({});
        setMessage(err.message || 'Unable to load saved results.');
      } finally {
        setLoadingSavedResults(false);
      }
    };

    loadSavedResults();
  }, [filters.studentId, filters.sessionId, filters.termId, lookups.subjects]);

  const totals = useMemo(() => {
    return Object.fromEntries(Object.entries(scores).map(([subjectId, row]) => {
      const total = Number(row.firstCa || 0) + Number(row.secondCa || 0) + Number(row.exam || 0);
      return [subjectId, total];
    }));
  }, [scores]);

  function update(subjectId, key, value) {
    setScores((current) => ({
      ...current,
      [subjectId]: { ...current[subjectId], [key]: value }
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const payload = {
      ...filters,
      scores: lookups.subjects.map((subject) => ({
        subjectId: subject.id,
        firstCa: scores[subject.id]?.firstCa || 0,
        secondCa: scores[subject.id]?.secondCa || 0,
        exam: scores[subject.id]?.exam || 0
      }))
    };
    try {
      await api('/results/bulk', { method: 'POST', body: JSON.stringify(payload) });
      setHasSavedResults(true);
      setMessage('Results saved successfully');
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'Failed to save results');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="mb-5 flex items-start justify-between gap-4 max-[760px]:grid">
        <h1>Result Upload</h1>
        <p>{hasSavedResults ? 'Editing existing results for the selected student and term.' : 'Enter 1st CA, 2nd CA, and examination scores for each subject.'}</p>
      </header>
      <form className={`${panel} ${formGrid}`} onSubmit={submit}>
        <div className="grid grid-cols-4 gap-3 max-[1040px]:grid-cols-2 max-[760px]:grid-cols-1">
          <select required value={filters.sessionId} onChange={(e) => setFilters({ ...filters, sessionId: e.target.value })}>
            {lookups.sessions.map((item) => <option key={item.id} value={item.id}>{item.session_name}</option>)}
          </select>
          <select required value={filters.termId} onChange={(e) => setFilters({ ...filters, termId: e.target.value })}>
            {lookups.terms.map((item) => <option key={item.id} value={item.id}>{item.term_name}</option>)}
          </select>
          <select required value={filters.studentId} onChange={(e) => setFilters({ ...filters, studentId: e.target.value })}>
            {lookups.students.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name}</option>)}
          </select>
          <input type="number" min="0" placeholder="Attendance" value={filters.attendance} onChange={(e) => setFilters({ ...filters, attendance: e.target.value })} />
        </div>
        <textarea placeholder="Principal's remark" value={filters.principalRemark} onChange={(e) => setFilters({ ...filters, principalRemark: e.target.value })} />
        <div className="mb-3 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 sm:hidden">
          Use the responsive row view on mobile to enter scores.
        </div>
        {loadingSavedResults && (
          <p className="m-0 text-sm font-semibold text-slate-500">Loading saved results...</p>
        )}
        <div className="responsive-table">
          <table>
            <thead><tr><th>Subject</th><th>1st CA</th><th>2nd CA</th><th>Exam</th><th>Total</th></tr></thead>
            <tbody>
              {lookups.subjects.map((subject) => (
                <tr key={subject.id}>
                  <td data-label="Subject">{subject.subject_name}</td>
                  <td data-label="1st CA"><input type="number" min="0" max="20" value={scores[subject.id]?.firstCa || ''} onChange={(e) => update(subject.id, 'firstCa', e.target.value)} /></td>
                  <td data-label="2nd CA"><input type="number" min="0" max="20" value={scores[subject.id]?.secondCa || ''} onChange={(e) => update(subject.id, 'secondCa', e.target.value)} /></td>
                  <td data-label="Exam"><input type="number" min="0" max="60" value={scores[subject.id]?.exam || ''} onChange={(e) => update(subject.id, 'exam', e.target.value)} /></td>
                  <td data-label="Total"><strong>{totals[subject.id] || 0}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message && <p className="m-0 font-bold text-primary-dark">{message}</p>}
        <button type="submit" className={primaryButton} disabled={saving || loadingSavedResults}>
          {hasSavedResults ? <Edit3 size={18} /> : <Save size={18} />}
          {saving ? 'Saving...' : (hasSavedResults ? 'Update Results' : 'Save Results')}
        </button>
      </form>
    </section>
  );
}
