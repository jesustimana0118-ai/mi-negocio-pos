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

  const isTakeout = !table || order.waiter_name?.includes('Para Llevar');
  const baseTotal = (order.subtotal_net || 0) + (order.iva_amount || 0) || order.total_amount;
  const suggestedTip = Math.round(baseTotal * 0.10);
  
  // En pedidos para llevar la propina inicia desactivada por defecto
  const [includeTip, setIncludeTip] = useState<boolean>(!isTakeout);

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

      if (table && table.id) {
        await supabase
          .from('restaurant_tables')
          .update({ status: 'available' })
          .eq('id', table.id);
      }

      onPaymentSuccess();
    } catch (err: any) {
      alert('Error al liquidar la cuenta: ' + (err instanceof Error ? err.message : 'Error de red'));
    } finally {
      setProcessing(false);
    }
  };

  const displayName = table ? table.name : (order.waiter_name?.replace('Para Llevar • ', '') || 'Cliente Mostrador');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className={`w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3.5 max-h-[94vh] flex flex-col border transition-all overflow-y-auto ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Cabecera */}
        <div className={`flex items-center justify-between border-b pb-2.5 shrink-0 ${
          isDark ? 'border-zinc-800' : 'border-slate-100'
        }`}>
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <span className={`p-1 rounded-lg border ${
                table 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                  : 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
              }`}>
                {table ? <Receipt className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
              </span>
              Cobro • {displayName}
            </h3>
            <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Orden #{order.order_number} {isTakeout && '• Para Llevar'}
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
        <div className="space-y-1 shrink-0">
          <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            isDark ? 'text-zinc-400' : 'text-slate-600'
          }`}>
            <Utensils className="w-3.5 h-3.5 text-blue-500" />
            Detalle del Pedido:
          </label>
          
          <div className={`rounded-xl border p-2.5 max-h-28 overflow-y-auto space-y-1.5 ${
            isDark ? 'bg-zinc-950/60 border-zinc-800/80' : 'bg-slate-50 border-slate-200'
          }`}>
            {loadingItems ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs font-mono text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                Cargando...
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-center py-1 text-zinc-500 font-mono">Sin ítems registrados</p>
            ) : (
              items.map((it) => {
                const itemPrice = it.unit_price ?? it.product?.price ?? 0;
                return (
                  <div key={it.id} className={`flex items-center justify-between text-xs pb-1 border-b last:border-b-0 last:pb-0 ${
                    isDark ? 'border-zinc-800/50' : 'border-slate-200/60'
                  }`}>
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      <span className={`font-mono font-bold px-1 py-0.2 rounded text-[10px] ${
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
        <div className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
          includeTip
            ? isDark
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
            : isDark
            ? 'bg-zinc-950/40 border-zinc-800 text-zinc-400'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          <div className="flex items-center gap-2">
            <HeartHandshake className={`w-4 h-4 ${includeTip ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`} />
            <div>
              <p className="text-xs font-bold leading-tight">Propina Sugerida (10%)</p>
              <p className="text-[10px] font-mono opacity-80">+${suggestedTip.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIncludeTip((prev) => !prev)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 border cursor-pointer ${
              includeTip
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                : isDark
                ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {includeTip ? 'Incluida ✓' : 'No agregar'}
          </button>
        </div>

        {/* Totales */}
        <div className={`p-3 rounded-xl border space-y-1.5 ${
          isDark ? 'bg-zinc-950/90 border-zinc-800' : 'bg-slate-50 border-slate-200 shadow-2xs'
        }`}>
          <div className={`flex justify-between text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
            <span>Neto: ${order.subtotal_net.toLocaleString('es-CL')}</span>
            <span>IVA (19%): ${order.iva_amount.toLocaleString('es-CL')}</span>
            <span>Propina: ${currentTip.toLocaleString('es-CL')}</span>
          </div>
          <div className={`flex justify-between items-baseline pt-1.5 border-t ${
            isDark ? 'border-zinc-800' : 'border-slate-200'
          }`}>
            <span className={`text-xs font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
              Total a Cobrar:
            </span>
            <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              ${finalTotal.toLocaleString('es-CL')}
            </span>
          </div>
        </div>

        {/* Medios de Pago */}
        <div className="space-y-1">
          <label className={`text-[11px] font-medium ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
            Medio de Pago:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod('card_debit')}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'card_debit'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-500" /> Débito
            </button>

            <button
              type="button"
              onClick={() => setMethod('card_credit')}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'card_credit'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-500" /> Crédito
            </button>

            <button
              type="button"
              onClick={() => setMethod('cash')}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'cash'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Banknote className="w-3.5 h-3.5 text-emerald-500" /> Efectivo
            </button>

            <button
              type="button"
              onClick={() => setMethod('transfer')}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                method === 'transfer'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : isDark
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-500" /> Transferencia
            </button>
          </div>
        </div>

        {/* Efectivo y Vuelto */}
        {method === 'cash' && (
          <div className={`p-2.5 rounded-xl border space-y-1.5 font-mono text-xs ${
            isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-zinc-400">Paga con:</span>
              <input
                type="number"
                placeholder={finalTotal.toString()}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className={`w-32 rounded-lg px-2 py-1 text-right text-xs font-bold border focus:outline-hidden focus:border-emerald-500 ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
            <div className={`flex justify-between pt-1 border-t ${
              isDark ? 'border-zinc-800/80' : 'border-slate-200'
            }`}>
              <span className={isDark ? 'text-zinc-400' : 'text-slate-600'}>Vuelto:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                ${change.toLocaleString('es-CL')}
              </span>
            </div>
          </div>
        )}

        {/* Botón Final */}
        <button
          onClick={handleProcessPayment}
          disabled={processing}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-md shadow-emerald-600/20 cursor-pointer shrink-0"
        >
          {processing ? (
            <span className="animate-pulse flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Procesando...
            </span>
          ) : (
            <>
              <Check className="w-4 h-4 stroke-[3]" /> Liquidar Pedido
            </>
          )}
        </button>
      </div>
    </div>
  );
}