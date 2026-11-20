import React from 'react';
import { Server, Plus, ShoppingCart, User, Building2, Settings, Sparkles, Shield } from 'lucide-react';
import { PlatformOS } from '../types/game';
import { UserAccount } from '../types/auth';
import { SteamOperationMode } from '../types/adminSettings';
import { canAccessAdminArea, getEffectiveRole, hasPermission } from '../utils/permissions';

interface TopNavProps {
  currentTab: 'servers' | 'catalog' | 'mods' | 'shop' | 'crm' | 'admincontrol' | 'usercontrol' | 'crossplatform';
  onTabChange: (tab: 'servers' | 'catalog' | 'mods' | 'shop' | 'crm' | 'admincontrol' | 'usercontrol' | 'crossplatform') => void;
  onOpenCreateModal: () => void;
  onOpenLoginModal: () => void;
  onOpenSetupWizard?: () => void;
  activeServerCount: number;
  expiringCount?: number;
  selectedOS: PlatformOS;
  onChangeOS: (os: PlatformOS) => void;
  currentUser: UserAccount;
  steamMode?: SteamOperationMode;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentTab,
  onTabChange,
  onOpenCreateModal,
  onOpenLoginModal,
  onOpenSetupWizard,
  activeServerCount,
  expiringCount = 0,
  selectedOS,
  onChangeOS,
  currentUser,
  steamMode = 'offline_disabled'
}) => {
  const effectiveRole = getEffectiveRole(currentUser);
  const showAdminArea = canAccessAdminArea(currentUser);
  const canManageSystem = hasPermission(currentUser, 'admin.system');
  const canCreateServer = hasPermission(currentUser, 'servers.create');

  return (
    <header className="sticky top-0 z-30 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      {/* Zone 1: Brand & Admin-only Host Indicators */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#home"
          onClick={(e) => { e.preventDefault(); onTabChange('servers'); }}
          className="flex items-center gap-2.5 text-neutral-100 font-bold tracking-tight text-base sm:text-lg hover:text-white transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20">
            <Server className="w-4 h-4" />
          </div>
          <span className="font-semibold text-base hidden sm:inline">ApexHost</span>
        </a>

        {/* Host OS & Steam status — STRICTLY ADMIN ONLY */}
        {canManageSystem && (
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-950 border border-neutral-800 text-xs">
            <span className="text-neutral-400 font-medium">Host</span>
            <span className="text-neutral-600">/</span>
            <select
              value={selectedOS}
              onChange={(e) => onChangeOS(e.target.value as PlatformOS)}
              className="bg-transparent text-emerald-400 font-semibold focus:outline-none cursor-pointer"
              title="Ziel-Betriebssystem"
            >
              <option value="linux" className="bg-neutral-900 text-neutral-100">Linux (Debian)</option>
              <option value="windows" className="bg-neutral-900 text-neutral-100">Windows (.bat)</option>
              <option value="macos" className="bg-neutral-900 text-neutral-100">macOS (.command)</option>
            </select>
          </div>
        )}

        {showAdminArea && (
          <button
            type="button"
            onClick={() => onTabChange('admincontrol')}
            className="hidden 2xl:flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-[11px] cursor-pointer"
            title="Steam-Status: Admin-Einstellungen öffnen"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              steamMode === 'offline_disabled' ? 'bg-sky-400' :
              steamMode === 'anonymous' ? 'bg-amber-400' :
              steamMode === 'mock_emulated' ? 'bg-purple-400' : 'bg-emerald-400'
            }`} />
            <span className="text-neutral-400">Steam:</span>
            <span className="font-semibold text-neutral-200">
              {steamMode === 'offline_disabled' ? 'Autark' :
               steamMode === 'anonymous' ? 'Anonymous' :
               steamMode === 'mock_emulated' ? 'Mock' : 'Auth'}
            </span>
          </button>
        )}
      </div>

      {/* Zone 2: Navigation — Clean separation between User Area & Admin Area */}
      <nav className="hidden xl:flex items-center gap-4 text-xs font-medium">
        {/* USER AREA */}
        <button
          onClick={() => onTabChange('servers')}
          className={`whitespace-nowrap shrink-0 transition-colors py-1 cursor-pointer ${
            currentTab === 'servers'
              ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Meine Server ({activeServerCount})
        </button>

        <button
          onClick={() => onTabChange('catalog')}
          className={`whitespace-nowrap shrink-0 transition-colors py-1 cursor-pointer ${
            currentTab === 'catalog'
              ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Spielekatalog
        </button>

        <button
          onClick={() => onTabChange('mods')}
          className={`whitespace-nowrap shrink-0 transition-colors py-1 cursor-pointer ${
            currentTab === 'mods'
              ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Mod/Plugin Hub
        </button>

        <button
          onClick={() => onTabChange('shop')}
          className={`whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
            currentTab === 'shop'
              ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Shop &amp; Mieten</span>
        </button>

        <button
          onClick={() => onTabChange('crm')}
          className={`whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
            currentTab === 'crm'
              ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Kundencenter</span>
          {expiringCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] tabular-nums" title={`${expiringCount} Server laufen bald ab`}>
              {expiringCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onTabChange('usercontrol')}
          className={`whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
            currentTab === 'usercontrol'
              ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>UserCP</span>
        </button>

        {/* ADMIN AREA (Strictly separated & hidden from regular users) */}
        {showAdminArea && (
          <>
            <span className="h-4 w-px bg-neutral-800 shrink-0" aria-hidden="true" />
            <button
              onClick={() => onTabChange('admincontrol')}
              className={`whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
                currentTab === 'admincontrol'
                  ? 'text-rose-400 font-semibold border-b-2 border-rose-400'
                  : 'text-rose-400/80 hover:text-rose-300'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Admin-Bereich</span>
            </button>

            {canManageSystem && (
              <button
                onClick={() => onTabChange('crossplatform')}
                className={`whitespace-nowrap shrink-0 transition-colors py-1 flex items-center gap-1.5 cursor-pointer ${
                  currentTab === 'crossplatform'
                    ? 'text-rose-400 font-semibold border-b-2 border-rose-400'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-rose-400/80" />
                <span>OS Starter</span>
              </button>
            )}
          </>
        )}
      </nav>

      {/* Zone 3: User Widget & Primary Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onOpenLoginModal}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs transition-colors cursor-pointer text-left"
          title="Benutzer wechseln oder anmelden"
        >
          <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
            effectiveRole === 'admin'
              ? 'bg-rose-950 text-rose-300 border border-rose-800'
              : effectiveRole === 'moderator'
              ? 'bg-amber-950 text-amber-300 border border-amber-800'
              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
          }`}>
            {currentUser.avatarInitials}
          </div>
          <div className="hidden sm:block">
            <div className="font-semibold text-neutral-200 leading-tight flex items-center gap-1.5">
              <span>{currentUser.username}</span>
              <span className={`text-[9px] uppercase px-1 rounded font-mono ${
                effectiveRole === 'admin'
                  ? 'bg-rose-900/60 text-rose-300'
                  : effectiveRole === 'moderator'
                  ? 'bg-amber-900/60 text-amber-300'
                  : 'bg-neutral-800 text-neutral-400'
              }`}>
                {effectiveRole === 'admin' ? 'ADMIN' : effectiveRole === 'moderator' ? 'MOD' : 'KUNDE'}
              </span>
            </div>
            <div className="text-[10px] text-emerald-400 font-mono tabular-nums leading-tight">
              {currentUser.balance.toFixed(2)} €
            </div>
          </div>
        </button>

        {/* Setup Wizard Button — STRICTLY ADMIN SYSTEM ONLY */}
        {onOpenSetupWizard && canManageSystem && (
          <button
            onClick={onOpenSetupWizard}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-rose-500/40 text-xs text-rose-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Systeminstallations-Assistent (Nur Administratoren)"
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden md:inline font-semibold">Setup-Assistent</span>
          </button>
        )}

        {/* Create Server CTA — Gated by servers.create permission */}
        {canCreateServer && (
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm shadow-emerald-600/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Server erstellen</span>
            <span className="sm:hidden">+</span>
          </button>
        )}
      </div>
    </header>
  );
};
