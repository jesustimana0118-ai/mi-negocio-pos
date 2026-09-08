import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  X, Lock, DollarSign, Calculator, 
  Percent, AlertCircle, FileSpreadsheet, Check
} from 'lucide-react';

interface ShiftClosingModalProps {
  shiftId: string;
  onClose: () => void;
  onShiftClosed: () => void;
}

interface FinancialSummary {
  declared_cash: number;
  expected_cash: number;
  discrepancy: number;
  total_sales: number;
  total_net: number;
  total_iva: number;
  total_tips: number;
  ppm_provision: number;
}

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';

export function ShiftClosingModal({ shiftId, onClose, onShiftClosed }: ShiftClosingModalProps) {
  const [declaredCash, setDeclaredCash] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);

  const handleCloseShift = async () => {
    if (!declaredCash) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('close_cash_shift_blind', {
        p_shift_id: shiftId,
        p_closed_by: DEMO_USER_ID,
        p_declared_cash: Number(declaredCash)
      });

      if (error) throw error;
      setSummary(data as FinancialSummary);
    } catch (err: any) {
      alert('Detalle del error: ' + (err?.message || err?.error_description || JSON.stringify(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-zinc-100">Cierre de Caja Ciego</h3>
              <p className="text-xs text-zinc-400 font-mono">Arqueo y Declaración Tributaria</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!summary ? (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-xl space-y-2">
              <div className="flex items-start gap-2.5 text-xs text-zinc-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  Ingresa el total de <strong>efectivo físico</strong> contado en el cajón (incluyendo el fondo inicial). El sistema revelará si existen descuadres y generará el informe fiscal.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 font-mono">
              <label htmlFor="declared-cash-input" className="text-xs text-zinc-400">Efectivo Físico Recontado (CLP):</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
                <input
                  id="declared-cash-input"
                  type="number"
                  placeholder="Ej: 60980"
                  value={declaredCash}
                  onChange={(e) => setDeclaredCash(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl pl-9 pr-4 py-3 text-lg font-bold text-zinc-100 outline-none tabular-nums"
                />
              </div>
            </div>

            <button
              onClick={handleCloseShift}
              disabled={!declaredCash || loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition active:scale-98"
            >
              {loading ? (
                <span className="animate-pulse">Calculando Arqueo...</span>
              ) : (
                <>
                  <Lock className="w-4 h-4 stroke-[2.5]" /> Ejecutar Cierre Definitivo
                </>
              )}
            </button>
          </div>
        ) : (
          /* Reporte Financiero & Tributario Post-Cierre */
          <div className="space-y-4 font-mono">
            <div className="p-4 bg-zinc-950/90 border border-zinc-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-800 text-zinc-400">
                <span>Arqueo de Efectivo:</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  summary.discrepancy === 0 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {summary.discrepancy === 0 ? 'Cuadratura Exacta' : `Diferencia: $${summary.discrepancy.toLocaleString('es-CL')}`}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500 block text-[11px]">Efectivo Declarado:</span>
                  <span className="text-zinc-100 font-bold tabular-nums">${summary.declared_cash.toLocaleString('es-CL')}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Efectivo en Sistema:</span>
                  <span className="text-zinc-100 font-bold tabular-nums">${summary.expected_cash.toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>

            {/* Cuadro Fiscal SII (IVA, PPM y Propinas) */}
            <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-300 font-semibold mb-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Liquidación Fiscal & Operativa</span>
              </div>

              <div className="flex justify-between text-zinc-400">
                <span>Ventas Brutas Totales:</span>
                <span className="text-zinc-200 tabular-nums">${summary.total_sales.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Venta Neta (Base Imponible):</span>
                <span className="text-zinc-200 tabular-nums">${summary.total_net.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span className="flex items-center gap-1">
                  <Percent className="w-3 h-3 text-emerald-400" /> Débito Fiscal IVA (19%):
                </span>
                <span className="text-emerald-400 font-bold tabular-nums">${summary.total_iva.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span className="flex items-center gap-1">
                  <Calculator className="w-3 h-3 text-amber-400" /> Provisión PPM (1%):
                </span>
                <span className="text-amber-400 font-bold tabular-nums">${summary.ppm_provision.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-zinc-400 pt-2 border-t border-zinc-800/80">
                <span>Pozo de Propinas (10% No Trib.):</span>
                <span className="text-blue-400 font-bold tabular-nums">${summary.total_tips.toLocaleString('es-CL')}</span>
              </div>
            </div>

            <button
              onClick={() => {
                onShiftClosed();
                onClose();
              }}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition"
            >
              <Check className="w-4 h-4 text-emerald-400" /> Finalizar y Regresar al Salón
            </button>
          </div>
        )}
      </div>
    </div>
  );
}