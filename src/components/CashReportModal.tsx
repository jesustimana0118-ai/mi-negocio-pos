import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Printer, X, Receipt, Banknote, 
  CheckCircle2, AlertTriangle, Loader2 
} from 'lucide-react';

interface CashExpense {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}

interface PaidOrderSummary {
  id: string;
  order_number: number;
  total_amount: number;
  tip_amount: number;
  payment_method: string;
  paid_at?: string;
  created_at: string;
}

interface ShiftInfo {
  id?: string;
  cashier_name: string;
  initial_cash: number;
  opened_at: string;
  closed_at?: string;
}

interface CashReportModalProps {
  shift: ShiftInfo;
  onClose: () => void;
  isDark?: boolean;
}

export function CashReportModal({
  shift,
  onClose,
  isDark = true,
}: CashReportModalProps) {
  const [loading, setLoading] = useState(true);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [declaredCash, setDeclaredCash] = useState<string>('');

  const [orders, setOrders] = useState<PaidOrderSummary[]>([]);
  const [expenses, setExpenses] = useState<CashExpense[]>([]);

  useEffect(() => {
    async function loadShiftFinancials() {
      setLoading(true);
      try {
        const startTime = shift.opened_at;

        // 1. Cargar órdenes pagadas durante el turno
        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('id, order_number, total_amount, tip_amount, payment_method, paid_at, created_at')
          .eq('status', 'paid')
          .gte('created_at', startTime);

        if (ordersErr) throw ordersErr;
        setOrders((ordersData as PaidOrderSummary[]) || []);

        // 2. Cargar gastos de caja chica del turno
        const { data: expensesData, error: expErr } = await supabase
          .from('cash_expenses')
          .select('*')
          .gte('created_at', startTime);

        if (!expErr && expensesData) {
          setExpenses(expensesData as CashExpense[]);
        }
      } catch (err) {
        console.error('Error al cargar datos del reporte de caja:', err);
      } finally {
        setLoading(false);
      }
    }

    loadShiftFinancials();
  }, [shift.opened_at]);

  // Cálculos consolidados del turno
  const totalSalesCount = orders.length;
  const grossSales = orders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
  const totalTips = orders.reduce((acc, o) => acc + (Number(o.tip_amount) || 0), 0);

  // Desglose por método de pago
  const cashSales = orders
    .filter((o) => o.payment_method === 'cash')
    .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

  const cardSales = orders
    .filter((o) => o.payment_method === 'card_debit' || o.payment_method === 'card_credit' || o.payment_method === 'card' || o.payment_method === 'debit' || o.payment_method === 'credit')
    .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

  const transferSales = orders
    .filter((o) => o.payment_method === 'transfer')
    .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

  const splitSales = orders
    .filter((o) => o.payment_method === 'split')
    .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);

  // Movimientos de efectivo en gaveta
  const totalExpenses = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const expectedCashInDrawer = shift.initial_cash + cashSales - totalExpenses;

  // Arqueo
  const countedNum = parseFloat(declaredCash);
  const hasCounted = !isNaN(countedNum);
  const cashDifference = hasCounted ? countedNum - expectedCashInDrawer : 0;

  // Impresión térmica con estilos CSS directos
  const handlePrint = () => {
    const reportEl = document.getElementById('thermal-z-report');
    if (!reportEl) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Reporte Z - Cierre de Caja</title>
          <style>
            @page {
              size: ${paperWidth === '80mm' ? '80mm' : '58mm'} auto;
              margin: 0mm !important;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              font-family: 'Courier New', Courier, monospace !important;
            }
            body {
              margin: 0 !important;
              padding: 4mm 2mm !important;
              background: #ffffff !important;
              color: #000000 !important;
              width: ${paperWidth === '80mm' ? '74mm' : '48mm'} !important;
              font-size: ${paperWidth === '80mm' ? '12px' : '10px'};
              line-height: 1.3;
            }
            .p-center { text-align: center; }
            .p-right { text-align: right; }
            .p-bold { font-weight: bold; }
            .p-black { font-weight: 900; }
            .p-row {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              margin-bottom: 2px;
            }
            .p-divider {
              border-bottom: 1px dashed #000;
              margin: 5px 0;
            }
            .p-solid {
              border-bottom: 1px solid #000;
              margin: 5px 0;
            }
            .p-title {
              font-size: ${paperWidth === '80mm' ? '14px' : '12px'};
              font-weight: 900;
              letter-spacing: 0.5px;
              text-transform: uppercase;
            }
            .p-section {
              font-size: ${paperWidth === '80mm' ? '10px' : '9px'};
              font-weight: bold;
              border-bottom: 1px solid #444;
              padding-bottom: 2px;
              margin-bottom: 4px;
              text-transform: uppercase;
            }
            .p-sig-box {
              border-top: 1px solid #000;
              width: 150px;
              margin: 32px auto 0 auto;
              padding-top: 3px;
              text-align: center;
              font-size: 9px;
            }
          </style>
        </head>
        <body>
          ${reportEl.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 250);
  };

  const openedDate = new Date(shift.opened_at);
  const currentDate = new Date();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className={`w-full max-w-2xl rounded-3xl p-5 shadow-2xl space-y-4 max-h-[94vh] flex flex-col border transition-all ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Cabecera */}
        <div className={`flex items-center justify-between border-b pb-3 shrink-0 ${
          isDark ? 'border-zinc-800' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Receipt className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                Reporte de Cierre de Caja (Reporte Z)
              </h3>
              <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Auditoría financiera del turno • Responsable: {shift.cashier_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`flex rounded-xl p-0.5 border font-mono text-[11px] font-bold ${
              isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-slate-100 border-slate-300'
            }`}>
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                  paperWidth === '80mm' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-400'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2 py-1 rounded-lg transition cursor-pointer ${
                  paperWidth === '58mm' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-400'
                }`}
              >
                58mm
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-xl transition cursor-pointer ${
                isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Panel Interactivo: Ingreso de Arqueo */}
        <div className={`p-3.5 rounded-2xl border space-y-2.5 font-mono text-xs shrink-0 ${
          isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-slate-50 border-slate-200 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5 text-blue-500">
              <Banknote className="w-4 h-4" /> Conteo Real de Efectivo en Gaveta:
            </span>
            <span className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              (Sencillo inicial + Ventas efectivo - Gastos)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-64">
              <span className="absolute left-3 top-2 text-zinc-400 font-bold">$</span>
              <input
                type="number"
                placeholder="Ingresar efectivo contado"
                value={declaredCash}
                onChange={(e) => setDeclaredCash(e.target.value)}
                className={`w-full rounded-xl pl-7 pr-3 py-2 text-sm font-bold border outline-none ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
            </div>

            {hasCounted && (
              <div className={`flex-1 w-full p-2 rounded-xl border flex items-center justify-between ${
                cashDifference === 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                  : cashDifference > 0
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
              }`}>
                <span className="font-bold flex items-center gap-1.5">
                  {cashDifference === 0 ? (
                    <><CheckCircle2 className="w-4 h-4" /> Caja Cuadrada Exacta</>
                  ) : cashDifference > 0 ? (
                    <><CheckCircle2 className="w-4 h-4" /> Sobrante de Efectivo</>
                  ) : (
                    <><AlertTriangle className="w-4 h-4" /> Faltante de Efectivo</>
                  )}
                </span>
                <span className="font-black text-sm tabular-nums">
                  {cashDifference >= 0 ? `+$${cashDifference.toLocaleString('es-CL')}` : `-$${Math.abs(cashDifference).toLocaleString('es-CL')}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Visor Térmico del Reporte Z */}
        <div className={`flex-1 overflow-y-auto flex justify-center py-2 rounded-2xl border p-3 ${
          isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-slate-100 border-slate-200'
        }`}>
          {loading ? (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 py-16">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              Calculando balance financiero del turno...
            </div>
          ) : (
            <div
              id="thermal-z-report"
              className={`bg-white text-black font-mono shadow-xl rounded-md p-4 transition-all ${
                paperWidth === '80mm' ? 'w-[320px] text-xs' : 'w-[250px] text-[11px]'
              }`}
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              {/* Encabezado */}
              <div className="p-center" style={{ marginBottom: '6px' }}>
                <h2 className="p-title">MI NEGOCIO POS</h2>
                <p style={{ fontSize: '10px' }}>CIERRE DE TURNO Y ARQUEO DE CAJA</p>
                <p style={{ fontSize: '10px', fontWeight: 'bold' }}>*** REPORTE Z DE CONTROL INTERNO ***</p>
              </div>

              <div className="p-divider" />

              {/* Datos del Turno */}
              <div style={{ fontSize: '11px', marginBottom: '6px' }}>
                <div className="p-row">
                  <span>CAJERO:</span>
                  <span className="p-bold">{shift.cashier_name}</span>
                </div>
                <div className="p-row" style={{ fontSize: '10px' }}>
                  <span>APERTURA:</span>
                  <span>{openedDate.toLocaleDateString('es-CL')} {openedDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="p-row" style={{ fontSize: '10px' }}>
                  <span>CIERRE/EMISIÓN:</span>
                  <span>{currentDate.toLocaleDateString('es-CL')} {currentDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="p-row p-bold">
                  <span>BOLETAS COBRADAS:</span>
                  <span>{totalSalesCount} transacciones</span>
                </div>
              </div>

              <div className="p-divider" />

              {/* Resumen de Ventas por Medio de Pago */}
              <div style={{ marginBottom: '6px' }}>
                <p className="p-section">1. VENTAS POR MEDIO DE PAGO</p>
                <div className="p-row">
                  <span>(+) EFECTIVO:</span>
                  <span className="p-bold">${cashSales.toLocaleString('es-CL')}</span>
                </div>
                <div className="p-row">
                  <span>(+) TARJETAS (POS):</span>
                  <span className="p-bold">${cardSales.toLocaleString('es-CL')}</span>
                </div>
                <div className="p-row">
                  <span>(+) TRANSFERENCIAS:</span>
                  <span className="p-bold">${transferSales.toLocaleString('es-CL')}</span>
                </div>
                {splitSales > 0 && (
                  <div className="p-row">
                    <span>(+) CUENTAS DIVIDIDAS:</span>
                    <span className="p-bold">${splitSales.toLocaleString('es-CL')}</span>
                  </div>
                )}
                <div className="p-solid" />
                <div className="p-row p-black" style={{ fontSize: '13px' }}>
                  <span>TOTAL VENTA BRUTA:</span>
                  <span>${grossSales.toLocaleString('es-CL')}</span>
                </div>
              </div>

              <div className="p-divider" />

              {/* Arqueo de Efectivo en Gaveta */}
              <div style={{ marginBottom: '6px' }}>
                <p className="p-section">2. ARQUEO DE EFECTIVO (GAVETA)</p>
                <div className="p-row">
                  <span>(+) SENCILLO INICIAL:</span>
                  <span>${shift.initial_cash.toLocaleString('es-CL')}</span>
                </div>
                <div className="p-row">
                  <span>(+) VENTAS EFECTIVO:</span>
                  <span>${cashSales.toLocaleString('es-CL')}</span>
                </div>
                <div className="p-row" style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                  <span>(-) GASTOS CAJA CHICA ({expenses.length}):</span>
                  <span>-${totalExpenses.toLocaleString('es-CL')}</span>
                </div>

                <div className="p-solid" />

                <div className="p-row p-bold">
                  <span>(=) EFECTIVO ESPERADO:</span>
                  <span>${expectedCashInDrawer.toLocaleString('es-CL')}</span>
                </div>

                {hasCounted && (
                  <>
                    <div className="p-row p-bold">
                      <span>(=) EFECTIVO DECLARADO:</span>
                      <span>${countedNum.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="p-divider" />
                    <div className="p-row p-black">
                      <span>DIFERENCIA:</span>
                      <span>
                        {cashDifference === 0 ? '$0 (CUADRADA)' : cashDifference > 0 ? `+$${cashDifference.toLocaleString('es-CL')} (SOBRANTE)` : `-$${Math.abs(cashDifference).toLocaleString('es-CL')} (FALTANTE)`}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="p-divider" />

              {/* Propinas del Personal */}
              <div style={{ marginBottom: '6px' }}>
                <p className="p-section">3. FONDO DE PROPINAS</p>
                <div className="p-row p-bold">
                  <span>TOTAL PROPINAS TURNO:</span>
                  <span>${totalTips.toLocaleString('es-CL')}</span>
                </div>
              </div>

              {/* Firmas */}
              <div style={{ marginTop: '20px' }}>
                <div className="p-sig-box">
                  FIRMA CAJERO RESPONSABLE
                </div>
                <div className="p-sig-box">
                  FIRMA SUPERVISOR / ADMIN
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botones de Acción */}
        <div className="flex items-center gap-2 pt-1 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl border font-bold text-xs cursor-pointer transition ${
              isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Cerrar Vista
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Reporte Z ({paperWidth})</span>
          </button>
        </div>
      </div>
    </div>
  );
}