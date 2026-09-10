import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Boxes, AlertTriangle, CheckCircle2, 
  Plus, RefreshCw, X, ArrowDownRight, Package, Trash2,
  ShoppingCart, Copy, Check, DollarSign, ClipboardList, Share2,
  Tag, Scale, ShieldAlert
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
  const [activeTab, setActiveTab] = useState<'stock' | 'shopping'>('stock');
  const [copied, setCopied] = useState(false);

  // Estados para crear nuevo insumo
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newUnit, setNewUnit] = useState('unit');
  const [newCurrentStock, setNewCurrentStock] = useState('10');
  const [newMinStock, setNewMinStock] = useState('5');
  const [newCostPerUnit, setNewCostPerUnit] = useState('1500');
  const [creatingLoading, setCreatingLoading] = useState(false);

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
        reason: 'Recepción de compra / reposición'
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

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      alert('Por favor escribe el nombre del insumo');
      return;
    }

    setCreatingLoading(true);
    try {
      // Si no puso SKU, generamos uno técnico automáticamente
      const cleanName = newName.trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
      const prefix = cleanName.slice(0, 3) || 'INS';
      const autoSku = newSku.trim() ? newSku.trim().toUpperCase() : `ING-${prefix}-${Math.floor(100 + Math.random() * 900)}`;

      const stockNum = parseFloat(newCurrentStock) || 0;
      const minNum = parseFloat(newMinStock) || 0;
      const costNum = parseFloat(newCostPerUnit) || 0;

      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          sku: autoSku,
          name: newName.trim(),
          unit: newUnit,
          current_stock: stockNum,
          min_stock: minNum,
          cost_per_unit: costNum
        })
        .select()
        .single();

      if (error) throw error;

      // Si ingresó stock inicial mayor a 0, guardamos el movimiento de inventario
      if (stockNum > 0 && data) {
        await supabase.from('inventory_movements').insert({
          ingredient_id: data.id,
          movement_type: 'purchase',
          quantity: stockNum,
          unit_cost: costNum,
          reason: 'Inventario inicial / Alta de insumo'
        });
      }

      // Limpiar formulario y cerrar
      setNewName('');
      setNewSku('');
      setNewCurrentStock('10');
      setNewMinStock('5');
      setNewCostPerUnit('1500');
      setIsCreating(false);
      loadInventory();
    } catch (err: any) {
      alert('Error creando insumo: ' + (err?.message || 'Verifica que el SKU no esté repetido'));
    } finally {
      setCreatingLoading(false);
    }
  };

  const handleDeleteIngredient = async (item: Ingredient) => {
    const confirmed = window.confirm(`¿Seguro que deseas eliminar "${item.name}" (${item.sku}) de la bodega?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('ingredients')
        .delete()
        .eq('id', item.id);

      if (error) {
        if (error.code === '23503') {
          alert(`No se puede eliminar "${item.name}" porque está vinculado a una receta activa o tiene historial de movimientos.`);
        } else {
          throw error;
        }
        return;
      }

      setIngredients((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: any) {
      alert('Error al eliminar insumo: ' + (err?.message || 'Error de base de datos'));
    }
  };

  // Filtrado y cálculo de reposición sugerida
  const criticalItems = ingredients.filter((i) => Number(i.current_stock) <= Number(i.min_stock));

  const shoppingList = criticalItems.map((item) => {
    const targetStock = Number(item.min_stock) * 2;
    const neededQty = Math.max(1, Math.ceil(targetStock - Number(item.current_stock)));
    const estimatedCost = neededQty * (Number(item.cost_per_unit) || 0);

    return {
      ...item,
      suggested_qty: neededQty,
      estimated_cost: estimatedCost,
    };
  });

  const totalEstimatedBudget = shoppingList.reduce((acc, it) => acc + it.estimated_cost, 0);
  const totalUnitsToBuy = shoppingList.reduce((acc, it) => acc + it.suggested_qty, 0);

  const handleCopyWhatsApp = () => {
    if (shoppingList.length === 0) return;

    const dateStr = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    const lines = [
      `🛒 *LISTA DE COMPRAS & REPOSICIÓN*`,
      `📅 Fecha: ${dateStr}`,
      `🏢 Mi Negocio POS — Control de Bodega\n`,
      `*INSUMOS CRÍTICOS (${shoppingList.length}):*`,
      ...shoppingList.map(
        (it, idx) =>
          `${idx + 1}. *${it.name}* ➔ *${it.suggested_qty} ${it.unit}* (Stock: ${Number(it.current_stock).toFixed(1)} / Min: ${it.min_stock})`
      ),
      `\n💰 *Presupuesto Estimado:* $${totalEstimatedBudget.toLocaleString('es-CL')} CLP`,
      `⚡ _Generado automáticamente para reposición._`
    ];

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="space-y-5">
      {/* Cabecera de Bodega con Selector de Pestañas y Botón Nuevo Insumo */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
              <Boxes className="w-4 h-4" />
            </span>
            Control de Bodega & Abastecimiento
          </h2>
          <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
            Stock en tiempo real, alertas críticas y reposición inteligente
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex p-1 rounded-xl border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'}`}>
            <button
              onClick={() => setActiveTab('stock')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'stock'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" /> Stock Actual
            </button>
            <button
              onClick={() => setActiveTab('shopping')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 relative ${
                activeTab === 'shopping'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Lista de Compras
              {criticalItems.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-black rounded-full bg-rose-500 text-white">
                  {criticalItems.length}
                </span>
              )}
            </button>
          </div>

          {/* Botón Nuevo Insumo */}
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Nuevo Insumo
          </button>

          <button
            onClick={loadInventory}
            disabled={loading}
            className={`p-2 rounded-xl border transition-all active:scale-95 shadow-xs cursor-pointer ${
              isDark 
                ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-white' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
            title="Actualizar bodega"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pestaña 1: Stock en Bodega */}
      {activeTab === 'stock' && (
        <>
          {criticalItems.length > 0 && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>
                  Atención: <strong>{criticalItems.length} insumo(s)</strong> están por debajo del stock mínimo.
                </span>
              </div>
              <button
                onClick={() => setActiveTab('shopping')}
                className="text-[11px] font-mono font-bold bg-rose-500 hover:bg-rose-600 text-white px-3 py-1 rounded-lg transition-all cursor-pointer shadow-xs"
              >
                Ver Lista de Reposición →
              </button>
            </div>
          )}

          <div className={`rounded-2xl border overflow-hidden shadow-xs transition-all ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className={`border-b ${
                  isDark ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-700 font-bold'
                }`}>
                  <tr>
                    <th className="p-3.5">SKU / Insumo</th>
                    <th className="p-3.5 text-right">Stock Actual</th>
                    <th className="p-3.5 text-right">Mínimo</th>
                    <th className="p-3.5 text-center">Estado</th>
                    <th className="p-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-slate-200/80'}`}>
                  {ingredients.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-xs text-slate-400 dark:text-zinc-500 font-mono">
                        No hay insumos registrados en bodega.
                      </td>
                    </tr>
                  ) : (
                    ingredients.map((item) => {
                      const isUnderMin = Number(item.current_stock) <= Number(item.min_stock);
                      const isWarning = !isUnderMin && Number(item.current_stock) <= Number(item.min_stock) * 1.5;

                      return (
                        <tr key={item.id} className={`transition-colors ${
                          isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50/80'
                        }`}>
                          <td className="p-3.5">
                            <span className={`text-[10px] uppercase block font-mono font-bold ${
                              isDark ? 'text-zinc-400' : 'text-slate-500'
                            }`}>
                              {item.sku}
                            </span>
                            <span className={`font-sans font-bold text-xs ${
                              isDark ? 'text-zinc-100' : 'text-slate-900'
                            }`}>
                              {item.name}
                            </span>
                          </td>
                          <td className={`p-3.5 text-right font-black tabular-nums ${
                            isDark ? 'text-zinc-100' : 'text-slate-900'
                          }`}>
                            {Number(item.current_stock).toFixed(2)} <span className={`font-normal ${
                              isDark ? 'text-zinc-400' : 'text-slate-500'
                            }`}>{item.unit}</span>
                          </td>
                          <td className={`p-3.5 text-right tabular-nums ${
                            isDark ? 'text-zinc-400' : 'text-slate-600 font-semibold'
                          }`}>
                            {Number(item.min_stock).toFixed(2)} {item.unit}
                          </td>
                          <td className="p-3.5 text-center">
                            {isUnderMin ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                                <AlertTriangle className="w-3 h-3" /> Crítico
                              </span>
                            ) : isWarning ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                <ArrowDownRight className="w-3 h-3" /> Bajo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Óptimo
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedIngredient(item);
                                  setIncomingQty('');
                                }}
                                className="px-2.5 py-1.5 bg-blue-600/10 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-500/30 rounded-lg transition-all active:scale-95 inline-flex items-center gap-1 text-xs font-sans font-bold cursor-pointer shadow-2xs"
                                title="Recepcionar compra"
                              >
                                <Plus className="w-3.5 h-3.5" /> Ingresar
                              </button>
                              <button
                                onClick={() => handleDeleteIngredient(item)}
                                className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 rounded-lg transition-all active:scale-95 cursor-pointer"
                                title="Eliminar insumo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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

      {/* Pestaña 2: Lista de Compras & Abastecimiento Sugerido */}
      {activeTab === 'shopping' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-rose-600 dark:text-rose-400">
                <span>Insumos Críticos</span>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 dark:text-zinc-100">
                  {shoppingList.length} ítems
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Bajo el nivel de seguridad
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
                <span>Total a Comprar</span>
                <ClipboardList className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 dark:text-zinc-100">
                  {totalUnitsToBuy} un/kg
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Para stock óptimo (2x stock mínimo)
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span>Presupuesto Estimado</span>
                <DollarSign className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  ${totalEstimatedBudget.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Efectivo estimado para reposición
                </p>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-emerald-50/60 border-emerald-200'
          }`}>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-600 text-white">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold">Enviar Pedido al Comprador o Proveedor</h3>
                <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Copia la lista formateada para WhatsApp o bloc de notas
                </p>
              </div>
            </div>

            <button
              onClick={handleCopyWhatsApp}
              disabled={shoppingList.length === 0}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-md cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" /> ¡Copiado al Portapapeles!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copiar para WhatsApp
                </>
              )}
            </button>
          </div>

          <div className={`rounded-2xl border overflow-hidden shadow-xs transition-all ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className={`border-b ${
                  isDark ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-700 font-bold'
                }`}>
                  <tr>
                    <th className="p-3.5">Insumo a Reponer</th>
                    <th className="p-3.5 text-right">Stock Actual</th>
                    <th className="p-3.5 text-right">Mínimo</th>
                    <th className="p-3.5 text-center">Compra Sugerida</th>
                    <th className="p-3.5 text-right">Costo Est.</th>
                    <th className="p-3.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-slate-200/80'}`}>
                  {shoppingList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400 dark:text-zinc-500">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <p className="font-bold font-sans text-slate-700 dark:text-zinc-200">Bodega Abastecida al 100%</p>
                        <p className="text-[11px]">No hay materias primas por debajo del stock mínimo de seguridad.</p>
                      </td>
                    </tr>
                  ) : (
                    shoppingList.map((item) => (
                      <tr key={item.id} className={isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50/80'}>
                        <td className="p-3.5">
                          <span className={`font-sans font-bold text-xs block ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                            {item.name}
                          </span>
                          <span className="text-[10px] text-zinc-400 uppercase font-mono">
                            {item.sku}
                          </span>
                        </td>
                        <td className="p-3.5 text-right text-rose-600 dark:text-rose-400 font-bold tabular-nums">
                          {Number(item.current_stock).toFixed(1)} {item.unit}
                        </td>
                        <td className="p-3.5 text-right text-zinc-400 tabular-nums">
                          {item.min_stock} {item.unit}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-black font-mono px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            +{item.suggested_qty} {item.unit}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-black tabular-nums text-slate-800 dark:text-zinc-200">
                          ${item.estimated_cost.toLocaleString('es-CL')}
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => {
                              setSelectedIngredient(item);
                              setIncomingQty(item.suggested_qty.toString());
                            }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-all active:scale-95 cursor-pointer shadow-2xs"
                            title="Ingresar compra directa con cantidad sugerida"
                          >
                            Recepcionar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Crear Nuevo Insumo */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className={`border w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 transition-all ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-zinc-800' : 'border-slate-100'
            }`}>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  <Package className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-extrabold text-sm">Nuevo Insumo en Bodega</h3>
                  <p className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Materia prima para recetas o reventa
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreating(false)}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isDark ? 'text-zinc-400 hover:text-zinc-100 bg-zinc-800/60' : 'text-slate-400 hover:text-slate-800 bg-slate-100'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateIngredient} className="space-y-3.5">
              {/* Nombre */}
              <div className="space-y-1">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-zinc-300' : 'text-slate-700'
                }`}>
                  <Tag className="w-3.5 h-3.5 text-blue-500" /> Nombre del Insumo:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Aceite para Freír 5L, Tomate, Servilletas"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs font-semibold border outline-none ${
                    isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500 text-zinc-100' : 'bg-slate-50 border-slate-300 focus:border-blue-500 text-slate-900'
                  }`}
                  autoFocus
                />
              </div>

              {/* SKU & Unidad de Medida */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    SKU (Opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Auto: ING-ACE-01"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase border outline-none ${
                      isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500 text-zinc-100' : 'bg-slate-50 border-slate-300 focus:border-blue-500 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-mono flex items-center gap-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    <Scale className="w-3 h-3 text-blue-500" /> Unidad:
                  </label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-xs font-bold border outline-none cursor-pointer ${
                      isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500 text-zinc-100' : 'bg-slate-50 border-slate-300 focus:border-blue-500 text-slate-900'
                    }`}
                  >
                    <option value="unit">Unidades (unit)</option>
                    <option value="kg">Kilos (kg)</option>
                    <option value="lt">Litros (lt)</option>
                    <option value="gr">Gramos (gr)</option>
                  </select>
                </div>
              </div>

              {/* Stock Inicial, Mínimo y Costo */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1 font-mono">
                  <label className={`text-[10px] font-bold ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Stock Inicial:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCurrentStock}
                    onChange={(e) => setNewCurrentStock(e.target.value)}
                    className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold border outline-none text-right ${
                      isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500 text-zinc-100' : 'bg-slate-50 border-slate-300 focus:border-blue-500 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1 font-mono">
                  <label className={`text-[10px] font-bold flex items-center gap-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                    <ShieldAlert className="w-3 h-3" /> Mínimo:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMinStock}
                    onChange={(e) => setNewMinStock(e.target.value)}
                    className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold border outline-none text-right ${
                      isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500 text-zinc-100' : 'bg-slate-50 border-slate-300 focus:border-blue-500 text-slate-900'
                    }`}
                  />
                </div>

                <div className="space-y-1 font-mono">
                  <label className={`text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    Costo Unit. ($):
                  </label>
                  <input
                    type="number"
                    value={newCostPerUnit}
                    onChange={(e) => setNewCostPerUnit(e.target.value)}
                    className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-bold border outline-none text-right ${
                      isDark ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500 text-zinc-100' : 'bg-slate-50 border-slate-300 focus:border-blue-500 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className={`p-2.5 rounded-xl border text-[11px] font-mono ${
                isDark ? 'bg-zinc-950/70 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                💡 Podrás vincular este insumo a las recetas desde <strong className="text-blue-500">Gerencia → Carta & Recetas</strong>.
              </div>

              <button
                type="submit"
                disabled={creatingLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
              >
                {creatingLoading ? 'Guardando en Supabase...' : 'Registrar Insumo en Bodega'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Recepción Manual de Mercadería */}
      {selectedIngredient && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3">
          <div className={`border w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4 ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-zinc-800' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-sm">Recepción de Insumo</h3>
              </div>
              <button
                onClick={() => setSelectedIngredient(null)}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  isDark ? 'text-zinc-400 hover:text-zinc-100' : 'text-slate-400 hover:text-slate-800'
                }`}
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
              <label htmlFor="incoming-qty-input-inventory" className={`text-xs ${
                isDark ? 'text-zinc-400' : 'text-slate-600 font-semibold'
              }`}>
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
                  isDark 
                    ? 'bg-zinc-950 border-zinc-700 focus:border-blue-500 text-zinc-100' 
                    : 'bg-slate-50 border-slate-300 focus:border-blue-500 text-slate-900'
                }`}
                autoFocus
              />
            </div>

            <button
              onClick={handleRestock}
              disabled={!incomingQty || submitting}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              {submitting ? 'Registrando...' : 'Confirmar Entrada a Bodega'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}