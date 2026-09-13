import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Printer, X, Scissors, Loader2
} from 'lucide-react';

interface OrderItemDetail {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  product?: {
    name: string;
  };
}

interface OrderData {
  id: string;
  order_number: number;
  created_at: string;
  paid_at?: string;
  waiter_name: string;
  payment_method?: string;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
}

interface ReceiptModalProps {
  orderId: string;
  tableName: string;
  tableNumber: number;
  isPrecuenta?: boolean;
  onClose: () => void;
  isDark?: boolean;
}

export function ReceiptModal({
  orderId,
  tableName,
  tableNumber,
  isPrecuenta = true,
  onClose,
  isDark = true,
}: ReceiptModalProps) {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReceiptData() {
      setLoading(true);
      try {
        const { data: orderData, error: orderErr } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (orderErr) throw orderErr;
        setOrder(orderData as OrderData);

        const { data: itemsData, error: itemsErr } = await supabase
          .from('order_items')
          .select(`
            id,
            quantity,
            unit_price,
            subtotal,
            product:products(name)
          `)
          .eq('order_id', orderId);

        if (itemsErr) throw itemsErr;
        setItems((itemsData as unknown as OrderItemDetail[]) || []);
      } catch (err) {
        console.error('Error cargando comprobante:', err);
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      loadReceiptData();
    }
  }, [orderId]);

  const handlePrint = () => {
    window.print();
  };

  const isTakeout = tableNumber === 0 || tableName.toLowerCase().includes('para llevar');
  const printDate = order?.created_at ? new Date(order.created_at) : new Date();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      {/* Reglas CSS de Impresión Térmica Directa para 1 Sola Hoja */}
      <style>{`
        @media print {
          html, body {
            height: max-content !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          .thermal-print-area, .thermal-print-area * {
            visibility: visible;
          }
          .thermal-print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === '80mm' ? '72mm' : '48mm'} !important;
            margin: 0 !important;
            padding: 2mm 3mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-after: avoid !important;
            break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: auto;
            margin: 0mm !important;
          }
        }
      `}</style>

      <div className={`w-full max-w-lg rounded-3xl p-5 shadow-2xl space-y-4 max-h-[94vh] flex flex-col border transition-all ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Cabecera y Controles en Pantalla */}
        <div className="no-print flex items-center justify-between border-b pb-3 border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Printer className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-extrabold text-sm">
                {isPrecuenta ? 'Precuenta de Salón' : 'Comprobante de Venta'}
              </h3>
              <p className={`text-[11px] font-mono ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Vista previa térmica • {paperWidth}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Selector de Ancho de Rollo */}
            <div className={`flex rounded-xl p-0.5 border font-mono text-[11px] font-bold ${
              isDark ? 'bg-zinc-950 border-zinc-700' : 'bg-slate-100 border-slate-300'
            }`}>
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  paperWidth === '80mm'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  paperWidth === '58mm'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-600 hover:text-slate-900'
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

        {/* Visor de Rollo Térmico */}
        <div className="flex-1 overflow-y-auto flex justify-center py-2 bg-zinc-950/40 rounded-2xl border border-zinc-800/80 p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 py-16">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              Generando ticket...
            </div>
          ) : !order ? (
            <p className="text-xs text-rose-400 font-mono py-12">No se encontró la orden.</p>
          ) : (
            <div
              id="thermal-receipt"
              className={`thermal-print-area bg-white text-black font-mono shadow-xl rounded-md p-4 transition-all ${
                paperWidth === '80mm' ? 'w-[320px] text-xs' : 'w-[250px] text-[11px]'
              }`}
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              {/* Encabezado del Local */}
              <div className="text-center space-y-0.5 border-b border-dashed border-black pb-2 mb-2">
                <h2 className="text-sm font-black tracking-wider uppercase">MI NEGOCIO POS</h2>
                <p className="text-[10px]">RESTAURANTE & BAR</p>
                <p className="text-[10px]">RUT: 76.123.456-7</p>
                <p className="text-[10px]">Av. Principal #1234, Santiago</p>
                <p className="text-[10px]">Tel: +56 9 1234 5678</p>
              </div>

              {/* Título del Documento */}
              <div className="text-center my-2 py-1 border-y border-dashed border-black">
                <span className="font-black tracking-wider block">
                  {isPrecuenta ? '*** PRECUENTA ***' : '*** COMPROBANTE DE PAGO ***'}
                </span>
                {isPrecuenta && (
                  <span className="text-[9px] block uppercase">
                    (Documento no válido como boleta)
                  </span>
                )}
              </div>

              {/* Metadatos de la Mesa y Garzón */}
              <div className="space-y-0.5 text-[11px] pb-2 border-b border-dashed border-black">
                <div className="flex justify-between">
                  <span>ORDEN: #{order.order_number}</span>
                  <span className="font-black">
                    {isTakeout ? 'PARA LLEVAR' : `MESA #${tableNumber}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>UBICACIÓN:</span>
                  <span className="truncate max-w-[150px] text-right">{tableName}</span>
                </div>
                <div className="flex justify-between">
                  <span>ATENDIDO POR:</span>
                  <span className="truncate max-w-[150px] text-right">{order.waiter_name || 'Personal'}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>FECHA:</span>
                  <span>
                    {printDate.toLocaleDateString('es-CL')} {printDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Listado de Ítems */}
              <div className="py-2 border-b border-dashed border-black space-y-1.5">
                <div className="flex justify-between font-black text-[10px] uppercase border-b border-black/30 pb-0.5">
                  <span className="w-8">CANT</span>
                  <span className="flex-1 px-1">DETALLE</span>
                  <span className="text-right w-16">TOTAL</span>
                </div>

                {items.map((it) => (
                  <div key={it.id} className="flex justify-between items-start text-[11px] leading-tight">
                    <span className="w-8 font-black">{it.quantity}x</span>
                    <span className="flex-1 px-1 break-words">
                      {it.product?.name || 'Ítem'}
                    </span>
                    <span className="text-right w-16 tabular-nums font-semibold">
                      ${(it.subtotal || it.unit_price * it.quantity).toLocaleString('es-CL')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totales y Liquidación Tributaria */}
              <div className="py-2 border-b border-dashed border-black space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL NETO:</span>
                  <span className="tabular-nums">${Number(order.subtotal_net || 0).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between">
                  <span>I.V.A. (19%):</span>
                  <span className="tabular-nums">${Number(order.iva_amount || 0).toLocaleString('es-CL')}</span>
                </div>

                {order.tip_amount > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>PROPINA SUGERIDA (10%):</span>
                    <span className="tabular-nums">+${Number(order.tip_amount).toLocaleString('es-CL')}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-black pt-1 border-t border-black">
                  <span>TOTAL A PAGAR:</span>
                  <span className="tabular-nums">${Number(order.total_amount || 0).toLocaleString('es-CL')}</span>
                </div>

                {order.payment_method && (
                  <div className="flex justify-between text-[10px] pt-1 uppercase">
                    <span>MEDIO DE PAGO:</span>
                    <span className="font-bold">{order.payment_method}</span>
                  </div>
                )}
              </div>

              {/* Pie con Cortesía */}
              <div className="text-center pt-3 text-[10px] space-y-1">
                <p className="font-bold">¡MUCHAS GRACIAS POR SU VISITA!</p>
                <p>Propina voluntaria según Ley 20.729</p>
                <div className="pt-2 flex items-center justify-center gap-1 text-black/60">
                  <Scissors className="w-3 h-3" />
                  <span>- - - - - - - - - - - - - - - -</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botones de Acción */}
        <div className="no-print flex items-center gap-2 pt-1">
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
            disabled={loading || !order}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Ticket ({paperWidth})</span>
          </button>
        </div>
      </div>
    </div>
  );
}