import React, { useState } from 'react';
import { ShoppingCart, Check, Zap, Globe, Plus, Shield, ArrowRight, CreditCard, Sparkles, CheckCircle2, Server } from 'lucide-react';
import { ShopPlan, ShopOrder, UserAccount } from '../types/auth';
import { SHOP_PLANS, SERVER_LOCATIONS } from '../data/shopPlans';
import { ServerInstance } from '../types/game';

interface ShopViewProps {
  currentUser: UserAccount;
  onTopUpBalance: (amount: number) => void;
  onPurchaseServer: (plan: ShopPlan, config: {
    serverName: string;
    location: string;
    billingCycle: 'monthly' | 'quarterly' | 'yearly';
    extraRamGb: number;
    hasDedicatedIp: boolean;
    totalPrice: number;
  }) => void;
  userOrders: ShopOrder[];
}

export const ShopView: React.FC<ShopViewProps> = ({
  currentUser,
  onTopUpBalance,
  onPurchaseServer,
  userOrders
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [configuringPlan, setConfiguringPlan] = useState<ShopPlan | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'orders'>('plans');

  // Configurator state
  const [cfgName, setCfgName] = useState('');
  const [cfgLocation, setCfgLocation] = useState('fra');
  const [cfgCycle, setCfgCycle] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [cfgExtraRam, setCfgExtraRam] = useState(0);
  const [cfgDedicatedIp, setCfgDedicatedIp] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number>(25);

  const filteredPlans = SHOP_PLANS.filter((p) => {
    if (selectedCategory === 'all') return true;
    return p.category === selectedCategory;
  });

  const openConfigurator = (plan: ShopPlan) => {
    setConfiguringPlan(plan);
    setCfgName(`${plan.defaultGameName} Server`);
    setCfgLocation('fra');
    setCfgCycle('monthly');
    setCfgExtraRam(0);
    setCfgDedicatedIp(false);
  };

  // Calculate pricing
  const calculateTotal = (plan: ShopPlan) => {
    let base = plan.priceMonthly;
    if (cfgExtraRam > 0) base += (cfgExtraRam * 1.0); // 1€ per extra GB
    if (cfgDedicatedIp) base += 2.50;

    let multiplier = 1;
    let discount = 1;
    if (cfgCycle === 'quarterly') {
      multiplier = 3;
      discount = 0.95; // 5% discount
    } else if (cfgCycle === 'yearly') {
      multiplier = 12;
      discount = 0.85; // 15% discount
    }
    return Math.round((base * multiplier * discount) * 100) / 100;
  };

  const handleCheckout = () => {
    if (!configuringPlan) return;
    const total = calculateTotal(configuringPlan);

    if (currentUser.balance < total) {
      alert(`Dein Guthaben (${currentUser.balance.toFixed(2)} €) reicht nicht aus für diesen Kauf (${total.toFixed(2)} €). Bitte lade zuerst dein Guthaben auf!`);
      setShowTopUpModal(true);
      return;
    }

    onPurchaseServer(configuringPlan, {
      serverName: cfgName.trim() || `${configuringPlan.defaultGameName} Server`,
      location: SERVER_LOCATIONS.find(l => l.id === cfgLocation)?.name || 'Frankfurt am Main (DE)',
      billingCycle: cfgCycle,
      extraRamGb: cfgExtraRam,
      hasDedicatedIp: cfgDedicatedIp,
      totalPrice: total
    });

    setConfiguringPlan(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header with Balance Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-100 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-400" />
            <span>Gameserver Hosting Shop & Cloud Provisioning</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Miete dedizierte Gameserver für Minecraft 26.3, Palworld, Rust, CS2 und mehr mit sofortiger automatischer Bereitstellung.
          </p>
        </div>

        {/* User Balance Wallet Widget */}
        <div className="flex items-center gap-3 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
          <div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Guthaben-Konto</div>
            <div className="text-sm font-bold font-mono text-emerald-400 tabular-nums">
              {currentUser.balance.toFixed(2)} €
            </div>
          </div>
          <button
            onClick={() => setShowTopUpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Aufladen</span>
          </button>
        </div>
      </div>

      {/* Tab switcher: Plans vs My Orders */}
      <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs w-fit">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'plans' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Server Tarife & Pakete ({SHOP_PLANS.length})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
            activeTab === 'orders' ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Meine Buchungen & Rechnungen ({userOrders.length})
        </button>
      </div>

      {activeTab === 'plans' ? (
        <>
          {/* Category filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'all', label: 'Alle Tarife' },
              { id: 'minecraft', label: 'Minecraft (v26.3 Cloud)' },
              { id: 'steam', label: 'Steam High-Performance' },
              { id: 'starter', label: 'Co-Op & Sandboxes' },
              { id: 'extreme', label: 'Enterprise & Multi-Server' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-md transition-colors shrink-0 cursor-pointer font-medium ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className={`bg-neutral-900 border rounded-xl p-5 flex flex-col justify-between transition-colors relative ${
                  plan.isPopular ? 'border-emerald-500/80 shadow-md shadow-emerald-500/10' : 'border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-2.5 right-4 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                    {plan.badge}
                  </div>
                )}

                <div>
                  <h3 className="text-base font-bold text-neutral-100">{plan.name}</h3>
                  <p className="text-xs text-neutral-400 mt-1 min-h-[32px]">{plan.tagline}</p>

                  {/* Price */}
                  <div className="mt-4 mb-4 pb-4 border-b border-neutral-800">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-neutral-100 tabular-nums">
                        {plan.priceMonthly.toFixed(2)} €
                      </span>
                      <span className="text-xs text-neutral-500">/ Monat</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">Prepaid · Jederzeit kündbar</div>
                  </div>

                  {/* Hardware Specs Matrix */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800/80">
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Arbeitsspeicher</span>
                      <span className="font-mono font-semibold text-neutral-200 tabular-nums">{plan.ramGb} GB DDR5</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Prozessor</span>
                      <span className="font-mono font-semibold text-neutral-200 tabular-nums">{plan.vCores} vCores</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Speicherplatz</span>
                      <span className="font-mono font-semibold text-neutral-200 tabular-nums">{plan.nvmeDiskGb} GB NVMe</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-500 block">Spielerslots</span>
                      <span className="font-mono font-semibold text-neutral-200">{plan.slots}</span>
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <ul className="space-y-2 text-xs text-neutral-300 mb-6">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => openConfigurator(plan)}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/30"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Jetzt konfigurieren & mieten</span>
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Orders & Active Subscriptions */
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h3 className="font-semibold text-neutral-100 text-sm">Deine gebuchten Server-Lizenzen</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Verwalte aktive Verträge, Rechnungen und Verlängerungen.</p>
          </div>

          {userOrders.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 text-xs">
              Du hast noch keine Server über das Shopsystem gebucht. Wähle oben einen Tarif aus.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {userOrders.map((ord) => (
                <div key={ord.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-emerald-400">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-neutral-200">{ord.planName}</div>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                        <span>Standort: {ord.location}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{ord.price.toFixed(2)} €</span>
                        <span>·</span>
                        <span className="capitalize">{ord.billingCycle}</span>
                        <span>·</span>
                        <span>Gebucht am {ord.createdAt}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                      Aktiv
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configurator / Checkout Modal */}
      {configuringPlan && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Server-Konfigurator: {configuringPlan.name}</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">Passe Standort, Abrechnungszeitraum und Zusätze an.</p>
              </div>
              <button
                onClick={() => setConfiguringPlan(null)}
                className="text-neutral-400 hover:text-neutral-200 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Server Name */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1">Server Name</label>
                <input
                  type="text"
                  value={cfgName}
                  onChange={(e) => setCfgName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Location Picker */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1.5">Rechenzentrums-Standort</label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVER_LOCATIONS.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setCfgLocation(loc.id)}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                        cfgLocation === loc.id
                          ? 'bg-neutral-800 border-emerald-500 text-neutral-100'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="font-semibold text-xs text-neutral-200 flex items-center gap-1.5">
                        <span>{loc.flag}</span>
                        <span>{loc.name}</span>
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center justify-between">
                        <span>Ping: {loc.pingMs} ms</span>
                        <span>{loc.ddos}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Billing Cycle */}
              <div>
                <label className="block text-neutral-300 font-medium mb-1.5">Abrechnungszeitraum</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCfgCycle('monthly')}
                    className={`p-2 rounded border text-center cursor-pointer transition-colors ${
                      cfgCycle === 'monthly' ? 'bg-neutral-800 border-emerald-500 text-emerald-400 font-semibold' : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <div>1 Monat</div>
                    <div className="text-[10px] text-neutral-500">Normalpreis</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCfgCycle('quarterly')}
                    className={`p-2 rounded border text-center cursor-pointer transition-colors ${
                      cfgCycle === 'quarterly' ? 'bg-neutral-800 border-emerald-500 text-emerald-400 font-semibold' : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <div>3 Monate</div>
                    <div className="text-[10px] text-emerald-400 font-medium">-5% Rabatt</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCfgCycle('yearly')}
                    className={`p-2 rounded border text-center cursor-pointer transition-colors ${
                      cfgCycle === 'yearly' ? 'bg-neutral-800 border-emerald-500 text-emerald-400 font-semibold' : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <div>12 Monate</div>
                    <div className="text-[10px] text-emerald-400 font-medium">-15% Rabatt</div>
                  </button>
                </div>
              </div>

              {/* Add-ons */}
              <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 space-y-2">
                <div className="font-semibold text-neutral-300 text-xs mb-1">Optionale Upgrades:</div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-neutral-200">Zusätzlicher DDR5 RAM</span>
                    <span className="text-[11px] text-neutral-500 block">(1.00 € / GB / Monat)</span>
                  </div>
                  <select
                    value={cfgExtraRam}
                    onChange={(e) => setCfgExtraRam(parseInt(e.target.value, 10))}
                    className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200"
                  >
                    <option value={0}>Kein Extra RAM</option>
                    <option value={2}>+2 GB (+2.00 €)</option>
                    <option value={4}>+4 GB (+4.00 €)</option>
                    <option value={8}>+8 GB (+8.00 €)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-neutral-900">
                  <div>
                    <span className="text-neutral-200">Dedizierte IPv4 Adresse</span>
                    <span className="text-[11px] text-neutral-500 block">Eigener Standard-Port ohne Doppelpunkt (+2.50 €)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={cfgDedicatedIp}
                    onChange={(e) => setCfgDedicatedIp(e.target.checked)}
                    className="accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Total Summary */}
              <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="text-neutral-400 text-[11px]">Gesamtbetrag (inkl. MwSt.):</div>
                  <div className="text-xl font-bold font-mono text-neutral-100 tabular-nums">
                    {calculateTotal(configuringPlan).toFixed(2)} €
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Dein Guthaben: <span className="font-mono text-emerald-400">{currentUser.balance.toFixed(2)} €</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfiguringPlan(null)}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs cursor-pointer"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleCheckout}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors shadow-sm shadow-emerald-600/30 flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Jetzt kostenpflichtig bestellen</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top-Up Balance Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="font-bold text-neutral-100 text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Guthaben aufladen</span>
              </h3>
              <button onClick={() => setShowTopUpModal(false)} className="text-neutral-400 hover:text-neutral-200">✕</button>
            </div>

            <p className="text-xs text-neutral-400">
              Wähle den Betrag, der deinem Prepaid-Konto gutgeschrieben werden soll:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[10, 25, 50, 100].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTopUpAmount(amt)}
                  className={`p-3 rounded-lg border text-center font-bold font-mono transition-colors cursor-pointer ${
                    topUpAmount === amt
                      ? 'bg-neutral-800 border-emerald-500 text-emerald-400'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  +{amt}.00 €
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                onTopUpBalance(topUpAmount);
                setShowTopUpModal(false);
              }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs cursor-pointer transition-colors"
            >
              +{topUpAmount}.00 € jetzt aufladen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
