import React from 'react';
import { X, Printer, Download, CheckCircle2, FileText, Shield } from 'lucide-react';
import { Invoice } from '../types/crm';

interface InvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ invoice, onClose }) => {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-8 space-y-6 text-neutral-100 shadow-2xl print:bg-white print:text-neutral-900 print:border-none print:shadow-none print:w-full">
        {/* Top Header Buttons (Hidden on print) */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 print:hidden">
          <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Rechnungsbeleg {invoice.invoiceNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Drucken / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Company Letterhead */}
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xl font-bold tracking-tight text-neutral-100 print:text-neutral-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center text-white text-xs">▲</span>
              <span>ApexHost Cloud Services GmbH</span>
            </div>
            <div className="text-xs text-neutral-400 print:text-neutral-600 mt-1 leading-relaxed">
              Mainzer Landstraße 180 · 60327 Frankfurt am Main<br />
              USt-IdNr.: DE 384 918 204 · Amtsgericht Frankfurt HRB 120491
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-2.5 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono text-xs font-bold uppercase print:border-emerald-600 print:text-emerald-700">
              BEZAHLT (Prepaid)
            </span>
            <div className="text-xs text-neutral-400 print:text-neutral-600 font-mono mt-1">
              Ref: {invoice.transactionReference}
            </div>
          </div>
        </div>

        {/* Recipient & Metadata Grid */}
        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-neutral-800 print:border-neutral-200 text-xs">
          <div>
            <div className="text-[11px] text-neutral-500 font-semibold uppercase tracking-wider mb-1">Rechnungsempfänger</div>
            <div className="font-semibold text-neutral-200 print:text-neutral-900">{invoice.customerName}</div>
            <div className="text-neutral-400 print:text-neutral-600 whitespace-pre-line leading-relaxed">
              {invoice.customerAddress}
            </div>
          </div>

          <div className="space-y-1 font-mono text-right">
            <div className="text-neutral-400 print:text-neutral-600">Rechnungs-Nr.: <strong className="text-neutral-100 print:text-neutral-900">{invoice.invoiceNumber}</strong></div>
            <div className="text-neutral-400 print:text-neutral-600">Rechnungsdatum: {invoice.date}</div>
            <div className="text-neutral-400 print:text-neutral-600">Zahlungsart: {invoice.paymentMethod}</div>
            <div className="text-neutral-400 print:text-neutral-600">Leistungszeitraum: 30 Tage Prepaid</div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 print:border-neutral-300 text-neutral-400 print:text-neutral-600">
                <th className="py-2 font-semibold">Position & Leistungsbeschreibung</th>
                <th className="py-2 font-semibold text-center w-16">Menge</th>
                <th className="py-2 font-semibold text-right w-24">Einzelpreis</th>
                <th className="py-2 font-semibold text-right w-24">Gesamt (Netto)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80 print:divide-neutral-200 font-mono">
              {invoice.items.map((item, idx) => (
                <tr key={idx} className="text-neutral-300 print:text-neutral-800">
                  <td className="py-3 font-sans">{item.description}</td>
                  <td className="py-3 text-center tabular-nums">{item.quantity}</td>
                  <td className="py-3 text-right tabular-nums">{item.unitPrice.toFixed(2)} €</td>
                  <td className="py-3 text-right tabular-nums">{item.total.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Calculation Totals */}
        <div className="flex justify-end pt-3 border-t border-neutral-800 print:border-neutral-200">
          <div className="w-64 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-neutral-400 print:text-neutral-600">
              <span>Nettobetrag:</span>
              <span className="tabular-nums">{invoice.subtotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-neutral-400 print:text-neutral-600">
              <span>zzgl. 19% MwSt.:</span>
              <span className="tabular-nums">{invoice.taxAmount.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-neutral-100 print:text-neutral-900 font-bold text-sm pt-2 border-t border-neutral-800 print:border-neutral-300">
              <span>Gesamtbetrag:</span>
              <span className="tabular-nums text-emerald-400 print:text-emerald-700">{invoice.total.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-[11px] text-neutral-500 print:text-neutral-600 pt-4 border-t border-neutral-800 print:border-neutral-200 leading-relaxed">
          Dieser Betrag wurde vollständig über dein Prepaid-Konto verrechnet. Der Server läuft für den bezahlten Zeitraum garantiert ohne weitere Zahlungsaufforderungen. Keine Kündigungsfrist erforderlich.
        </div>
      </div>
    </div>
  );
};
