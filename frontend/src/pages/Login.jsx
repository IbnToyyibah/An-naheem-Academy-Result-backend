import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login({ role }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', admissionNumber: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isAdmin = role === 'admin';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const credentials = isAdmin
        ? { username: form.username.trim(), password: form.password }
        : { admissionNumber: form.admissionNumber.trim(), password: form.password.trim() };
      await login(role, credentials);
      navigate(isAdmin ? '/admin' : '/parent');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-[#edf8f6] via-[#f7f8fb] to-[#fff5ed] p-6 max-[520px]:p-3">
      <section className="w-full max-w-[440px] rounded-lg border border-line bg-panel p-[30px] shadow-panel max-[520px]:p-3.5">
        <div className="mb-6 flex items-center gap-3.5">
          <GraduationCap className="text-primary" size={40} />
          <div>
            <h1 className="text-xl font-bold text-black">{isAdmin ? 'Admin Login' : 'Parent Login'}</h1>
            <p className="text-2xl font-extrabold text-blue-900">AN-NAHEEM ACADEMY</p>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-3.5">
          {isAdmin ? (
            <label className="grid gap-[7px] font-bold text-[#344054]">
              Username
              <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </label>
          ) : (
            <label className="grid gap-[7px] font-bold text-[#344054]">
              Admission Number
              <input required placeholder="ANA/JSS1/001a" value={form.admissionNumber} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} />
            </label>
          )}
          <label className="grid gap-[7px] font-bold text-[#344054]">
            Password
            <input type="password" required minLength={isAdmin ? 6 : 4} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          {!isAdmin && <p className="m-0 text-sm font-bold text-muted">Use admission number and default password <span className="font-extrabold">0823</span>.</p>}
          {error && <p className="m-0 font-bold text-accent">{error}</p>}
          <button className="flex items-center justify-center gap-2 rounded-[7px] border-blue-900 bg-blue-900 px-4 py-[11px] font-extrabold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-70" disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" size={18} /> : <LockKeyhole size={18} />}
            <span>Login</span>
          </button>
        </form>

        <Link to={isAdmin ? '/parent-login' : '/admin-login'} className="mt-[18px] block text-center font-extrabold text-primary">
          {isAdmin ? 'Switch to Parent Login' : 'Switch to Admin Login'}
        </Link>
      </section>
    </main>
  );
}
