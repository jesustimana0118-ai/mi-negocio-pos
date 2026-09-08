import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Printer, X, FileText } from 'lucide-react';

interface ReceiptItem {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  product: {
    name: string;
  };
}

interface OrderDetail {
  id: string;
  order_number: number;
  created_at: string;
  subtotal_net: number;
  iva_amount: number;
  tip_amount: number;
  total_amount: number;
  payment_method: string | null;
  waiter_name?: string | null;
  status: string;
}

interface ReceiptModalProps {
  orderId: string;
  tableName: string;
  tableNumber: number;
  isPrecuenta?: boolean;
  onClose: () => void;
}

export function ReceiptModal({
  orderId,
  tableName,
  tableNumber,
  isPrecuenta = true,
  onClose,
}: ReceiptModalProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReceiptData() {
      setLoading(true);

      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      const { data: itemsData } = await supabase
        .from('order_items')
        .select(`
          id,
          quantity,
          unit_price,
          subtotal,
          product:products(name)
        `)
        .eq('order_id', orderId);

      if (orderData) setOrder(orderData as OrderDetail);
      if (itemsData) setItems(itemsData as unknown as ReceiptItem[]);

      setLoading(false);
    }

    loadReceiptData();
  }, [orderId]);

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = order?.created_at
    ? new Date(order.created_at).toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  const baseConsumption = order ? order.subtotal_net + order.iva_amount : 0;
  const suggestedTip = Math.round(baseConsumption * 0.1);

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #thermal-receipt-print, #thermal-receipt-print * {
            visibility: visible;
          }
          #thermal-receipt-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 78mm;
            padding: 0;
            margin: 0;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: monospace;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 no-print">
        <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-zinc-100">
                {isPrecuenta ? 'Precuenta de Salón' : 'Comprobante de Pago'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-20 text-center text-xs text-zinc-500 font-mono animate-pulse">
                Generando formato térmico...
              </div>
            ) : order ? (
              <div
                id="thermal-receipt-print"
                className="bg-white text-zinc-950 font-mono text-[12px] p-5 rounded-xl shadow-inner border border-zinc-200 select-text leading-tight"
              >
                <div className="text-center space-y-1 border-b border-dashed border-zinc-400 pb-3 mb-3">
                  <h2 className="font-black text-sm uppercase tracking-wider">
                    Mi Negocio POS
                  </h2>
                  <p className="text-[11px] text-zinc-700">R.U.T.: 76.842.190-K</p>
                  <p className="text-[11px] text-zinc-700">Giro: Restaurante y Bar</p>
                  <p className="text-[10px] text-zinc-500">Av. Gastronomía 1234, Santiago</p>
                  <p className="text-[10px] text-zinc-500">Teléfono: +56 9 8765 4321</p>
                </div>

                <div className="space-y-0.5 border-b border-dashed border-zinc-400 pb-2.5 mb-3 text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-bold">ORDEN #{order.order_number}</span>
                    <span className="font-bold">MESA {tableNumber}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Sector: {tableName}</span>
                    <span>{formattedDate}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600 font-semibold">
                    <span>Atendido por:</span>
                    <span>{order.waiter_name || 'Garzón'}</span>
                  </div>
                  <div className="pt-1 text-center font-bold text-[10px] uppercase text-zinc-700">
                    {isPrecuenta
                      ? '*** ESTADO DE CUENTA / PRECUENTA ***'
                      : '*** COMPROBANTE DE VENTA VALORADA ***'}
                  </div>
                </div>

                <table className="w-full text-left mb-3">
                  <thead>
                    <tr className="border-b border-zinc-950 text-[11px]">
                      <th className="pb-1 w-8">CANT</th>
                      <th className="pb-1">DETALLE</th>
                      <th className="pb-1 text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dotted divide-zinc-300">
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-1 font-bold align-top">{it.quantity}</td>
                        <td className="py-1 align-top pr-1">{it.product.name}</td>
                        <td className="py-1 text-right align-top tabular-nums">
                          ${it.subtotal.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="border-t border-dashed border-zinc-400 pt-2.5 space-y-1 text-[11px]">
                  <div className="flex justify-between text-zinc-600">
                    <span>Subtotal Neto:</span>
                    <span className="tabular-nums">${order.subtotal_net.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>IVA Débito (19%):</span>
                    <span className="tabular-nums">${order.iva_amount.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between font-bold text-xs pt-1 border-t border-zinc-950">
                    <span>TOTAL CONSUMO:</span>
                    <span className="tabular-nums">${baseConsumption.toLocaleString('es-CL')}</span>
                  </div>

                  <div className="pt-2 border-t border-dotted border-zinc-300 space-y-0.5">
                    <div className="flex justify-between text-zinc-700 font-semibold">
                      <span>Propina Sugerida (10%):</span>
                      <span className="tabular-nums">
                        ${(isPrecuenta ? suggestedTip : order.tip_amount).toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div className="flex justify-between font-black text-sm pt-1 text-zinc-950">
                      <span>TOTAL CON PROPINA:</span>
                      <span className="tabular-nums">
                        ${(baseConsumption + (isPrecuenta ? suggestedTip : order.tip_amount)).toLocaleString('es-CL')}
                      </span>
                    </div>
                  </div>

                  {!isPrecuenta && order.payment_method && (
                    <div className="pt-2 border-t border-zinc-950 text-[10px] uppercase flex justify-between font-bold">
                      <span>FORMA DE PAGO:</span>
                      <span>{order.payment_method}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-dashed border-zinc-400 text-center space-y-1 text-[10px] text-zinc-600">
                  <p className="italic">
                    "La propina es voluntaria y corresponde al 10% del consumo total sugerido según Ley 20.918."
                  </p>
                  <p className="font-bold uppercase tracking-wider text-zinc-800 pt-1">
                    ¡Gracias por su visita!
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2.5 pt-2 border-t border-zinc-800">
            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg"
            >
              <Printer className="w-4 h-4" /> Imprimir Ticket (80mm)
            </button>
            <button
              onClick={onClose}
              className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl text-xs transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}