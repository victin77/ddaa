import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { Consultant, Sale } from '../types';
import { api, formatBRL, todayISO } from '../api';
import { useAuth } from '../auth';
import { Plus, Trash2 } from 'lucide-react';

const PRODUCTS = ['Imóvel', 'Auto', 'Moto', 'Agro', 'Serviços'];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (s: Sale) => void;
  editing?: Sale | null;
  consultants: Consultant[];
}

interface QuotaInput {
  value: string;
}

export default function SaleFormModal({ open, onClose, onSaved, editing, consultants }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [consultantId, setConsultantId] = useState<number>(
    editing?.consultant_id ?? (isAdmin ? consultants[0]?.id ?? 0 : user?.consultant_id ?? 0)
  );
  const [clientName, setClientName] = useState(editing?.client_name ?? '');
  const [clientNumber, setClientNumber] = useState(editing?.client_number ?? '');
  const [product, setProduct] = useState(editing?.product ?? 'Imóvel');
  const [saleDate, setSaleDate] = useState(editing?.sale_date.slice(0, 10) ?? todayISO());
  const [insurance, setInsurance] = useState<boolean>(!!editing?.insurance);
  const [commissionPct, setCommissionPct] = useState<string>(
    String(editing?.commission_percentage ?? 0.8)
  );
  const [groupQuota, setGroupQuota] = useState<string>(editing?.group_quota ?? '');
  const [quotas, setQuotas] = useState<QuotaInput[]>(
    editing && editing.quotas_list.length > 0
      ? editing.quotas_list.map((q) => ({ value: String(q.value) }))
      : [{ value: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setConsultantId(
        editing?.consultant_id ?? (isAdmin ? consultants[0]?.id ?? 0 : user?.consultant_id ?? 0)
      );
      setClientName(editing?.client_name ?? '');
      setClientNumber(editing?.client_number ?? '');
      setProduct(editing?.product ?? 'Imóvel');
      setSaleDate(editing?.sale_date.slice(0, 10) ?? todayISO());
      setInsurance(!!editing?.insurance);
      setCommissionPct(String(editing?.commission_percentage ?? 0.8));
      setGroupQuota(editing?.group_quota ?? '');
      setQuotas(
        editing && editing.quotas_list.length > 0
          ? editing.quotas_list.map((q) => ({ value: String(q.value) }))
          : [{ value: '' }]
      );
      setError('');
    }
  }, [open, editing, consultants, isAdmin, user]);

  const baseValue = useMemo(
    () => quotas.reduce((s, q) => s + (Number(q.value) || 0), 0),
    [quotas]
  );

  const totalCommission = useMemo(
    () => Math.round(baseValue * (Number(commissionPct) / 100) * 100) / 100,
    [baseValue, commissionPct]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload: any = {
        consultant_id: consultantId,
        client_name: clientName,
        client_number: clientNumber || null,
        product,
        sale_date: saleDate,
        insurance: insurance ? 1 : 0,
        commission_percentage: Number(commissionPct),
        group_quota: groupQuota.trim() || null,
        quotas_list: quotas
          .filter((q) => Number(q.value) > 0)
          .map((q) => ({ value: Number(q.value) })),
        base_value: baseValue,
        quotas: quotas.filter((q) => Number(q.value) > 0).length || 1,
      };
      const r = editing
        ? await api.put(`/sales/${editing.id}`, payload)
        : await api.post('/sales', payload);
      onSaved(r.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar venda' : 'Nova venda'}
      size="lg"
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Consultor</label>
            <select
              className="input"
              value={consultantId}
              onChange={(e) => setConsultantId(Number(e.target.value))}
              disabled={!isAdmin}
            >
              {(isAdmin ? consultants : consultants.filter((c) => c.id === user?.consultant_id)).map(
                (c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label className="label">Produto</label>
            <select
              className="input"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
            >
              {PRODUCTS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Cliente</label>
            <input
              className="input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Nº do cliente</label>
            <input
              className="input"
              value={clientNumber || ''}
              onChange={(e) => setClientNumber(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Data da venda</label>
            <input
              type="date"
              className="input"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">% Comissão</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Grupo / Nº da cota</label>
            <input
              type="text"
              className="input"
              placeholder="Ex: G4521 / C087"
              value={groupQuota}
              onChange={(e) => setGroupQuota(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                checked={insurance}
                onChange={(e) => setInsurance(e.target.checked)}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm">Venda com seguro</span>
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Cotas</label>
            <button
              type="button"
              onClick={() => setQuotas([...quotas, { value: '' }])}
              className="btn-ghost text-xs"
            >
              <Plus className="w-3 h-3" /> adicionar cota
            </button>
          </div>
          <div className="card-soft p-3 flex flex-col gap-2 max-h-60 overflow-y-auto">
            {quotas.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted w-10">#{i + 1}</span>
                <input
                  type="number"
                  step="0.01"
                  className="input flex-1"
                  placeholder="Valor da cota"
                  value={q.value}
                  onChange={(e) => {
                    const next = [...quotas];
                    next[i].value = e.target.value;
                    setQuotas(next);
                  }}
                />
                <button
                  type="button"
                  className="text-muted hover:text-danger p-1.5"
                  onClick={() => setQuotas(quotas.filter((_, idx) => idx !== i))}
                  disabled={quotas.length <= 1}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="card-soft p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Base</div>
              <div className="font-semibold mt-0.5">{formatBRL(baseValue)}</div>
            </div>
            <div className="card-soft p-3 border border-accent/30">
              <div className="text-[10px] uppercase tracking-wider text-muted">Comissão</div>
              <div className="font-semibold mt-0.5 text-accent-soft">
                {formatBRL(totalCommission)}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar venda'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
