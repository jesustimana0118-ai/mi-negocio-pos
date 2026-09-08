import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RecipeModal } from './RecipeModal';
import { ProductFormModal } from './ProductFormModal';
import { 
  TrendingUp, DollarSign, Receipt, Percent, 
  AlertOctagon, CheckCircle2, History,
  Flame, RefreshCw, BarChart3, Users, Utensils, 
  Plus, Edit3, Layers, Tag
} from 'lucide-react';

interface ShiftAudit {
  id: string;
  opened_at: string;
  closed_at: string | null;
  initial_cash: number;
  declared_cash: number | null;
  expected_cash: number | null;
  cash_discrepancy: number | null;
  total_sales: number;
  total_net: number;
  total_iva: number;
  total_tips: number;
  status: 'open' | 'closed';
}

interface ProductSaleMetric {
  product_name: string;
  total_qty: number;
  total_revenue: number;
}

interface ProductItem {
  id: string;
  name: string;
  category: string;
  price: number;
  is_active: boolean;
  recipe_count?: number;
}

interface AdminDashboardViewProps {
  isDark?: boolean;
}

export function AdminDashboardView({ isDark = true }: AdminDashboardViewProps) {
  const [adminTab, setAdminTab] = useState<'metrics' | 'menu'>('metrics');
  const [shifts, setShifts] = useState<ShiftAudit[]>([]);
  const [topProducts, setTopProducts] = useState<ProductSaleMetric[]>([]);
  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [recipeProduct, setRecipeProduct] = useState<ProductItem | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const { data: shiftsData } = await supabase
        .from('cash_shifts')
        .select('*')
        .order('opened_at', { ascending: false });

      if (shiftsData) setShifts(shiftsData as ShiftAudit[]);

      const { data: itemsData } = await supabase
        .from('order_items')
        .select(`
          quantity,
          subtotal,
          product:products(name)
        `);

      if (itemsData) {
        const aggregated: Record<string, ProductSaleMetric> = {};
        itemsData.forEach((item: any) => {
          const name = item.product?.name || 'Producto';
          if (!aggregated[name]) {
            aggregated[name] = { product_name: name, total_qty: 0, total_revenue: 0 };
          }
          aggregated[name].total_qty += Number(item.quantity) || 0;
          aggregated[name].total_revenue += Number(item.subtotal) || 0;
        });

        const sorted = Object.values(aggregated).sort((a, b) => b.total_qty - a.total_qty);
        setTopProducts(sorted);
      }

      const { data: prodsData } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      const { data: recData } = await supabase
        .from('product_ingredients')
        .select('product_id');

      if (prodsData) {
        const recipeCounts: Record<string, number> = {};
        (recData || []).forEach((r: { product_id: string }) => {
          recipeCounts[r.product_id] = (recipeCounts[r.product_id] || 0) + 1;
        });

        const mapped = prodsData.map((p: any) => ({
          ...p,
          recipe_count: recipeCounts[p.id] || 0,
        }));
        setProductsList(mapped);
      }
    } catch (err) {
      console.error('Error cargando métricas:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  const totalGrossSales = shifts.reduce((acc, s) => acc + (Number(s.total_sales) || 0), 0);
  const totalNetSales = shifts.reduce((acc, s) => acc + (Number(s.total_net) || 0), 0);
  const totalIvaDebit = shifts.reduce((acc, s) => acc + (Number(s.total_iva) || 0), 0);
  const totalPpmProvision = Math.round(totalNetSales * 0.01);
  const totalTipsPool = shifts.reduce((acc, s) => acc + (Number(s.total_tips) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Barra de cabecera */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 ${
        isDark ? 'border-zinc-800' : 'border-slate-200'
      }`}>
        <div>
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-500" />
            Panel Gerencial & Finanzas
          </h2>
          <p className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
            Consolidado impositivo SII, arqueos antifraude y escandallo de costos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex p-1 rounded-xl border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'}`}>
            <button
              onClick={() => setAdminTab('metrics')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                adminTab === 'metrics'
                  ? 'bg-violet-600 text-white shadow'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Métricas & Finanzas
            </button>
            <button
              onClick={() => setAdminTab('menu')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                adminTab === 'menu'
                  ? 'bg-violet-600 text-white shadow'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Carta & Escandallos
            </button>
          </div>

          <button
            onClick={loadDashboardData}
            disabled={loading}
            className={`p-2 rounded-xl border transition active:scale-95 ${
              isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
            }`}
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-violet-500' : ''}`} />
          </button>
        </div>
      </div>

      {adminTab === 'metrics' ? (
        <>
          {/* Tarjetas KPI con fondos degradados y acentos vivos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Ventas Brutas */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-900 border-emerald-500/30' 
                : 'bg-gradient-to-br from-emerald-50 via-white to-white border-emerald-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-600 dark:text-emerald-400">Ventas Brutas Totales</span>
                <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-500">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  ${totalGrossSales.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Neto: ${totalNetSales.toLocaleString('es-CL')}
                </p>
              </div>
            </div>

            {/* IVA Débito Fiscal */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-teal-950/40 via-zinc-900 to-zinc-900 border-teal-500/30' 
                : 'bg-gradient-to-br from-teal-50 via-white to-white border-teal-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-teal-600 dark:text-teal-400">IVA Débito (19%)</span>
                <div className="p-1.5 bg-teal-500/10 rounded-lg text-teal-500">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-teal-600 dark:text-teal-400">
                  ${totalIvaDebit.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Formulario 29 SII
                </p>
              </div>
            </div>

            {/* Provisión PPM */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-900 border-amber-500/30' 
                : 'bg-gradient-to-br from-amber-50 via-white to-white border-amber-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-amber-600 dark:text-amber-400">Provisión PPM (1%)</span>
                <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                  ${totalPpmProvision.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Pago Provisional Mensual
                </p>
              </div>
            </div>

            {/* Pozo Propinas */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-blue-950/40 via-zinc-900 to-zinc-900 border-blue-500/30' 
                : 'bg-gradient-to-br from-blue-50 via-white to-white border-blue-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-blue-600 dark:text-blue-400">Pozo Propinas (10%)</span>
                <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-500">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-blue-600 dark:text-blue-400">
                  ${totalTipsPool.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Fondo a repartir
                </p>
              </div>
            </div>
          </div>

          {/* Tablas de Auditoría y Ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tabla de Arqueos */}
            <div className={`lg:col-span-2 rounded-2xl border p-5 shadow-sm space-y-4 ${
              isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-slate-50/80 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />
                  <h3 className="font-extrabold text-sm">Auditoría de Arqueos de Turno</h3>
                </div>
                <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Control Antifraude</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className={`border-b ${isDark ? 'bg-zinc-950 text-zinc-400 border-zinc-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                    <tr>
                      <th className="p-3">Apertura</th>
                      <th className="p-3 text-right">Sistema</th>
                      <th className="p-3 text-right">Declarado</th>
                      <th className="p-3 text-center">Descuadre</th>
                      <th className="p-3 text-right">Venta</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
                    {shifts.map((s) => {
                      const hasDiscrepancy = s.cash_discrepancy !== null && s.cash_discrepancy !== 0;
                      const isShortage = (s.cash_discrepancy || 0) < 0;

                      return (
                        <tr key={s.id} className={isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-white'}>
                          <td className="p-3 font-sans">
                            <span className="font-bold block text-xs">
                              {new Date(s.opened_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                              {s.status === 'open' ? 'En curso' : 'Cerrado'}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            ${(Number(s.expected_cash) || Number(s.initial_cash)).toLocaleString('es-CL')}
                          </td>
                          <td className="p-3 text-right font-bold tabular-nums">
                            {s.declared_cash !== null ? `$${Number(s.declared_cash).toLocaleString('es-CL')}` : '—'}
                          </td>
                          <td className="p-3 text-center">
                            {s.status === 'open' ? (
                              <span className="text-[10px] font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                Abierto
                              </span>
                            ) : !hasDiscrepancy ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Exacto
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                                isShortage 
                                  ? 'text-rose-500 bg-rose-500/10 border-rose-500/20' 
                                  : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                              }`}>
                                <AlertOctagon className="w-3 h-3" />
                                {isShortage ? `Falta: $${Math.abs(s.cash_discrepancy || 0).toLocaleString('es-CL')}` : `Sobra: $${(s.cash_discrepancy || 0).toLocaleString('es-CL')}`}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-black text-emerald-500 tabular-nums">
                            ${(Number(s.total_sales) || 0).toLocaleString('es-CL')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Ranking Top Productos */}
            <div className={`rounded-2xl border p-5 shadow-sm space-y-4 ${
              isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-slate-50/80 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-500" />
                  <h3 className="font-extrabold text-sm">Top Productos</h3>
                </div>
                <Flame className="w-4 h-4 text-amber-500" />
              </div>

              <div className="space-y-3">
                {topProducts.length === 0 ? (
                  <p className={`text-xs text-center py-8 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Sin ventas registradas.</p>
                ) : (
                  topProducts.slice(0, 5).map((prod, index) => {
                    const maxQty = topProducts[0]?.total_qty || 1;
                    const percentage = Math.round((prod.total_qty / maxQty) * 100);

                    return (
                      <div key={prod.product_name} className="space-y-1.5 font-mono text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-sans font-bold flex items-center gap-1.5">
                            <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>#{index + 1}</span>
                            {prod.product_name}
                          </span>
                          <span className="font-black tabular-nums">
                            {prod.total_qty} un.
                          </span>
                        </div>
                        <div className={`w-full rounded-full h-2 overflow-hidden border ${
                          isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-200 border-slate-300'
                        }`}>
                          <div 
                            className="bg-gradient-to-r from-violet-600 to-fuchsia-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className={`flex justify-end text-[10px] tabular-nums ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                          ${prod.total_revenue.toLocaleString('es-CL')} recaudados
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Catálogo de Platos & Recetas */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black flex items-center gap-2">
                <Utensils className="w-4 h-4 text-violet-500" /> Catálogo de Platos & Recetas
              </h3>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Precios de venta y escandallos con deducción automática de inventario
              </p>
            </div>
            <button
              onClick={() => setIsCreatingProduct(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-violet-500/20"
            >
              <Plus className="w-4 h-4" /> Nuevo Plato
            </button>
          </div>

          <div className={`rounded-2xl border overflow-hidden shadow-sm ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-slate-50/80 border-slate-200'
          }`}>
            <table className="w-full text-left text-xs">
              <thead className={`border-b font-mono ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-white border-slate-200 text-slate-600'}`}>
                <tr>
                  <th className="p-3.5">Plato / Producto</th>
                  <th className="p-3.5">Categoría</th>
                  <th className="p-3.5 text-right">Precio Venta (IVA Inc.)</th>
                  <th className="p-3.5 text-center">Escandallo</th>
                  <th className="p-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-mono ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
                {productsList.map((prod) => (
                  <tr key={prod.id} className={isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-white'}>
                    <td className="p-3.5 font-sans font-bold">
                      {prod.name}
                    </td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] border font-sans font-medium ${
                        isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-white text-slate-700 border-slate-300'
                      }`}>
                        <Tag className="w-3 h-3 text-violet-500" /> {prod.category}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-black text-emerald-500 tabular-nums text-sm">
                      ${prod.price.toLocaleString('es-CL')}
                    </td>
                    <td className="p-3.5 text-center">
                      {(prod.recipe_count || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> {prod.recipe_count} insumo(s)
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                          isDark ? 'bg-zinc-800 text-zinc-500 border-zinc-700' : 'bg-slate-200 text-slate-500 border-slate-300'
                        }`}>
                          Sin receta
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setRecipeProduct(prod)}
                          className="px-2.5 py-1.5 bg-violet-600/10 hover:bg-violet-600/20 text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg text-xs font-sans font-bold flex items-center gap-1 transition active:scale-95"
                          title="Gestionar receta"
                        >
                          <Layers className="w-3.5 h-3.5" /> Receta
                        </button>
                        <button
                          onClick={() => setEditingProduct(prod)}
                          className={`p-1.5 rounded-lg border transition active:scale-95 ${
                            isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modales */}
      {(isCreatingProduct || editingProduct) && (
        <ProductFormModal
          product={editingProduct}
          onClose={() => {
            setIsCreatingProduct(false);
            setEditingProduct(null);
          }}
          onSuccess={loadDashboardData}
        />
      )}

      {recipeProduct && (
        <RecipeModal
          product={recipeProduct}
          onClose={() => {
            setRecipeProduct(null);
            loadDashboardData();
          }}
        />
      )}
    </div>
  );
}