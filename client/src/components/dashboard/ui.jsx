import React, { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

export function Shell({ darkMode, children }) {
  return (
    <div
      className={`relative h-screen w-screen overflow-hidden transition-colors duration-500 ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 ${darkMode ? 'bg-grid-slate-dark' : 'bg-grid-slate'} opacity-100`} />
      <div className="pointer-events-none absolute inset-0 opacity-80 bg-[radial-gradient(900px_circle_at_15%_10%,rgba(59,130,246,0.18),transparent_45%),radial-gradient(1000px_circle_at_85%_20%,rgba(99,102,241,0.14),transparent_55%)]" />
      <div className="relative flex h-full w-full flex-col">{children}</div>
    </div>
  );
}

export function Pill({ icon: Icon, label, value, tone = 'violet' }) {
  const map = {
    violet: 'from-violet-600 to-purple-600 shadow-violet-600/25',
    emerald: 'from-emerald-600 to-teal-600 shadow-emerald-600/25',
    cyan: 'from-cyan-600 to-blue-600 shadow-cyan-600/25',
    amber: 'from-amber-500 to-orange-600 shadow-amber-600/25',
    rose: 'from-rose-600 to-pink-600 shadow-rose-600/25'
  };

  return (
    <div className={`rounded-3xl p-5 bg-gradient-to-r ${map[tone]} shadow-xl`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/70">{label}</div>
          <div className="mt-1 text-2xl font-bold text-white">{value}</div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

export function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/15">
          <Icon className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <div className="text-lg font-semibold">{title}</div>
          {subtitle && <div className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

export function Modal({ open, title, children, onClose, widthClass = 'max-w-3xl' }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative w-full ${widthClass} overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950`}>
        <div className="flex items-center justify-between border-b border-slate-200/60 px-6 py-5 dark:border-white/10">
          <div className="font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function TextInput({ label, value, onChange, type = 'text', placeholder, required }) {
  const isPassword = type === 'password';
  const [showPassword, setShowPassword] = useState(false);
  const effectiveType = isPassword && showPassword ? 'text' : type;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </div>
      <div className="relative">
        <input
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-white/10 dark:bg-white/5 ${isPassword ? 'pr-12' : ''}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute inset-y-0 right-0 inline-flex items-center justify-center px-4 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function SelectInput({ label, value, onChange, options, required }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      >
        <option value="" className="bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-300">
          Selecione...
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 transition ${
        active
          ? 'border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-200'
          : 'border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function InfoBox({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 font-semibold text-slate-900 dark:text-white">{value || '-'}</div>
    </div>
  );
}
