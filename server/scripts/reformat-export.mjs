import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'C:\\Users\\Vitor\\Downloads\\export-all-2026-05-14.xlsx';
const DST = 'C:\\Users\\Vitor\\Downloads\\export-all-2026-05-14-importavel.xlsx';

const wb = XLSX.read(readFileSync(SRC), { type: 'buffer' });
const wsIn = wb.Sheets['Vendas'];
const rows = XLSX.utils.sheet_to_json(wsIn, { defval: '' });

const remapped = rows.map((r) => ({
  Data: r['Data'],
  Consultor: r['Consultor'],
  Cliente: r['Cliente'],
  cliente_numero: r['Nº Cliente'] ?? '',
  Produto: r['Produto'],
  valor: r['Base (R$)'],
  comissao_pct: r['Comissão %'],
  grupo_cota: r['Grupo / Cota'] ?? r['Crédito gerado (R$)'] ?? '',
  Seguro: r['Seguro'],
  Cotas: r['Cotas'],
  'Venda ID': r['Venda ID'],
}));

const wbOut = XLSX.utils.book_new();
const wsOut = XLSX.utils.json_to_sheet(remapped);
XLSX.utils.book_append_sheet(wbOut, wsOut, 'Vendas');

const parcelasIn = wb.Sheets['Parcelas'];
if (parcelasIn) {
  XLSX.utils.book_append_sheet(wbOut, parcelasIn, 'Parcelas (ref)');
}

const buf = XLSX.write(wbOut, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(DST, buf);

console.log(`OK: ${remapped.length} vendas gravadas em ${DST}`);
