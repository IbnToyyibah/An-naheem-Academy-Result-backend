import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { BookOpen, LayoutDashboard, LogOut, Printer, Settings, UserRound, LockKeyhole, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const adminLinks = [
  ['Dashboard', '/admin', LayoutDashboard],
  ['Students', '/admin/students', UserRound],
  ['Results', '/admin/results', BookOpen],
  ['Settings', '/admin/settings', Settings]
];

const parentLinks = [
  ['Dashboard', '/parent', LayoutDashboard],
  ['Profile', '/parent/profile', UserRound],
  ['Result', '/parent/result', Printer]
];

export default function Layout({ role }) {
  const { logout } = useAuth();
  const links = role === 'admin' ? adminLinks : parentLinks;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const linkClass = ({ isActive }) =>
    [
      'flex items-center gap-2.5 rounded-[7px] px-3 py-[11px] font-bold text-[#344054] text-sm transition hover:bg-primary-soft hover:text-primary-dark',
      isActive ? 'bg-primary-soft text-primary-dark' : ''
    ].join(' ');

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <div className="grid min-h-screen min-w-0 grid-cols-[260px_1fr] max-[760px]:grid-cols-1">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="hidden max-[760px]:flex fixed top-4 left-4 z-50 items-center justify-center p-2 rounded-[7px] bg-primary text-white hover:bg-primary-dark transition"
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay for mobile menu */}
      {mobileMenuOpen && (
        <div
          className="hidden max-[760px]:block fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`sticky top-0 flex h-screen flex-col gap-[18px] border-r border-line bg-white p-[18px] max-[760px]:static max-[760px]:h-auto max-[760px]:p-4 max-[760px]:fixed max-[760px]:left-0 max-[760px]:top-0 max-[760px]:w-64 max-[760px]:z-40 max-[760px]:transform max-[760px]:transition-transform max-[760px]:duration-300 ${
        mobileMenuOpen ? 'max-[760px]:translate-x-0' : 'max-[760px]:-translate-x-full'
      }`}>
        <Link 
          className="flex flex-col items-center justify-center gap-1 px-0 pb-2 pt-0 text-center" 
          to={role === 'admin' ? '/admin' : '/parent'}
          onClick={handleNavClick}
        >
          <span className="mb-1 grid h-20 w-20 place-items-center overflow-hidden">
            <img className="block h-full w-full object-contain" src="/Annaheem.jpeg.png" alt="Annaheem Academy logo" />
          </span>
          <span className="text-xs font-black leading-tight text-ink">AN-NAHEEM ACADEMY</span>
          <span className="text-[11px] font-extrabold text-muted">School Results</span>
        </Link>
        <nav className="grid gap-2 max-[760px]:grid-cols-1">
          {links.map(([label, to, Icon]) => (
            <NavLink 
              className={linkClass} 
              key={to} 
              to={to} 
              end={to === '/admin' || to === '/parent'}
              onClick={handleNavClick}
            >
              <Icon size={16} />
              <span className="text-sm">{label}</span>
            </NavLink>
          ))}
        </nav>
        <button 
          className="mt-auto flex w-full items-center gap-2.5 rounded-[7px] border-0 bg-transparent px-3 py-[11px] font-bold text-[#344054] text-sm transition hover:bg-primary-soft hover:text-primary-dark" 
          onClick={() => {
            logout();
            handleNavClick();
          }}
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </aside>
      <main className="min-w-0 overflow-x-hidden p-6 max-[760px]:p-3 max-[520px]:p-2">
        <Outlet />
      </main>
    </div>
  );
}
