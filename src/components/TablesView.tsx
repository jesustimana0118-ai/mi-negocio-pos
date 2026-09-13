import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RestaurantTable } from '../types/database';
import { 
  Users, Clock, Receipt, RefreshCw, 
  LayoutGrid, Plus, Trash2, X, Armchair, ShoppingBag, 
  ArrowRight, ArrowRightLeft, MoveRight
} from 'lucide-react';

interface OpenTakeoutOrder {
  id: string;
  order_number: number;
  waiter_name: string;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
  created_at: string;
}

interface TablesViewProps {
  onSelectTable: (table: RestaurantTable) => void;
  onNewTakeoutOrder: () => void;
  onSelectTakeoutOrder: (order: OpenTakeoutOrder) => void;
  isDark?: boolean;
}

export function TablesView({ 
  onSelectTable, 
  onNewTakeoutOrder,
  onSelectTakeoutOrder,
  isDark = true 
}: TablesViewProps) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [takeoutOrders, setTakeoutOrders] = useState<OpenTakeoutOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Crear Mesa
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [submitting, setSubmitting] = useState(false);

  // Modal Mover Mesa
  const [moveSourceTable, setMoveSourceTable] = useState<RestaurantTable | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    const { data: tablesData } = await supabase
      .from('restaurant_tables')
      .select('*')
      .order('table_number', { ascending: true });

    if (tablesData) {
      setTables(tablesData as RestaurantTable[]);
    }

    const { data: takeoutsData } = await supabase
      .from('orders')
      .select('id, order_number, waiter_name, subtotal_net, iva_amount, tip_amount, total_amount, created_at')
      .is('table_id', null)
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (takeoutsData) {
      setTakeoutOrders(takeoutsData as OpenTakeoutOrder[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const tablesChannel = supabase
      .channel('realtime_tables_view')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_tables' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tablesChannel);
    };
  }, []);

  const handleOpenCreateModal = () => {
    const nextNum = tables.length > 0 
      ? Math.max(...tables.map((t) => t.table_number || 0)) + 1 
      : 1;
    setTableNumber(nextNum.toString());
    setTableName(`Mesa ${nextNum}`);
    setTableCapacity('4');
    setIsModalOpen(true);
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(tableNumber, 10);
    const cap = parseInt(tableCapacity, 10) || 2;

    if (!num || !tableName.trim()) {
      alert('Por favor ingresa un número y nombre válido para la mesa.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .insert({
          table_number: num,
          name: tableName.trim(),
          capacity: cap,
          status: 'available',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          alert(`Ya existe una mesa registrada con el número ${num}.`);
        } else {
          throw error;
        }
        return;
      }

      if (data) {
        setTables((prev) => 
          [...prev, data as RestaurantTable].sort((a, b) => a.table_number - b.table_number)
        );
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert('Error al crear mesa: ' + (err?.message || 'Error de base de datos'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTable = async (e: React.MouseEvent, table: RestaurantTable) => {
    e.stopPropagation();

    if (table.status === 'occupied') {
      alert('No puedes eliminar una mesa que está ocupada.');
      return;
    }

    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar la "${table.name}" (#${table.table_number})?`
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('restaurant_tables')
        .delete()
        .eq('id', table.id);

      if (error) {
        if (error.code === '23503') {
          alert(`No se puede eliminar la mesa porque tiene historial de órdenes.`);
        } else {
          throw error;
        }
        return;
      }

      setTables((prev) => prev.filter((t) => t.id !== table.id));
    } catch (err: any) {
      alert('Error al eliminar mesa: ' + (err?.message || 'Error de base de datos'));
    }
  };

  // Mover cuenta exclusivamente a una mesa disponible
  const handleExecuteMove = async (targetTable: RestaurantTable) => {
    if (!moveSourceTable || targetTable.status !== 'available') return;

    const confirmed = window.confirm(
      `¿Mover comanda de "${moveSourceTable.name}" a "${targetTable.name}" (#${targetTable.table_number})?`
    );
    if (!confirmed) return;

    setMoveLoading(true);

    try {
      // 1. Obtener la comanda abierta de la mesa de origen
      const { data: sourceOrder, error: srcOrderErr } = await supabase
        .from('orders')
        .select('id')
        .eq('table_id', moveSourceTable.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (srcOrderErr || !sourceOrder) {
        throw new Error('No se encontró una comanda abierta en la mesa.');
      }

      // 2. Reasignar comanda a la nueva mesa
      const { error: transferErr } = await supabase
        .from('orders')
        .update({ table_id: targetTable.id })
        .eq('id', sourceOrder.id);

      if (transferErr) throw transferErr;

      // 3. Liberar mesa origen y ocupar mesa destino
      await supabase
        .from('restaurant_tables')
        .update({ status: 'available' })
        .eq('id', moveSourceTable.id);

      await supabase
        .from('restaurant_tables')
        .update({ status: 'occupied' })
        .eq('id', targetTable.id);

      setMoveSourceTable(null);
      await loadData();
    } catch (err: any) {
      alert('Error al mover mesa: ' + (err?.message || 'Error de base de datos'));
    } finally {
      setMoveLoading(false);
    }
  };

  const availableTargetTables = tables.filter(
    (t) => (!moveSourceTable || t.id !== moveSourceTable.id) && t.status === 'available'
  );

  return (
    <div className="space-y-4">
      {/* Cabecera del Salón */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
              <LayoutGrid className="w-4 h-4" />
            </span>
            Control del Salón & Mostrador
          </h2>
          <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
            {tables.length} mesas • {takeoutOrders.length} pedido(s) para llevar activos
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onNewTakeoutOrder}
            className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-violet-500/20 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" /> + Para Llevar
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 border cursor-pointer ${
              isDark
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
            }`}
          >
            <Plus className="w-4 h-4" /> Nueva Mesa
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className={`p-2 rounded-xl border transition-all active:scale-95 shadow-xs cursor-pointer ${
              isDark
                ? 'bg-zinc-800/90 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
            title="Refrescar estado"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pedidos Para Llevar Activos */}
      {takeoutOrders.length > 0 && (
        <div className={`p-3.5 rounded-2xl border space-y-2.5 transition-all ${
          isDark 
            ? 'bg-violet-950/20 border-violet-500/30' 
            : 'bg-violet-50/60 border-violet-200 shadow-xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-violet-700 dark:text-violet-300 flex items-center gap-1.5 uppercase tracking-wide">
              <ShoppingBag className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              Retiro en Mostrador ({takeoutOrders.length})
            </span>
            <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Toca para cobrar o revisar
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {takeoutOrders.map((order) => {
              const minutesAgo = Math.floor(
                (Date.now() - new Date(order.created_at).getTime()) / 60000
              );
              const clientName = order.waiter_name?.replace('Para Llevar • ', '') || 'Mostrador';

              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onSelectTakeoutOrder(order)}
                  className={`p-3 rounded-xl border text-left transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between ${
                    isDark
                      ? 'bg-zinc-900 border-zinc-800 hover:border-violet-500/60'
                      : 'bg-white border-slate-200 hover:border-violet-400 shadow-xs'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                        #{order.order_number}
                      </span>
                      <span className={`text-xs font-bold truncate ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                        {clientName}
                      </span>
                    </div>
                    <div className={`text-[11px] font-mono mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Hace {minutesAgo}m • <strong className="text-emerald-600 dark:text-emerald-400 font-bold">${order.total_amount.toLocaleString('es-CL')}</strong>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-violet-500 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid de Mesas */}
      {loading ? (
        <div className={`py-24 text-center text-xs font-mono animate-pulse rounded-2xl border ${
          isDark ? 'border-zinc-800 text-zinc-500 bg-zinc-900/30' : 'border-slate-200 text-slate-500 bg-white/70 shadow-inner'
        }`}>
          Sincronizando estado...
        </div>
      ) : tables.length === 0 ? (
        <div className={`py-20 text-center space-y-3 rounded-2xl border ${
          isDark ? 'border-zinc-800 bg-zinc-900/40 text-zinc-400' : 'border-slate-200 bg-white text-slate-500 shadow-xs'
        }`}>
          <Armchair className="w-10 h-10 mx-auto text-slate-400" />
          <p className="font-bold text-sm">No hay mesas creadas</p>
          <p className="text-xs">Crea una mesa o toma pedidos "Para Llevar".</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {tables.map((table) => {
            const isAvailable = table.status === 'available';
            const isOccupied = table.status === 'occupied';
            const isBilled = table.status === 'billed';

            return (
              <div
                key={table.id}
                onClick={() => onSelectTable(table)}
                className={`group relative p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between min-h-[125px] active:scale-[0.98] cursor-pointer ${
                  isDark
                    ? isAvailable
                      ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-600 hover:shadow-lg hover:shadow-black/20'
                      : isOccupied
                      ? 'bg-amber-500/[0.08] border-amber-500/40 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/5'
                      : 'bg-blue-500/[0.08] border-blue-500/40 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/5'
                    : isAvailable
                    ? 'bg-gradient-to-b from-white via-white to-emerald-50/30 border-emerald-200/80 shadow-xs hover:shadow-md hover:border-emerald-400 hover:-translate-y-0.5'
                    : isOccupied
                    ? 'bg-gradient-to-b from-white via-amber-50/20 to-amber-100/30 border-amber-300 shadow-xs hover:shadow-md hover:border-amber-400 hover:-translate-y-0.5'
                    : 'bg-gradient-to-b from-white via-blue-50/20 to-blue-100/30 border-blue-300 shadow-xs hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5'
                }`}
              >
                {/* Cabecera */}
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono font-bold text-xs border transition-colors ${
                        isAvailable
                          ? isDark
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                            : 'bg-emerald-100/80 border-emerald-300 text-emerald-800 font-extrabold'
                          : isOccupied
                          ? isDark
                            ? 'bg-amber-950/60 border-amber-700 text-amber-300 font-extrabold'
                            : 'bg-amber-100 border-amber-300 text-amber-900 font-black'
                          : isDark
                          ? 'bg-blue-950/60 border-blue-700 text-blue-300 font-extrabold'
                          : 'bg-blue-100 border-blue-300 text-blue-900 font-black'
                      }`}
                    >
                      {table.table_number}
                    </span>
                    <span className={`text-xs font-bold truncate ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                      {table.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`flex items-center gap-1 text-[11px] font-mono ${
                      isDark ? 'text-zinc-400' : 'text-slate-600 font-semibold'
                    }`}>
                      <Users className={`w-3.5 h-3.5 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`} />
                      {table.capacity}
                    </span>

                    {/* Botón Cambiar de Mesa (solo visible en mesas ocupadas) */}
                    {isOccupied && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMoveSourceTable(table);
                        }}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          isDark 
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-400 border-zinc-700' 
                            : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-200'
                        }`}
                        title="Cambiar a otra mesa libre"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isAvailable && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTable(e, table)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Eliminar mesa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Pie con Estado */}
                <div className={`pt-3 flex items-center justify-between w-full border-t border-dashed mt-3 ${
                  isDark ? 'border-zinc-800' : 'border-slate-200/80'
                }`}>
                  {isAvailable && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-300/80 dark:border-emerald-500/20 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Disponible
                    </span>
                  )}
                  {isOccupied && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-500/20 shadow-2xs">
                      <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      Ocupada
                    </span>
                  )}
                  {isBilled && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-800 dark:text-blue-300 bg-blue-100/90 dark:bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-300 dark:border-blue-500/20 shadow-2xs">
                      <Receipt className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      Por Cobrar
                    </span>
                  )}

                  <span className={`text-[10px] font-mono font-medium transition-transform group-hover:translate-x-0.5 ${
                    isDark ? 'text-zinc-500 group-hover:text-zinc-300' : 'text-slate-500 group-hover:text-slate-900'
                  }`}>
                    Operar →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Cambiar Comanda a Mesa Libre */}
      {moveSourceTable && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className={`w-full max-w-md rounded-3xl p-5 border shadow-2xl space-y-4 ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-zinc-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm">
                    Cambiar Mesa: {moveSourceTable.name} (#{moveSourceTable.table_number})
                  </h3>
                  <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Elige una mesa disponible para transferir la cuenta
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMoveSourceTable(null)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isDark ? 'text-zinc-400 hover:text-zinc-100 bg-zinc-800' : 'text-slate-400 hover:text-slate-800 bg-slate-100'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Listado de mesas libres */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {availableTargetTables.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-zinc-500">
                  No hay mesas libres en este momento para realizar el cambio.
                </div>
              ) : (
                availableTargetTables.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    disabled={moveLoading}
                    onClick={() => handleExecuteMove(target)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all active:scale-[0.98] cursor-pointer ${
                      isDark
                        ? 'bg-zinc-950 border-emerald-500/30 hover:border-emerald-500/70 hover:bg-emerald-500/5'
                        : 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/80 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs border bg-emerald-500/20 border-emerald-500/40 text-emerald-400">
                        #{target.table_number}
                      </span>
                      <div>
                        <p className={`text-xs font-bold ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                          {target.name}
                        </p>
                        <p className={`text-[10px] font-mono ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                          Capacidad: {target.capacity} personas
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                      <MoveRight className="w-3.5 h-3.5" /> Mover Aquí
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Nueva Mesa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className={`w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4 border transition-all ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-zinc-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  <Armchair className="w-4 h-4" />
                </span>
                <h3 className="font-extrabold text-sm">Configurar Nueva Mesa</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  isDark ? 'text-zinc-400 hover:text-zinc-100' : 'text-slate-400 hover:text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-3 font-mono text-xs">
              <div className="space-y-1">
                <label className={`block font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  Número de Mesa:
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-bold border outline-none ${
                    isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500' : 'bg-slate-50 border-slate-300 focus:border-blue-500'
                  }`}
                  placeholder="Ej: 7"
                />
              </div>

              <div className="space-y-1">
                <label className={`block font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  Nombre o Ubicación:
                </label>
                <input
                  type="text"
                  required
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-sans font-medium border outline-none ${
                    isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500' : 'bg-slate-50 border-slate-300 focus:border-blue-500'
                  }`}
                  placeholder="Ej: Mesa 7 (Terraza) o Barra 2"
                />
              </div>

              <div className="space-y-1">
                <label className={`block font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  Capacidad de personas:
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-bold border outline-none ${
                    isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500' : 'bg-slate-50 border-slate-300 focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="pt-2 flex gap-2 font-sans font-bold">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`flex-1 py-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs transition active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  {submitting ? 'Guardando...' : 'Crear Mesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}