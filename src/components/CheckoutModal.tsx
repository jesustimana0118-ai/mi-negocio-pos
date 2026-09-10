import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RestaurantTable } from '../types/database';
import { 
  X, Banknote, CreditCard, 
  ArrowRightLeft, Receipt, Check, Utensils, HeartHandshake, Loader2, ShoppingBag 
} from 'lucide-react';

interface ActiveOrder {
  id: string;
  order_number: number;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
  waiter_name?: string;
}

interface OrderItemDetail {
  id: string;
  quantity: number;
  unit_price?: number;
  product?: {
    name: string;
    price?: number;
  };
}

interface CheckoutModalProps {
  table?: RestaurantTable | null;
  order: ActiveOrder;
  onClose: () => void;
  onPaymentSuccess: () => void;
  isDark?: boolean;
}

type PaymentOption = 'card_debit' | 'card_credit' | 'cash' | 'transfer';

export function CheckoutModal({ 
  table, 
  order, 
  onClose, 
  onPaymentSuccess, 
  isDark = true 
}: CheckoutModalProps) {
  const [method, setMethod] = useState<PaymentOption>('card_debit');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<OrderItemDetail[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  const baseTotal = (order.subtotal_net || 0) + (order.iva_amount || 0) || order.total_amount;
  const suggestedTip = Math.round(baseTotal * 0.10);
  const [includeTip, setIncludeTip] = useState<boolean>(!table ? false : true);

  const currentTip = includeTip ? (order.tip_amount > 0 ? order.tip_amount : suggestedTip) : 0;
  const finalTotal = baseTotal + currentTip;

  const receivedNum = Number(cashReceived) || 0;
  const change = receivedNum > finalTotal ? receivedNum - finalTotal : 0;

  useEffect(() => {
    async function fetchOrderItems() {
      setLoadingItems(true);
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          unit_price,
          product:products(name, price)
        `)
        .eq('order_id', order.id);

      if (!error && data) {
        setItems(data as unknown as OrderItemDetail[]);
      }
      setLoadingItems(false);
    }

    fetchOrderItems();
  }, [order.id]);

  const handleProcessPayment = async () => {
    setProcessing(true);
    try {
      // 1. Marcar orden como pagada
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method: method,
          tip_amount: currentTip,
          total_amount: finalTotal,
          paid_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (orderError) throw orderError;

      // 2. Liberar la mesa física si aplica
      if (table && table.id) {
        const { error: tableError } = await supabase
          .from('restaurant_tables')
          .update({ status: 'available' })
          .eq('id', table.id);

        if (tableError) throw tableError;
      }

      onPaymentSuccess();
    } catch (err: any) {
      alert('Error al liquidar la cuenta: ' + (err instanceof Error ? err.message : 'Error de red'));
    } finally {
      setProcessing(false);
    }
  };

  const displayName = table ? table.name : (order.waiter_name?.replace('Para Llevar • ', '') || 'Para Llevar');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
      <div className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col border transition-all ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Cabecera del Modal */}
        <div className={`flex items-center justify-between border-b pb-3 shrink-0 ${
          isDark ? 'border-zinc-800' : 'border-slate-100'
        }`}>
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <span className={`p-1 rounded-lg border ${
                table 
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                  : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
              }`}>
                {table ? <Receipt className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
              </span>
              Cobro • {displayName}
            </h3>
            <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Orden #{order.order_number} {!table && '• Pedido Para Llevar'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isDark ? 'text-zinc-400 hover:text-zinc-100 bg-zinc-800/60' : 'text-slate-400 hover:text-slate-800 bg-slate-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Desglose de Productos */}
        <div className="space-y-1.5 shrink-0">
          <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            isDark ? 'text-zinc-400' : 'text-slate-600'
          }`}>
            <Utensils className="w-3.5 h-3.5 text-blue-500" />
            Detalle del Pedido:
          </label>
          
          <div className={`rounded-xl border p-3 max-h-36 overflow-y-auto space-y-2 ${
            isDark ? 'bg-zinc-950/60 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
          }`}>
            {loadingItems ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs font-mono text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                Cargando ítems...
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-center py-2 text-zinc-500 font-mono">Sin ítems registrados en esta orden</p>
            ) : (
              items.map((it) => {
                const itemPrice = it.unit_price ?? it.product?.price ?? 0;
                return (
                  <div key={it.id} className={`flex items-center justify-between text-xs pb-1.5 border-b last:border-b-0 last:pb-0 ${
                    isDark ? 'border-zinc-800/50' : 'border-slate-200/60'
                  }`}>
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                        isDark ? 'bg-zinc-800 text-emerald-400' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {it.quantity}x
                      </span>
                      <span className={`truncate font-medium ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                        {it.product?.name || 'Producto'}
                      </span>
                    </div>
                    <span className={`font-mono font-bold shrink-0 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      ${(itemPrice * it.quantity).toLocaleString('es-CL')}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Propina Sugerida */}
        <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
          includeTip
            ? isDark
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
              : 'bg-amber-50 border-amber-300 text-amber-900'
            : isDark
            ? 'bg-zinc-950/40 border-zinc-800 text-zinc-400'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          <div className="flex items-center gap-2.5">
            <HeartHandshake className={`w-5 h-5 ${includeTip ? 'text-amber-500' : 'text-zinc-500'}`} />
            <div>
              <p className="text-xs font-bold leading-tight">Propina Sugerida (10%)</p>
              <p className="text-[11px] font-mono opacity-80">+${suggestedTip.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIncludeTip((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
              includeTip
                ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-xs'
                : isDark
                ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {includeTip ? 'Incluida ✓' : 'No agregar'}
          </button>
        </div>

        {/* Totales */}
        <div className={`p-3.5 rounded-xl border space-y-2 ${
          isDark ? 'bg-zinc-950/90 border-zinc-800' : 'bg-slate-50 border-slate-200 shadow-2xs'
        }`}>
          <div className={`flex justify-between text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
            <span>Neto: ${order.subtotal_net.toLocaleString('es-CL')}</span>
            <span>IVA (19%): ${order.iva_amount.toLocaleString('es-CL')}</span>
            <span>Propina: ${currentTip.toLocaleString('es-CL')}</span>
          </div>
          <div className={`flex justify-between items-baseline pt-2 border-t ${
            isDark ? 'border-zinc-800' : 'border-slate-200'
          }`}>
            <span className={`text-xs font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
              Total a Cobrar:
            </span>
            <span className="text-2xl font-black font-mono text-emerald-500 tabular-nums">
              ${finalTotal.toLocaleString('es-CL')}
            </span>
          </div>
        </div>

        {/* Medios de Pago */}
        <div className="space-y-1.5">
          <label className={`text-xs font-medium ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
            Medio de Pago:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod('card_debit')}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'card_debit'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-4 h-4 text-emerald-500" /> Tarjeta Débito
            </button>

            <button
              type="button"
              onClick={() => setMethod('card_credit')}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'card_credit'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-4 h-4 text-emerald-500" /> Tarjeta Crédito
            </button>

            <button
              type="button"
              onClick={() => setMethod('cash')}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'cash'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Banknote className="w-4 h-4 text-emerald-500" /> Efectivo
            </button>

            <button
              type="button"
              onClick={() => setMethod('transfer')}
              className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'transfer'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4 text-emerald-500" /> Transferencia
            </button>
          </div>
        </div>

        {/* Efectivo / Vuelto */}
        {method === 'cash' && (
          <div className={`p-3 rounded-xl border space-y-2 font-mono ${
            isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <label htmlFor="cash-input" className="text-xs text-zinc-400">Paga con:</label>
              <input
                id="cash-input"
                type="number"
                placeholder={finalTotal.toString()}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className={`w-36 rounded-lg px-2.5 py-1 text-right text-sm font-bold border focus:outline-hidden focus:border-emerald-500 ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
            <div className={`flex justify-between text-xs pt-1 border-t ${
              isDark ? 'border-zinc-800/80' : 'border-slate-200'
            }`}>
              <span className={isDark ? 'text-zinc-400' : 'text-slate-600'}>Vuelto a entregar:</span>
              <span className="font-bold text-amber-500 tabular-nums">
                ${change.toLocaleString('es-CL')}
              </span>
            </div>
          </div>
        )}

        {/* Botón Final */}
        <button
          onClick={handleProcessPayment}
          disabled={processing}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-black rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-md shadow-emerald-500/10 cursor-pointer"
        >
          {processing ? (
            <span className="animate-pulse flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Procesando Cobro...
            </span>
          ) : (
            <>
              <Check className="w-5 h-5 stroke-[3]" /> Liquidar Pedido
            </>
          )}
        </button>
      </div>
    </div>
  );
}