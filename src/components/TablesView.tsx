import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RestaurantTable } from '../types/database';
import { Users, Clock, Receipt, RefreshCw, LayoutGrid } from 'lucide-react';

interface TablesViewProps {
  onSelectTable: (table: RestaurantTable) => void;
  isDark?: boolean;
}

export function TablesView({ onSelectTable, isDark = true }: TablesViewProps) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTables() {
    setLoading(true);
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .order('table_number', { ascending: true });

    if (!error && data) {
      setTables(data as RestaurantTable[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTables();

    const channel = supabase
      .channel('realtime_tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_tables' },
        () => loadTables()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Cabecera del Plano */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-blue-600" />
            Control del Salón
          </h2>
          <p className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Toca una mesa para abrir comanda o emitir precuenta
          </p>
        </div>
        <button
          onClick={loadTables}
          disabled={loading}
          className={`p-2 rounded-xl border transition active:scale-95 ${
            isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
          }`}
          title="Refrescar mesas"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Grid de Mesas: 3 Columnas compactas */}
      {loading ? (
        <div className="py-24 text-center text-xs font-mono text-slate-400 animate-pulse">
          Sincronizando estado de las mesas...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {tables.map((table) => {
            const isAvailable = table.status === 'available';
            const isOccupied = table.status === 'occupied';
            const isBilled = table.status === 'billed';

            return (
              <button
                key={table.id}
                onClick={() => onSelectTable(table)}
                className={`p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between min-h-[125px] active:scale-[0.98] ${
                  isDark
                    ? isAvailable
                      ? 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-600'
                      : isOccupied
                      ? 'bg-amber-500/[0.08] border-amber-500/40 hover:border-amber-500/60'
                      : 'bg-blue-500/[0.08] border-blue-500/40 hover:border-blue-500/60'
                    : isAvailable
                    ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    : isOccupied
                    ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400 hover:shadow-sm'
                    : 'bg-blue-50/40 border-blue-300 hover:border-blue-400 hover:shadow-sm'
                }`}
              >
                {/* Cabecera */}
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono font-bold text-xs border ${
                        isAvailable
                          ? isDark
                            ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                            : 'bg-slate-100 border-slate-200 text-slate-700'
                          : isOccupied
                          ? 'bg-amber-100 border-amber-300 text-amber-800 font-extrabold'
                          : 'bg-blue-100 border-blue-300 text-blue-800 font-extrabold'
                      }`}
                    >
                      {table.table_number}
                    </span>
                    <span className="text-xs font-bold truncate max-w-[110px]">
                      {table.name}
                    </span>
                  </div>

                  <span className={`flex items-center gap-1 text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    <Users className="w-3 h-3 text-slate-400" />
                    {table.capacity}
                  </span>
                </div>

                {/* Pie con Estado */}
                <div className="pt-3 flex items-center justify-between">
                  {isAvailable && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Disponible
                    </span>
                  )}
                  {isOccupied && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-500/20">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Ocupada
                    </span>
                  )}
                  {isBilled && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-500/20">
                      <Receipt className="w-3 h-3 text-blue-600" />
                      Por Cobrar
                    </span>
                  )}

                  <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                    Ver →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}