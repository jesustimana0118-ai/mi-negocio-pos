import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShiftClosingModal } from './ShiftClosingModal';
import { 
  DollarSign, Lock, Unlock, Receipt, CreditCard, 
  ArrowDownCircle, Clock, User, Eye, 
  CheckCircle2, X, RefreshCw, 
  ShoppingBag, Landmark
} from 'lucide-react';

interface CurrentShift {
  id: string;
  opened_at: string;
  initial_cash: number;
  status: 'open' | 'closed';
  opened_by?: string;
  cashier_name?: string;
}

interface PaidOrder {
  id: string;
  order_number: number;
  paid_at: string;
  waiter_name: string;
  payment_method?: string;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
  is_staff_meal?: boolean;
  table?: {
    table_number: number;
    name: string;
  } | null;
  order_items?: {
    id: string;
    quantity: number;
    unit_price?: number;
    subtotal?: number;
    product?: {
      name: string;
    };
  }[];
}

interface CashMovement {
  id: string;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  created_at: string;
  created_by_name?: string;
}

interface CashRegisterViewProps {
  isDark?: boolean;
}

export function CashRegisterView({ isDark = true }: CashRegisterViewProps) {
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [paidOrders, setPaidOrders] = useState<PaidOrder[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Apertura de turno
  const [cashierPin, setCashierPin] = useState('');
  const [initialFund, setInitialFund] = useState('50000');
  const [pinError, setPinError] = useState(false);
  const [openingLoading, setOpeningLoading] = useState(false);

  // Modales
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PaidOrder | null>(null);

  // Formulario Caja Chica
  const [movType, setMovType] = useState<'out' | 'in'>('out');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');
  const [submittingMov, setSubmittingMov] = useState(false);

  async function loadCashData() {
    setLoading(true);
    try {
      // 1. Obtener turno abierto actual
      const { data: shiftData } = await supabase
        .from('cash_shifts')
        .select('*')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (shiftData) {
        let cashier = 'Cajero Turno';
        if (shiftData.opened_by) {
          const { data: staffData } = await supabase
            .from('staff')
            .select('name')
            .eq('id', shiftData.opened_by)
            .maybeSingle();
          if (staffData?.name) cashier = staffData.name;
        }

        setCurrentShift({
          ...shiftData,
          cashier_name: cashier,
        });

        // 2. Traer órdenes pagadas durante este turno
        const { data: ordersData } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            paid_at,
            waiter_name,
            payment_method,
            subtotal_net,
            iva_amount,
            tip_amount,
            total_amount,
            is_staff_meal,
            table:restaurant_tables(table_number, name),
            order_items(
              id,
              quantity,
              unit_price,
              subtotal,
              product:products(name)
            )
          `)
          .eq('status', 'paid')
          .gte('paid_at', shiftData.opened_at)
          .order('paid_at', { ascending: false });

        setPaidOrders((ordersData as unknown as PaidOrder[]) || []);

        // 3. Traer movimientos de caja chica del turno
        const { data: movsData } = await supabase
          .from('cash_movements')
          .select('*')
          .eq('shift_id', shiftData.id)
          .order('created_at', { ascending: false });

        setMovements((movsData as CashMovement[]) || []);
      } else {
        setCurrentShift(null);
        setPaidOrders([]);
        setMovements([]);
      }
    } catch (err) {
      console.error('Error cargando datos de caja:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCashData();

    const channel = supabase
      .channel('cash_register_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadCashData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_movements' }, () => {
        loadCashData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Apertura de turno
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cashierPin.length < 4) return;
    setOpeningLoading(true);
    setPinError(false);

    try {
      const { data: staffData, error: staffErr } = await supabase
        .from('staff')
        .select('*')
        .eq('pin_code', cashierPin)
        .maybeSingle();

      if (staffErr || !staffData) {
        setPinError(true);
        setOpeningLoading(false);
        return;
      }

      const initialNum = Math.max(0, parseFloat(initialFund) || 0);

      const { error: shiftErr } = await supabase
        .from('cash_shifts')
        .insert({
          opened_at: new Date().toISOString(),
          opened_by: staffData.id,
          initial_cash: initialNum,
          status: 'open',
          total_sales: 0,
          total_net: 0,
          total_iva: 0,
          total_tips: 0,
        });

      if (shiftErr) throw shiftErr;

      setCashierPin('');
      setInitialFund('50000');
      loadCashData();
    } catch (err: any) {
      alert('Error abriendo turno: ' + (err?.message || 'Error de base de datos'));
    } finally {
      setOpeningLoading(false);
    }
  };

  // Registro de Caja Chica
  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShift || !movAmount || !movReason.trim()) return;

    setSubmittingMov(true);
    try {
      const amountNum = parseFloat(movAmount);
      if (isNaN(amountNum) || amountNum <= 0) return;

      const { error } = await supabase.from('cash_movements').insert({
        shift_id: currentShift.id,
        type: movType,
        amount: amountNum,
        reason: movReason.trim(),
        created_by_name: currentShift.cashier_name || 'Cajero',
      });

      if (error) throw error;

      setShowMovementModal(false);
      setMovAmount('');
      setMovReason('');
      loadCashData();
    } catch (err: any) {
      alert('Error registrando movimiento: ' + (err?.message || 'Error'));
    } finally {
      setSubmittingMov(false);
    }
  };

  // Métricas visibles para el cajero
  const cardSales = paidOrders
    .filter((o) => o.payment_method === 'card' || o.payment_method === 'debit' || o.payment_method === 'credit')
    .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

  const transferSales = paidOrders
    .filter((o) => o.payment_method === 'transfer')
    .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

  const totalTips = paidOrders.reduce((acc, o) => acc + (Number(o.tip_amount) || 0), 0);

  const totalOutMovements = movements
    .filter((m) => m.type === 'out')
    .reduce((acc, m) => acc + Number(m.amount), 0);

  return (
    <div className="space-y-5">
      {/* Cabecera Principal */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 ${
        isDark ? 'border-zinc-800' : 'border-slate-200'
      }`}>
        <div>
          <h2 className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <DollarSign className="w-4 h-4" />
            </span>
            Terminal de Caja & Facturación
          </h2>
          <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
            Registro de boletas emitidas, cuadratura de tarjetas y movimientos de caja chica
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentShift && (
            <>
              <button
                type="button"
                onClick={() => setShowMovementModal(true)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer ${
                  isDark 
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700' 
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
                }`}
              >
                <ArrowDownCircle className="w-3.5 h-3.5 text-amber-500" />
                <span>Caja Chica (Gastos)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowClosingModal(true)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-rose-600/20 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Cerrar Turno (Arqueo)</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={loadCashData}
            disabled={loading}
            className={`p-2 rounded-xl border transition active:scale-95 shadow-xs cursor-pointer ${
              isDark 
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700' 
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Refrescar caja"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* ESTADO 1: CAJA CERRADA */}
      {!currentShift && !loading && (
        <div className="max-w-md mx-auto my-8">
          <div className={`p-6 rounded-3xl border shadow-2xl space-y-5 ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-500">
                <Unlock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black">Apertura de Caja</h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Inicia un nuevo turno para habilitar los cobros del restaurante
              </p>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4 font-mono">
              <div className="space-y-1">
                <label className="text-xs font-bold flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-blue-500" /> PIN del Cajero:
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={cashierPin}
                  onChange={(e) => setCashierPin(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-center text-lg tracking-widest font-black border outline-none ${
                    pinError ? 'border-rose-500 bg-rose-500/10' : isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-slate-50 border-slate-300'
                  }`}
                  autoFocus
                />
                {pinError && (
                  <p className="text-[11px] text-rose-500 font-sans font-bold">PIN incorrecto o sin permisos de personal.</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Fondo Inicial (Sencillo para Vuelto):
                </label>
                <input
                  type="number"
                  required
                  step="1000"
                  value={initialFund}
                  onChange={(e) => setInitialFund(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-right text-base font-black border outline-none tabular-nums ${
                    isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-slate-50 border-slate-300'
                  }`}
                />
                <p className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Monto físico disponible en la gaveta antes de iniciar las ventas.
                </p>
              </div>

              <button
                type="submit"
                disabled={openingLoading || cashierPin.length < 4}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {openingLoading ? 'Verificando y Abriendo...' : 'Comenzar Turno de Caja'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ESTADO 2: CAJA ABIERTA */}
      {currentShift && (
        <>
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-emerald-500 uppercase tracking-wider font-mono">
                    Turno Activo
                  </span>
                  <span className={`text-xs font-bold ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                    • Responsable: <strong>{currentShift.cashier_name}</strong>
                  </span>
                </div>
                <p className={`text-[11px] font-mono mt-0.5 flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  <Clock className="w-3 h-3" />
                  Apertura: {new Date(currentShift.opened_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} • Sencillo Inicial: ${currentShift.initial_cash.toLocaleString('es-CL')}
                </p>
              </div>
            </div>

            <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              {paidOrders.length} boletas cobradas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-2xl border ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-violet-600 dark:text-violet-400">
                <span>Ventas con Tarjeta (POS)</span>
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-zinc-100">
                  ${cardSales.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Para cuadrar con voucher Transbank
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
                <span>Transferencias</span>
                <Landmark className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-zinc-100">
                  ${transferSales.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Verificadas en cartola bancaria
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
                <span>Gastos de Caja Chica</span>
                <ArrowDownCircle className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                  ${totalOutMovements.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  {movements.length} retiros/gastos registrados
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span>Propinas Acumuladas</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  ${totalTips.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Fondo del personal del turno
                </p>
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border overflow-hidden shadow-xs ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`p-4 border-b flex items-center justify-between ${
              isDark ? 'border-zinc-800 bg-zinc-950/50' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-500" />
                <h3 className="font-extrabold text-sm">Historial de Boletas & Cuentas Cobradas</h3>
              </div>
              <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Registro auditado en tiempo real
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className={`border-b text-[11px] uppercase ${
                  isDark ? 'bg-zinc-950 text-zinc-400 border-zinc-800' : 'bg-slate-50 text-slate-700 border-slate-200 font-bold'
                }`}>
                  <tr>
                    <th className="p-3.5">N° / Hora</th>
                    <th className="p-3.5">Ubicación</th>
                    <th className="p-3.5">Garzón</th>
                    <th className="p-3.5">Medio de Pago</th>
                    <th className="p-3.5 text-right">Neto + IVA</th>
                    <th className="p-3.5 text-right">Propina</th>
                    <th className="p-3.5 text-right">Total Cobrado</th>
                    <th className="p-3.5 text-center">Acción</th>
                  </tr>
                </thead>

                <tbody className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-slate-200/80'}`}>
                  {paidOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-xs text-zinc-500">
                        No hay pagos procesados en este turno todavía.
                      </td>
                    </tr>
                  ) : (
                    paidOrders.map((order) => {
                      const isTakeout = !order.table || !order.table.table_number;
                      const timeStr = new Date(order.paid_at).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      const method = order.payment_method || 'cash';
                      const methodLabel =
                        method === 'card' || method === 'debit' || method === 'credit'
                          ? 'Tarjeta'
                          : method === 'transfer'
                          ? 'Transferencia'
                          : 'Efectivo';

                      return (
                        <tr key={order.id} className={isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50/80'}>
                          <td className="p-3.5">
                            <span className={`font-bold block ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                              #{order.order_number}
                            </span>
                            <span className="text-[10px] text-zinc-400">{timeStr}</span>
                          </td>

                          <td className="p-3.5 font-sans">
                            {order.is_staff_meal ? (
                              <span className="text-emerald-500 font-bold text-[11px]">Colación $0</span>
                            ) : isTakeout ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-violet-500 font-bold">
                                <ShoppingBag className="w-3 h-3" /> Para Llevar
                              </span>
                            ) : (
                              <span className="font-bold text-xs">Mesa #{order.table?.table_number}</span>
                            )}
                          </td>

                          <td className="p-3.5 font-sans text-zinc-300">
                            {order.waiter_name || 'Garzón'}
                          </td>

                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              methodLabel === 'Tarjeta'
                                ? 'bg-violet-500/10 text-violet-400 border-violet-500/30'
                                : methodLabel === 'Transferencia'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {methodLabel}
                            </span>
                          </td>

                          <td className="p-3.5 text-right tabular-nums text-zinc-400">
                            ${(Number(order.subtotal_net || 0) + Number(order.iva_amount || 0)).toLocaleString('es-CL')}
                          </td>

                          <td className="p-3.5 text-right tabular-nums text-blue-400 font-bold">
                            +${(Number(order.tip_amount) || 0).toLocaleString('es-CL')}
                          </td>

                          <td className="p-3.5 text-right tabular-nums font-black text-sm text-emerald-500">
                            ${(Number(order.total_amount) || 0).toLocaleString('es-CL')}
                          </td>

                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              className={`p-1.5 rounded-lg border transition active:scale-95 cursor-pointer ${
                                isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                              }`}
                              title="Ver detalle del consumo"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL 1: Caja Chica */}
      {showMovementModal && currentShift && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className={`w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-4 ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-zinc-800">
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm">Movimiento de Caja Chica</h3>
              </div>
              <button
                onClick={() => setShowMovementModal(false)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMovement} className="space-y-3.5 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovType('out')}
                  className={`py-2 rounded-xl font-bold border transition cursor-pointer ${
                    movType === 'out'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}
                >
                  Gasto / Retiro
                </button>
                <button
                  type="button"
                  onClick={() => setMovType('in')}
                  className={`py-2 rounded-xl font-bold border transition cursor-pointer ${
                    movType === 'in'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}
                >
                  Ingreso Extra
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-400">Monto en Efectivo (CLP):</label>
                <input
                  type="number"
                  required
                  placeholder="Ej: 8000"
                  value={movAmount}
                  onChange={(e) => setMovAmount(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-base font-bold outline-none tabular-nums"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-400">Motivo / Justificación:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Compra de limones urgente, Retiro caja fuerte"
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submittingMov}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl transition cursor-pointer active:scale-95"
              >
                {submittingMov ? 'Registrando...' : 'Confirmar Movimiento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Detalle de Boleta */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className={`w-full max-w-sm rounded-3xl p-5 border shadow-2xl space-y-4 ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-zinc-800">
              <div>
                <h4 className="font-bold text-sm">Comanda #{selectedOrder.order_number}</h4>
                <p className="text-[11px] font-mono text-zinc-400">
                  {new Date(selectedOrder.paid_at).toLocaleString('es-CL')}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-xs p-2 rounded-xl bg-zinc-950 border border-zinc-800">
              {selectedOrder.order_items?.map((it) => (
                <div key={it.id} className="flex justify-between items-center py-1 border-b border-zinc-800/60 last:border-0">
                  <span>
                    <strong className="text-amber-400">{it.quantity}x</strong> {it.product?.name || 'Ítem'}
                  </span>
                  <span className="tabular-nums">${(Number(it.subtotal) || 0).toLocaleString('es-CL')}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 font-mono text-xs border-t border-zinc-800 pt-2 text-zinc-300">
              <div className="flex justify-between">
                <span className="text-zinc-400">Neto:</span>
                <span>${Number(selectedOrder.subtotal_net || 0).toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">IVA (19%):</span>
                <span>${Number(selectedOrder.iva_amount || 0).toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-blue-400">
                <span>Propina (10%):</span>
                <span>+${Number(selectedOrder.tip_amount || 0).toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-emerald-400 pt-1 border-t border-zinc-800">
                <span>Total Pagado:</span>
                <span>${Number(selectedOrder.total_amount || 0).toLocaleString('es-CL')}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: Cierre de Turno Ciego */}
      {showClosingModal && currentShift && (
        <ShiftClosingModal
          shiftId={currentShift.id}
          onClose={() => setShowClosingModal(false)}
          onShiftClosed={() => {
            setShowClosingModal(false);
            loadCashData();
          }}
        />
      )}
    </div>
  );
}