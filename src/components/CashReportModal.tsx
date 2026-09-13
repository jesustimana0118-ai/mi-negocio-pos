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

        const { data: ordersData, error: ordersErr } = await supabase
          .from('orders')
          .select('id, order_number, total_amount, tip_amount, payment_method, paid_at, created_at')
          .eq('status', 'paid')
          .gte('created_at', startTime);

        if (ordersErr) throw ordersErr;
        setOrders((ordersData as PaidOrderSummary[]) || []);

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

  const totalSalesCount = orders.length;
  const grossSales = orders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
  const totalTips = orders.reduce((acc, o) => acc + (Number(o.tip_amount) || 0), 0);

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

  const totalExpenses = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const expectedCashInDrawer = shift.initial_cash + cashSales - totalExpenses;

  const countedNum = parseFloat(declaredCash);
  const hasCounted = !isNaN(countedNum);
  const cashDifference = hasCounted ? countedNum - expectedCashInDrawer : 0;

  const openedDate = new Date(shift.opened_at);
  const currentDate = new Date();

  // Impresión térmica blindada con tablas HTML (formato estándar de impresoras POS)
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

    const widthCSS = paperWidth === '80mm' ? '72mm' : '48mm';
    const fontSize = paperWidth === '80mm' ? '12px' : '10px';

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Reporte Z</title>
          <style>
            @page {
              size: ${paperWidth === '80mm' ? '80mm' : '58mm'} auto;
              margin: 0mm !important;
            }
            body {
              margin: 0 !important;
              padding: 3mm 2mm !important;
              background: #ffffff !important;
              color: #000000 !important;
              width: ${widthCSS} !important;
              font-family: 'Courier New', Courier, monospace !important;
              font-size: ${fontSize} !important;
              line-height: 1.3 !important;
            }
            table {
              width: 100% !important;
              border-collapse: collapse !important;
            }
            td {
              vertical-align: top !important;
            }
            .text-right {
              text-align: right !important;
            }
            .text-center {
              text-align: center !important;
            }
            .bold {
              font-weight: bold !important;
            }
            .black {
              font-weight: 900 !important;
            }
            .dashed {
              border-bottom: 1px dashed #000 !important;
              margin: 6px 0 !important;
            }
            .solid {
              border-bottom: 1px solid #000 !important;
              margin: 4px 0 !important;
            }
            .sig-box {
              border-top: 1px solid #000;
              width: 140px;
              margin: 28px auto 0 auto;
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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className={`w-full max-w-xl rounded-3xl p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col border transition-all ${
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
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  paperWidth === '80mm' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-400'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
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
        <div className={`p-3 rounded-2xl border space-y-2 font-mono text-xs shrink-0 ${
          isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-slate-50 border-slate-200 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <Banknote className="w-4 h-4" /> Conteo Real de Efectivo en Gaveta:
            </span>
            <span className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              (Sencillo inicial + Ventas efectivo - Gastos)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="relative w-full sm:w-56">
              <span className="absolute left-3 top-2 text-zinc-400 font-bold">$</span>
              <input
                type="number"
                placeholder="Ingresar efectivo contado"
                value={declaredCash}
                onChange={(e) => setDeclaredCash(e.target.value)}
                className={`w-full rounded-xl pl-7 pr-3 py-1.5 text-sm font-bold border outline-none ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
            </div>

            {hasCounted && (
              <div className={`flex-1 w-full p-2 rounded-xl border flex items-center justify-between text-xs ${
                cashDifference === 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : cashDifference > 0
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
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

        {/* Visor Térmico Limpio (Sin doble capa ni sombras fantasma) */}
        <div className={`flex-1 overflow-y-auto rounded-2xl border p-4 flex justify-center ${
          isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-slate-100 border-slate-200'
        }`}>
          {loading ? (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 py-16">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              Calculando balance financiero del turno...
            </div>
          ) : (
            <div
              id="thermal-z-report"
              className={`bg-white text-black font-mono shadow-md rounded-md p-4 transition-all h-fit ${
                paperWidth === '80mm' ? 'w-[320px] text-xs' : 'w-[250px] text-[11px]'
              }`}
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              {/* Encabezado */}
              <div className="text-center" style={{ marginBottom: '6px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase' }}>MI NEGOCIO POS</h2>
                <p style={{ fontSize: '10px' }}>CIERRE DE TURNO Y ARQUEO DE CAJA</p>
                <p style={{ fontSize: '10px', fontWeight: 'bold' }}>*** REPORTE Z DE CONTROL INTERNO ***</p>
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              {/* Metadatos del Turno en Tabla */}
              <table style={{ width: '100%', fontSize: '11px', marginBottom: '6px' }}>
                <tbody>
                  <tr>
                    <td>CAJERO:</td>
                    <td className="text-right bold" style={{ textTransform: 'uppercase' }}>{shift.cashier_name}</td>
                  </tr>
                  <tr style={{ fontSize: '10px' }}>
                    <td>APERTURA:</td>
                    <td className="text-right">
                      {openedDate.toLocaleDateString('es-CL')} {openedDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                  <tr style={{ fontSize: '10px' }}>
                    <td>CIERRE/EMISIÓN:</td>
                    <td className="text-right">
                      {currentDate.toLocaleDateString('es-CL')} {currentDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                  <tr style={{ fontWeight: 'bold' }}>
                    <td>BOLETAS COBRADAS:</td>
                    <td className="text-right">{totalSalesCount} transacciones</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              {/* 1. Ventas por medio de pago */}
              <div style={{ marginBottom: '6px' }}>
                <p style={{ fontSize: '10px', fontWeight: 'bold', borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '4px' }}>
                  1. VENTAS POR MEDIO DE PAGO
                </p>
                <table style={{ width: '100%', fontSize: '11px' }}>
                  <tbody>
                    <tr>
                      <td>(+) EFECTIVO:</td>
                      <td className="text-right bold">${cashSales.toLocaleString('es-CL')}</td>
                    </tr>
                    <tr>
                      <td>(+) TARJETAS (POS):</td>
                      <td className="text-right bold">${cardSales.toLocaleString('es-CL')}</td>
                    </tr>
                    <tr>
                      <td>(+) TRANSFERENCIAS:</td>
                      <td className="text-right bold">${transferSales.toLocaleString('es-CL')}</td>
                    </tr>
                    {splitSales > 0 && (
                      <tr>
                        <td>(+) CUENTAS DIVIDIDAS:</td>
                        <td className="text-right bold">${splitSales.toLocaleString('es-CL')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div style={{ borderBottom: '1px solid #000', margin: '4px 0' }} />

                <table style={{ width: '100%', fontSize: '13px', fontWeight: 900 }}>
                  <tbody>
                    <tr>
                      <td>TOTAL VENTA BRUTA:</td>
                      <td className="text-right">${grossSales.toLocaleString('es-CL')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              {/* 2. Arqueo de Gaveta */}
              <div style={{ marginBottom: '6px' }}>
                <p style={{ fontSize: '10px', fontWeight: 'bold', borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '4px' }}>
                  2. ARQUEO DE EFECTIVO (GAVETA)
                </p>
                <table style={{ width: '100%', fontSize: '11px' }}>
                  <tbody>
                    <tr>
                      <td>(+) SENCILLO INICIAL:</td>
                      <td className="text-right">${shift.initial_cash.toLocaleString('es-CL')}</td>
                    </tr>
                    <tr>
                      <td>(+) VENTAS EFECTIVO:</td>
                      <td className="text-right">${cashSales.toLocaleString('es-CL')}</td>
                    </tr>
                    <tr style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                      <td>(-) GASTOS CAJA CHICA ({expenses.length}):</td>
                      <td className="text-right">-${totalExpenses.toLocaleString('es-CL')}</td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ borderBottom: '1px solid #000', margin: '4px 0' }} />

                <table style={{ width: '100%', fontSize: '11px', fontWeight: 'bold' }}>
                  <tbody>
                    <tr>
                      <td>(=) EFECTIVO ESPERADO:</td>
                      <td className="text-right">${expectedCashInDrawer.toLocaleString('es-CL')}</td>
                    </tr>
                    {hasCounted && (
                      <>
                        <tr>
                          <td>(=) EFECTIVO DECLARADO:</td>
                          <td className="text-right">${countedNum.toLocaleString('es-CL')}</td>
                        </tr>
                        <tr style={{ fontWeight: 900 }}>
                          <td>DIFERENCIA:</td>
                          <td className="text-right">
                            {cashDifference === 0 ? '$0 (CUADRADA)' : cashDifference > 0 ? `+$${cashDifference.toLocaleString('es-CL')} (SOBRANTE)` : `-$${Math.abs(cashDifference).toLocaleString('es-CL')} (FALTANTE)`}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }} />

              {/* 3. Fondo de propinas */}
              <div style={{ marginBottom: '6px' }}>
                <p style={{ fontSize: '10px', fontWeight: 'bold', borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '4px' }}>
                  3. FONDO DE PROPINAS
                </p>
                <table style={{ width: '100%', fontSize: '11px', fontWeight: 'bold' }}>
                  <tbody>
                    <tr>
                      <td>TOTAL PROPINAS TURNO:</td>
                      <td className="text-right">${totalTips.toLocaleString('es-CL')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Firmas */}
              <div style={{ marginTop: '24px' }}>
                <div style={{ borderTop: '1px solid #000', width: '150px', margin: '24px auto 0 auto', paddingTop: '3px', textAlign: 'center', fontSize: '9px' }}>
                  FIRMA CAJERO RESPONSABLE
                </div>
                <div style={{ borderTop: '1px solid #000', width: '150px', margin: '24px auto 0 auto', paddingTop: '3px', textAlign: 'center', fontSize: '9px' }}>
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