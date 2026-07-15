import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ParentDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(user || null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage('');
    // Prefer cached user profile from login to avoid unnecessary auth redirects
    if (user && (user.first_name || user.admissionNumber || user.admission_number)) {
      setProfile(user);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    api('/parent/profile', { authRedirect: false })
      .then((data) => {
        if (!active) return;
        setProfile(data || user || null);
      })
      .catch((err) => {
        if (!active) return;
        const forbiddenMessage = 'You do not have access to this resource';
        if (err?.status === 403 || err?.message === forbiddenMessage) {
          setMessage('');
        } else {
          setMessage(err.message || 'Unable to load student details.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <section className="space-y-4">
      <header className="space-y-1.5">
        <h1 className="text-2xl max-[760px]:text-xl font-bold text-slate-900">Parent Dashboard</h1>
        <p className="text-xs text-slate-500">Access your child's profile, class, and exam result information.</p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
          Loading student information...
        </div>
      ) : message ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-red-700">
          {message}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              {profile?.passport_path ? (
                <img
                  src={assetUrl(profile.passport_path)}
                  alt="Student passport"
                  className="h-16 w-16 rounded-xl object-cover border border-slate-200"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-xl bg-slate-200 text-xl font-bold text-slate-700">
                  {profile?.first_name?.[0] || 'S'}
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Student</p>
                <h2 className="text-base font-bold text-slate-900">{profile?.first_name} {profile?.last_name}</h2>
                <p className="text-xs text-slate-500">{profile?.admissionNumber || profile?.admission_number}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2.5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Class</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{profile?.class_name || 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Parent contact</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">{profile?.parent_name || 'N/A'}</p>
                <p className="text-xs text-slate-500">{profile?.parent_phone || profile?.parent_email || 'No contact available'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">What to do next</h3>
            <p className="mt-2 text-xs text-slate-500">
              View the latest results for your child or return to their profile details at any time.
            </p>
            <Link
              to="/parent/result"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-800"
            >
              View Result
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
