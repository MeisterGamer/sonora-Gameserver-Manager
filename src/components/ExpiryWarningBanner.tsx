import React from 'react';
import { AlertTriangle, Clock, RefreshCw, X, Zap } from 'lucide-react';
import { CustomerContract } from '../types/crm';

interface ExpiryWarningBannerProps {
  contracts: CustomerContract[];
  onQuickRenew: (contractId: string) => void;
  onOpenCRM: () => void;
}

export const ExpiryWarningBanner: React.FC<ExpiryWarningBannerProps> = ({
  contracts,
  onQuickRenew,
  onOpenCRM
}) => {
  // Find urgent contracts: grace period first, then expiring soon
  const graceContract = contracts.find(c => c.status === 'grace_period');
  const expiringContract = contracts.find(c => c.status === 'expiring_soon');

  if (!graceContract && !expiringContract) return null;

  if (graceContract) {
    return (
      <div className="bg-rose-950/90 border-b border-rose-800 text-rose-200 px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 animate-bounce" />
          <span>
            <strong>Dringende Prepaid-Warnung:</strong> Dein Server <strong>„{graceContract.serverName}“</strong> ist abgelaufen und befindet sich in der <strong>72-Stunden-Karenzzeit</strong>! Bei Nicht-Verlängerung werden Weltdaten unwiderruflich gelöscht.
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onQuickRenew(graceContract.id)}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded text-xs cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Jetzt reaktivieren ({graceContract.monthlyPrice.toFixed(2)} €)</span>
          </button>
          <button
            onClick={onOpenCRM}
            className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded text-xs cursor-pointer transition-colors"
          >
            Vertrag verwalten
          </button>
        </div>
      </div>
    );
  }

  if (expiringContract) {
    return (
      <div className="bg-amber-950/80 border-b border-amber-800/80 text-amber-200 px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Prepaid-Ablauf-Warnung:</strong> Der Server <strong>„{expiringContract.serverName}“</strong> läuft in <strong>{expiringContract.daysRemaining} Tagen</strong> ab ({expiringContract.expiresAt}).
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onQuickRenew(expiringContract.id)}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded text-xs cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
          >
            <Zap className="w-3 h-3" />
            <span>+30 Tage verlängern ({expiringContract.monthlyPrice.toFixed(2)} €)</span>
          </button>
          <button
            onClick={onOpenCRM}
            className="px-2.5 py-1 bg-amber-900/60 hover:bg-amber-800 text-amber-200 rounded text-xs cursor-pointer transition-colors"
          >
            Übersicht
          </button>
        </div>
      </div>
    );
  }

  return null;
};
