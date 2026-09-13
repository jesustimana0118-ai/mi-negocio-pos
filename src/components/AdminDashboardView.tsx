import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RecipeModal } from './RecipeModal';
import { ProductFormModal } from './ProductFormModal';
import { StaffAttendanceAudit } from './StaffAttendanceAudit';
import { StaffManagementView } from './StaffManagementView';
import { 
  TrendingUp, DollarSign, Receipt, Percent, 
  AlertOctagon, CheckCircle2, History,
  Flame, RefreshCw, BarChart3, Users, Utensils, 
  Plus, Edit3, Layers, Tag, Trash2, UserCheck, 
  Clock, LogOut, Coffee, ShieldCheck, Calculator, ArrowUpRight,
  FileSpreadsheet, FileText, Camera, Shield
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
  recipe_cost?: number;
  food_cost_pct?: number;
  net_margin?: number;
}

interface AttendanceLog {
  id: string;
  event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  timestamp: string;
  notes?: string;
  staff?: {
    name: string;
    role: string;
  };
}

interface StaffMealOrder {
  id: string;
  order_number: number;
  created_at: string;
  waiter_name: string;
  staff?: {
    name: string;
    role: string;
  };
  order_items: {
    id: string;
    quantity: number;
    product?: {
      name: string;
      price: number;
    };
  }[];
}

interface AdminDashboardViewProps {
  isDark?: boolean;
}

export function AdminDashboardView({ isDark = true }: AdminDashboardViewProps) {
  const [adminTab, setAdminTab] = useState<'metrics' | 'menu' | 'staff' | 'attendance' | 'team'>('metrics');
  const [shifts, setShifts] = useState<ShiftAudit[]>([]);
  const [topProducts, setTopProducts] = useState<ProductSaleMetric[]>([]);
  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [staffMeals, setStaffMeals] = useState<StaffMealOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [recipeProduct, setRecipeProduct] = useState<ProductItem | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  async function loadDashboardData() {
    setLoading(true);
    try {
      // 1. Turnos de Caja
      const { data: shiftsData } = await supabase
        .from('cash_shifts')
        .select('*')
        .order('opened_at', { ascending: false });

      if (shiftsData) setShifts(shiftsData as ShiftAudit[]);

      // 2. Ranking de Ventas
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

      // 3. Insumos para costeo de recetas
      const { data: ingsData } = await supabase
        .from('ingredients')
        .select('id, cost_per_unit');

      const ingredientCosts: Record<string, number> = {};
      (ingsData || []).forEach((i: { id: string; cost_per_unit: number }) => {
        ingredientCosts[i.id] = Number(i.cost_per_unit) || 0;
      });

      // 4. Recetas (cantidades de insumos por plato)
      const { data: recData } = await supabase
        .from('product_ingredients')
        .select('product_id, ingredient_id, quantity');

      const recipeCounts: Record<string, number> = {};
      const recipeCosts: Record<string, number> = {};

      (recData || []).forEach((r: { product_id: string; ingredient_id: string; quantity: number }) => {
        recipeCounts[r.product_id] = (recipeCounts[r.product_id] || 0) + 1;
        const unitCost = ingredientCosts[r.ingredient_id] || 0;
        recipeCosts[r.product_id] = (recipeCosts[r.product_id] || 0) + (Number(r.quantity) * unitCost);
      });

      // 5. Catálogo de Platos con Food Cost y Margen calculado
      const { data: prodsData } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (prodsData) {
        const mapped: ProductItem[] = prodsData.map((p: any) => {
          const cost = Math.round(recipeCosts[p.id] || 0);
          const price = Number(p.price) || 0;
          const netPrice = price > 0 ? price / 1.19 : 0;
          const foodCostPct = netPrice > 0 && cost > 0 ? Math.round((cost / netPrice) * 100) : 0;
          const netMargin = netPrice > 0 ? Math.round(netPrice - cost) : 0;

          return {
            ...p,
            recipe_count: recipeCounts[p.id] || 0,
            recipe_cost: cost,
            food_cost_pct: foodCostPct,
            net_margin: netMargin,
          };
        });
        setProductsList(mapped);
      }

      // 6. Marcas de Asistencia
      const { data: attData } = await supabase
        .from('staff_attendance')
        .select(`
          id,
          event_type,
          timestamp,
          notes,
          staff:staff(name, role)
        `)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (attData) setAttendanceLogs(attData as unknown as AttendanceLog[]);

      // 7. Órdenes de Colación
      const { data: mealsData } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          created_at,
          waiter_name,
          staff:staff(name, role),
          order_items(
            id,
            quantity,
            product:products(name, price)
          )
        `)
        .eq('is_staff_meal', true)
        .order('created_at', { ascending: false })
        .limit(30);

      if (mealsData) setStaffMeals(mealsData as unknown as StaffMealOrder[]);

    } catch (err) {
      console.error('Error cargando métricas:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleDeleteProduct = async (prod: ProductItem) => {
    const confirmed = window.confirm(`¿Seguro que deseas eliminar "${prod.name}" de la carta?`);
    if (!confirmed) return;

    try {
      await supabase.from('product_ingredients').delete().eq('product_id', prod.id);
      const { error } = await supabase.from('products').delete().eq('id', prod.id);

      if (error) {
        if (error.code === '23503') {
          alert(`No se puede eliminar "${prod.name}" porque tiene órdenes asociadas. Puedes desactivarlo.`);
        } else {
          throw error;
        }
        return;
      }

      setProductsList((prev) => prev.filter((p) => p.id !== prod.id));
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message || 'Error de base de datos'));
    }
  };

  // Cálculos fiscales
  const totalGrossSales = shifts.reduce((acc, s) => acc + (Number(s.total_sales) || 0), 0);
  const totalNetSales = shifts.reduce((acc, s) => acc + (Number(s.total_net) || 0), 0);
  const totalIvaDebit = shifts.reduce((acc, s) => acc + (Number(s.total_iva) || 0), 0);
  const totalPpmProvision = Math.round(totalNetSales * 0.01);
  const totalTipsPool = shifts.reduce((acc, s) => acc + (Number(s.total_tips) || 0), 0);

  // Cálculos de colaciones
  const totalStaffMealCost = staffMeals.reduce((acc, meal) => {
    const mealVal = meal.order_items.reduce(
      (sub, it) => sub + (it.product?.price || 0) * it.quantity,
      0
    );
    return acc + mealVal;
  }, 0);

  const totalMealPortions = staffMeals.reduce(
    (acc, meal) => acc + meal.order_items.reduce((sub, it) => sub + it.quantity, 0),
    0
  );

  // Promedio Food Cost de platos costeados
  const costedProducts = productsList.filter((p) => (p.recipe_count || 0) > 0 && (p.recipe_cost || 0) > 0);
  const avgFoodCost = costedProducts.length > 0
    ? Math.round(costedProducts.reduce((acc, p) => acc + (p.food_cost_pct || 0), 0) / costedProducts.length)
    : 0;

  // Función de Descarga del Reporte Completo en Excel/CSV
  const handleExportReport = () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('es-CL');
    const formattedTime = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    let csv = '\uFEFF';

    csv += 'REPORTE FINANCIERO, TRIBUTARIO Y AUDITORÍA CONTABLE\n';
    csv += `Sistema POS Gastronómico;Fecha de Emisión: ${formattedDate} ${formattedTime}\n\n`;

    csv += '--- 1. PRE-CIERRE TRIBUTARIO SII (FORMULARIO 29) ---\n';
    csv += 'Concepto Tributario;Monto CLP;Base Legal / Detalle\n';
    csv += `Ventas Brutas Totales;${Math.round(totalGrossSales)};Total recaudado boletas y facturas (IVA Inc.)\n`;
    csv += `Ventas Netas Totales;${Math.round(totalNetSales)};Base imponible neta sin IVA\n`;
    csv += `IVA Débito Fiscal (19%);${Math.round(totalIvaDebit)};Impuesto al Valor Agregado F29 SII\n`;
    csv += `Provisión PPM Obligatorio (1%);${Math.round(totalPpmProvision)};Pago Provisional Mensual SII\n`;
    csv += `Pozo Acumulado de Propinas (10%);${Math.round(totalTipsPool)};Fondo legal a repartir al personal (Ley 20.918)\n\n`;

    csv += '--- 2. AUDITORÍA DE ARQUEOS DE CAJA (CONTROL ANTIFRAUDE) ---\n';
    csv += 'Fecha / Turno;Estado;Fondo Inicial CLP;Efectivo Sistema CLP;Efectivo Declarado CLP;Diferencia CLP;Venta Turno CLP\n';
    if (shifts.length === 0) {
      csv += 'Sin turnos registrados;—;0;0;0;0;0\n';
    } else {
      shifts.forEach((s) => {
        const opened = new Date(s.opened_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        const initial = Math.round(Number(s.initial_cash) || 0);
        const expected = Math.round(Number(s.expected_cash) || initial);
        const declared = s.declared_cash !== null ? Math.round(Number(s.declared_cash)) : 'Pendiente';
        const discrepancy = s.cash_discrepancy !== null ? Math.round(Number(s.cash_discrepancy)) : 0;
        const sales = Math.round(Number(s.total_sales) || 0);
        csv += `${opened};${s.status === 'open' ? 'En curso' : 'Cerrado'};${initial};${expected};${declared};${discrepancy};${sales}\n`;
      });
    }
    csv += '\n';

    csv += '--- 3. INGENIERÍA DE MENÚ Y RENTABILIDAD DE CARTA ---\n';
    csv += 'Plato / Producto;Categoría;Precio Venta Bruto CLP;Venta Neta CLP;Costo Materia Prima CLP;Food Cost %;Margen Neto Líquido CLP;Margen %\n';
    productsList.forEach((p) => {
      const net = Math.round(p.price / 1.19);
      const cost = Math.round(p.recipe_cost || 0);
      const fc = p.food_cost_pct || 0;
      const marginVal = Math.round(p.net_margin || 0);
      const marginPct = 100 - fc;
      csv += `${p.name};${p.category};${p.price};${net};${cost};${fc}%;${marginVal};${marginPct}%\n`;
    });
    csv += '\n';

    csv += '--- 4. REGISTRO DE ASISTENCIA LABORAL (DIRECCIÓN DEL TRABAJO) ---\n';
    csv += 'Colaborador;Rol / Cargo;Tipo de Evento;Fecha & Hora\n';
    if (attendanceLogs.length === 0) {
      csv += 'Sin marcas de asistencia registradas;—;—;—\n';
    } else {
      attendanceLogs.forEach((log) => {
        const staffName = log.staff?.name || 'Personal';
        const staffRole = log.staff?.role || 'Operativo';
        const eventLabel = log.event_type === 'clock_in' ? 'Entrada' : log.event_type === 'clock_out' ? 'Salida' : 'Colación';
        const eventDate = new Date(log.timestamp).toLocaleString('es-CL');
        csv += `${staffName};${staffRole};${eventLabel};${eventDate}\n`;
      });
    }
    csv += '\n';

    csv += '--- 5. CONSUMO DE COLACIONES DEL PERSONAL ($0) ---\n';
    csv += `Total Invertido en Beneficio CLP;${Math.round(totalStaffMealCost)};Raciones Totales;${totalMealPortions} un.\n`;
    csv += 'Colaborador;Alimentos Consumidos;Fecha & Hora;Costo Absorbido CLP\n';
    if (staffMeals.length === 0) {
      csv += 'Sin consumos de colación registrados;—;—;0\n';
    } else {
      staffMeals.forEach((meal) => {
        const staffName = meal.staff?.name || meal.waiter_name?.replace('Colación • ', '') || 'Personal';
        const itemsSummary = meal.order_items.map((it) => `${it.quantity}x ${it.product?.name || 'Ítem'}`).join(' + ');
        const mealDate = new Date(meal.created_at).toLocaleString('es-CL');
        const mealTotal = Math.round(meal.order_items.reduce((acc, it) => acc + (it.product?.price || 0) * it.quantity, 0));
        csv += `${staffName};"${itemsSummary}";${mealDate};${mealTotal}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Balance_Contable_${now.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDFReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permite las ventanas emergentes (pop-ups) en tu navegador para generar el reporte PDF.');
      return;
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Reporte Gerencial & Auditoría - POS Gastronómico</title>
        <style>
          @page { size: A4; margin: 16mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.4; margin: 0; padding: 0; background: #ffffff; }
          .header { border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title h1 { font-size: 20px; font-weight: 900; color: #111827; margin: 0; }
          .title p { font-size: 11px; color: #6b7280; margin: 3px 0 0 0; font-family: monospace; }
          .meta { text-align: right; font-size: 11px; color: #4b5563; font-family: monospace; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
          .kpi-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
          .kpi-card span { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; display: block; }
          .kpi-card .val { font-size: 17px; font-weight: 900; color: #111827; margin-top: 3px; font-family: monospace; }
          section { margin-bottom: 22px; page-break-inside: avoid; }
          h3 { font-size: 13px; font-weight: 800; color: #374151; border-left: 4px solid #7c3aed; padding-left: 8px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; font-family: monospace; }
          th { background: #f3f4f6; color: #374151; font-weight: 700; text-align: left; padding: 6px 8px; border-bottom: 1px solid #d1d5db; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .badge { display: inline-block; padding: 1px 7px; border-radius: 9999px; font-size: 9.5px; font-weight: 800; }
          .badge-green { background: #d1fae5; color: #065f46; }
          .badge-amber { background: #fef3c7; color: #92400e; }
          .chart-container { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 15px; margin-top: 12px; }
          .bar-row { display: flex; align-items: center; margin-bottom: 7px; font-size: 10.5px; font-family: monospace; }
          .bar-label { width: 150px; font-weight: 700; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .bar-track { flex: 1; background: #e5e7eb; height: 11px; border-radius: 6px; margin: 0 10px; overflow: hidden; }
          .bar-fill { background: linear-gradient(90deg, #7c3aed, #a855f7); height: 100%; border-radius: 6px; }
          .bar-value { width: 65px; text-align: right; font-weight: 800; color: #4b5563; }
          .footer { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 10px; display: flex; justify-content: space-between; font-size: 9.5px; color: #9ca3af; font-family: monospace; }
          @media print { body { -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">
            <h1>Reporte Gerencial & Auditoría Operativa</h1>
            <p>Sistema POS Gastronómico — Control Tributario, Asistencia y Costos</p>
          </div>
          <div class="meta">
            <div>Emisión: ${formattedDate}</div>
            <div>Hora: ${formattedTime}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <span>Ventas Brutas</span>
            <div class="val" style="color: #059669;">$${totalGrossSales.toLocaleString('es-CL')}</div>
          </div>
          <div class="kpi-card">
            <span>IVA Débito (19%)</span>
            <div class="val" style="color: #0d9488;">$${totalIvaDebit.toLocaleString('es-CL')}</div>
          </div>
          <div class="kpi-card">
            <span>Food Cost Promedio</span>
            <div class="val" style="color: #7c3aed;">${avgFoodCost}%</div>
          </div>
          <div class="kpi-card">
            <span>Pozo Propinas</span>
            <div class="val" style="color: #2563eb;">$${totalTipsPool.toLocaleString('es-CL')}</div>
          </div>
        </div>

        <section>
          <h3>1. Gráfico & Análisis de Rentabilidad de Carta (Food Cost %)</h3>
          <div class="chart-container">
            <div style="font-size: 10.5px; font-weight: 800; margin-bottom: 8px; color: #4b5563; text-transform: uppercase;">Porcentaje de Costo de Insumos sobre Venta Neta</div>
            ${productsList.map(p => {
              const fc = p.food_cost_pct || 0;
              return `
                <div class="bar-row">
                  <div class="bar-label" title="${p.name}">${p.name}</div>
                  <div class="bar-track">
                    <div class="bar-fill" style="width: ${Math.min(fc, 100)}%;"></div>
                  </div>
                  <div class="bar-value">${fc}%</div>
                </div>
              `;
            }).join('')}
          </div>

          <table style="margin-top: 10px;">
            <thead>
              <tr>
                <th>Plato / Producto</th>
                <th>Categoría</th>
                <th class="text-right">Precio Venta (IVA Inc.)</th>
                <th class="text-right">Costo Insumos</th>
                <th class="text-center">Food Cost %</th>
                <th class="text-right">Margen Neto ($)</th>
              </tr>
            </thead>
            <tbody>
              ${productsList.map(p => `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td>${p.category}</td>
                  <td class="text-right">$${p.price.toLocaleString('es-CL')}</td>
                  <td class="text-right">$${(p.recipe_cost || 0).toLocaleString('es-CL')}</td>
                  <td class="text-center">
                    <span class="badge ${ (p.food_cost_pct || 0) <= 32 ? 'badge-green' : 'badge-amber' }">
                      ${p.food_cost_pct || 0}%
                    </span>
                  </td>
                  <td class="text-right" style="color: #059669; font-weight: 800;">+$${(p.net_margin || 0).toLocaleString('es-CL')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <section>
          <h3>2. Auditoría Antifraude de Turnos de Caja</h3>
          <table>
            <thead>
              <tr>
                <th>Apertura</th>
                <th>Estado</th>
                <th class="text-right">Fondo Inicial</th>
                <th class="text-right">Efectivo Sistema</th>
                <th class="text-right">Efectivo Declarado</th>
                <th class="text-center">Descuadre</th>
                <th class="text-right">Venta Turno</th>
              </tr>
            </thead>
            <tbody>
              ${shifts.length === 0 ? '<tr><td colspan="7" class="text-center">Sin turnos registrados</td></tr>' : shifts.map(s => `
                <tr>
                  <td>${new Date(s.opened_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>${s.status === 'open' ? 'En curso' : 'Cerrado'}</td>
                  <td class="text-right">$${(Number(s.initial_cash) || 0).toLocaleString('es-CL')}</td>
                  <td class="text-right">$${(Number(s.expected_cash) || Number(s.initial_cash)).toLocaleString('es-CL')}</td>
                  <td class="text-right">${s.declared_cash !== null ? `$${Number(s.declared_cash).toLocaleString('es-CL')}` : 'Pendiente'}</td>
                  <td class="text-center">
                    <span class="badge ${ (s.cash_discrepancy || 0) === 0 ? 'badge-green' : 'badge-amber' }">
                      ${(s.cash_discrepancy || 0) === 0 ? 'Exacto' : `$${s.cash_discrepancy}`}
                    </span>
                  </td>
                  <td class="text-right" style="font-weight: 800; color: #059669;">$${(Number(s.total_sales) || 0).toLocaleString('es-CL')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <div class="footer">
          <div>Sistema POS Gastronómico • Módulo de Auditoría Gerencial</div>
          <div>Documento confidencial emitido para administración</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Barra de cabecera */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4 ${
        isDark ? 'border-zinc-800' : 'border-slate-200'
      }`}>
        <div>
          <h2 className={`text-base font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
            <span className="p-1.5 rounded-lg bg-violet-500/10 text-violet-600 border border-violet-500/20">
              <TrendingUp className="w-4 h-4" />
            </span>
            Panel Gerencial & Auditoría Operativa
          </h2>
          <p className={`text-xs font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
            Consolidado tributario SII, asistencia digital DT y costos de recetas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Reporte PDF Gerencial con Gráficas */}
          <button
            onClick={handlePrintPDFReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            title="Generar e imprimir Reporte Ejecutivo con Gráficas en PDF"
          >
            <FileText className="w-4 h-4" />
            <span>Reporte PDF Gerencial</span>
          </button>

          {/* Botón Exportar Planilla Contable */}
          <button
            onClick={handleExportReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            title="Descargar balance completo para el contador (Excel / Google Sheets)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar Balance (.CSV)</span>
          </button>

          {/* Pestañas de Navegación Gerencial */}
          <div className={`flex p-1 rounded-xl border overflow-x-auto max-w-full ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-slate-100 border-slate-200'}`}>
            <button
              onClick={() => setAdminTab('metrics')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer shrink-0 ${
                adminTab === 'metrics'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Métricas & Finanzas
            </button>

            {/* PESTAÑA: Gestión de Personal, Roles y PINs */}
            <button
              onClick={() => setAdminTab('team')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                adminTab === 'team'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Equipo & Roles</span>
            </button>

            <button
              onClick={() => setAdminTab('staff')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer shrink-0 ${
                adminTab === 'staff'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Personal & RRHH
            </button>
            <button
              onClick={() => setAdminTab('attendance')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                adminTab === 'attendance'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
              <span>Asistencia DT (GPS)</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </button>
            <button
              onClick={() => setAdminTab('menu')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer shrink-0 ${
                adminTab === 'menu'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Carta & Recetas
            </button>
          </div>

          <button
            onClick={loadDashboardData}
            disabled={loading}
            className={`p-2 rounded-xl border transition-all active:scale-95 shadow-xs cursor-pointer ${
              isDark 
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 hover:text-white' 
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-violet-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pestaña: Gestión de Equipo, Roles y PINs */}
      {adminTab === 'team' && (
        <StaffManagementView isDark={isDark} />
      )}

      {/* Pestaña 1: Finanzas e Impuestos */}
      {adminTab === 'metrics' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-900 border-emerald-500/30' 
                : 'bg-gradient-to-br from-emerald-50/70 via-white to-white border-emerald-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-600 dark:text-emerald-400">Ventas Brutas Totales</span>
                <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
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

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-teal-950/40 via-zinc-900 to-zinc-900 border-teal-500/30' 
                : 'bg-gradient-to-br from-teal-50/70 via-white to-white border-teal-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-teal-600 dark:text-teal-400">IVA Débito (19%)</span>
                <div className="p-1.5 bg-teal-500/10 rounded-lg text-teal-600 dark:text-teal-400">
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

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-900 border-amber-500/30' 
                : 'bg-gradient-to-br from-amber-50/70 via-white to-white border-amber-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-amber-700 dark:text-amber-400">Provisión PPM (1%)</span>
                <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-600 dark:text-amber-400">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-amber-700 dark:text-amber-400">
                  ${totalPpmProvision.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Pago Provisional Mensual
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark 
                ? 'bg-gradient-to-br from-blue-950/40 via-zinc-900 to-zinc-900 border-blue-500/30' 
                : 'bg-gradient-to-br from-blue-50/70 via-white to-white border-blue-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-blue-600 dark:text-blue-400">Pozo Propinas (10%)</span>
                <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`lg:col-span-2 rounded-2xl border p-5 shadow-xs space-y-4 ${
              isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />
                  <h3 className={`font-extrabold text-sm ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                    Auditoría de Arqueos de Turno
                  </h3>
                </div>
                <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Control Antifraude
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className={`border-b ${
                    isDark ? 'bg-zinc-950 text-zinc-400 border-zinc-800' : 'bg-slate-50 text-slate-700 border-slate-200 font-bold'
                  }`}>
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
                        <tr key={s.id} className={isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50/80'}>
                          <td className="p-3 font-sans">
                            <span className={`font-bold block text-xs ${isDark ? 'text-zinc-200' : 'text-slate-800'}`}>
                              {new Date(s.opened_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                              {s.status === 'open' ? 'En curso' : 'Cerrado'}
                            </span>
                          </td>
                          <td className={`p-3 text-right tabular-nums ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                            ${(Number(s.expected_cash) || Number(s.initial_cash)).toLocaleString('es-CL')}
                          </td>
                          <td className={`p-3 text-right font-bold tabular-nums ${isDark ? 'text-zinc-200' : 'text-slate-900'}`}>
                            {s.declared_cash !== null ? `$${Number(s.declared_cash).toLocaleString('es-CL')}` : '—'}
                          </td>
                          <td className="p-3 text-center">
                            {s.status === 'open' ? (
                              <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                Abierto
                              </span>
                            ) : !hasDiscrepancy ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Exacto
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                                isShortage 
                                  ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20' 
                                  : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                              }`}>
                                <AlertOctagon className="w-3 h-3" />
                                {isShortage ? `Falta: $${Math.abs(s.cash_discrepancy || 0).toLocaleString('es-CL')}` : `Sobra: $${(s.cash_discrepancy || 0).toLocaleString('es-CL')}`}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                            ${(Number(s.total_sales) || 0).toLocaleString('es-CL')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 shadow-xs space-y-4 ${
              isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-violet-500" />
                  <h3 className={`font-extrabold text-sm ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                    Top Productos
                  </h3>
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
                          <span className={`font-sans font-bold flex items-center gap-1.5 ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>
                            <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>#{index + 1}</span>
                            {prod.product_name}
                          </span>
                          <span className={`font-black tabular-nums ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
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
      )}

      {/* Pestaña 2: Personal & RRHH */}
      {adminTab === 'staff' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
                <span>Marcas Registradas</span>
                <Clock className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-zinc-100">
                  {attendanceLogs.length}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Control de jornada DT
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
                <span>Inversión en Colaciones</span>
                <Utensils className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                  ${totalStaffMealCost.toLocaleString('es-CL')}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Beneficio alimentario ($0)
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span>Raciones Entregadas</span>
                <Coffee className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  {totalMealPortions} un.
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Platos y bebestibles
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-violet-600 dark:text-violet-400">
                <span>Cumplimiento Legal</span>
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-lg font-black text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Auditado
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Hora de servidor inmutable
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={`rounded-2xl border p-5 shadow-xs space-y-4 ${
              isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-500" />
                  <h3 className={`font-extrabold text-sm ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                    Libro Digital de Asistencia
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminTab('attendance')}
                  className="text-[11px] font-mono font-bold text-violet-400 hover:text-violet-300 transition cursor-pointer"
                >
                  Ver Fotos y GPS →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className={`border-b ${
                    isDark ? 'bg-zinc-950 text-zinc-400 border-zinc-800' : 'bg-slate-50 text-slate-700 border-slate-200 font-bold'
                  }`}>
                    <tr>
                      <th className="p-3">Colaborador</th>
                      <th className="p-3">Evento</th>
                      <th className="p-3 text-right">Fecha & Hora</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
                    {attendanceLogs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-slate-400 dark:text-zinc-500">
                          Sin marcas de asistencia registradas.
                        </td>
                      </tr>
                    ) : (
                      attendanceLogs.map((log) => {
                        const isEntry = log.event_type === 'clock_in';
                        const isExit = log.event_type === 'clock_out';

                        return (
                          <tr key={log.id} className={isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50/80'}>
                            <td className="p-3">
                              <span className={`font-bold block font-sans ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                                {log.staff?.name || 'Empleado'}
                              </span>
                              <span className="text-[10px] text-zinc-400 capitalize">
                                {log.staff?.role || 'Personal'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isEntry
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                  : isExit
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                              }`}>
                                {isEntry ? <Clock className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                                {isEntry ? 'Entrada' : isExit ? 'Salida' : 'Colación'}
                              </span>
                            </td>
                            <td className={`p-3 text-right tabular-nums ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                              {new Date(log.timestamp).toLocaleString('es-CL', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 shadow-xs space-y-4 ${
              isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-amber-500" />
                  <h3 className={`font-extrabold text-sm ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                    Consumo de Colaciones ($0)
                  </h3>
                </div>
                <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Descargo de Bodega
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className={`border-b ${
                    isDark ? 'bg-zinc-950 text-zinc-400 border-zinc-800' : 'bg-slate-50 text-slate-700 border-slate-200 font-bold'
                  }`}>
                    <tr>
                      <th className="p-3">Colaborador</th>
                      <th className="p-3">Alimentos Consumidos</th>
                      <th className="p-3 text-right">Costo Absorbido</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-zinc-800' : 'divide-slate-200'}`}>
                    {staffMeals.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-slate-400 dark:text-zinc-500">
                          Sin colaciones registradas hasta ahora.
                        </td>
                      </tr>
                    ) : (
                      staffMeals.map((meal) => {
                        const mealTotal = meal.order_items.reduce(
                          (acc, it) => acc + (it.product?.price || 0) * it.quantity,
                          0
                        );

                        return (
                          <tr key={meal.id} className={isDark ? 'hover:bg-zinc-800/40' : 'hover:bg-slate-50/80'}>
                            <td className="p-3">
                              <span className={`font-bold block font-sans ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                                {meal.staff?.name || meal.waiter_name?.replace('Colación • ', '') || 'Personal'}
                              </span>
                              <span className="text-[10px] text-zinc-400">
                                {new Date(meal.created_at).toLocaleDateString('es-CL', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="space-y-0.5">
                                {meal.order_items.map((it) => (
                                  <span key={it.id} className="block text-[11px] font-sans">
                                    <strong className="text-amber-500">{it.quantity}x</strong> {it.product?.name || 'Ítem'}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3 text-right font-black text-amber-600 dark:text-amber-400 tabular-nums">
                              ${mealTotal.toLocaleString('es-CL')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pestaña: Auditoría Completa de Asistencia DT (GPS y Cámara) */}
      {adminTab === 'attendance' && (
        <StaffAttendanceAudit isDark={isDark} />
      )}

      {/* Pestaña 3: Carta, Recetas & Food Cost % */}
      {adminTab === 'menu' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-violet-600 dark:text-violet-400">
                <span>Promedio Food Cost</span>
                <Calculator className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className={`text-2xl font-black tabular-nums ${
                  avgFoodCost <= 32 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {avgFoodCost}%
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Meta recomendada: 25% - 32%
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span>Fichas Técnicas Activas</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">
                  {costedProducts.length} <span className="text-xs font-normal text-zinc-500">/ {productsList.length} platos</span>
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Platos con descuento automático
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200 shadow-xs'
            }`}>
              <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
                <span>Margen de Ganancia</span>
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
                  {avgFoodCost > 0 ? `${100 - avgFoodCost}%` : '—'}
                </span>
                <p className={`text-[11px] font-mono mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Margen bruto promedio sobre neto
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-sm font-extrabold flex items-center gap-2 ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                <Utensils className="w-4 h-4 text-violet-500" /> Ingeniería de Menú & Rentabilidad
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-600 font-medium'}`}>
                Costos reales de producción, margen bruto líquido y Food Cost % por plato
              </p>
            </div>
            <button
              onClick={() => setIsCreatingProduct(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-violet-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nuevo Plato
            </button>
          </div>

          <div className={`rounded-2xl border overflow-hidden shadow-xs transition-all ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-slate-200'
          }`}>
            <table className="w-full text-left text-xs">
              <thead className={`border-b font-mono ${
                isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-700 font-bold'
              }`}>
                <tr>
                  <th className="p-3.5">Plato / Categoría</th>
                  <th className="p-3.5 text-right">Precio Venta (IVA Inc.)</th>
                  <th className="p-3.5 text-right">Costo Insumos</th>
                  <th className="p-3.5 text-center">Food Cost %</th>
                  <th className="p-3.5 text-right">Margen Neto ($)</th>
                  <th className="p-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-mono ${isDark ? 'divide-zinc-800/80' : 'divide-slate-200/80'}`}>
                {productsList.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-400 dark:text-zinc-500 font-mono">
                      No hay platos ingresados en la carta.
                    </td>
                  </tr>
                ) : (
                  productsList.map((prod) => {
                    const hasRecipe = (prod.recipe_count || 0) > 0;
                    const cost = prod.recipe_cost || 0;
                    const fcPct = prod.food_cost_pct || 0;
                    const margin = prod.net_margin || 0;

                    const isOptimal = hasRecipe && fcPct > 0 && fcPct <= 32;
                    const isWarning = hasRecipe && fcPct > 32 && fcPct <= 40;

                    return (
                      <tr key={prod.id} className={`transition-colors ${isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-slate-50/80'}`}>
                        <td className="p-3.5 font-sans">
                          <span className={`font-bold block text-xs ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                            {prod.name}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] mt-0.5 px-2 py-0.2 rounded border font-mono ${
                            isDark ? 'bg-zinc-800 text-zinc-400 border-zinc-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            <Tag className="w-2.5 h-2.5 text-violet-500" /> {prod.category}
                          </span>
                        </td>

                        <td className="p-3.5 text-right font-black text-slate-900 dark:text-zinc-100 tabular-nums text-sm">
                          ${prod.price.toLocaleString('es-CL')}
                          <span className="block text-[10px] font-normal text-slate-400 font-mono">
                            Neto: ${Math.round(prod.price / 1.19).toLocaleString('es-CL')}
                          </span>
                        </td>

                        <td className="p-3.5 text-right tabular-nums">
                          {hasRecipe ? (
                            <div>
                              <span className="font-bold text-amber-600 dark:text-amber-400 text-xs">
                                ${cost.toLocaleString('es-CL')}
                              </span>
                              <span className="block text-[10px] text-zinc-400 font-mono">
                                {prod.recipe_count} ingrediente(s)
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-500 italic font-sans">
                              Sin receta
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          {hasRecipe && cost > 0 ? (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border tabular-nums ${
                              isOptimal
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : isWarning
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                            }`}>
                              {fcPct}%
                              <span className="text-[9px] font-medium font-sans">
                                {isOptimal ? '• Óptimo' : isWarning ? '• Atención' : '• Alto'}
                              </span>
                            </span>
                          ) : (
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${
                              isDark ? 'bg-zinc-800 text-zinc-500 border-zinc-700' : 'bg-slate-100 text-slate-400 border-slate-200'
                            }`}>
                              —
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-right tabular-nums">
                          {hasRecipe && cost > 0 ? (
                            <div>
                              <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs">
                                +${margin.toLocaleString('es-CL')}
                              </span>
                              <span className="block text-[10px] text-zinc-400 font-mono">
                                Margen: {100 - fcPct}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-500">—</span>
                          )}
                        </td>

                        <td className="p-3.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setRecipeProduct(prod)}
                              className="px-2.5 py-1.5 bg-violet-600/10 hover:bg-violet-600/20 text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded-lg text-xs font-sans font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                              title="Gestionar receta e insumos"
                            >
                              <Layers className="w-3.5 h-3.5" /> Ficha
                            </button>
                            <button
                              onClick={() => setEditingProduct(prod)}
                              className={`p-1.5 rounded-lg border transition-all active:scale-95 cursor-pointer ${
                                isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                              title="Editar plato"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(prod)}
                              className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 rounded-lg transition-all active:scale-95 cursor-pointer"
                              title="Eliminar plato"
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