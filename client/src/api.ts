import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export const formatBRL = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatNumber = (n: number | null | undefined, digits = 0) =>
  (Number(n) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const formatDate = (d: string | null | undefined) => {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
