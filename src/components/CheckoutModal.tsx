import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RestaurantTable } from '../types/database';
import { 
  X, Banknote, CreditCard, 
  ArrowRightLeft, Receipt, Check 
} from 'lucide-react';

interface ActiveOrder {
  id: string;
  order_number: number;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
}

interface CheckoutModalProps {
  table: RestaurantTable;
  order: ActiveOrder;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

type PaymentOption = 'cash' | 'card_debit' | 'card_credit' | 'transfer';

export function CheckoutModal({ table, order, onClose, onPaymentSuccess }: CheckoutModalProps) {
  const [method, setMethod] = useState<PaymentOption>('card_debit');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [processing, setProcessing] = useState(false);

  const receivedNum = Number(cashReceived) || 0;
  const change = receivedNum > order.total_amount ? receivedNum - order.total_amount : 0;

  const handleProcessPayment = async () => {
    setProcessing(true);
    try {
      // 1. Marcar la orden como pagada (esto dispara el trigger de descuento de stock)
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method: method,
          paid_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (orderError) throw orderError;

      // 2. Liberar la mesa
      const { error: tableError } = await supabase
        .from('restaurant_tables')
        .update({ status: 'available' })
        .eq('id', table.id);

      if (tableError) throw tableError;

      onPaymentSuccess();
    } catch (err) {
      alert('Error al liquidar la cuenta: ' + (err instanceof Error ? err.message : 'Error de red'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
          <div>
            <h3 className="font-bold text-base text-zinc-100 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-400" /> Cobro • {table.name}
            </h3>
            <p className="text-xs text-zinc-400 font-mono">Orden #{order.order_number}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumen de Total a Pagar */}
        <div className="p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-xl space-y-2">
          <div className="flex justify-between text-xs font-mono text-zinc-400">
            <span>Neto: ${order.subtotal_net.toLocaleString('es-CL')}</span>
            <span>IVA (19%): ${order.iva_amount.toLocaleString('es-CL')}</span>
            <span>Propina (10%): ${order.tip_amount.toLocaleString('es-CL')}</span>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-zinc-800">
            <span className="text-xs font-bold text-zinc-300">Total a Cobrar:</span>
            <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              ${order.total_amount.toLocaleString('es-CL')}
            </span>
          </div>
        </div>

        {/* Selector de Medios de Pago */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-400">Medio de Pago:</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod('card_debit')}
              className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium transition ${
                method === 'card_debit'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <CreditCard className="w-4 h-4" /> Tarjeta Débito
            </button>

            <button
              type="button"
              onClick={() => setMethod('card_credit')}
              className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium transition ${
                method === 'card_credit'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <CreditCard className="w-4 h-4" /> Tarjeta Crédito
            </button>

            <button
              type="button"
              onClick={() => setMethod('cash')}
              className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium transition ${
                method === 'cash'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Banknote className="w-4 h-4" /> Efectivo
            </button>

            <button
              type="button"
              onClick={() => setMethod('transfer')}
              className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium transition ${
                method === 'transfer'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" /> Transferencia
            </button>
          </div>
        </div>

        {/* Input de Efectivo / Vuelto */}
        {method === 'cash' && (
          <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-2 font-mono">
            <div className="flex items-center justify-between">
              <label htmlFor="cash-input" className="text-xs text-zinc-400">Paga con:</label>
              <input
                id="cash-input"
                type="number"
                placeholder={order.total_amount.toString()}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-32 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1 text-right text-sm font-bold text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-zinc-800/80">
              <span className="text-zinc-400">Vuelto a entregar:</span>
              <span className="font-bold text-amber-400 tabular-nums">
                ${change.toLocaleString('es-CL')}
              </span>
            </div>
          </div>
        )}

        {/* Botón Final de Cobro */}
        <button
          onClick={handleProcessPayment}
          disabled={processing}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2 transition active:scale-98"
        >
          {processing ? (
            <span className="animate-pulse">Procesando y Descontando Stock...</span>
          ) : (
            <>
              <Check className="w-5 h-5 stroke-[3]" /> Liquidar y Liberar Mesa
            </>
          )}
        </button>
      </div>
    </div>
  );
}