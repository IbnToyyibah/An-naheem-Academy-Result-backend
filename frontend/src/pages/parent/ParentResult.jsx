import { useEffect, useState } from 'react';
import { ClipboardList, Printer, RefreshCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '../../services/api.js';
import EmptyState from '../../components/EmptyState.jsx';
import { assetUrl } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { defaultSubjects } from '../../utils/subjects.js';

export default function ParentResult() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(user || null);
  const [lookups, setLookups] = useState({ sessions: [], terms: [], subjects: [], latestResult: null });
  const [filters, setFilters] = useState({ sessionId: '', termId: '' });
  const [result, setResult] = useState(user?.results || { results: [], summary: {} });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(!user && !user?.results);

  useEffect(() => {
    let active = true;

    const loadParentData = async () => {
      try {
        if (user?.lookups) {
          const sessions = user.lookups.sessions || [];
          const terms = user.lookups.terms || [];
          const subjects = user.lookups.subjects || [];
          const nextFilters = {
            sessionId: user.lookups.latestResult?.sessionId || sessions.find((s) => s.is_current)?.id || sessions[0]?.id || '',
            termId: user.lookups.latestResult?.termId || terms[0]?.id || ''
          };
          setLookups({ sessions, terms, subjects, latestResult: user.lookups.latestResult || null });
          setFilters(nextFilters);
          setProfile(user || null);
          if (user.results) {
            setResult(user.results);
          }
        }

        const [profileData, lookupsData] = await Promise.all([
          api('/parent/profile', { authRedirect: false }),
          api('/parent/lookups', { authRedirect: false })
        ]);

        if (!active) return;

        setProfile(profileData || null);
        const sessions = lookupsData?.sessions || [];
        const terms = lookupsData?.terms || [];
        const subjects = lookupsData?.subjects || [];
        const nextFilters = {
          sessionId: lookupsData?.latestResult?.sessionId || sessions.find((s) => s.is_current)?.id || sessions[0]?.id || '',
          termId: lookupsData?.latestResult?.termId || terms[0]?.id || ''
        };
        setLookups({ sessions, terms, subjects, latestResult: lookupsData?.latestResult || null });
        setFilters(nextFilters);
      } catch (err) {
        const forbiddenMessage = 'You do not have access to this resource';
        if (active) {
          if (err?.status === 403 || err?.message === forbiddenMessage) {
            setMessage('');
          } else {
            setMessage(err.message || 'Unable to load result lookups.');
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadParentData();
    return () => {
      active = false;
    };
  }, []);

  const selectorsDisabled = Boolean(
    (user?.lookups && (user.lookups.latestResult?.sessionId || user.lookups.latestResult?.termId)) ||
    (lookups?.latestResult && (lookups.latestResult.sessionId || lookups.latestResult.termId)) ||
    (result?.results && result.results.length > 0 && user?.lookups?.latestResult)
  );

  useEffect(() => {
    if (!filters.sessionId || !filters.termId) return;
    setMessage('');
    api(`/parent/results?sessionId=${filters.sessionId}&termId=${filters.termId}`, { authRedirect: false })
      .then((data) => setResult(data || { results: [], summary: {} }))
      .catch((err) => {
        const forbiddenMessage = 'You do not have access to this resource';
        if (err?.status === 403 || err?.message === forbiddenMessage) {
          // suppress the backend forbidden message for parent result view
          setMessage('');
        } else {
          setMessage(err.message || 'Unable to load results.');
        }
      });
  }, [filters]);

  return (
    <motion.div
      className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] max-[760px]:rounded-[22px]"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="relative z-[1] p-4 sm:p-6">
        <div className="print-header hidden border-b border-slate-200 pb-3 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/Annaheem.jpeg.png" alt="Annaheem Academy logo" className="h-12 w-12 object-contain" />
              <div>
                <h1 className="m-0 text-xl font-black uppercase leading-none tracking-[0.16em] text-slate-900">AN-NAHEEM ACADEMY</h1>
                <p className="m-0 mt-1 text-md font-semibold text-slate-600">Knowledge, Discipline & Excellence</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="m-0 text-[12px] font-black uppercase tracking-[0.18em] text-slate-900">Term Result Sheet</h2>
              <p className="m-0 mt-1 text-[10px] text-slate-600">
                Session: <span className="font-semibold text-slate-900">{lookups.sessions.find(s => String(s.id) === String(filters.sessionId))?.session_name || 'N/A'}</span>
              </p>
              <p className="m-0 text-[10px] text-slate-600">
                Term: <span className="font-semibold text-slate-900">{lookups.terms.find(t => String(t.id) === String(filters.termId))?.term_name || 'N/A'}</span>
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-[10px]">
            <div>
              <span className="block uppercase tracking-[0.14em] text-slate-500">Student</span>
              <span className="font-bold text-slate-900">{profile?.first_name} {profile?.last_name}</span>
            </div>
            <div>
              <span className="block uppercase tracking-[0.14em] text-slate-500">Admission</span>
              <span className="font-bold text-slate-900">{profile?.admissionNumber || profile?.admission_number}</span>
            </div>
            <div>
              <span className="block uppercase tracking-[0.14em] text-slate-500">Class</span>
              <span className="font-bold text-slate-900">{profile?.class_name || 'N/A'}</span>
            </div>
            <div>
              <span className="block uppercase tracking-[0.14em] text-slate-500">Gender</span>
              <span className="font-bold capitalize text-slate-900">{profile?.gender || 'N/A'}</span>
            </div>
          </div>
        </div>

        <header className="no-print mb-4">
          <div className="overflow-hidden rounded-[24px] bg-slate-50">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-900/5 ring-1 ring-slate-200">
                  <ClipboardList size={26} className="text-slate-900" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Academic Result</p>
                  <h1 className="m-0 text-2xl font-black tracking-tight text-slate-900 max-[520px]:text-xl">View Result</h1>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    A cleaner, printable report sheet for the selected student, built to stay compact and readable.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 backdrop-blur transition hover:bg-slate-100" onClick={() => window.print()}>
                  <Printer size={13} /> Print
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 backdrop-blur transition hover:bg-slate-100"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCcw size={13} /> Refresh
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="no-print mb-4 overflow-hidden rounded-[24px] bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="flex items-center gap-3">
              {profile?.passport_path ? (
                <img
                  src={assetUrl(profile.passport_path)}
                  alt="Passport"
                  className="h-16 w-16 rounded-2xl border border-line object-cover shadow-sm"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-lg font-black text-slate-400">
                  ?
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Student Profile</p>
                <h2 className="m-0 truncate text-lg font-black text-slate-900">{profile?.first_name} {profile?.last_name}</h2>
                <p className="mt-1 text-sm text-slate-600">{profile?.admissionNumber || profile?.admission_number} - {profile?.class_name || 'N/A'}</p>
                {profile?.gender && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{profile.gender}</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Session
                <select
                  value={filters.sessionId}
                  onChange={(e) => { if (!selectorsDisabled) setFilters((prev) => ({ ...prev, sessionId: e.target.value })); }}
                  className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 ${selectorsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  disabled={selectorsDisabled}
                >
                  {lookups.sessions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.session_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Term
                <select
                  value={filters.termId}
                  onChange={(e) => { if (!selectorsDisabled) setFilters((prev) => ({ ...prev, termId: e.target.value })); }}
                  className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 ${selectorsDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  disabled={selectorsDisabled}
                >
                  {lookups.terms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.term_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {selectorsDisabled && <p className="mt-3 text-xs font-semibold text-slate-500">Session and term are locked by the school for this result.</p>}
        </section>

        <section className="overflow-hidden rounded-[24px] border border-line bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 max-[520px]:px-3">
            <div>
              <h2 className="m-0 text-base font-black text-slate-900">Result Sheet</h2>
              <p className="mt-1 text-xs text-slate-500">Subject-wise scores, grade, and teacher remark.</p>
            </div>
            {loading && <span className="text-xs font-semibold text-slate-500">Loading...</span>}
          </div>
          {message && <p className="mx-4 mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-800">{message}</p>}

          <div className="px-4 py-4 max-[520px]:px-3">
            <div className="responsive-table overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-sm text-slate-700">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-bold">Subject</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-bold">1st CA</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-bold">2nd CA</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-bold">Exam</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-bold">Total</th>
                    <th className="whitespace-nowrap px-3 py-3 text-left font-bold">Grade</th>
                    <th className="px-3 py-3 text-left font-bold">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    (lookups.subjects && lookups.subjects.length ? lookups.subjects.map(s => s.subject_name) : defaultSubjects) || []
                  ).map((subjectName, index) => {
                    const row = (result.results || []).find((r) => r.subject_name === subjectName) || {};
                    return (
                      <tr key={row.id || subjectName} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} transition hover:bg-slate-100/80`}>
                        <td data-label="Subject" className="px-3 py-3 font-semibold text-slate-900">{subjectName}</td>
                        <td data-label="1st CA" className="px-3 py-3">{row.first_ca ?? ''}</td>
                        <td data-label="2nd CA" className="px-3 py-3">{row.second_ca ?? ''}</td>
                        <td data-label="Exam" className="px-3 py-3">{row.exam ?? ''}</td>
                        <td data-label="Total" className="px-3 py-3 font-semibold text-slate-900">{row.total ?? ''}</td>
                        <td data-label="Grade" className="px-3 py-3 font-semibold text-slate-900">{row.grade ?? ''}</td>
                        <td data-label="Remark" className="px-3 py-3 text-slate-600">{row.remark ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!result.results.length && !loading && (
              <div className="p-10 text-center text-slate-500">
                <EmptyState title="No result uploaded for this selection" />
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4 print:gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm print:p-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 print:text-[10px]">Total Score</p>
            <p className="mt-2 text-xl font-black text-slate-900 print:text-sm print:mt-1">{result.summary.totalScore || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm print:p-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 print:text-[10px]">Average Score</p>
            <p className="mt-2 text-xl font-black text-slate-900 print:text-sm print:mt-1">{result.summary.averageScore || 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm print:p-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 print:text-[10px]">Position</p>
            <p className="mt-2 text-xl font-black text-slate-900 print:text-sm print:mt-1">{result.summary.position || 'Pending'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm print:p-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 print:text-[10px]">Attendance</p>
            <p className="mt-2 text-xl font-black text-slate-900 print:text-sm print:mt-1">{result.summary.attendance || 'Pending'}</p>
          </div>
        </section>

        <div className="mt-4 rounded-2xl border border-line bg-white/80 px-4 py-3 text-sm text-slate-700 print:mt-3 print:px-0 print:py-0">
          Principal's Remark: <span className="font-bold text-slate-900">{result.summary.principalRemark || 'Pending'}</span>
        </div>

        <div className="mt-4 hidden justify-between gap-12 text-xs print:flex print-signatures">
          <div className="flex flex-1 flex-col items-center">
            <div className="h-7 w-40 border-b border-slate-900" />
            <span className="mt-1.5 font-bold text-slate-700">Class Teacher's Signature</span>
          </div>
          <div className="flex flex-1 flex-col items-center">
            <div className="h-7 w-40 border-b border-slate-900" />
            <span className="mt-1.5 font-bold text-slate-700">Principal's Signature</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
