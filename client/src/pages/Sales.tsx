import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { api, formatBRL, formatDate } from '../api';
import { Consultant, Sale } from '../types';
import { fuzzyMatch } from '../components/fuzzy';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../auth';
import { Search, Plus, Upload, Download, X } from 'lucide-react';
import clsx from 'clsx';
import SaleFormModal from './SaleFormModal';
import SaleDetailsModal from './SaleDetailsModal';
import ImportPreviewModal from './ImportPreviewModal';

export default function Sales() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [sales, setSales] = useState<Sale[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [q, setQ] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [selected, setSelected] = useState<Sale | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [toast, setToast] = useState<string>('');
  const [params, setParams] = useSearchParams();
  const [dateStart, setDateStart] = useState<string>(params.get('start') ?? '');
  const [dateEnd, setDateEnd] = useState<string>(params.get('end') ?? '');

  const datePresets: { key: string; label: string; range: () => [string, string] }[] = [
    {
      key: 'today',
      label: 'Hoje',
      range: () => [dayjs().format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
    },
    {
      key: '7d',
      label: '7 dias',
      range: () => [
        dayjs().subtract(6, 'day').format('YYYY-MM-DD'),
        dayjs().format('YYYY-MM-DD'),
      ],
    },
    {
      key: '30d',
      label: '30 dias',
      range: () => [
        dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
        dayjs().format('YYYY-MM-DD'),
      ],
    },
    {
      key: 'month',
      label: 'Este mês',
      range: () => [
        dayjs().startOf('month').format('YYYY-MM-DD'),
        dayjs().endOf('month').format('YYYY-MM-DD'),
      ],
    },
  ];

  const activePreset = useMemo(() => {
    if (!dateStart || !dateEnd) return null;
    return datePresets.find((p) => {
      const [s, e] = p.range();
      return s === dateStart && e === dateEnd;
    })?.key ?? null;
  }, [dateStart, dateEnd]);

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null);
      setOpenForm(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
    const qParam = params.get('q');
    if (qParam) {
      setQ(qParam);
      params.delete('q');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (dateStart) next.set('start', dateStart);
    else next.delete('start');
    if (dateEnd) next.set('end', dateEnd);
    else next.delete('end');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStart, dateEnd]);

  const applyPreset = (key: string) => {
    const preset = datePresets.find((p) => p.key === key);
    if (!preset) return;
    const [s, e] = preset.range();
    setDateStart(s);
    setDateEnd(e);
  };

  const clearDates = () => {
    setDateStart('');
    setDateEnd('');
  };

  const reload = async () => {
    const r = await api.get('/sales');
    setSales(r.data);
    if (selected) {
      const fresh = r.data.find((s: Sale) => s.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  };

  useEffect(() => {
    reload();
    api.get('/consultants').then((r) => setConsultants(r.data));
  }, []);

  const filtered = useMemo(() => {
    let base = sales;
    if (dateStart || dateEnd) {
      const start = dateStart ? dayjs(dateStart).startOf('day') : null;
      const end = dateEnd ? dayjs(dateEnd).endOf('day') : null;
      base = base.filter((s) => {
        const d = dayjs(s.sale_date);
        if (start && d.isBefore(start)) return false;
        if (end && d.isAfter(end)) return false;
        return true;
      });
    }
    if (!q.trim()) return base;
    return base.filter((s) => {
      const big = `${s.client_name} ${s.consultant_name} ${s.product} ${s.client_number ?? ''} ${
        s.sale_date
      } ${s.base_value} ${s.total_commission}`;
      const statusBucket = s.installments.some((i) => i.status === 'overdue' || i.bill_overdue)
        ? 'atrasado atraso'
        : s.installments.every((i) => i.status === 'paid')
        ? 'pago'
        : 'pendente';
      return fuzzyMatch(q, big + ' ' + statusBucket);
    });
  }, [sales, q, dateStart, dateEnd]);

  const handleSave = (s: Sale) => {
    reload();
    setToast('Venda salva ✓');
    setTimeout(() => setToast(''), 2500);
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/sales/${id}`);
    setSales(sales.filter((s) => s.id !== id));
    setToast('Venda excluída');
    setTimeout(() => setToast(''), 2500);
  };

  const handleImport = (file: File) => {
    setImportFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExport = async () => {
    const r = await api.get(`/export/xlsx?scope=${isAdmin ? 'all' : 'me'}`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `racon-comissoes.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="h-page">Vendas</h1>
          <p className="text-sm text-muted mt-1">Cadastre, edite e acompanhe cada negócio</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              />
              <button
                className="btn-ghost"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4" /> Importar Excel
              </button>
            </>
          )}
          <button className="btn-ghost" onClick={handleExport}>
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setOpenForm(true);
            }}
          >
            <Plus className="w-4 h-4" /> Nova venda
          </button>
        </div>
      </header>

      <div className="card-tight flex flex-col gap-3">
        <div className="flex items-center gap-2 bg-bg-elev rounded-xl px-3.5 py-2.5">
          <Search className="w-4 h-4 text-muted" />
          <input
            className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted"
            placeholder="Buscar por cliente, consultor, produto, valor, status…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button onClick={() => setQ('')} className="text-xs text-muted hover:text-ink">
              limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {datePresets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={clsx(
                  'pill text-xs transition-colors',
                  activePreset === p.key
                    ? 'bg-accent text-white'
                    : 'bg-overlay/[0.05] text-muted hover:text-ink hover:bg-overlay/[0.10]'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="input w-auto py-1.5 text-xs"
              aria-label="Data inicial"
            />
            <span className="text-muted text-xs">até</span>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="input w-auto py-1.5 text-xs"
              aria-label="Data final"
            />
            {(dateStart || dateEnd) && (
              <button
                type="button"
                onClick={clearDates}
                className="icon-btn w-7 h-7"
                aria-label="Limpar filtro de data"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-elev/60">
                <th className="table-th">Cliente</th>
                <th className="table-th">Consultor</th>
                <th className="table-th">Produto</th>
                <th className="table-th">Data</th>
                <th className="table-th">Base</th>
                <th className="table-th">Comissão</th>
                <th className="table-th">Cotas</th>
                <th className="table-th">Parcelas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const paid = s.installments.filter((i) => i.status === 'paid').length;
                const overdue = s.installments.some(
                  (i) => i.status === 'overdue' || i.bill_overdue
                );
                const cancel = s.installments.some((i) => i.cancellation_phase);
                return (
                  <tr
                    key={s.id}
                    className="hover:bg-overlay/[0.03] cursor-pointer"
                    onClick={() => setSelected(s)}
                  >
                    <td className="table-td">
                      <div className="font-medium">{s.client_name}</div>
                      {s.client_number && (
                        <div className="text-xs text-muted">#{s.client_number}</div>
                      )}
                    </td>
                    <td className="table-td text-ink">{s.consultant_name}</td>
                    <td className="table-td text-ink">{s.product}</td>
                    <td className="table-td text-ink">{formatDate(s.sale_date)}</td>
                    <td className="table-td">{formatBRL(s.base_value)}</td>
                    <td className="table-td font-semibold text-accent-soft">
                      {formatBRL(s.total_commission)}
                    </td>
                    <td className="table-td text-ink">{s.quotas}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">
                          {paid}/{s.installments.length}
                        </span>
                        {cancel ? (
                          <span className="pill bg-danger/20 text-danger">Cancelamento</span>
                        ) : overdue ? (
                          <StatusPill status="overdue" />
                        ) : paid === s.installments.length ? (
                          <StatusPill status="paid" />
                        ) : (
                          <StatusPill status="pending" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className="table-td text-center text-muted" colSpan={8}>
                    Nenhuma venda encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SaleFormModal
        open={openForm}
        onClose={() => setOpenForm(false)}
        onSaved={handleSave}
        editing={editing}
        consultants={consultants}
      />
      <SaleDetailsModal
        open={!!selected}
        sale={selected}
        onClose={() => setSelected(null)}
        onUpdated={(s) => {
          setSelected(s);
          reload();
        }}
        onDelete={handleDelete}
        onEdit={(s) => {
          setSelected(null);
          setEditing(s);
          setOpenForm(true);
        }}
        canEdit={true}
        canDelete={isAdmin || !!(user?.consultant_id && selected?.consultant_id === user.consultant_id)}
      />
      <ImportPreviewModal
        open={!!importFile}
        file={importFile}
        consultants={consultants}
        onClose={() => setImportFile(null)}
        onDone={({ ok, failed }) => {
          reload();
          if (failed === 0) {
            setToast(`${ok} ${ok === 1 ? 'venda importada' : 'vendas importadas'} com sucesso`);
          } else {
            setToast(`${ok} importadas · ${failed} com falha`);
          }
          setTimeout(() => setToast(''), 4000);
        }}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 surface px-4 py-3 text-sm shadow-glow border border-accent/30">
          {toast}
        </div>
      )}
    </div>
  );
}
