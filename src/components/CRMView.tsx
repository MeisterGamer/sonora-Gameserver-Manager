import React, { useState } from 'react';
import { 
  CreditCard, 
  Clock, 
  FileText, 
  AlertTriangle, 
  Users, 
  CheckCircle2, 
  RefreshCw, 
  HelpCircle, 
  Plus, 
  Send, 
  ExternalLink, 
  ShieldAlert, 
  Zap, 
  RotateCcw, 
  Building2, 
  Calendar,
  Trash2 
} from 'lucide-react';
import { 
  CustomerContract, 
  CustomerProfile, 
  Invoice, 
  PaymentTransaction, 
  SupportTicket, 
  ExpiryNotification 
} from '../types/crm';
import { UserAccount } from '../types/auth';
import { InvoiceModal } from './InvoiceModal';

interface CRMViewProps {
  currentUser: UserAccount;
  contracts: CustomerContract[];
  customers: CustomerProfile[];
  invoices: Invoice[];
  transactions: PaymentTransaction[];
  tickets: SupportTicket[];
  notifications: ExpiryNotification[];
  onRenewContract: (contractId: string, days: number) => void;
  onToggleAutoRenew: (contractId: string) => void;
  onTopUpBalance: (amount: number, method: string) => void;
  onFastForwardTime: (days: number) => void;
  onCreateTicket: (subject: string, serverName: string, text: string) => void;
  onReplyTicket: (ticketId: string, text: string) => void;
  onDeleteServer?: (serverId: string) => void;
}

export const CRMView: React.FC<CRMViewProps> = ({
  currentUser,
  contracts,
  customers,
  invoices,
  transactions,
  tickets,
  notifications,
  onRenewContract,
  onToggleAutoRenew,
  onTopUpBalance,
  onFastForwardTime,
  onCreateTicket,
  onReplyTicket,
  onDeleteServer
}) => {
  const [activeTab, setActiveTab] = useState<'contracts' | 'payment' | 'customers' | 'invoices' | 'tickets'>('contracts');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Top up payment form state
  const [payAmount, setPayAmount] = useState<number>(25);
  const [selectedPayMethod, setSelectedPayMethod] = useState<'PayPal' | 'Kreditkarte' | 'Sofort / Klarna' | 'Paysafecard' | 'Krypto (BTC/ETH)'>('PayPal');
  const [showTopUpDialog, setShowTopUpDialog] = useState(false);

  // New ticket state
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketServer, setTicketServer] = useState(contracts[0]?.serverName || 'Allgemein');
  const [ticketText, setTicketText] = useState('');

  // Ticket reply state
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});

  const handleCreateTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketText.trim()) return;
    onCreateTicket(ticketSubject.trim(), ticketServer, ticketText.trim());
    setTicketSubject('');
    setTicketText('');
    setShowNewTicketModal(false);
  };

  const handleSendReply = (ticketId: string) => {
    const text = replyTextMap[ticketId];
    if (!text || !text.trim()) return;
    onReplyTicket(ticketId, text.trim());
    setReplyTextMap({ ...replyTextMap, [ticketId]: '' });
  };

  const currentCustomerProfile = customers.find(c => c.id === currentUser.id) || customers[0];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono text-[10px] font-bold uppercase tracking-wider">
              100% Prepaid System
            </span>
            <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-400" />
              <span>Kundenmanagement & Prepaid-Abrechnung</span>
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Volle Kostenkontrolle: Keine Abonnements, keine Schulden. Server laufen nur mit hinterlegtem Prepaid-Guthaben.
          </p>
        </div>

        {/* Quick Balance & Time-Fast-Forward Button for Testing */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800 text-xs">
            <div className="text-[10px] text-neutral-500 uppercase font-semibold">Prepaid-Konto</div>
            <div className="text-sm font-bold font-mono text-emerald-400 tabular-nums">
              {currentUser.balance.toFixed(2)} €
            </div>
          </div>

          <button
            onClick={() => setShowTopUpDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Guthaben aufladen</span>
          </button>

          {/* Test Expiry Fast Forward */}
          <button
            onClick={() => onFastForwardTime(5)}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-amber-800/60 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            title="Spult das Datum um 5 Tage vor, um das Warnungssystem und Karenzzeiten live zu testen"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>+5 Tage vorspulen (Test)</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab('contracts')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'contracts' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Server-Laufzeiten & Warnungen ({contracts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('payment')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'payment' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Prepaid Payment & Historie</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'invoices' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Rechnungen & Belege ({invoices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'customers' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Kunden-Stammdaten</span>
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'tickets' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Support-Tickets ({tickets.length})</span>
        </button>
      </div>

      {/* Tab 1: Contracts & Expiry Management */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-neutral-100 text-sm">Aktive Prepaid-Verträge & Restlaufzeiten</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Server schalten sich bei Ablauf automatisch ab, Daten bleiben 72 Stunden in der Karenzzeit gesichert.
                </p>
              </div>

              <div className="text-xs font-mono text-neutral-400">
                Automatische Verlängerung bucht aus Guthaben ab.
              </div>
            </div>

            <div className="divide-y divide-neutral-800/80">
              {contracts.map((c) => {
                let badgeStyle = 'bg-emerald-950 text-emerald-400 border-emerald-800';
                let statusLabel = `${c.daysRemaining} Tage verbleibend`;

                if (c.status === 'grace_period') {
                  badgeStyle = 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse';
                  statusLabel = '⚠️ Abgelaufen (72h Karenzzeit)';
                } else if (c.status === 'expiring_soon') {
                  badgeStyle = 'bg-amber-950 text-amber-300 border-amber-800';
                  statusLabel = `Achtung: noch ${c.daysRemaining} Tage`;
                }

                return (
                  <div key={c.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-neutral-100 text-sm">{c.serverName}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${badgeStyle}`}>
                            {statusLabel}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mt-1">
                          <span className="text-neutral-300">{c.gameName}</span>
                          <span>·</span>
                          <span className="font-mono">{c.ipAddress}</span>
                          <span>·</span>
                          <span>Ablaufdatum: <strong className="text-neutral-200">{c.expiresAt}</strong></span>
                          <span>·</span>
                          <span>Tarif: {c.monthlyPrice.toFixed(2)} € / 30 Tage</span>
                        </div>
                      </div>
                    </div>

                    {/* Auto-renew & Actions */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800 text-xs">
                        <span className="text-neutral-400">Auto-Verlängerung:</span>
                        <button
                          onClick={() => onToggleAutoRenew(c.id)}
                          className={`font-semibold cursor-pointer ${c.autoRenew ? 'text-emerald-400' : 'text-neutral-500'}`}
                        >
                          {c.autoRenew ? 'Aktiv (Prepaid)' : 'Aus'}
                        </button>
                      </div>

                      {/* Renewal Buttons */}
                      <button
                        onClick={() => onRenewContract(c.id, 30)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>+30 Tage verlängern ({c.monthlyPrice.toFixed(2)} €)</span>
                      </button>

                      <button
                        onClick={() => onRenewContract(c.id, 90)}
                        className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs cursor-pointer transition-colors"
                        title="3 Monate im Voraus verlängern"
                      >
                        +90 Tage
                      </button>

                      {onDeleteServer && (
                        <button
                          onClick={() => onDeleteServer(c.serverId)}
                          className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                          title="Server & Vertrag vorzeitig auflösen / löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Prepaid Payment & Gateway Selection */}
      {activeTab === 'payment' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gateways Box */}
          <div className="lg:col-span-1 bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-neutral-100 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span>Guthaben aufladen</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Wähle eine der gesicherten Sofort-Zahlungsarten für die Prepaid-Aufladung:
            </p>

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[10, 25, 50, 100].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPayAmount(amt)}
                  className={`p-2.5 rounded-lg border font-mono font-bold text-center cursor-pointer transition-colors ${
                    payAmount === amt ? 'bg-neutral-800 border-emerald-500 text-emerald-400' : 'bg-neutral-950 border-neutral-800 text-neutral-300'
                  }`}
                >
                  +{amt}.00 €
                </button>
              ))}
            </div>

            {/* Methods */}
            <div className="space-y-1.5 text-xs">
              {[
                { name: 'PayPal', icon: '🅿️', info: 'Sofortige Freischaltung' },
                { name: 'Kreditkarte', icon: '💳', info: 'Mastercard, Visa, AMEX' },
                { name: 'Sofort / Klarna', icon: '⚡', info: 'Online-Banking' },
                { name: 'Paysafecard', icon: '🎟️', info: '16-stelliger PIN' },
                { name: 'Krypto (BTC/ETH)', icon: '₿', info: 'Zero-Confirmation' }
              ].map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => setSelectedPayMethod(m.name as any)}
                  className={`w-full p-2 rounded-lg border flex items-center justify-between text-left cursor-pointer transition-colors ${
                    selectedPayMethod === m.name ? 'bg-neutral-800 border-emerald-500 text-neutral-100' : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <span>{m.icon}</span>
                    <span>{m.name}</span>
                  </span>
                  <span className="text-[11px] text-neutral-500 font-mono">{m.info}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                onTopUpBalance(payAmount, selectedPayMethod);
                alert(`Erfolgreich +${payAmount}.00 € via ${selectedPayMethod} aufgeladen!`);
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs cursor-pointer transition-colors shadow-sm"
            >
              +{payAmount}.00 € jetzt verbindlich aufladen
            </button>
          </div>

          {/* Transactions Ledger */}
          <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-neutral-100 text-sm">Transaktionsbuch & Zahlungsverlauf</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Alle Einzahlungen und Server-Verlängerungen auf einen Blick.</p>
              </div>
              <span className="text-xs font-mono text-neutral-400 tabular-nums">{transactions.length} Buchungen</span>
            </div>

            <div className="divide-y divide-neutral-800/80">
              {transactions.map((tx) => (
                <div key={tx.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <div className="font-semibold text-neutral-200">{tx.note}</div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono mt-0.5">
                      <span>{tx.timestamp}</span>
                      <span>·</span>
                      <span>Methode: {tx.method}</span>
                      <span>·</span>
                      <span>Ref: {tx.reference}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`font-mono font-bold tabular-nums text-sm ${tx.amount > 0 ? 'text-emerald-400' : 'text-neutral-300'}`}>
                      {tx.amount > 0 ? `+${tx.amount.toFixed(2)}` : tx.amount.toFixed(2)} €
                    </span>
                    <span className="block text-[10px] text-neutral-500 font-mono">Gebucht</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Invoices */}
      {activeTab === 'invoices' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-neutral-100 text-sm">Rechnungsbelege mit 19% MwSt.</h3>
              <p className="text-xs text-neutral-400 mt-0.5">Offizielle steuerkonforme PDF-Rechnungsbelege für deine Unterlagen.</p>
            </div>
            <span className="text-xs font-mono text-neutral-400">{invoices.length} Rechnungen</span>
          </div>

          <div className="divide-y divide-neutral-800">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-neutral-300 font-mono">
                    <FileText className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="font-mono font-semibold text-neutral-100">{inv.invoiceNumber}</div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5 font-mono">
                      <span>Datum: {inv.date}</span>
                      <span>·</span>
                      <span>Zahlart: {inv.paymentMethod}</span>
                      <span>·</span>
                      <span>Status: <strong className="text-emerald-400 uppercase">Bezahlt</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right font-mono">
                    <div className="font-bold text-neutral-100 tabular-nums">{inv.total.toFixed(2)} €</div>
                    <div className="text-[10px] text-neutral-500">inkl. {inv.taxAmount.toFixed(2)} € MwSt.</div>
                  </div>

                  <button
                    onClick={() => setSelectedInvoice(inv)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <span>Rechnung ansehen</span>
                    <ExternalLink className="w-3 h-3 text-emerald-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Customer Directory & Master Data */}
      {activeTab === 'customers' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-6">
          <div>
            <h3 className="font-semibold text-neutral-100 text-sm">Kunden-Stammdaten & Adressbuch</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Hinterlegte Stammdaten für Rechnungsstellung und Server-Verträge.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customers.map((cust) => (
              <div key={cust.id} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3 text-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-sm text-neutral-100">{cust.fullName}</span>
                    {cust.company && <span className="block text-[11px] text-emerald-400 font-medium">{cust.company}</span>}
                    <span className="text-[10px] font-mono text-neutral-500">Kundennummer: {cust.customerNumber}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                    {cust.balance.toFixed(2)} € Guthaben
                  </span>
                </div>

                <div className="space-y-1 text-neutral-400 pt-2 border-t border-neutral-900 leading-relaxed">
                  <div>E-Mail: <span className="text-neutral-200 font-mono">{cust.email}</span></div>
                  <div>Telefon: <span className="text-neutral-200 font-mono">{cust.phone}</span></div>
                  <div>Anschrift: <span className="text-neutral-200">{cust.street}, {cust.zipCity} ({cust.country})</span></div>
                  <div>Gesamtumsatz: <span className="text-neutral-200 font-mono">{cust.totalSpent.toFixed(2)} €</span></div>
                  <div>Kunde seit: <span className="text-neutral-200 font-mono">{cust.registeredAt}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Support Tickets */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-neutral-100 text-sm">Technischer Support & Kundenanfragen</h3>
            <button
              onClick={() => setShowNewTicketModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Neues Ticket erstellen</span>
            </button>
          </div>

          <div className="space-y-4">
            {tickets.map((t) => (
              <div key={t.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-800 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-100 text-sm">{t.subject}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 uppercase">
                        {t.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      Ticket-ID: <span className="font-mono text-neutral-300">{t.ticketNumber}</span> · Bezug: {t.serverName} · Erstellt: {t.createdAt}
                    </div>
                  </div>
                </div>

                {/* Conversation message stream */}
                <div className="space-y-3">
                  {t.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl text-xs max-w-xl ${
                        m.sender === 'support'
                          ? 'bg-neutral-950 border border-emerald-900/60 ml-auto text-neutral-200'
                          : 'bg-neutral-950/80 border border-neutral-800 mr-auto text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 text-[11px] font-semibold mb-1 text-neutral-400">
                        <span className={m.sender === 'support' ? 'text-emerald-400 font-bold' : 'text-neutral-300'}>
                          {m.author}
                        </span>
                        <span className="font-mono text-neutral-500">{m.timestamp}</span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={replyTextMap[t.id] || ''}
                    onChange={(e) => setReplyTextMap({ ...replyTextMap, [t.id]: e.target.value })}
                    placeholder="Antwort verfassen..."
                    className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => handleSendReply(t.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Antworten</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice Detail / Print Modal */}
      <InvoiceModal
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />

      {/* Create Ticket Modal */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-neutral-100 text-sm">Neues Support-Ticket eröffnen</h3>
              <button onClick={() => setShowNewTicketModal(false)} className="text-neutral-400 hover:text-neutral-200">✕</button>
            </div>

            <form onSubmit={handleCreateTicketSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-300 font-medium mb-1">Betreff / Problem</label>
                <input
                  type="text"
                  required
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="z. B. Hilfe bei Port-Freigabe oder Mod-Lags..."
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1">Betroffener Gameserver</label>
                <select
                  value={ticketServer}
                  onChange={(e) => setTicketServer(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                >
                  <option value="Allgemein">Allgemeine Anfrage</option>
                  {contracts.map(c => (
                    <option key={c.id} value={c.serverName}>{c.serverName} ({c.gameName})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-300 font-medium mb-1">Beschreibung deiner Anfrage</label>
                <textarea
                  required
                  value={ticketText}
                  onChange={(e) => setTicketText(e.target.value)}
                  placeholder="Beschreibe dein Anliegen so detailliert wie möglich..."
                  className="w-full h-24 px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 resize-none"
                />
              </div>

              <div className="pt-2 border-t border-neutral-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded cursor-pointer"
                >
                  Ticket absenden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top-Up Dialog */}
      {showTopUpDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-neutral-100 text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Prepaid Guthaben aufladen</span>
              </h3>
              <button onClick={() => setShowTopUpDialog(false)} className="text-neutral-400 hover:text-neutral-200">✕</button>
            </div>

            <p className="text-xs text-neutral-400">
              Wähle deinen Wunschbetrag für die Prepaid-Gutschrift:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[10, 25, 50, 100].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPayAmount(amt)}
                  className={`p-3 rounded-lg border text-center font-bold font-mono transition-colors cursor-pointer ${
                    payAmount === amt ? 'bg-neutral-800 border-emerald-500 text-emerald-400' : 'bg-neutral-950 border-neutral-800 text-neutral-300'
                  }`}
                >
                  +{amt}.00 €
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                onTopUpBalance(payAmount, selectedPayMethod);
                setShowTopUpDialog(false);
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs cursor-pointer transition-colors"
            >
              +{payAmount}.00 € jetzt aufladen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
