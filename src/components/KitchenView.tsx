import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat, Clock, CheckCircle2, RefreshCw, Flame, Check, ShoppingBag } from 'lucide-react';

interface KitchenOrderItem {
  id: string;
  order_id: string;
  quantity: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  created_at?: string;
  product: {
    name: string;
  };
}

interface KitchenOrder {
  id: string;
  order_number: number;
  created_at: string;
  waiter_name?: string;
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

  async function loadKitchenOrders(isBackground = false) {
    if (!isBackground) setLoading(true);

    const { data: ordersData } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        created_at,
        waiter_name,
        table:restaurant_tables(table_number, name)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: true });

    if (ordersData && ordersData.length > 0) {
      const orderIds = ordersData.map((o) => o.id);

      const { data: itemsData } = await supabase
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

      const itemsList = (itemsData || []) as unknown as KitchenOrderItem[];

      const grouped = ordersData.map((order: any) => ({
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at,
        waiter_name: order.waiter_name,
        table: order.table,
        items: itemsList.filter((item) => item.order_id === order.id),
      }));

      setOrders(grouped);
    } else {
      setOrders([]);
    }

    if (!isBackground) setLoading(false);
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
    let nextStatus: 'pending' | 'ready' | 'completed' = 'pending';

    if (item.status === 'pending') {
      nextStatus = 'ready';
    } else if (item.status === 'ready' || item.status === 'preparing') {
      nextStatus = 'completed';
    } else {
      nextStatus = 'pending';
    }

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== item.order_id) return order;
        return {
          ...order,
          items: order.items.map((it) =>
            it.id === item.id ? { ...it, status: nextStatus } : it
          ),
        };
      })
    );

    await supabase
      .from('order_items')
      .update({ status: nextStatus })
      .eq('id', item.id);
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
            const minutesAgo = Math.floor(
              (Date.now() - new Date(order.created_at).getTime()) / 60000
            );
            const isTakeout = !order.table;

            return (
              <div
                key={order.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between space-y-3.5 transition-all shadow-xs ${
                  isTakeout
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
                    {isTakeout ? (
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
                          {order.table?.name}
                        </h3>
                      </div>
                    )}
                  </div>

                  <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    minutesAgo > 25
                      ? 'text-rose-700 bg-rose-50 border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 animate-pulse'
                      : 'text-amber-800 bg-amber-50 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                  }`}>
                    <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    {minutesAgo}m
                  </span>
                </div>

                {/* Filas de platos */}
                <div className="space-y-2 flex-1">
                  {order.items.map((item) => {
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
                            {item.product?.name}
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

                {/* Pie */}
                <div className={`pt-2.5 border-t flex justify-between text-[11px] font-mono ${
                  isDark ? 'border-zinc-800 text-zinc-500' : 'border-slate-100 text-slate-500'
                }`}>
                  <span>Comanda #{order.order_number}</span>
                  <span>{isTakeout ? 'Empaque desechable' : 'Servicio en loza'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}