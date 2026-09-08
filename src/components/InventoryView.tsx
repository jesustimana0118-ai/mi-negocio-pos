import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Boxes, AlertTriangle, CheckCircle2, 
  Plus, RefreshCw, X, ArrowDownRight, Package 
} from 'lucide-react';

interface Ingredient {
  id: string;
  sku: string;
  name: string;
  current_stock: number;
  min_stock: number;
  unit: string;
  cost_per_unit: number;
}

interface InventoryViewProps {
  isDark?: boolean;
}

export function InventoryView({ isDark = true }: InventoryViewProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);
  const [incomingQty, setIncomingQty] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  async function loadInventory() {
    setLoading(true);
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name', { ascending: true });

    if (!error && data) {
      setIngredients(data as Ingredient[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const handleRestock = async () => {
    if (!selectedIngredient || !incomingQty) return;
    const qty = parseFloat(incomingQty);
    if (isNaN(qty) || qty <= 0) return;

    setSubmitting(true);
    try {
      const newStock = Number(selectedIngredient.current_stock) + qty;

      await supabase
        .from('ingredients')
        .update({ current_stock: newStock })
        .eq('id', selectedIngredient.id);

      await supabase.from('inventory_movements').insert({
        ingredient_id: selectedIngredient.id,
        movement_type: 'purchase',
        quantity: qty,
        unit_cost: selectedIngredient.cost_per_unit,
        reason: 'Recepción manual de mercadería'
      });

      setSelectedIngredient(null);
      setIncomingQty('');
      loadInventory();
    } catch (err: any) {
      alert('Error ingresando stock: ' + (err?.message || 'Error de red'));
    } finally {
      setSubmitting(false);
    }
  };

  const criticalItems = ingredients.filter(i => i.current_stock <= i.min_stock);

  return (
    <div className="space-y-5">
      {/* Cabecera de Bodega */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black flex items-center gap-2">
            <Boxes className="w-5 h-5 text-blue-500" />
            Control de Bodega & Materias Primas
          </h2>
          <p className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Stock en tiempo real, niveles de seguridad y reposición
          </p>
        </div>
        <button
          onClick={loadInventory}
          disabled={loading}
          className={`p-2 rounded-xl border transition active:scale-95 ${
            isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-slate-100 text-slate-700 border-slate-300'
          }`}
          title="Actualizar bodega"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
        </button>
      </div>

      {/* Alerta de Stock Crítico */}
      {criticalItems.length > 0 && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between text-xs text-rose-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>
              Atención: <strong>{criticalItems.length} insumo(s)</strong> están por debajo del stock mínimo.
            </span>
          </div>
          <span className="text-[11px] font-mono font-bold bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
            Revisar Urgente
          </span>
        </div>
      )}

      {/* Tabla de Insumos */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${
        isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-slate-50/80 border-slate-200'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className={`border-b ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-white border-slate-200 text-slate-600'}`}>
              <tr>
                <th className="p-3.5">SKU / Insumo</th>
                <th className="p-3.5 text-right">Stock Actual</th>
                <th className="p-3.5 text-right">Mínimo</th>
                <th className="p-3.5 text-center">Estado</th>
                <th className="p-3.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
              {ingredients.map((item) => {
                const isUnderMin = item.current_stock <= item.min_stock;
                const isWarning = !isUnderMin && item.current_stock <= item.min_stock * 1.5;

                return (
                  <tr key={item.id} className={isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-white'}>
                    <td className="p-3.5">
                      <span className={`text-[10px] uppercase block font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{item.sku}</span>
                      <span className="font-sans font-bold text-xs">{item.name}</span>
                    </td>
                    <td className="p-3.5 text-right font-black tabular-nums">
                      {Number(item.current_stock).toFixed(2)} <span className={`font-normal ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{item.unit}</span>
                    </td>
                    <td className={`p-3.5 text-right tabular-nums ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      {Number(item.min_stock).toFixed(2)} {item.unit}
                    </td>
                    <td className="p-3.5 text-center">
                      {isUnderMin ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                          <AlertTriangle className="w-3 h-3" /> Crítico
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <ArrowDownRight className="w-3 h-3" /> Bajo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Óptimo
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedIngredient(item)}
                        className="px-2.5 py-1.5 bg-blue-600/10 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-500/30 rounded-lg transition active:scale-95 inline-flex items-center gap-1 text-xs font-sans font-bold"
                        title="Recepcionar compra"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ingresar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Ingreso de Mercadería */}
      {selectedIngredient && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className={`border w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4 ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-sm">Recepción de Insumo</h3>
              </div>
              <button
                onClick={() => setSelectedIngredient(null)}
                className={`p-1 rounded-lg ${isDark ? 'text-zinc-400 hover:text-zinc-100' : 'text-slate-400 hover:text-slate-800'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className={`text-xs font-sans ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Producto:</p>
              <p className="text-sm font-bold">{selectedIngredient.name}</p>
              <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Stock actual: {Number(selectedIngredient.current_stock).toFixed(2)} {selectedIngredient.unit}
              </p>
            </div>

            <div className="space-y-1.5 font-mono">
              <label htmlFor="incoming-qty-input-inventory" className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Cantidad Recibida ({selectedIngredient.unit}):
              </label>
              <input
                id="incoming-qty-input-inventory"
                type="number"
                step="0.01"
                placeholder="Ej: 10"
                value={incomingQty}
                onChange={(e) => setIncomingQty(e.target.value)}
                className={`w-full rounded-xl px-3 py-2 text-base font-bold outline-none tabular-nums border ${
                  isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500' : 'bg-slate-50 border-slate-300 focus:border-blue-500'
                }`}
                autoFocus
              />
            </div>

            <button
              onClick={handleRestock}
              disabled={!incomingQty || submitting}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-500/20"
            >
              {submitting ? 'Registrando...' : 'Confirmar Entrada a Bodega'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}