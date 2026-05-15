import { useEffect, useState } from 'react';
import { api, formatBRL } from '../api';
import { Consultant } from '../types';
import { Check, Pencil, Plus, Target, UserCheck, UserX, X } from 'lucide-react';

export default function Consultants() {
  const [list, setList] = useState<Consultant[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState('');

  const reload = () => api.get('/consultants').then((r) => setList(r.data));

  useEffect(() => {
    reload();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSaving(true);
    try {
      await api.post('/consultants', {
        name,
        email,
        monthly_target: Number(target) || 0,
      });
      setName('');
      setEmail('');
      setTarget('');
      reload();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Consultant) => {
    await api.put(`/consultants/${c.id}`, { active: c.active ? 0 : 1 });
    reload();
  };

  const startEditTarget = (c: Consultant) => {
    setEditingId(c.id);
    setEditTarget(String((c.monthly_target ?? 0) || ''));
  };

  const saveEditTarget = async (c: Consultant) => {
    await api.put(`/consultants/${c.id}`, { monthly_target: Number(editTarget) || 0 });
    setEditingId(null);
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-xs text-muted uppercase tracking-wider">Consultores</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Equipe comercial</h1>
      </header>

      <div className="card p-5">
        <h3 className="font-semibold mb-4">Novo consultor</h3>
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">E-mail (opcional)</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Meta mensal (R$)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="100"
              placeholder="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={saving}>
              <Plus className="w-4 h-4" /> Cadastrar
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-elev/60">
                <th className="table-th">Nome</th>
                <th className="table-th">E-mail</th>
                <th className="table-th">Meta mensal</th>
                <th className="table-th">Login</th>
                <th className="table-th">Status</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-overlay/[0.03]">
                  <td className="table-td font-medium">{c.name}</td>
                  <td className="table-td text-ink">{c.email || '—'}</td>
                  <td className="table-td">
                    {editingId === c.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          step="100"
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          className="input w-32 py-1.5 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditTarget(c);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                        <button
                          onClick={() => saveEditTarget(c)}
                          className="icon-btn w-7 h-7 text-success"
                          aria-label="Salvar meta"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="icon-btn w-7 h-7"
                          aria-label="Cancelar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditTarget(c)}
                        className="inline-flex items-center gap-2 text-sm hover:text-accent transition-colors"
                        title="Editar meta"
                      >
                        <Target className="w-3.5 h-3.5 text-muted" />
                        {(c.monthly_target ?? 0) > 0 ? (
                          <span className="font-semibold tabular-nums">
                            {formatBRL(c.monthly_target ?? 0)}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">definir</span>
                        )}
                        <Pencil className="w-3 h-3 text-muted" />
                      </button>
                    )}
                  </td>
                  <td className="table-td">
                    {c.login_username ? (
                      <span className="pill bg-accent/15 text-accent-soft">
                        {c.login_username}
                      </span>
                    ) : (
                      <span className="text-muted text-xs">sem login</span>
                    )}
                  </td>
                  <td className="table-td">
                    {c.active ? (
                      <span className="pill bg-success/15 text-success">Ativo</span>
                    ) : (
                      <span className="pill bg-overlay/10 text-muted">Inativo</span>
                    )}
                  </td>
                  <td className="table-td text-right">
                    <button onClick={() => toggleActive(c)} className="btn-ghost text-xs">
                      {c.active ? (
                        <>
                          <UserX className="w-3.5 h-3.5" /> Desativar
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5" /> Ativar
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td className="table-td text-center text-muted" colSpan={6}>
                    Nenhum consultor cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
