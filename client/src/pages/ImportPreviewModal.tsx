import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import Modal from '../components/Modal';
import { Consultant } from '../types';
import { api } from '../api';
import { Check, AlertTriangle, UserPlus, Users, Loader2, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  file: File | null;
  consultants: Consultant[];
  onDone: (result: { ok: number; failed: number }) => void;
}

interface ParsedRow {
  consultorRaw: string;
  cliente: string;
  cliente_numero: string | null;
  produto: string;
  sale_date: string;
  base_value: number;
  commission_percentage: number;
  quotas: number;
  group_quota: string | null;
  insurance: 0 | 1;
  vendaIdOriginal: number | null;
}

interface ParsedParcela {
  vendaIdOriginal: number;
  number: number;
  value: number;
  due_date: string;
  status: 'paid' | 'pending' | 'overdue';
  bill_overdue: 0 | 1;
  paid_date: string | null;
}

interface ParsedFile {
  rows: ParsedRow[];
  parcelas: ParsedParcela[];
}

interface GroupState {
  consultorRaw: string;
  count: number;
  rows: ParsedRow[];
  mapping: { kind: 'existing'; consultantId: number } | { kind: 'create' };
  autoMatchedTo: number | null;
}

function normalizeKey(k: string) {
  return k
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getField(row: Record<string, any>, ...names: string[]) {
  const norm = Object.keys(row).reduce<Record<string, any>>((acc, k) => {
    acc[normalizeKey(k)] = row[k];
    return acc;
  }, {});
  for (const n of names) {
    const v = norm[normalizeKey(n)];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function parseDate(raw: any): string {
  if (raw === undefined || raw === null || raw === '') return dayjs().format('YYYY-MM-DD');
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return dayjs(new Date(d.y, d.m - 1, d.d)).format('YYYY-MM-DD');
  }
  return dayjs(raw).format('YYYY-MM-DD');
}

function parseRows(buf: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buf, { type: 'array' });

  const vendasSheetName =
    wb.SheetNames.find((n) => normalizeKey(n) === 'vendas') ?? wb.SheetNames[0];
  const vendasSheet = wb.Sheets[vendasSheetName];
  const rawVendas = XLSX.utils.sheet_to_json<Record<string, any>>(vendasSheet, { defval: '' });

  const rows = rawVendas
    .map((row) => {
      const consultorRaw = String(getField(row, 'consultor', 'consultor_nome', 'vendedor') || '').trim();
      if (!consultorRaw) return null;
      const vendaIdRaw = getField(row, 'venda_id', 'vendaid', 'id');
      const vendaIdOriginal = vendaIdRaw !== undefined && vendaIdRaw !== ''
        ? Number(vendaIdRaw)
        : null;
      return {
        consultorRaw,
        cliente: String(getField(row, 'cliente', 'cliente_nome', 'nome do cliente') || '').trim(),
        cliente_numero: (() => {
          const v = getField(row, 'cliente_numero', 'numero_cliente', 'numero do cliente', 'n cliente');
          return v ? String(v) : null;
        })(),
        produto: String(getField(row, 'produto') || 'Imóvel'),
        sale_date: parseDate(getField(row, 'data', 'data_venda', 'data da venda')),
        base_value: Number(getField(row, 'valor', 'base', 'base_value', 'valor_base', 'base r') || 0),
        commission_percentage: Number(getField(row, 'comissao_pct', 'pct', 'comissao') || 0.8),
        quotas: Number(getField(row, 'cotas', 'qtd_cotas') || 1),
        group_quota: (() => {
          const v = getField(row, 'grupo_cota', 'grupocota', 'grupo', 'grupo_quota');
          return v !== undefined && String(v).trim() !== '' ? String(v).trim() : null;
        })(),
        insurance: (Number(getField(row, 'seguro') || 0) || /sim|s/i.test(String(getField(row, 'seguro') || ''))
          ? 1
          : 0) as 0 | 1,
        vendaIdOriginal: Number.isFinite(vendaIdOriginal as number) ? vendaIdOriginal : null,
      };
    })
    .filter((r): r is ParsedRow => r !== null);

  const parcelasSheetName = wb.SheetNames.find((n) => normalizeKey(n).startsWith('parcela'));
  const parcelas: ParsedParcela[] = [];
  if (parcelasSheetName) {
    const ws = wb.Sheets[parcelasSheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
    for (const row of raw) {
      const vendaIdRaw = getField(row, 'venda_id', 'vendaid');
      const numberRaw = getField(row, 'parcela', 'parcelan', 'parcela_no', 'numero', 'parcela_numero');
      const vendaId = Number(vendaIdRaw);
      const number = Number(numberRaw);
      if (!Number.isFinite(vendaId) || !Number.isFinite(number)) continue;
      const statusRaw = String(getField(row, 'status') || 'pending').toLowerCase().trim();
      const status: ParsedParcela['status'] =
        statusRaw === 'paid' || statusRaw === 'pago'
          ? 'paid'
          : statusRaw === 'overdue' || statusRaw === 'atrasado'
            ? 'overdue'
            : 'pending';
      const billOverdueRaw = getField(row, 'boleto_atrasado', 'boletoatrasado');
      const bill_overdue: 0 | 1 =
        billOverdueRaw === 1 ||
        billOverdueRaw === true ||
        /sim|s|true|1/i.test(String(billOverdueRaw ?? ''))
          ? 1
          : 0;
      const paidRaw = getField(row, 'pago_em', 'pagoem', 'paid_date');
      const paid_date = status === 'paid' && paidRaw ? parseDate(paidRaw) : null;
      parcelas.push({
        vendaIdOriginal: vendaId,
        number,
        value: Number(getField(row, 'valor', 'value', 'valorr') || 0),
        due_date: parseDate(getField(row, 'vencimento', 'due_date')),
        status,
        bill_overdue,
        paid_date,
      });
    }
  }

  return { rows, parcelas };
}

function findMatch(name: string, consultants: Consultant[]): Consultant | null {
  const norm = normalizeKey(name);
  return consultants.find((c) => normalizeKey(c.name) === norm) ?? null;
}

export default function ImportPreviewModal({ open, onClose, file, consultants, onDone }: Props) {
  const [step, setStep] = useState<'loading' | 'preview' | 'importing' | 'done'>('loading');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parcelas, setParcelas] = useState<ParsedParcela[]>([]);
  const [groups, setGroups] = useState<GroupState[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, ok: 0, failed: 0, parcelasUpdated: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !file) return;
    setStep('loading');
    setParseError(null);
    setRows([]);
    setParcelas([]);
    setGroups([]);
    setProgress({ current: 0, total: 0, ok: 0, failed: 0, parcelasUpdated: 0 });
    setErrors([]);

    file
      .arrayBuffer()
      .then((buf) => {
        const parsed = parseRows(buf);
        if (parsed.rows.length === 0) {
          setParseError(
            'Nenhuma venda encontrada. Verifique se a planilha tem a coluna "consultor".'
          );
          setStep('preview');
          return;
        }
        const byConsultor = new Map<string, ParsedRow[]>();
        for (const r of parsed.rows) {
          const key = r.consultorRaw;
          const arr = byConsultor.get(key) ?? [];
          arr.push(r);
          byConsultor.set(key, arr);
        }
        const newGroups: GroupState[] = Array.from(byConsultor.entries()).map(([name, rs]) => {
          const match = findMatch(name, consultants);
          return {
            consultorRaw: name,
            count: rs.length,
            rows: rs,
            mapping: match ? { kind: 'existing', consultantId: match.id } : { kind: 'create' },
            autoMatchedTo: match?.id ?? null,
          };
        });
        setRows(parsed.rows);
        setParcelas(parsed.parcelas);
        setGroups(newGroups);
        setStep('preview');
      })
      .catch((e) => {
        setParseError(`Erro ao ler arquivo: ${e?.message || e}`);
        setStep('preview');
      });
  }, [open, file, consultants]);

  const parcelasStats = useMemo(() => {
    let paid = 0;
    let overdue = 0;
    let pending = 0;
    for (const p of parcelas) {
      if (p.status === 'paid') paid++;
      else if (p.status === 'overdue') overdue++;
      else pending++;
    }
    return { total: parcelas.length, paid, overdue, pending };
  }, [parcelas]);

  const totals = useMemo(() => {
    const totalSales = rows.length;
    const totalConsultors = groups.length;
    const matched = groups.filter((g) => g.mapping.kind === 'existing').length;
    const toCreate = groups.filter((g) => g.mapping.kind === 'create').length;
    return { totalSales, totalConsultors, matched, toCreate };
  }, [rows, groups]);

  const updateMapping = (idx: number, value: string) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== idx) return g;
        if (value === '__create__') return { ...g, mapping: { kind: 'create' } };
        return { ...g, mapping: { kind: 'existing', consultantId: Number(value) } };
      })
    );
  };

  const runImport = async () => {
    setStep('importing');
    setProgress({ current: 0, total: rows.length, ok: 0, failed: 0, parcelasUpdated: 0 });
    setErrors([]);

    const consultantIdByGroupName = new Map<string, number>();

    for (const g of groups) {
      if (g.mapping.kind === 'existing') {
        consultantIdByGroupName.set(g.consultorRaw, g.mapping.consultantId);
      } else {
        try {
          const r = await api.post('/consultants', { name: g.consultorRaw, active: 1 });
          consultantIdByGroupName.set(g.consultorRaw, r.data.id);
        } catch (e: any) {
          setErrors((prev) => [
            ...prev,
            `Falha ao criar consultor "${g.consultorRaw}": ${e?.response?.data?.error || e?.message || 'erro'}`,
          ]);
        }
      }
    }

    const parcelasByVendaId = new Map<number, ParsedParcela[]>();
    for (const p of parcelas) {
      const arr = parcelasByVendaId.get(p.vendaIdOriginal) ?? [];
      arr.push(p);
      parcelasByVendaId.set(p.vendaIdOriginal, arr);
    }

    let ok = 0;
    let failed = 0;
    let parcelasUpdated = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const consultantId = consultantIdByGroupName.get(r.consultorRaw);
      if (!consultantId) {
        failed++;
        setErrors((prev) => [...prev, `Venda ${i + 1}: consultor "${r.consultorRaw}" não mapeado`]);
      } else {
        try {
          const created = await api.post('/sales', {
            consultant_id: consultantId,
            client_name: r.cliente,
            client_number: r.cliente_numero,
            product: r.produto,
            sale_date: r.sale_date,
            insurance: r.insurance,
            base_value: r.base_value,
            quotas: r.quotas,
            commission_percentage: r.commission_percentage,
            group_quota: r.group_quota,
          });
          ok++;

          const newSale = created.data as {
            id: number;
            installments: { id: number; number: number }[];
          };
          const parcelasArquivo = r.vendaIdOriginal !== null
            ? parcelasByVendaId.get(r.vendaIdOriginal)
            : undefined;
          if (parcelasArquivo && parcelasArquivo.length > 0 && newSale.installments?.length) {
            const byNumber = new Map<number, { id: number }>();
            for (const inst of newSale.installments) byNumber.set(inst.number, inst);
            const updates = parcelasArquivo
              .map((p) => {
                const target = byNumber.get(p.number);
                if (!target) return null;
                return {
                  id: target.id,
                  status: p.status,
                  bill_overdue: p.bill_overdue,
                  paid_date: p.paid_date,
                  due_date: p.due_date,
                  value: p.value,
                };
              })
              .filter((u): u is NonNullable<typeof u> => u !== null);

            if (updates.length > 0) {
              try {
                await api.put(`/sales/${newSale.id}/installments`, { installments: updates });
                parcelasUpdated += updates.length;
              } catch (e: any) {
                setErrors((prev) => [
                  ...prev,
                  `Venda ${i + 1} (${r.cliente || '—'}): parcelas criadas mas status não aplicado — ${e?.response?.data?.error || e?.message || 'erro'}`,
                ]);
              }
            }
          }
        } catch (e: any) {
          failed++;
          setErrors((prev) => [
            ...prev,
            `Venda ${i + 1} (${r.cliente || '—'}): ${e?.response?.data?.error || e?.message || 'erro'}`,
          ]);
        }
      }
      setProgress({ current: i + 1, total: rows.length, ok, failed, parcelasUpdated });
    }

    setStep('done');
    onDone({ ok, failed });
  };

  const closeIfIdle = () => {
    if (step === 'importing') return;
    onClose();
  };

  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Modal
      open={open}
      onClose={closeIfIdle}
      size="lg"
      title={
        step === 'done'
          ? 'Importação concluída'
          : step === 'importing'
            ? 'Importando vendas…'
            : 'Revisar importação'
      }
    >
      {step === 'loading' && (
        <div className="py-10 grid place-items-center text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
          <div className="text-sm">Lendo planilha…</div>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col gap-4">
          {parseError ? (
            <div className="card-soft p-4 flex items-start gap-3 border border-danger/30">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="text-sm text-ink">{parseError}</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Vendas" value={totals.totalSales} icon={<Users className="w-4 h-4" />} />
                <Stat label="Consultores" value={totals.totalConsultors} />
                <Stat label="Já cadastrados" value={totals.matched} tone="success" />
                <Stat label="Serão criados" value={totals.toCreate} tone="accent" />
              </div>

              {parcelasStats.total > 0 && (
                <div className="card-soft p-3 border border-overlay/[0.05]">
                  <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                    Parcelas detectadas no arquivo
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-ink">
                      <span className="font-semibold tabular-nums">{parcelasStats.total}</span> total
                    </span>
                    <span className="pill bg-success/15 text-success">
                      <Check className="w-3 h-3" /> {parcelasStats.paid} pagas
                    </span>
                    <span className="pill bg-overlay/10 text-muted">
                      {parcelasStats.pending} pendentes
                    </span>
                    {parcelasStats.overdue > 0 && (
                      <span className="pill bg-danger/15 text-danger">
                        <AlertTriangle className="w-3 h-3" /> {parcelasStats.overdue} em atraso
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-2">
                    Status (pago, pendente, atraso) e datas de pagamento serão aplicados após a criação das vendas.
                  </div>
                </div>
              )}

              <div className="text-xs text-muted">
                Confirme como cada consultor do arquivo deve ser tratado:
              </div>

              <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
                {groups.map((g, idx) => {
                  const isMatched = g.mapping.kind === 'existing';
                  const isAutoMatch =
                    isMatched &&
                    g.autoMatchedTo !== null &&
                    g.mapping.kind === 'existing' &&
                    g.mapping.consultantId === g.autoMatchedTo;
                  return (
                    <div
                      key={g.consultorRaw}
                      className="card-soft p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{g.consultorRaw}</div>
                        <div className="text-xs text-muted">
                          {g.count} {g.count === 1 ? 'venda' : 'vendas'} no arquivo
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isMatched ? (
                          isAutoMatch ? (
                            <span className="pill bg-success/15 text-success">
                              <Check className="w-3 h-3" /> auto-detectado
                            </span>
                          ) : (
                            <span className="pill bg-overlay/[0.08] text-ink">manual</span>
                          )
                        ) : (
                          <span className="pill bg-accent/15 text-accent-soft">
                            <UserPlus className="w-3 h-3" /> novo
                          </span>
                        )}
                        <select
                          className="input py-1.5 text-xs w-56"
                          value={
                            g.mapping.kind === 'existing'
                              ? String(g.mapping.consultantId)
                              : '__create__'
                          }
                          onChange={(e) => updateMapping(idx, e.target.value)}
                        >
                          <option value="__create__">+ Criar "{g.consultorRaw}"</option>
                          <optgroup label="Mapear para existente">
                            {consultants.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-overlay/[0.05]">
            <button className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            {!parseError && (
              <button
                className="btn-primary"
                onClick={runImport}
                disabled={rows.length === 0}
              >
                Importar {totals.totalSales} {totals.totalSales === 1 ? 'venda' : 'vendas'}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex flex-col gap-5 py-2">
          <div className="text-sm text-muted">
            Inserindo vendas no sistema. Não feche esta janela.
          </div>

          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold tabular-nums">{pct}%</div>
            <div className="text-sm text-muted tabular-nums">
              {progress.current} / {progress.total}
            </div>
          </div>

          <div className="h-3 rounded-full bg-overlay/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-300 ease-out relative overflow-hidden"
              style={{ width: `${pct}%` }}
            >
              <div className="absolute inset-0 import-shimmer" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="card-soft p-3">
              <div className="text-xs text-muted">Sucesso</div>
              <div className="text-2xl font-semibold text-success tabular-nums">
                {progress.ok}
              </div>
            </div>
            <div className="card-soft p-3">
              <div className="text-xs text-muted">Falhas</div>
              <div className="text-2xl font-semibold text-danger tabular-nums">
                {progress.failed}
              </div>
            </div>
            <div className="card-soft p-3">
              <div className="text-xs text-muted">Parcelas atualizadas</div>
              <div className="text-2xl font-semibold text-accent-soft tabular-nums">
                {progress.parcelasUpdated}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-4 py-2">
          <div className="grid place-items-center py-2">
            <div className="w-16 h-16 rounded-full bg-success/15 text-success grid place-items-center mb-3 anim-pop">
              <Check className="w-8 h-8" />
            </div>
            <div className="text-xl font-semibold">
              {progress.ok} {progress.ok === 1 ? 'venda importada' : 'vendas importadas'}
            </div>
            {progress.parcelasUpdated > 0 && (
              <div className="text-sm text-muted mt-1">
                {progress.parcelasUpdated}{' '}
                {progress.parcelasUpdated === 1 ? 'parcela atualizada' : 'parcelas atualizadas'}{' '}
                com status do arquivo
              </div>
            )}
            {progress.failed > 0 && (
              <div className="text-sm text-danger mt-1">
                {progress.failed} {progress.failed === 1 ? 'falha' : 'falhas'}
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <div className="card-soft p-3 max-h-48 overflow-y-auto">
              <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-danger" /> Erros ({errors.length})
              </div>
              <ul className="text-xs text-ink space-y-1">
                {errors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <X className="w-3 h-3 text-danger shrink-0 mt-0.5" />
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button className="btn-primary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  icon,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'accent';
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'accent' ? 'text-accent-soft' : 'text-ink';
  return (
    <div className="card-soft p-3">
      <div className="text-xs text-muted flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
