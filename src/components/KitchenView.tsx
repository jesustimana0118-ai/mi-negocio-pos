import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChefHat, Clock, CheckCircle2, RefreshCw } from 'lucide-react';

interface KitchenOrderItem {
  id: string;
  order_id: string;
  quantity: number;
  status: 'pending' | 'preparing' | 'ready';
  created_at?: string;
  product: {
    name: string;
  };
}

interface KitchenOrder {
  id: string;
  order_number: number;
  created_at: string;
  table: {
    table_number: number;
    name: string;
  };
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
    const nextStatus: 'pending' | 'preparing' | 'ready' =
      item.status === 'pending'
        ? 'preparing'
        : item.status === 'preparing'
        ? 'ready'
        : 'pending';

    // Actualización inmediata en memoria sin saltos ni recargas
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
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-500" />
            Pantalla KDS • Comandas en Marcha
          </h2>
          <p className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Recepción y despacho en tiempo real vía WebSockets
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold font-mono px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
            {orders.length} comanda(s) activas
          </span>
          <button
            onClick={() => loadKitchenOrders(false)}
            disabled={loading}
            className={`p-2 rounded-xl border transition active:scale-95 ${
              isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
            title="Refrescar KDS"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Listado de Comandas */}
      {loading ? (
        <div className="py-24 text-center text-xs font-mono text-slate-400 animate-pulse">
          Sincronizando comandas con salón...
        </div>
      ) : orders.length === 0 ? (
        <div className="py-24 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <p className="font-bold text-sm">Sin comandas pendientes en cocina</p>
          <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Todo el servicio está despachado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => {
            const minutesAgo = Math.floor(
              (Date.now() - new Date(order.created_at).getTime()) / 60000
            );

            return (
              <div
                key={order.id}
                className={`rounded-2xl border p-4 flex flex-col justify-between space-y-3.5 shadow-sm transition-all ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                {/* Cabecera de la tarjeta */}
                <div className={`flex justify-between items-start border-b pb-3 ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
                  <div>
                    <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                      Mesa #{order.table?.table_number}
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{order.table?.name}</h3>
                  </div>

                  <span className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                    minutesAgo > 25
                      ? 'text-rose-600 bg-rose-50 border-rose-200 animate-pulse'
                      : 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                  }`}>
                    <Clock className="w-3 h-3" />
                    {minutesAgo}m
                  </span>
                </div>

                {/* Filas de platos con interacción elegante */}
                <div className="space-y-2 flex-1">
                  {order.items.map((item) => {
                    
                    const isPreparing = item.status === 'preparing';
                    const isReady = item.status === 'ready';

                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleItemStatus(item)}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all active:scale-[0.98] ${
                          isReady
                            ? 'bg-slate-50/60 dark:bg-zinc-950/60 border-slate-200 dark:border-zinc-800 opacity-60'
                            : isPreparing
                            ? 'bg-amber-50/50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
                            : 'bg-white dark:bg-zinc-950/80 border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg border ${
                            isReady
                              ? 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                              : isPreparing
                              ? 'bg-amber-500 text-white border-amber-600'
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700'
                          }`}>
                            {item.quantity}x
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-zinc-100 truncate">
                            {item.product?.name}
                          </span>
                        </div>

                        {/* Badge de estado refinado */}
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider uppercase border shrink-0 ${
                          isReady
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                            : isPreparing
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                        }`}>
                          {isReady ? 'Listo' : isPreparing ? 'Preparando' : 'Marchado'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Pie */}
                <div className={`pt-2.5 border-t flex justify-between text-[11px] font-mono ${
                  isDark ? 'border-zinc-800 text-zinc-500' : 'border-slate-100 text-slate-400'
                }`}>
                  <span>Comanda #{order.order_number}</span>
                  <span>Toca un plato para cambiar estado</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}