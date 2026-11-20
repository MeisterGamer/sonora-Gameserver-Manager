import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Users,
  Check,
  X,
  RotateCcw,
  Save,
  RefreshCw,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { RbacRole, SystemPermissionKey } from '../types/auth';
import { apiRequest } from '../services/api';

interface PermissionMeta {
  key: SystemPermissionKey;
  label: string;
  description: string;
  scope: 'user' | 'admin';
}

interface RbacUserRow {
  id: string;
  username: string;
  email: string;
  baseRole: 'admin' | 'user';
  effectiveRole: RbacRole;
  grants: SystemPermissionKey[];
  denies: SystemPermissionKey[];
  effectivePermissions: SystemPermissionKey[];
}

interface AdminRbacPanelProps {
  onPermissionsChanged?: () => void;
}

export const AdminRbacPanel: React.FC<AdminRbacPanelProps> = ({ onPermissionsChanged }) => {
  const [catalog, setCatalog] = useState<PermissionMeta[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<Record<RbacRole, SystemPermissionKey[]>>({
    admin: [],
    moderator: [],
    user: []
  });
  const [rbacUsers, setRbacUsers] = useState<RbacUserRow[]>([]);
  const [selectedRoleTab, setSelectedRoleTab] = useState<'moderator' | 'user'>('user');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showStatus = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadRbac = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/rbac');
      if (res?.success) {
        setCatalog(Array.isArray(res.catalog) ? res.catalog : []);
        if (res.roleTemplates) setRoleTemplates(res.roleTemplates);
        setRbacUsers(Array.isArray(res.users) ? res.users : []);
      }
    } catch (err: any) {
      showStatus('err', err.message || 'Rechtesystem konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRbac();
  }, [loadRbac]);

  const toggleRolePermission = (role: 'moderator' | 'user', perm: SystemPermissionKey) => {
    setRoleTemplates(prev => {
      const current = prev[role] || [];
      const exists = current.includes(perm);
      return {
        ...prev,
        [role]: exists ? current.filter(p => p !== perm) : [...current, perm]
      };
    });
  };

  const handleSaveRoleTemplate = async (role: 'moderator' | 'user') => {
    setSaving(true);
    try {
      const res = await apiRequest(`/api/admin/rbac/roles/${role}`, 'PUT', {
        permissions: roleTemplates[role] || []
      });
      if (res?.roleTemplates) setRoleTemplates(res.roleTemplates);
      await loadRbac();
      onPermissionsChanged?.();
      showStatus('ok', res?.message || `Rollen-Vorlage "${role}" gespeichert.`);
    } catch (err: any) {
      showStatus('err', err.message || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUserRbac = async (
    userId: string,
    role: RbacRole,
    grants: SystemPermissionKey[],
    denies: SystemPermissionKey[]
  ) => {
    setSaving(true);
    try {
      const res = await apiRequest(`/api/admin/rbac/users/${userId}`, 'PUT', {
        role,
        grants,
        denies
      });
      await loadRbac();
      onPermissionsChanged?.();
      showStatus('ok', res?.message || 'Benutzerrechte aktualisiert.');
    } catch (err: any) {
      showStatus('err', err.message || 'Benutzerrechte konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const cycleUserOverride = (userRow: RbacUserRow, perm: SystemPermissionKey) => {
    const isGranted = userRow.grants.includes(perm);
    const isDenied = userRow.denies.includes(perm);
    let nextGrants = userRow.grants.filter(p => p !== perm);
    let nextDenies = userRow.denies.filter(p => p !== perm);

    if (!isGranted && !isDenied) {
      nextGrants = [...nextGrants, perm];
    } else if (isGranted) {
      nextDenies = [...nextDenies, perm];
    }
    // else: back to role default
    handleUpdateUserRbac(userRow.id, userRow.effectiveRole, nextGrants, nextDenies);
  };

  const userScopePerms = catalog.filter(p => p.scope === 'user');
  const adminScopePerms = catalog.filter(p => p.scope === 'admin');

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center gap-2 ${
            toast.type === 'ok'
              ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
              : 'bg-rose-950/70 border-rose-700/60 text-rose-200'
          }`}
        >
          {toast.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-medium">{toast.text}</span>
        </div>
      )}

      {/* Section 1: Role Permission Templates */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-400" />
              <span>Rechtesystem &amp; Rollen-Vorlagen (Admin / Moderator / Kunde)</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Strikte Trennung zwischen Benutzer-Rechten und Admin-Bereich. Administratoren besitzen immer Vollzugriff.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadRbac}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Aktualisieren</span>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Role selector tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
              <button
                type="button"
                onClick={() => setSelectedRoleTab('user')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedRoleTab === 'user'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Kunde / Benutzer ({(roleTemplates.user || []).length} Rechte)
              </button>
              <button
                type="button"
                onClick={() => setSelectedRoleTab('moderator')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  selectedRoleTab === 'moderator'
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Moderator / Support ({(roleTemplates.moderator || []).length} Rechte)
              </button>
              <div className="px-3 py-1.5 rounded-md text-neutral-500 flex items-center gap-1.5 whitespace-nowrap">
                <Lock className="w-3 h-3 text-rose-400" />
                <span>Administrator (Vollzugriff)</span>
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveRoleTemplate(selectedRoleTab)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Rolle &bdquo;{selectedRoleTab === 'user' ? 'Kunde' : 'Moderator'}&ldquo; speichern</span>
            </button>
          </div>

          {/* Two columns: User-Bereich vs Admin-Bereich */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* User Permissions */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-xs font-semibold text-emerald-400">Benutzer-Inhalte &amp; Serversteuerung</span>
                <span className="text-[11px] font-mono text-neutral-500">User Scope</span>
              </div>
              {userScopePerms.map(perm => {
                const checked = (roleTemplates[selectedRoleTab] || []).includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-neutral-900 border border-transparent hover:border-neutral-800 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-neutral-100">{perm.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{perm.description}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRolePermission(selectedRoleTab, perm.key)}
                      className="mt-1 w-4 h-4 rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer shrink-0"
                    />
                  </label>
                );
              })}
            </div>

            {/* Admin Permissions */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-xs font-semibold text-rose-400">Admin-Inhalte &amp; Systemsteuerung</span>
                <span className="text-[11px] font-mono text-neutral-500">Admin Scope</span>
              </div>
              {adminScopePerms.map(perm => {
                const checked = (roleTemplates[selectedRoleTab] || []).includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-lg hover:bg-neutral-900 border border-transparent hover:border-neutral-800 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-neutral-100">{perm.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{perm.description}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRolePermission(selectedRoleTab, perm.key)}
                      className="mt-1 w-4 h-4 rounded bg-neutral-900 border-neutral-700 text-rose-500 focus:ring-rose-500 cursor-pointer shrink-0"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Per-User Role Assignment & Granular Overrides */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Individuelle Benutzer-Rollen &amp; Sonderrechte</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Weise jedem Konto eine Rolle zu oder vergib gezielte Einzel-Freigaben / Sperren (Grant / Deny).
            </p>
          </div>
          <span className="text-xs font-mono text-neutral-400 tabular-nums">{rbacUsers.length} Benutzer</span>
        </div>

        <div className="divide-y divide-neutral-800">
          {rbacUsers.map(u => {
            const isExpanded = expandedUserId === u.id;
            const isProtectedRoot = u.id === 'local-admin';
            return (
              <div key={u.id} className="p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-100">{u.username}</span>
                      <span className="text-[11px] font-mono text-neutral-500">{u.email}</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 tabular-nums">
                      Effektive Rechte: <strong className="text-neutral-200">{u.effectivePermissions.length}</strong>
                      {u.grants.length > 0 && <span className="text-emerald-400 ml-2">+{u.grants.length} Sonder-Freigaben</span>}
                      {u.denies.length > 0 && <span className="text-rose-400 ml-2">-{u.denies.length} Gesperrt</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={u.effectiveRole}
                      disabled={isProtectedRoot || saving}
                      onChange={(e) => handleUpdateUserRbac(u.id, e.target.value as RbacRole, u.grants, u.denies)}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 font-medium focus:border-rose-500 focus:outline-none disabled:opacity-60 cursor-pointer"
                    >
                      <option value="user">Kunde / Benutzer</option>
                      <option value="moderator">Moderator / Support</option>
                      <option value="admin">Administrator (Vollzugriff)</option>
                    </select>

                    {!isProtectedRoot && (
                      <button
                        type="button"
                        onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs cursor-pointer whitespace-nowrap"
                      >
                        <span>Sonderrechte</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && !isProtectedRoot && (
                  <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Klicke auf eine Berechtigung zum Wechseln: Standard → Erlaubt (+) → Verweigert (−)</span>
                      {(u.grants.length > 0 || u.denies.length > 0) && (
                        <button
                          type="button"
                          onClick={() => handleUpdateUserRbac(u.id, u.effectiveRole, [], [])}
                          className="flex items-center gap-1 text-neutral-300 hover:text-white cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Overrides zurücksetzen</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {catalog.map(perm => {
                        const isGranted = u.grants.includes(perm.key);
                        const isDenied = u.denies.includes(perm.key);
                        const hasEffective = u.effectivePermissions.includes(perm.key);
                        return (
                          <button
                            key={perm.key}
                            type="button"
                            disabled={saving}
                            onClick={() => cycleUserOverride(u, perm.key)}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                              isGranted
                                ? 'bg-emerald-950/50 border-emerald-600/60 text-emerald-200'
                                : isDenied
                                ? 'bg-rose-950/50 border-rose-600/60 text-rose-200'
                                : hasEffective
                                ? 'bg-neutral-900 border-neutral-700 text-neutral-200'
                                : 'bg-neutral-900/50 border-neutral-800 text-neutral-500'
                            }`}
                          >
                            <span className="truncate font-medium">{perm.label}</span>
                            <span className="font-mono text-[10px] shrink-0 flex items-center gap-1">
                              {isGranted ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>GRANT</span>
                                </>
                              ) : isDenied ? (
                                <>
                                  <X className="w-3 h-3 text-rose-400" />
                                  <span>DENY</span>
                                </>
                              ) : hasEffective ? (
                                <span>Rolle ✓</span>
                              ) : (
                                <span>—</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
