import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Plus, Trash2, Layers, AlertCircle } from 'lucide-react';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
}

interface RecipeItem {
  id: string;
  ingredient_id: string;
  quantity: number;
  ingredient: {
    id: string;
    name: string;
    unit: string;
    cost_per_unit: number;
  };
}

interface RecipeModalProps {
  product: {
    id: string;
    name: string;
    price: number;
  };
  onClose: () => void;
}

export function RecipeModal({ product, onClose }: RecipeModalProps) {
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadRecipeData() {
    setLoading(true);
    // 1. Cargar ingredientes de bodega
    const { data: ingData } = await supabase
      .from('ingredients')
      .select('id, name, unit, cost_per_unit')
      .order('name', { ascending: true });

    if (ingData) setAvailableIngredients(ingData as Ingredient[]);

    // 2. Cargar receta actual del plato
    const { data: recData } = await supabase
      .from('product_ingredients')
      .select(`
        id,
        ingredient_id,
        quantity,
        ingredient:ingredients(id, name, unit, cost_per_unit)
      `)
      .eq('product_id', product.id);

    if (recData) setRecipeItems(recData as unknown as RecipeItem[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRecipeData();
  }, [product.id]);

  const handleAddIngredient = async () => {
    if (!selectedIngredientId || !quantity) return;
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_ingredients')
        .insert({
          product_id: product.id,
          ingredient_id: selectedIngredientId,
          quantity: qty,
        });

      if (error) throw error;

      setSelectedIngredientId('');
      setQuantity('');
      await loadRecipeData();
    } catch (err: any) {
      alert('Error agregando ingrediente: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('product_ingredients')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRecipeItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert('Error eliminando insumo: ' + err.message);
    }
  };

  // Cálculos gastronómicos
  const netPrice = Math.round(product.price / 1.19); // Venta neta sin IVA
  const totalCost = recipeItems.reduce((acc, item) => {
    const unitCost = item.ingredient?.cost_per_unit || 0;
    return acc + unitCost * Number(item.quantity);
  }, 0);

  const profitMargin = netPrice > 0 ? Math.round(((netPrice - totalCost) / netPrice) * 100) : 0;
  const selectedIngObj = availableIngredients.find((i) => i.id === selectedIngredientId);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">Escandallo de Costos</h3>
              <p className="text-xs text-zinc-400">{product.name} — ${product.price.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumen de Rentabilidad */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs font-mono">
          <div>
            <span className="text-zinc-500 block text-[10px]">Venta Neta:</span>
            <span className="text-zinc-200 font-bold tabular-nums">${netPrice.toLocaleString('es-CL')}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">Costo Receta:</span>
            <span className="text-rose-400 font-bold tabular-nums">${Math.round(totalCost).toLocaleString('es-CL')}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">Margen Bruto:</span>
            <span className={`font-bold tabular-nums ${
              profitMargin >= 65 ? 'text-emerald-400' : profitMargin >= 50 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {profitMargin}%
            </span>
          </div>
        </div>

        {/* Formulario para vincular insumo */}
        <div className="p-3.5 bg-zinc-950/40 border border-zinc-800/80 rounded-xl space-y-2.5">
          <span className="text-[11px] font-semibold text-zinc-300 block">Vincular Materia Prima de Bodega:</span>
          <div className="flex gap-2">
            <select
              value={selectedIngredientId}
              onChange={(e) => setSelectedIngredientId(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-xl px-2.5 py-2 text-xs text-zinc-100 outline-none"
            >
              <option value="">Selecciona un insumo...</option>
              {availableIngredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name} (${ing.cost_per_unit}/{ing.unit})
                </option>
              ))}
            </select>

            <div className="w-24 relative font-mono">
              <input
                type="number"
                step="0.001"
                placeholder={selectedIngObj ? selectedIngObj.unit : 'Cant.'}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-xl px-2.5 py-2 text-xs text-zinc-100 outline-none tabular-nums"
              />
            </div>

            <button
              onClick={handleAddIngredient}
              disabled={!selectedIngredientId || !quantity || saving}
              className="px-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>
        </div>

        {/* Tabla de la Receta */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-zinc-500 font-mono animate-pulse">
              Cargando receta...
            </div>
          ) : recipeItems.length === 0 ? (
            <div className="py-12 text-center bg-zinc-950/40 border border-zinc-800 rounded-xl space-y-1.5 p-4">
              <AlertCircle className="w-6 h-6 text-zinc-600 mx-auto" />
              <p className="text-xs font-medium text-zinc-400">Sin escandallo asignado</p>
              <p className="text-[11px] text-zinc-500">Agrega materias primas arriba para descontar stock automáticamente.</p>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-[11px]">
                  <tr>
                    <th className="p-2.5">Insumo</th>
                    <th className="p-2.5 text-right">Cantidad</th>
                    <th className="p-2.5 text-right">Costo</th>
                    <th className="p-2.5 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {recipeItems.map((item) => {
                    const itemCost = (item.ingredient?.cost_per_unit || 0) * Number(item.quantity);
                    return (
                      <tr key={item.id} className="hover:bg-zinc-800/30">
                        <td className="p-2.5 font-sans text-zinc-200">{item.ingredient?.name}</td>
                        <td className="p-2.5 text-right text-zinc-300 tabular-nums">
                          {Number(item.quantity)} <span className="text-zinc-500 text-[10px]">{item.ingredient?.unit}</span>
                        </td>
                        <td className="p-2.5 text-right font-bold text-zinc-100 tabular-nums">
                          ${Math.round(itemCost).toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 text-zinc-500 hover:text-rose-400 rounded transition"
                            title="Eliminar de la receta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pie */}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs transition"
        >
          Guardar y Regresar
        </button>
      </div>
    </div>
  );
}