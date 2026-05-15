import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { Sale, Installment, SaleQuota } from '../types';
import { api, formatBRL, formatDate } from '../api';
import { StatusPill } from '../components/StatusPill';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  onClose: () => void;
  sale: Sale | null;
  onUpdated: (s: Sale) => void;
  onDelete: (id: number) => void;
  onEdit: (s: Sale) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function SaleDetailsModal({
  open,
  onClose,
  sale,
  onUpdated,
  onDelete,
  onEdit,
  canEdit,
  canDelete,
}: Props) {
  const [tab, setTab] = useState<'parcelas' | 'cotas'>('parcelas');
  const [savingInstallments, setSavingInstallments] = useState(false);
  const [installments, setInstallments] = useState<Installment[]>(sale?.installments ?? []);
  const [quotas, setQuotas] = useState<SaleQuota[]>(sale?.quotas_list ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (sale) {
      setInstallments(sale.installments ?? []);
      setQuotas(sale.quotas_list ?? []);
    }
  }, [sale?.id, sale?.installments, sale?.quotas_list]);

  if (!sale) return null;

  const updateInstallment = (id: number, patch: Partial<Installment>) => {
    setInstallments(installments.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const saveInstallments = async () => {
    setSavingInstallments(true);
    try {
      const r = await api.put(`/sales/${sale.id}/installments`, { installments });
      onUpdated(r.data);
      setInstallments(r.data.installments);
    } finally {
      setSavingInstallments(false);
    }
  };

  const saveQuotas = async () => {
    const r = await api.put(`/sales/${sale.id}/quotas`, {
      quotas: quotas.map((q, i) => ({ number: i + 1, value: q.value })),
    });
    onUpdated(r.data);
    setQuotas(r.data.quotas_list);
    setInstallments(r.data.installments);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Venda #${sale.id} · ${sale.client_name}`} size="xl">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <div className="card-soft p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">Consultor</div>
          <div className="text-sm font-medium mt-0.5">{sale.consultant_name}</div>
        </div>
        <div className="card-soft p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">Produto</div>
          <div className="text-sm font-medium mt-0.5">{sale.product}</div>
        </div>
        <div className="card-soft p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted">Data</div>
          <div className="text-sm font-medium mt-0.5">{formatDate(sale.sale_date)}</div>
        </div>
        <div className="card-soft p-3 border border-accent/30">
          <div className="text-[10px] uppercase tracking-wider text-muted">Comissão</div>
          <div className="text-sm font-bold text-accent-soft mt-0.5">
            {formatBRL(sale.total_commission)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm">
        <div>
          <span className="text-muted text-xs">Nº cliente: </span>
          <span>{sale.client_number || '—'}</span>
        </div>
        <div>
          <span className="text-muted text-xs">Cotas: </span>
          <span>{sale.quotas}</span>
        </div>
        <div>
          <span className="text-muted text-xs">Base: </span>
          <span>{formatBRL(sale.base_value)}</span>
        </div>
        <div>
          <span className="text-muted text-xs">Seguro: </span>
          <span>{sale.insurance ? 'Sim' : 'Não'}</span>
        </div>
      </div>

      <div className="relative flex gap-1 p-1 bg-bg-elev rounded-full mb-4 w-fit">
        {(['parcelas', 'cotas'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={clsx(
              'relative z-10 px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors',
              tab === t ? 'text-white' : 'text-muted hover:text-ink'
            )}
          >
            {t}
          </button>
        ))}
        <span
          className="absolute top-1 bottom-1 rounded-full bg-accent shadow-glow transition-all duration-300 ease-out"
          style={{
            left: tab === 'parcelas' ? '4px' : 'calc(50% + 0px)',
            width: 'calc(50% - 4px)',
          }}
        />
      </div>

      {tab === 'parcelas' && (
        <div key="parcelas" className="flex flex-col gap-2 anim-fade anim-stagger">
          {installments.map((i) => (
            <div
              key={i.id}
              className="card-soft p-3 flex flex-wrap items-center gap-3 border border-overlay/[0.05]"
            >
              <div className="w-12 text-center">
                <div className="text-[10px] text-muted uppercase">Parcela</div>
                <div className="font-bold">{i.number}ª</div>
              </div>
              <div className="flex-1 min-w-[120px]">
                <div className="text-[10px] text-muted uppercase">Valor</div>
                <div className="font-semibold">{formatBRL(i.value)}</div>
              </div>
              <div className="flex-1 min-w-[120px]">
                <div className="text-[10px] text-muted uppercase">Vencimento</div>
                <input
                  type="date"
                  className="input"
                  value={(i.due_date ?? '').slice(0, 10)}
                  onChange={(e) => updateInstallment(i.id, { due_date: e.target.value })}
                />
              </div>
              <div className="min-w-[160px]">
                <div className="text-[10px] text-muted uppercase">Status</div>
                <select
                  className="input"
                  value={i.bill_overdue ? 'bill_overdue' : i.status}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'bill_overdue') {
                      updateInstallment(i.id, { bill_overdue: 1, status: 'pending' });
                    } else {
                      updateInstallment(i.id, {
                        bill_overdue: 0,
                        status: v as Installment['status'],
                      });
                    }
                  }}
                >
                  <option value="pending">Pendente</option>
                  <option value="bill_overdue">Boleto atrasado</option>
                  <option value="paid">Paga</option>
                  <option value="overdue">Atrasada</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={i.status} billOverdue={!!i.bill_overdue} />
                {i.cancellation_phase && (
                  <span className="pill bg-danger/20 text-danger">
                    <AlertTriangle className="w-3 h-3" />
                    Fase de cancelamento
                  </span>
                )}
              </div>
            </div>
          ))}
          <div className="flex justify-end mt-2">
            <button
              type="button"
              className="btn-primary"
              onClick={saveInstallments}
              disabled={savingInstallments}
            >
              {savingInstallments ? 'Salvando…' : 'Salvar parcelas'}
            </button>
          </div>
        </div>
      )}

      {tab === 'cotas' && (
        <div key="cotas" className="flex flex-col gap-2 anim-fade">
          {quotas.length === 0 && (
            <div className="text-sm text-muted">Esta venda ainda não tem cotas individuais.</div>
          )}
          {quotas.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted w-10">#{i + 1}</span>
              <input
                type="number"
                step="0.01"
                className="input flex-1"
                value={q.value}
                onChange={(e) =>
                  setQuotas(
                    quotas.map((qq, idx) =>
                      idx === i ? { ...qq, value: Number(e.target.value) } : qq
                    )
                  )
                }
              />
              <button
                type="button"
                className="text-muted hover:text-danger p-1.5"
                onClick={() => setQuotas(quotas.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() =>
                setQuotas([...quotas, { id: Date.now(), sale_id: sale.id, number: quotas.length + 1, value: 0 }])
              }
            >
              <Plus className="w-3 h-3" /> nova cota
            </button>
            <button type="button" className="btn-primary" onClick={saveQuotas}>
              Salvar cotas
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-overlay/[0.05]">
        {canDelete && (
          <button
            type="button"
            className="btn-danger"
            onClick={() => setConfirmDelete(true)}
          >
            Excluir
          </button>
        )}
        {canEdit && (
          <button type="button" className="btn-primary" onClick={() => onEdit(sale)}>
            Editar
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(sale.id);
          onClose();
        }}
        title="Excluir esta venda?"
        description={
          <>
            A venda de <span className="text-ink font-medium">{sale.client_name || 'cliente sem nome'}</span>{' '}
            ({formatBRL(sale.base_value)}) será excluída <span className="text-danger font-medium">permanentemente</span>,
            junto com suas parcelas e cotas. Essa ação não pode ser desfeita.
          </>
        }
        confirmLabel="Sim, excluir"
        cancelLabel="Cancelar"
        tone="danger"
      />
    </Modal>
  );
}
