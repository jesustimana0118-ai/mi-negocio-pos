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
          <h2 className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
              <LayoutGrid className="w-4 h-4" />
            </span>
            Control del Salón
          </h2>
          <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
            Toca una mesa para abrir comanda o emitir precuenta
          </p>
        </div>
        <button
          onClick={loadTables}
          disabled={loading}
          className={`p-2 rounded-xl border transition-all active:scale-95 shadow-xs ${
            isDark
              ? 'bg-zinc-800/90 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-slate-200/50 hover:border-slate-300'
          }`}
          title="Refrescar mesas"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Grid de Mesas */}
      {loading ? (
        <div className={`py-24 text-center text-xs font-mono animate-pulse rounded-2xl border ${
          isDark ? 'border-zinc-800 text-zinc-500 bg-zinc-900/30' : 'border-slate-200 text-slate-500 bg-white/70 shadow-inner'
        }`}>
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
                className={`group p-4 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between min-h-[125px] active:scale-[0.98] ${
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

                  <span className={`flex items-center gap-1 text-[11px] font-mono shrink-0 ${
                    isDark ? 'text-zinc-400' : 'text-slate-600 font-semibold'
                  }`}>
                    <Users className={`w-3.5 h-3.5 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`} />
                    {table.capacity}
                  </span>
                </div>

                {/* Pie con Estado */}
                <div className="pt-3 flex items-center justify-between w-full border-t border-dashed mt-3 ${
                  isDark ? 'border-zinc-800' : 'border-slate-200/80'
                }">
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