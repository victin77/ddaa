import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { PublicConsultant } from '../types';
import { Shield, UserRound } from 'lucide-react';
import clsx from 'clsx';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'admin' | 'consultant'>('admin');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [list, setList] = useState<PublicConsultant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    api.get('/public/consultants').then((r) => setList(r.data));
  }, []);

  useEffect(() => {
    if (mode === 'admin') {
      setUsername('admin');
      setPassword('');
    } else {
      setUsername('');
      setPassword('');
    }
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-bg">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent grid place-items-center font-extrabold text-white text-2xl shadow-glow">
            R
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Painel RACON</h1>
            <p className="text-muted text-sm mt-1">
              Acompanhe suas comissões e suba no ranking
            </p>
          </div>
        </div>

        <div className="surface p-6">
          <div className="relative grid grid-cols-2 gap-2 p-1 rounded-full bg-bg-elev mb-5">
            <span
              aria-hidden
              className="absolute top-1 bottom-1 rounded-full bg-accent shadow-glow transition-all duration-300 ease-out"
              style={{
                width: 'calc(50% - 6px)',
                left: mode === 'admin' ? '4px' : 'calc(50% + 2px)',
              }}
            />
            <button
              type="button"
              onClick={() => setMode('admin')}
              className={clsx(
                'relative z-10 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-colors',
                mode === 'admin' ? 'text-white' : 'text-muted hover:text-ink'
              )}
            >
              <Shield className="w-4 h-4" /> Admin
            </button>
            <button
              type="button"
              onClick={() => setMode('consultant')}
              className={clsx(
                'relative z-10 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-colors',
                mode === 'consultant' ? 'text-white' : 'text-muted hover:text-ink'
              )}
            >
              <UserRound className="w-4 h-4" /> Consultor
            </button>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'admin' ? (
              <div>
                <label className="label">Usuário</label>
                <input
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <label className="label">Consultor</label>
                <select
                  className="input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                >
                  <option value="">Selecione um consultor…</option>
                  {list
                    .filter((c) => c.username)
                    .map((c) => (
                      <option key={c.id} value={c.username || ''}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Senha</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-2.5 mt-2" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-5">
          {mode === 'admin'
            ? 'Login de administrador. Acesso completo.'
            : 'Você verá apenas suas próprias vendas e o ranking geral.'}
        </p>
      </div>
    </div>
  );
}
