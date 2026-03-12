import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../api.js';
import { fmtBRL } from '../../utils.js';
import { SectionTitle, SelectInput, TextInput } from './ui.jsx';

function normalizeSearchText(value) {
  return String(value ?? '')
    .replace(/,/g, '.')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9./\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function isNumericToken(value) {
  return /^\d+(?:[.,]\d+)?$/.test(String(value ?? '').trim());
}

function normalizeNumericToken(value) {
  const token = String(value ?? '').trim().replace(',', '.');
  if (!token) return '';
  if (/^\d+\.\d+$/.test(token)) {
    const [intPart, decPart] = token.split('.');
    const cleanDec = decPart.replace(/0+$/g, '');
    return cleanDec ? `${intPart}.${cleanDec}` : intPart;
  }
  return token;
}

function smallTypoMatch(a, b) {
  const maxDistance = a.length >= 7 ? 2 : 1;
  if (Math.abs(a.length - b.length) > maxDistance) return false;

  let prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return false;
    [prev, curr] = [curr, prev];
  }

  return prev[b.length] <= maxDistance;
}

function hasSingleAdjacentSwap(a, b) {
  if (a.length !== b.length || a.length < 4) return false;
  const diff = [];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diff.push(i);
    if (diff.length > 2) return false;
  }
  if (diff.length !== 2) return false;
  const [i, j] = diff;
  return j === i + 1 && a[i] === b[j] && a[j] === b[i];
}

function tokenMatches(queryToken, candidateToken) {
  if (!queryToken || !candidateToken) return false;
  if (candidateToken.includes(queryToken)) return true;

  const numericToken = isNumericToken(queryToken) || isNumericToken(candidateToken);
  if (numericToken) {
    const queryNorm = normalizeNumericToken(queryToken);
    const candidateNorm = normalizeNumericToken(candidateToken);
    if (queryNorm && candidateNorm && queryNorm === candidateNorm) return true;

    const queryDigits = digitsOnly(queryToken);
    const candidateDigits = digitsOnly(candidateToken);
    if (queryDigits.length >= 4 && candidateDigits.includes(queryDigits)) return true;
    return false;
  }

  if (hasSingleAdjacentSwap(queryToken, candidateToken)) return true;
  if (queryToken.length < 4 || candidateToken.length < 4) return false;
  return smallTypoMatch(queryToken, candidateToken);
}

function buildSaleSearchDoc(sale, fmtDate, todayIso) {
  const installments = Array.isArray(sale.installments) ? sale.installments : [];
  const today = todayIso();

  let hasPaid = false;
  let hasPending = false;
  let hasOverdue = false;
  let hasBillOverdue = false;
  let hasCancelPhase = false;

  for (const installment of installments) {
    const paid = String(installment.status || '') === 'paid' || !!installment.paid_date;
    if (paid) {
      hasPaid = true;
      continue;
    }

    const billOverdue = Number(installment.bill_overdue || 0) === 1;
    const due = String(installment.due_date || '').slice(0, 10);
    const overdueAuto = String(installment.status || '') === 'overdue' || (Boolean(due) && due < today);
    const pending = !billOverdue && !overdueAuto;

    if (billOverdue) hasBillOverdue = true;
    if (overdueAuto || billOverdue) hasOverdue = true;
    if (pending) hasPending = true;
    if (Number(installment.cancellation_phase || 0) === 1 && billOverdue) hasCancelPhase = true;
  }

  const saleDateIso = String(sale.sale_date || '').slice(0, 10);
  const saleDateBr = fmtDate(saleDateIso);
  const saleDateDigits = digitsOnly(saleDateBr || saleDateIso);

  const numberTermsFrom = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return [];
    return [String(number), number.toFixed(2), number.toFixed(2).replace('.', ','), fmtBRL(number), digitsOnly(fmtBRL(number))];
  };

  const numericTerms = [
    ...numberTermsFrom(sale.base_value),
    ...numberTermsFrom(sale.total_commission),
    ...numberTermsFrom(sale.commission_percentage),
    ...numberTermsFrom(sale.unit_value),
    ...numberTermsFrom(sale.credit_generated)
  ];

  const quotaTerms = Array.isArray(sale.quotas_values)
    ? sale.quotas_values.flatMap((value) => numberTermsFrom(value))
    : [];

  const keywords = [
    'venda',
    'cliente',
    'consultor',
    'produto',
    'valor',
    'base',
    'comissao',
    'parcela',
    'parcelas',
    hasPending ? 'pendente pendentes' : '',
    hasPaid ? 'paga pago pagas pagos quitada quitado' : '',
    hasOverdue ? 'atrasada atrasado atrasadas atrasados vencida vencido em atraso' : '',
    hasBillOverdue ? 'boleto atrasado boleto em aberto' : '',
    hasCancelPhase ? 'fase cancelamento' : ''
  ].join(' ');

  const rawParts = [
    sale.client_name,
    sale.client_number,
    sale.consultant_name,
    sale.product,
    saleDateIso,
    saleDateBr,
    saleDateDigits,
    digitsOnly(sale.client_number || ''),
    ...numericTerms,
    ...quotaTerms,
    keywords
  ];

  const raw = rawParts.join(' ');
  const text = normalizeSearchText(raw);
  const digitTokens = rawParts.map((part) => digitsOnly(part)).filter(Boolean);
  const tokens = text.split(' ').filter(Boolean);

  return { text, tokens, digitTokens };
}

function matchesSaleQuery(searchDoc, query) {
  const queryTokens = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!queryTokens.length) return true;

  return queryTokens.every((queryToken) => {
    if (searchDoc.text.includes(queryToken)) return true;
    if (digitsOnly(queryToken) && searchDoc.digitTokens.some((candidate) => candidate.includes(digitsOnly(queryToken)))) return true;
    return searchDoc.tokens.some((candidateToken) => tokenMatches(queryToken, candidateToken));
  });
}

export function SalesView({ sales, isAdmin, onNew, onDetails, fmtDate, todayIso }) {
  const [query, setQuery] = useState('');

  const salesIndex = useMemo(
    () => sales.map((sale) => ({ sale, searchDoc: buildSaleSearchDoc(sale, fmtDate, todayIso) })),
    [sales, fmtDate, todayIso]
  );

  const filtered = useMemo(() => {
    if (!query) return sales;
    return salesIndex
      .filter(({ searchDoc }) => matchesSaleQuery(searchDoc, query))
      .map(({ sale }) => sale);
  }, [query, sales, salesIndex]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xl font-semibold">Vendas</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Clique em uma linha para ver detalhes.</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca livre: nome, produto, valor, data, status, número..."
            className="w-72 max-w-full rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-white/10 dark:bg-white/5"
          />
          <button onClick={onNew} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-600/20">
            <Plus className="h-4 w-4" />
            Nova venda
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                {isAdmin && <th className="px-4 py-3 text-left">Consultor</th>}
                <th className="px-4 py-3 text-left">Produto</th>
                <th className="px-4 py-3 text-left">Cotas</th>
                <th className="px-4 py-3 text-right">Base</th>
                <th className="px-4 py-3 text-right">Comissão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/10">
              {filtered.map((sale) => (
                <tr key={sale.id} onClick={() => onDetails(sale)} className="cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/5">
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(sale.sale_date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{sale.client_name}</span>
                      {sale.client_number ? <span className="text-xs text-slate-500 dark:text-slate-400">({sale.client_number})</span> : null}
                    </div>
                  </td>
                  {isAdmin && <td className="px-4 py-3">{sale.consultant_name}</td>}
                  <td className="px-4 py-3">{sale.product}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {Array.isArray(sale.quotas_values) && sale.quotas_values.length
                      ? <div className="max-w-[420px] truncate" title={sale.quotas_values.map(fmtBRL).join(' | ')}>{sale.quotas_values.map(fmtBRL).join(' | ')}</div>
                      : `${Math.max(1, Number(sale.quotas || 1))}x ${fmtBRL(sale.unit_value || 0)}`}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{fmtBRL(sale.base_value)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtBRL(sale.total_commission)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    Nenhuma venda encontrada.
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

export function ConsultantsView({ consultants, onReload, UsersIcon }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.createConsultant({ name, email, active: true });
      setName('');
      setEmail('');
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={UsersIcon} title="Consultores" subtitle="Cadastre e mantenha sua equipe organizada." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-xl dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 font-semibold">Novo consultor</div>
          <form onSubmit={add} className="space-y-4">
            <TextInput label="Nome" required value={name} onChange={setName} />
            <TextInput label="Email" value={email} onChange={setEmail} />
            <button disabled={saving} className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-600/20 disabled:opacity-60">
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-xl dark:border-white/10 dark:bg-white/5 lg:col-span-2">
          <div className="border-b border-slate-200/60 px-6 py-4 font-semibold dark:border-white/10">Lista</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-white/10">
                {consultants.map((consultant) => (
                  <tr key={consultant.id} className="hover:bg-slate-100/70 dark:hover:bg-white/5">
                    <td className="px-4 py-3 font-medium">{consultant.name}</td>
                    <td className="px-4 py-3">{consultant.email || '-'}</td>
                    <td className="px-4 py-3">
                      {consultant.active ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-3 py-1 text-xs text-emerald-200">Ativo</span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-slate-500/10 px-3 py-1 text-xs text-slate-400">Inativo</span>
                      )}
                    </td>
                  </tr>
                ))}
                {consultants.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Nenhum consultor cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsView({ consultants, onReload, KeyRoundIcon }) {
  const [selected, setSelected] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedConsultant = useMemo(
    () => consultants.find((consultant) => String(consultant.id) === String(selected)) || null,
    [consultants, selected]
  );

  useEffect(() => {
    setMessage('');
    setPassword('');
    setUsername(selectedConsultant?.login_username || '');
  }, [selectedConsultant]);

  const createLogin = async (event) => {
    event.preventDefault();
    setMessage('');
    if (!selected || !username || !password) return;
    setLoading(true);
    try {
      await api.createConsultantLogin(Number(selected), { username, password });
      setMessage('Sucesso: Login salvo com sucesso.');
      setPassword('');
      await onReload();
    } catch (error) {
      setMessage(error.payload?.error === 'username_taken' ? 'Erro: Usuario ja existe.' : 'Erro: Nao foi possivel salvar o login.');
    } finally {
      setLoading(false);
    }
  };

  const deleteLogin = async () => {
    if (!selected) return;
    const name = selectedConsultant?.name || 'este consultor';
    if (!window.confirm(`Deseja realmente excluir o login de ${name}?`)) return;

    setMessage('');
    setLoading(true);
    try {
      await api.deleteConsultantLogin(Number(selected));
      setMessage('Sucesso: Login excluido.');
      setUsername('');
      setPassword('');
      await onReload();
    } catch (error) {
      setMessage(
        error.payload?.error === 'login_not_found'
          ? 'Aviso: Este consultor nao possui login cadastrado.'
          : 'Erro: Nao foi possivel excluir o login.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={KeyRoundIcon} title="Configuracoes" subtitle="Crie e mantenha logins dos consultores." />

      <div className="max-w-3xl rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-xl dark:border-white/10 dark:bg-white/5">
        <form onSubmit={createLogin} className="space-y-4">
          <SelectInput
            label="Consultor"
            required
            value={selected}
            onChange={setSelected}
            options={consultants.map((consultant) => ({ value: String(consultant.id), label: consultant.name }))}
          />
          <TextInput label="Usuario" required value={username} onChange={setUsername} placeholder="Ex: pedro" />
          <TextInput label="Senha" required value={password} onChange={setPassword} type="password" />

          {selectedConsultant && (
            <div className="text-xs text-slate-600 dark:text-slate-300">
              Login atual: <span className="font-mono">{selectedConsultant.login_username || 'nao cadastrado'}</span>
            </div>
          )}

          {message && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">{message}</div>}

          <div className="flex flex-wrap items-center gap-2">
            <button disabled={loading} className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-600/20 disabled:opacity-60">
              {loading ? 'Salvando...' : 'Salvar login'}
            </button>
            <button
              type="button"
              onClick={deleteLogin}
              disabled={loading || !selected}
              className="rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              Excluir login
            </button>
          </div>

          <div className="text-xs text-slate-600 dark:text-slate-300">
            Depois, o consultor entra pela tela de login com esse usuario e senha.
          </div>
        </form>
      </div>
    </div>
  );
}
