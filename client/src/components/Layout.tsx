import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Settings,
  LogOut,
  Trophy,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Menu,
  X,
  Crown,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../auth';
import { useTheme } from '../contexts/ThemeContext';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

function NavItem({
  to,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: any;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
          isActive
            ? 'bg-overlay/[0.08] text-ink'
            : 'text-muted hover:bg-overlay/[0.04] hover:text-ink'
        )
      }
    >
      <Icon className="w-[18px] h-[18px]" />
      <span className="flex-1">{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

  const crumb =
    location.pathname === '/'
      ? 'Visão geral'
      : location.pathname.startsWith('/vendas')
      ? 'Vendas'
      : location.pathname.startsWith('/ranking')
      ? 'Ranking'
      : location.pathname.startsWith('/consultores')
      ? 'Consultores'
      : location.pathname.startsWith('/configuracoes')
      ? 'Configurações'
      : '';

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/vendas?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <div className="min-h-screen w-full p-2 sm:p-3 lg:p-4 bg-bg flex">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'shrink-0 self-stretch flex flex-col surface p-4 transition-transform',
          'w-[260px]',
          'fixed lg:sticky top-2 sm:top-3 lg:top-4 left-2 sm:left-3 lg:left-0 bottom-2 sm:bottom-3 lg:bottom-auto lg:h-[calc(100vh-32px)] z-50',
          mobileOpen ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0'
        )}
      >
        <div className="flex items-center justify-between gap-2.5 px-1 py-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent grid place-items-center font-extrabold text-white text-lg shadow-glow">
              R
            </div>
            <div>
              <div className="font-bold leading-tight text-[15px]">Racon</div>
              <div className="text-[11px] text-muted -mt-0.5">Painel de Comissões</div>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="icon-btn w-8 h-8 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSearchSubmit} className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar venda…"
            className="w-full pl-9 pr-12 py-2 text-sm bg-bg-elev border border-overlay/[0.05] rounded-xl placeholder:text-muted focus:outline-none focus:border-accent/40"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted bg-overlay/[0.04] rounded-md px-1.5 py-0.5">
            ↵
          </span>
        </form>

        <nav className="flex flex-col gap-1">
          <NavItem to="/" icon={LayoutDashboard} label="Visão geral" onNavigate={() => setMobileOpen(false)} />
          <NavItem to="/vendas" icon={TrendingUp} label="Vendas" onNavigate={() => setMobileOpen(false)} />
          <NavItem to="/ranking" icon={Trophy} label="Ranking" onNavigate={() => setMobileOpen(false)} />
          {isAdmin && (
            <>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted/80 px-3 mt-5 mb-1.5">
                Administrar
              </div>
              <NavItem to="/consultores" icon={Users} label="Consultores" onNavigate={() => setMobileOpen(false)} />
              <NavItem to="/configuracoes" icon={Settings} label="Configurações" onNavigate={() => setMobileOpen(false)} />
            </>
          )}
        </nav>

        <div className="mt-auto">
          <div className="rounded-2xl bg-orange-soft border border-accent/20 p-4 text-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <Crown className="w-4 h-4 text-accent" />
              <span className="font-semibold capitalize">
                {user?.role === 'admin' ? 'Modo Admin' : user?.username}
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed mb-3">
              {user?.role === 'admin'
                ? 'Acesso completo. Você gerencia toda a equipe.'
                : 'Boa venda hoje! Mantenha o ritmo do seu ranking.'}
            </p>
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="btn-primary w-full text-xs py-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 lg:ml-4 surface p-4 sm:p-5 lg:p-7 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-5 lg:mb-7 flex-wrap">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="icon-btn w-9 h-9 lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(-1)}
              className="icon-btn w-9 h-9 hidden sm:grid"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="icon-btn w-9 h-9 hidden sm:grid"
              aria-label="Avançar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-muted ml-2 hidden sm:inline">Racon</span>
            <span className="text-muted hidden sm:inline">›</span>
            <span className="font-medium truncate">{crumb}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
              className="icon-btn"
              aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-soft grid place-items-center text-xs font-bold uppercase text-white">
              {user?.username.slice(0, 2)}
            </div>
            <button
              onClick={() => navigate('/vendas?new=1')}
              className="btn-primary"
            >
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Nova venda</span>
            </button>
          </div>
        </div>

        <div key={location.pathname} className="flex-1 anim-page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
