import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RestaurantTable } from '../types/database';
import { 
  X, Banknote, CreditCard, 
  ArrowRightLeft, Receipt, Check, Utensils, HeartHandshake, Loader2, ShoppingBag,
  Users, Trash2, Plus, Split
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

interface PartialPayment {
  id: string;
  amount: number;
  method: PaymentOption;
  label: string;
}

export function CheckoutModal({ 
  table, 
  order, 
  onClose, 
  onPaymentSuccess, 
  isDark = true 
}: CheckoutModalProps) {
  // Modalidad: Pago Total vs Dividir Cuenta
  const [payMode, setPayMode] = useState<'full' | 'split'>('full');

  // Pago Total Tradicional
  const [method, setMethod] = useState<PaymentOption>('card_debit');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<OrderItemDetail[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // División de Cuentas (Split Bill)
  const [splitCount, setSplitCount] = useState<number>(2);
  const [partialPayments, setPartialPayments] = useState<PartialPayment[]>([]);
  const [currentPartialAmount, setCurrentPartialAmount] = useState<string>('');
  const [currentPartialMethod, setCurrentPartialMethod] = useState<PaymentOption>('card_debit');

  const isTakeout = !table || order.waiter_name?.includes('Para Llevar');
  const baseTotal = (order.subtotal_net || 0) + (order.iva_amount || 0) || order.total_amount;
  const suggestedTip = Math.round(baseTotal * 0.10);
  
  // Propina
  const [includeTip, setIncludeTip] = useState<boolean>(!isTakeout);
  const currentTip = includeTip ? (order.tip_amount > 0 ? order.tip_amount : suggestedTip) : 0;
  const finalTotal = baseTotal + currentTip;

  // Cálculos de División
  const totalPaidSoFar = partialPayments.reduce((acc, p) => acc + p.amount, 0);
  const remainingBalance = Math.max(0, finalTotal - totalPaidSoFar);
  const suggestedQuota = Math.ceil(finalTotal / splitCount);

  // Si cambia el total o la cantidad de personas, predefinimos el input con la cuota o el saldo restante
  useEffect(() => {
    if (remainingBalance > 0) {
      const quota = Math.min(remainingBalance, suggestedQuota);
      setCurrentPartialAmount(quota.toString());
    } else {
      setCurrentPartialAmount('0');
    }
  }, [splitCount, remainingBalance, suggestedQuota]);

  // Vuelto en efectivo para pago total
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

  // Agregar un abono en modo Split
  const handleAddPartialPayment = () => {
    const amountNum = parseFloat(currentPartialAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    const actualAmount = Math.min(amountNum, remainingBalance);

    const methodLabels: Record<PaymentOption, string> = {
      card_debit: 'Débito',
      card_credit: 'Crédito',
      cash: 'Efectivo',
      transfer: 'Transferencia',
    };

    const newPayment: PartialPayment = {
      id: Math.random().toString(36).substring(2, 9),
      amount: actualAmount,
      method: currentPartialMethod,
      label: methodLabels[currentPartialMethod],
    };

    setPartialPayments((prev) => [...prev, newPayment]);
  };

  const handleRemovePartialPayment = (id: string) => {
    setPartialPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handleProcessPayment = async () => {
    setProcessing(true);
    try {
      // Determinar método registrado final
      let finalMethod: string = method;
      if (payMode === 'split') {
        const uniqueMethods = Array.from(new Set(partialPayments.map((p) => p.method)));
        if (uniqueMethods.length === 1) {
          finalMethod = uniqueMethods[0];
        } else {
          finalMethod = 'split';
        }
      }

      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method: finalMethod,
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
            type="button"
            onClick={onClose} 
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isDark ? 'text-zinc-400 hover:text-zinc-100 bg-zinc-800/60' : 'text-slate-400 hover:text-slate-800 bg-slate-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de Modalidad: Pago Total vs Dividir Cuenta */}
        <div className={`grid grid-cols-2 p-1 rounded-xl border shrink-0 ${
          isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => setPayMode('full')}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              payMode === 'full'
                ? 'bg-blue-600 text-white shadow-xs'
                : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" /> Pago Completo
          </button>

          <button
            type="button"
            onClick={() => setPayMode('split')}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              payMode === 'split'
                ? 'bg-purple-600 text-white shadow-xs'
                : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Split className="w-3.5 h-3.5" /> Dividir Cuenta
          </button>
        </div>

        {/* Desglose de Productos */}
        <div className="space-y-1 shrink-0">
          <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            isDark ? 'text-zinc-400' : 'text-slate-600'
          }`}>
            <Utensils className="w-3.5 h-3.5 text-blue-500" />
            Detalle del Consumo:
          </label>
          
          <div className={`rounded-xl border p-2.5 max-h-24 overflow-y-auto space-y-1.5 ${
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
        <div className={`flex items-center justify-between p-2.5 rounded-xl border transition-all shrink-0 ${
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

        {/* Resumen de Total */}
        <div className={`p-3 rounded-xl border space-y-1.5 shrink-0 ${
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
              Total Cuenta:
            </span>
            <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              ${finalTotal.toLocaleString('es-CL')}
            </span>
          </div>
        </div>

        {/* --- OPCIÓN A: PAGO COMPLETO TRADICIONAL --- */}
        {payMode === 'full' && (
          <div className="space-y-3">
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

            <button
              type="button"
              onClick={handleProcessPayment}
              disabled={processing}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-md shadow-emerald-600/20 cursor-pointer shrink-0"
            >
              {processing ? (
                <span className="animate-pulse flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando Cobro...
                </span>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" /> Liquidar Pedido (${finalTotal.toLocaleString('es-CL')})
                </>
              )}
            </button>
          </div>
        )}

        {/* --- OPCIÓN B: DIVISIÓN DE CUENTAS (SPLIT BILL) --- */}
        {payMode === 'split' && (
          <div className="space-y-3 font-mono">
            {/* Calculadora de personas */}
            <div className={`p-3 rounded-xl border space-y-2 ${
              isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold flex items-center gap-1.5 text-zinc-300">
                  <Users className="w-3.5 h-3.5 text-purple-400" /> Dividir entre comensales:
                </span>
                <span className="text-purple-400 font-bold">
                  {splitCount} pers. (${suggestedQuota.toLocaleString('es-CL')} c/u)
                </span>
              </div>

              <div className="flex gap-1.5">
                {[2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSplitCount(num)}
                    className={`flex-1 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      splitCount === num
                        ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                        : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Formulario de Abono Parcial */}
            {remainingBalance > 0 && (
              <div className={`p-3 rounded-xl border space-y-2.5 ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
              }`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-300">Cobrar Abono / Cuota:</span>
                  <button
                    type="button"
                    onClick={() => setCurrentPartialAmount(remainingBalance.toString())}
                    className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                  >
                    Pagar Restante Total
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400">Monto del Abono:</label>
                    <input
                      type="number"
                      value={currentPartialAmount}
                      onChange={(e) => setCurrentPartialAmount(e.target.value)}
                      className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold border outline-none text-right tabular-nums ${
                        isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400">Medio de Pago:</label>
                    <select
                      value={currentPartialMethod}
                      onChange={(e) => setCurrentPartialMethod(e.target.value as PaymentOption)}
                      className={`w-full rounded-xl px-2 py-1.5 text-xs font-bold border outline-none cursor-pointer ${
                        isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="card_debit">Débito</option>
                      <option value="card_credit">Crédito</option>
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddPartialPayment}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Registrar Abono (+${Number(currentPartialAmount || 0).toLocaleString('es-CL')})
                </button>
              </div>
            )}

            {/* Listado de Abonos Realizados */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-zinc-400">Abonos Registrados ({partialPayments.length}):</span>
                <span className="font-bold text-emerald-400 tabular-nums">
                  Pagado: ${totalPaidSoFar.toLocaleString('es-CL')}
                </span>
              </div>

              {partialPayments.length === 0 ? (
                <div className="p-3 text-center text-xs text-zinc-500 border border-dashed rounded-xl border-zinc-800">
                  Aún no se registran pagos parciales para esta cuenta.
                </div>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {partialPayments.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs ${
                        isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-400 text-[10px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-zinc-200">
                          ${p.amount.toLocaleString('es-CL')}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded border bg-zinc-800 border-zinc-700 text-zinc-300">
                          {p.label}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePartialPayment(p.id)}
                        className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        title="Eliminar este abono"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Estado del Saldo Pendiente */}
            <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
              remainingBalance === 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              <span>Saldo Pendiente:</span>
              <span className="text-sm font-black tabular-nums">
                {remainingBalance === 0 ? '✓ Cuenta 100% Cubierta' : `$${remainingBalance.toLocaleString('es-CL')}`}
              </span>
            </div>

            {/* Botón Final cuando la cuenta está completamente pagada */}
            <button
              type="button"
              disabled={remainingBalance > 0 || processing}
              onClick={handleProcessPayment}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-md shadow-emerald-600/20 cursor-pointer shrink-0"
            >
              {processing ? (
                <span className="animate-pulse flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Finalizando Cuenta...
                </span>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" /> Finalizar y Liberar Mesa (Cuenta Completa)
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}