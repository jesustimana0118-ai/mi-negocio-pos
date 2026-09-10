import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Layers, X, Plus, Trash2, CheckCircle2, Scale } from 'lucide-react';

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
  sku: string;
}

interface RecipeItem {
  id?: string;
  ingredient_id: string;
  quantity: number;
  ingredient?: Ingredient;
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
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: ingData } = await supabase
          .from('ingredients')
          .select('*')
          .order('name', { ascending: true });

        if (ingData) {
          setAvailableIngredients(ingData as Ingredient[]);
        }

        const { data: recData } = await supabase
          .from('product_ingredients')
          .select(`
            id,
            ingredient_id,
            quantity,
            ingredient:ingredients(*)
          `)
          .eq('product_id', product.id);

        if (recData) {
          const formatted = recData.map((r: any) => ({
            id: r.id,
            ingredient_id: r.ingredient_id,
            quantity: Number(r.quantity),
            ingredient: r.ingredient,
          }));
          setRecipeItems(formatted);
        }
      } catch (err) {
        console.error('Error cargando receta:', err);
      }
    }

    loadData();
  }, [product.id]);

  const handleSelectIngredient = (ingId: string) => {
    setSelectedIngredientId(ingId);
    const found = availableIngredients.find((i) => i.id === ingId);
    if (!found) return;

    if (found.unit === 'unit') {
      setQuantity('1');
    } else if (found.unit === 'kg' || found.unit === 'lt') {
      setQuantity('0.15');
    } else {
      setQuantity('50');
    }
  };

  const selectedIng = availableIngredients.find((i) => i.id === selectedIngredientId);

  const handleAddItem = () => {
    if (!selectedIngredientId || !quantity) return;
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return;

    const ing = availableIngredients.find((i) => i.id === selectedIngredientId);
    if (!ing) return;

    const existingIndex = recipeItems.findIndex((r) => r.ingredient_id === selectedIngredientId);
    if (existingIndex >= 0) {
      const updated = [...recipeItems];
      updated[existingIndex].quantity += qty;
      setRecipeItems(updated);
    } else {
      setRecipeItems([...recipeItems, { ingredient_id: selectedIngredientId, quantity: qty, ingredient: ing }]);
    }

    setSelectedIngredientId('');
    setQuantity('1');
  };

  const handleRemoveItem = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const handleSaveRecipe = async () => {
    setSaving(true);
    try {
      await supabase.from('product_ingredients').delete().eq('product_id', product.id);

      if (recipeItems.length > 0) {
        const rows = recipeItems.map((it) => ({
          product_id: product.id,
          ingredient_id: it.ingredient_id,
          quantity: it.quantity,
        }));

        const { error } = await supabase.from('product_ingredients').insert(rows);
        if (error) throw error;
      }

      onClose();
    } catch (err: any) {
      alert('Error guardando la receta: ' + (err?.message || 'Error de base de datos'));
    } finally {
      setSaving(false);
    }
  };

  const netPrice = Math.round(Number(product.price) / 1.19);
  const totalRecipeCost = Math.round(
    recipeItems.reduce((acc, it) => {
      const cost = it.ingredient?.cost_per_unit || 0;
      return acc + it.quantity * Number(cost);
    }, 0)
  );
  const netMargin = netPrice - totalRecipeCost;
  const foodCostPct = netPrice > 0 && totalRecipeCost > 0 ? Math.round((totalRecipeCost / netPrice) * 100) : 0;
  const grossMarginPct = netPrice > 0 ? Math.round((netMargin / netPrice) * 100) : 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-zinc-900 border border-zinc-800 text-zinc-100 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5">
        
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Layers className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm text-zinc-100">Escandallo & Ficha Técnica</h3>
              <p className="text-xs font-mono text-zinc-400">
                {product.name} — <span className="text-emerald-400 font-bold">${product.price.toLocaleString('es-CL')}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg bg-zinc-800/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 bg-zinc-950 p-3.5 rounded-2xl border border-zinc-800/80 font-mono text-xs">
          <div>
            <span className="text-[10px] text-zinc-400 block">Venta Neta:</span>
            <span className="font-black text-zinc-100 text-sm">${netPrice.toLocaleString('es-CL')}</span>
          </div>
          <div>
            <span className="text-[10px] text-zinc-400 block">Costo Receta:</span>
            <span className={`font-black text-sm ${totalRecipeCost > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
              ${totalRecipeCost.toLocaleString('es-CL')}
            </span>
            {foodCostPct > 0 && (
              <span className="block text-[9px] text-zinc-400">({foodCostPct}% Food Cost)</span>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-400 block">Margen Neto:</span>
            <span className={`font-black text-sm ${netMargin > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {grossMarginPct}%
            </span>
            <span className="block text-[9px] text-zinc-400">+${netMargin.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-violet-400" /> Vincular Materia Prima de Bodega:
          </label>
          <div className="flex gap-2">
            <select
              value={selectedIngredientId}
              onChange={(e) => handleSelectIngredient(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-bold text-zinc-100 outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="">Selecciona un insumo...</option>
              {availableIngredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name} ({ing.unit}) — ${Number(ing.cost_per_unit).toLocaleString('es-CL')}/{ing.unit}
                </option>
              ))}
            </select>

            <div className="relative w-32 flex items-center">
              <input
                type="number"
                step={selectedIng?.unit === 'unit' ? '1' : '0.001'}
                min="0.001"
                placeholder={selectedIng?.unit === 'unit' ? '1' : '0.15'}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-3 pr-10 py-2 text-xs font-mono font-black text-zinc-100 outline-none focus:border-violet-500 text-right"
              />
              <span className="absolute right-2.5 text-[10px] font-mono text-violet-400 font-bold pointer-events-none uppercase">
                {selectedIng?.unit || 'un'}
              </span>
            </div>

            <button
              onClick={handleAddItem}
              disabled={!selectedIngredientId}
              className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-bold text-zinc-400">Ingredientes en la Receta ({recipeItems.length}):</span>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
            {recipeItems.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-zinc-800 rounded-2xl text-zinc-500">
                <Layers className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                <p className="font-sans font-bold text-zinc-400">Sin ingredientes asignados</p>
                <p className="text-[11px] mt-0.5">Agrega materias primas arriba para descontar stock en cada venta.</p>
              </div>
            ) : (
              recipeItems.map((item, index) => {
                const unitCost = Number(item.ingredient?.cost_per_unit || 0);
                const subtotal = Math.round(item.quantity * unitCost);

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2.5 bg-zinc-950/70 border border-zinc-800 rounded-xl"
                  >
                    <div className="flex-1">
                      <span className="font-sans font-bold text-zinc-200 block text-xs">
                        {item.ingredient?.name || 'Insumo'}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {item.quantity} {item.ingredient?.unit} × ${unitCost.toLocaleString('es-CL')}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-black text-amber-400 tabular-nums">
                        ${subtotal.toLocaleString('es-CL')}
                      </span>
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        title="Quitar de la receta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <button
          onClick={handleSaveRecipe}
          disabled={saving}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-violet-600/20 cursor-pointer disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          {saving ? 'Guardando cambios...' : 'Guardar y Aplicar Receta'}
        </button>
      </div>
    </div>
  );
}