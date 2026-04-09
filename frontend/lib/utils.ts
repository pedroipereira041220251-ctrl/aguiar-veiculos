import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(val: number | undefined | null) {
  return (val ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function fmtKm(km: number) {
  return km.toLocaleString('pt-BR') + ' km';
}

export const STATUS_LABEL: Record<string, string> = {
  disponivel: 'Disponível', reservado: 'Reservado',
  vendido: 'Vendido', inativo: 'Inativo',
};

export const STATUS_COLOR: Record<string, string> = {
  disponivel: 'bg-emerald-100 text-emerald-700',
  reservado:  'bg-yellow-100 text-yellow-700',
  vendido:    'bg-blue-100 text-blue-700',
  inativo:    'bg-gray-100 text-gray-500',
};

export const FUNIL_LABEL: Record<string, string> = {
  novo: 'Novo', contato: 'Em contato', visita: 'Visita agendada',
  proposta: 'Proposta feita', fechado: 'Fechado', perdido: 'Perdido',
};
