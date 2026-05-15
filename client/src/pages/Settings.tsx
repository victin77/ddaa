import { useEffect, useState } from 'react';
import { api } from '../api';
import { Consultant } from '../types';
import { Key, Trash2, Copy, Check, Save, UserX, ShieldAlert, Database } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import DangerConfirmDialog from '../components/DangerConfirmDialog';

interface Draft {
  name: string;
  email: string;
}

export default function Settings() {
  const [list, setList] = useState<Consultant[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [usernames, setUsernames] = useState<Record<number, string>>({});
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [generated, setGenerated] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [savingProfile, setSavingProfile] = useState<number | null>(null);
  const [confirmDeleteLogin, setConfirmDeleteLogin] = useState<Consultant | null>(null);
  const [confirmDeleteConsultant, setConfirmDeleteConsultant] = useState<Consultant | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [wipeSalesOpen, setWipeSalesOpen] = useState(false);
  const [wipeAllOpen, setWipeAllOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  const flash = (kind: 'ok' | 'err', msg: string) => {
    setFeedback({ kind, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  const reload = () =>
    api.get('/consultants').then((r) => {
      const rows = r.data as Consultant[];
      setList(rows);
      const next: Record<number, Draft> = {};
      for (const c of rows) {
        next[c.id] = { name: c.name, email: c.email || '' };
      }
      setDrafts(next);
    });

  useEffect(() => {
    reload();
  }, []);

  const isProfileDirty = (c: Consultant) => {
    const d = drafts[c.id];
    if (!d) return false;
    return d.name.trim() !== c.name || (d.email || '') !== (c.email || '');
  };

  const saveProfile = async (c: Consultant) => {
    const d = drafts[c.id];
    if (!d || !d.name.trim()) return;
    setSavingProfile(c.id);
    try {
      await api.put(`/consultants/${c.id}`, {
        name: d.name.trim(),
        email: d.email.trim() || null,
      });
      reload();
    } finally {
      setSavingProfile(null);
    }
  };

  const createLogin = async (c: Consultant) => {
    const r = await api.post(`/consultants/${c.id}/create-login`, {
      username: usernames[c.id] || undefined,
      password: passwords[c.id] || undefined,
    });
    setGenerated({ ...generated, [c.id]: `${r.data.username} / ${r.data.password}` });
    setPasswords({ ...passwords, [c.id]: '' });
    reload();
  };

  const deleteLogin = async (c: Consultant) => {
    try {
      await api.delete(`/consultants/${c.id}/login`);
      setGenerated({ ...generated, [c.id]: '' });
      setConfirmDeleteLogin(null);
      reload();
      flash('ok', `Login de ${c.name} removido.`);
    } catch (e: any) {
      setConfirmDeleteLogin(null);
      flash(
        'err',
        `Falha ao remover login: ${e?.response?.status ?? ''} ${e?.response?.data?.error || e?.message || 'erro'}`
      );
    }
  };

  const wipeSales = async () => {
    setWiping(true);
    try {
      const r = await api.post('/admin/wipe-sales', { confirm: 'APAGAR TODAS AS VENDAS' });
      setWipeSalesOpen(false);
      flash('ok', `${r.data.salesRemoved} ${r.data.salesRemoved === 1 ? 'venda apagada' : 'vendas apagadas'}.`);
      reload();
    } catch (e: any) {
      flash(
        'err',
        `Falha ao apagar vendas: ${e?.response?.status ?? ''} ${e?.response?.data?.error || e?.message || 'erro'}`
      );
    } finally {
      setWiping(false);
    }
  };

  const wipeAll = async () => {
    setWiping(true);
    try {
      const r = await api.post('/admin/wipe-all', { confirm: 'ZERAR SISTEMA' });
      setWipeAllOpen(false);
      flash(
        'ok',
        `Sistema zerado: ${r.data.sales} vendas e ${r.data.consultants} consultores removidos.`
      );
      reload();
    } catch (e: any) {
      flash(
        'err',
        `Falha ao zerar sistema: ${e?.response?.status ?? ''} ${e?.response?.data?.error || e?.message || 'erro'}`
      );
    } finally {
      setWiping(false);
    }
  };

  const deleteConsultant = async (c: Consultant) => {
    try {
      const r = await api.delete(`/consultants/${c.id}`);
      setConfirmDeleteConsultant(null);
      reload();
      flash(
        'ok',
        `${c.name} excluído${r.data?.salesRemoved ? ` (${r.data.salesRemoved} vendas removidas)` : ''}.`
      );
    } catch (e: any) {
      setConfirmDeleteConsultant(null);
      flash(
        'err',
        `Falha ao excluir: ${e?.response?.status ?? ''} ${e?.response?.data?.error || e?.message || 'erro'}`
      );
    }
  };

  const copy = (id: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="text-xs text-muted uppercase tracking-wider">Configurações</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Consultores & acessos</h1>
        <p className="text-sm text-muted mt-1">
          Edite dados do consultor, gerencie credenciais de acesso ou remova-o permanentemente.
        </p>
      </header>

      {feedback && (
        <div
          className={
            feedback.kind === 'ok'
              ? 'card-soft border border-success/30 px-4 py-3 text-sm text-success'
              : 'card-soft border border-danger/30 px-4 py-3 text-sm text-danger'
          }
        >
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((c) => {
          const draft = drafts[c.id] ?? { name: c.name, email: c.email || '' };
          const dirty = isProfileDirty(c);
          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="font-semibold">{c.name}</div>
                {c.login_username ? (
                  <span className="pill bg-accent/15 text-accent-soft">
                    <Key className="w-3 h-3" /> {c.login_username}
                  </span>
                ) : (
                  <span className="pill bg-overlay/10 text-muted">sem login</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="label">Nome</label>
                  <input
                    className="input"
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [c.id]: { ...draft, name: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <label className="label">E-mail</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="opcional"
                    value={draft.email}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [c.id]: { ...draft, email: e.target.value } })
                    }
                  />
                </div>
              </div>

              {dirty && (
                <div className="flex justify-end mb-3">
                  <button
                    onClick={() => saveProfile(c)}
                    className="btn-primary text-xs"
                    disabled={savingProfile === c.id || !draft.name.trim()}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingProfile === c.id ? 'Salvando…' : 'Salvar dados'}
                  </button>
                </div>
              )}

              <div className="border-t border-overlay/[0.05] pt-3">
                <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                  Credenciais
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="label">Usuário</label>
                    <input
                      className="input"
                      placeholder={
                        c.login_username || c.name.toLowerCase().replace(/\s+/g, '.')
                      }
                      value={usernames[c.id] || ''}
                      onChange={(e) =>
                        setUsernames({ ...usernames, [c.id]: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Senha</label>
                    <input
                      className="input"
                      placeholder="(gera automática se vazio)"
                      value={passwords[c.id] || ''}
                      onChange={(e) =>
                        setPasswords({ ...passwords, [c.id]: e.target.value })
                      }
                    />
                  </div>
                </div>

                {generated[c.id] && (
                  <div className="card-soft p-3 mb-3 flex items-center justify-between gap-2">
                    <code className="text-xs font-mono text-accent-soft">{generated[c.id]}</code>
                    <button
                      type="button"
                      className="text-muted hover:text-ink p-1"
                      onClick={() => copy(c.id, generated[c.id])}
                    >
                      {copied === c.id ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2">
                  {c.login_username && (
                    <button
                      onClick={() => setConfirmDeleteLogin(c)}
                      className="btn-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir login
                    </button>
                  )}
                  <button onClick={() => createLogin(c)} className="btn-primary">
                    <Key className="w-3.5 h-3.5" />{' '}
                    {c.login_username ? 'Atualizar login' : 'Criar login'}
                  </button>
                </div>
              </div>

              <div className="border-t border-overlay/[0.05] mt-4 pt-3 flex justify-end">
                <button
                  onClick={() => setConfirmDeleteConsultant(c)}
                  className="inline-flex items-center gap-2 text-xs text-danger hover:underline"
                >
                  <UserX className="w-3.5 h-3.5" />
                  Excluir consultor permanentemente
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 card border border-danger/30 overflow-hidden">
        <div className="px-5 py-4 bg-danger/5 border-b border-danger/20 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-danger" />
          <div className="font-semibold text-danger">Zona de perigo</div>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-overlay/[0.06]">
            <div>
              <div className="font-medium flex items-center gap-2">
                <Database className="w-4 h-4 text-muted" />
                Apagar todas as vendas
              </div>
              <div className="text-xs text-muted mt-1">
                Remove vendas, parcelas e cotas. Consultores e logins permanecem.
              </div>
            </div>
            <button
              className="btn-danger shrink-0"
              onClick={() => setWipeSalesOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" /> Apagar vendas
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-danger/20 bg-danger/5">
            <div>
              <div className="font-medium flex items-center gap-2 text-danger">
                <ShieldAlert className="w-4 h-4" />
                Zerar sistema completamente
              </div>
              <div className="text-xs text-muted mt-1">
                Apaga <span className="text-danger font-medium">tudo</span>: vendas, parcelas, cotas, consultores e logins de consultor. Só o usuário admin permanece.
              </div>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-full bg-danger hover:brightness-110 px-4 py-2 text-sm font-semibold text-white transition shrink-0"
              onClick={() => setWipeAllOpen(true)}
            >
              <ShieldAlert className="w-3.5 h-3.5" /> Zerar sistema
            </button>
          </div>
        </div>
      </div>

      <DangerConfirmDialog
        open={wipeSalesOpen}
        onClose={() => setWipeSalesOpen(false)}
        onConfirm={wipeSales}
        loading={wiping}
        title="Apagar todas as vendas?"
        description={
          <>
            Você vai remover{' '}
            <span className="text-danger font-medium">todas as vendas, parcelas e cotas</span> do
            sistema. Os consultores e logins permanecem cadastrados. Essa ação não pode ser desfeita.
          </>
        }
        requireText="APAGAR TODAS AS VENDAS"
        confirmLabel="Apagar vendas"
      />

      <DangerConfirmDialog
        open={wipeAllOpen}
        onClose={() => setWipeAllOpen(false)}
        onConfirm={wipeAll}
        loading={wiping}
        title="Zerar todo o sistema?"
        description={
          <>
            Você vai apagar <span className="text-danger font-medium">tudo</span> — vendas,
            parcelas, cotas, consultores e logins de consultor. Só o login admin é preservado. Essa
            ação não pode ser desfeita.
          </>
        }
        requireText="ZERAR SISTEMA"
        confirmLabel="Zerar tudo"
      />

      <ConfirmDialog
        open={!!confirmDeleteLogin}
        onClose={() => setConfirmDeleteLogin(null)}
        onConfirm={() => confirmDeleteLogin && deleteLogin(confirmDeleteLogin)}
        title="Remover login?"
        description={
          <>
            O acesso de <span className="text-ink font-medium">{confirmDeleteLogin?.name}</span>{' '}
            será removido. O consultor continua cadastrado, mas não conseguirá mais entrar no
            sistema até receber novas credenciais.
          </>
        }
        confirmLabel="Sim, remover login"
        cancelLabel="Cancelar"
        tone="danger"
      />

      <ConfirmDialog
        open={!!confirmDeleteConsultant}
        onClose={() => setConfirmDeleteConsultant(null)}
        onConfirm={() => confirmDeleteConsultant && deleteConsultant(confirmDeleteConsultant)}
        title="Excluir consultor permanentemente?"
        description={
          <>
            <span className="text-ink font-medium">{confirmDeleteConsultant?.name}</span> será
            removido junto com{' '}
            <span className="text-danger font-medium">
              todas as vendas, parcelas, cotas e o login
            </span>{' '}
            dele. Essa ação não pode ser desfeita.
          </>
        }
        confirmLabel="Sim, excluir tudo"
        cancelLabel="Cancelar"
        tone="danger"
      />
    </div>
  );
}
