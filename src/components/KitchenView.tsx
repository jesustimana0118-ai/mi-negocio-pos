import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat, Clock, CheckCircle2, RefreshCw, Flame, Check, ShoppingBag, Utensils, CheckCheck } from 'lucide-react';

interface KitchenOrderItem {
  id: string;
  order_id: string;
  quantity: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  created_at?: string;
  product?: {
    name: string;
  };
}

interface KitchenOrder {
  id: string;
  order_number: number;
  created_at: string;
  waiter_name?: string;
  is_staff_meal?: boolean;
  status: string;
  table: {
    table_number: number;
    name: string;
  } | null;
  items: KitchenOrderItem[];
}

interface KitchenViewProps {
  isDark?: boolean;
}

export function KitchenView({ isDark = false }: KitchenViewProps) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  // Intervalo para actualizar los minutos en tiempo real cada 30 segundos
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  async function loadKitchenOrders(isBackground = false) {
    if (!isBackground) setLoading(true);

    try {
      // Trae comandas abiertas de salón/llevar O colaciones pagadas con platos pendientes
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          created_at,
          waiter_name,
          is_staff_meal,
          status,
          table:restaurant_tables(table_number, name)
        `)
        .or('status.eq.open,is_staff_meal.eq.true')
        .order('created_at', { ascending: true });

      if (ordersError) throw ordersError;

      if (ordersData && ordersData.length > 0) {
        const orderIds = ordersData.map((o) => o.id);

        const { data: itemsData, error: itemsError } = await supabase
          .from('order_items')
          .select(`
            id,
            order_id,
            quantity,
            status,
            created_at,
            product:products(name)
          `)
          .in('order_id', orderIds)
          .order('id', { ascending: true });

        if (itemsError) throw itemsError;

        const itemsList = (itemsData || []) as unknown as KitchenOrderItem[];

        const grouped = ordersData
          .map((order: any) => {
            const tableObj = Array.isArray(order.table)
              ? (order.table.length > 0 ? order.table[0] : null)
              : order.table;

            return {
              id: order.id,
              order_number: order.order_number,
              created_at: order.created_at,
              waiter_name: order.waiter_name,
              is_staff_meal: Boolean(order.is_staff_meal),
              status: order.status,
              table: tableObj,
              items: itemsList.filter((item) => item.order_id === order.id),
            };
          })
          // Mostrar sólo comandas que tengan al menos un plato pendiente o listo
          .filter((order) => (order.items || []).some((it) => it.status !== 'completed'));

        setOrders(grouped);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error('Error cargando comandas de cocina:', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => {
    loadKitchenOrders();

    const channel = supabase
      .channel('kds_realtime_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => loadKitchenOrders(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => loadKitchenOrders(true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleItemStatus = async (item: KitchenOrderItem) => {
    if (!item || !item.id) return;

    let nextStatus: 'pending' | 'ready' | 'completed' = 'pending';

    if (!item.status || item.status === 'pending') {
      nextStatus = 'ready';
    } else if (item.status === 'ready' || item.status === 'preparing') {
      nextStatus = 'completed';
    } else {
      nextStatus = 'pending';
    }

    setOrders((prevOrders) =>
      (prevOrders || []).map((order) => {
        if (!order || order.id !== item.order_id) return order;
        return {
          ...order,
          items: (order.items || []).map((it) =>
            it.id === item.id ? { ...it, status: nextStatus } : it
          ),
        };
      }).filter((order) => order.items.some((it) => it.status !== 'completed'))
    );

    try {
      const { error } = await supabase
        .from('order_items')
        .update({ status: nextStatus })
        .eq('id', item.id);

      if (error) throw error;
    } catch (err) {
      console.error('Error al actualizar ítem en Supabase:', err);
    }
  };

  const markAllItemsReady = async (orderId: string) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        return {
          ...order,
          items: order.items.map((it) => ({ ...it, status: 'ready' as const })),
        };
      })
    );

    try {
      await supabase
        .from('order_items')
        .update({ status: 'ready' })
        .eq('order_id', orderId)
        .neq('status', 'completed');
    } catch (err) {
      console.error('Error al despachar comanda:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <ChefHat className="w-4 h-4" />
            </span>
            Pantalla KDS • Comandas en Marcha
          </h2>
          <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
            Recepción y despacho en tiempo real vía WebSockets
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold font-mono px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-xs">
            {orders.length} comanda(s) activas
          </span>
          <button
            onClick={() => loadKitchenOrders(false)}
            disabled={loading}
            className={`p-2 rounded-xl border transition-all active:scale-95 shadow-xs cursor-pointer ${
              isDark
                ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
            title="Refrescar KDS"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Listado de Comandas */}
      {loading ? (
        <div className={`py-24 text-center text-xs font-mono animate-pulse rounded-2xl border ${
          isDark ? 'border-zinc-800 text-zinc-500 bg-zinc-900/30' : 'border-slate-200 text-slate-500 bg-white/70 shadow-inner'
        }`}>
          Sincronizando comandas con salón...
        </div>
      ) : orders.length === 0 ? (
        <div className={`py-24 text-center space-y-3 rounded-2xl border ${
          isDark ? 'border-zinc-800/80 bg-zinc-900/20' : 'border-slate-200 bg-white shadow-xs'
        }`}>
          <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto" />
          <div>
            <p className={`font-bold text-sm ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>Sin comandas pendientes en cocina</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Todo el servicio está despachado.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => {
            const rawMinutes = order.created_at
              ? Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)
              : 0;
            const minutesAgo = isNaN(rawMinutes) ? 0 : Math.max(0, rawMinutes);
            const isTakeout = !order.table || !order.table.table_number;
            const isStaffMeal = order.is_staff_meal;

            const allReady = order.items.every((it) => it.status === 'ready' || it.status === 'completed');

            return (
              <div
                key={order.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between space-y-3.5 transition-all shadow-xs ${
                  isStaffMeal
                    ? isDark
                      ? 'bg-zinc-900/90 border-emerald-500/40 shadow-emerald-500/5'
                      : 'bg-white border-emerald-300 shadow-emerald-500/5'
                    : isTakeout
                    ? isDark
                      ? 'bg-zinc-900/90 border-violet-500/40 shadow-violet-500/5'
                      : 'bg-white border-violet-300 shadow-violet-500/5'
                    : isDark
                    ? 'bg-zinc-900/90 border-zinc-800'
                    : 'bg-white border-slate-200 hover:shadow-md'
                }`}
              >
                {/* Cabecera de la comanda */}
                <div className={`flex justify-between items-start border-b pb-3 ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
                  <div>
                    {isStaffMeal ? (
                      <div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-500/30 uppercase tracking-wide">
                          <Utensils className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          Colación Personal
                        </span>
                        <h3 className={`text-base font-extrabold mt-1 truncate max-w-[180px] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {order.waiter_name?.replace('Colación • ', '') || 'Personal'}
                        </h3>
                      </div>
                    ) : isTakeout ? (
                      <div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-500/20 px-2 py-0.5 rounded-md border border-violet-300 dark:border-violet-500/30 uppercase tracking-wide">
                          <ShoppingBag className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                          Para Llevar
                        </span>
                        <h3 className={`text-base font-extrabold mt-1 truncate max-w-[180px] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {order.waiter_name?.replace('Para Llevar • ', '') || 'Mostrador'}
                        </h3>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                          Mesa #{order.table?.table_number}
                        </span>
                        <h3 className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {order.table?.name || `Mesa ${order.table?.table_number}`}
                        </h3>
                      </div>
                    )}
                  </div>

                  <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    minutesAgo > 20
                      ? 'text-rose-700 bg-rose-50 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 animate-pulse'
                      : minutesAgo > 10
                      ? 'text-amber-800 bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                      : 'text-emerald-800 bg-emerald-50 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                  }`}>
                    <Clock className="w-3 h-3" />
                    {minutesAgo}m
                  </span>
                </div>

                {/* Filas de platos */}
                <div className="space-y-2 flex-1">
                  {(order.items || []).map((item) => {
                    const isPending = !item.status || item.status === 'pending';
                    const isReady = item.status === 'ready' || item.status === 'preparing';
                    const isCompleted = item.status === 'completed';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleItemStatus(item)}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                          isPending
                            ? isDark
                              ? 'bg-amber-500/[0.08] border-amber-500/40 hover:border-amber-400'
                              : 'bg-amber-50/50 border-amber-300 hover:border-amber-400 hover:bg-amber-50/80 shadow-xs'
                            : isReady
                            ? isDark
                              ? 'bg-emerald-500/[0.12] border-emerald-500/50 hover:border-emerald-400'
                              : 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-400 shadow-xs'
                            : isDark
                            ? 'bg-zinc-950/50 border-zinc-800/80 opacity-50'
                            : 'bg-slate-100/70 border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg border transition-colors ${
                            isPending
                              ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                              : isReady
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                              : isDark
                              ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              : 'bg-slate-200 text-slate-600 border-slate-300'
                          }`}>
                            {item.quantity}x
                          </span>
                          <span className={`text-xs font-bold truncate ${
                            isCompleted
                              ? 'line-through text-slate-500 dark:text-zinc-500'
                              : isDark
                              ? 'text-zinc-100'
                              : 'text-slate-900'
                          }`}>
                            {item.product?.name || 'Producto'}
                          </span>
                        </div>

                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-mono font-bold uppercase border shrink-0 transition-transform active:scale-95 ${
                          isPending
                            ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600 shadow-xs'
                            : isReady
                            ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-xs'
                            : isDark
                            ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            : 'bg-slate-200 text-slate-700 border-slate-300'
                        }`}>
                          {isPending && <Flame className="w-3 h-3 text-amber-100" />}
                          {isReady && <Check className="w-3 h-3 text-emerald-100" />}
                          {isPending ? 'Marchar' : isReady ? 'Listo' : 'Completado'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Despachar comanda completa si aún hay pendientes */}
                {!allReady && (
                  <button
                    type="button"
                    onClick={() => markAllItemsReady(order.id)}
                    className={`w-full py-1.5 px-3 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer ${
                      isDark
                        ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Marchar Todo Como Listo</span>
                  </button>
                )}

                {/* Pie */}
                <div className={`pt-2.5 border-t flex justify-between text-[11px] font-mono ${
                  isDark ? 'border-zinc-800 text-zinc-500' : 'border-slate-100 text-slate-500'
                }`}>
                  <span>Comanda #{order.order_number}</span>
                  <span>{isStaffMeal ? 'Colación interna' : isTakeout ? 'Empaque para llevar' : 'Servicio en salón'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}