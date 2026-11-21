import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type { ModItem } from '../src/types/game';
import { MODS_AND_PLUGINS_DATABASE } from '../src/data/modsAndPlugins';

export type CompatibilityLevel = 'exact' | 'minor' | 'universal' | 'incompatible' | 'unverified';
export type CompatibilityFilterMode = 'strict' | 'compatible' | 'all';
export type TagFilterMode = 'all' | 'any';

export interface IndexedModItem extends ModItem {
  normalizedTags: string[];
  normalizedLoaders: string[];
  normalizedVersions: string[];
  versionSupportSource: 'declared' | 'inferred' | 'live';
  downloadsNumeric: number;
  searchTokens: string[];
  indexedAt: string;
}

export interface ModIndexSearchResultItem extends IndexedModItem {
  compatibilityStatus: CompatibilityLevel;
  compatibilityLabel: string;
  matchedTags: string[];
  relevanceScore: number;
}

export interface TagFacet {
  key: string;
  label: string;
  count: number;
}

export interface VersionFacet {
  version: string;
  count: number;
}

export interface NamedFacet {
  name: string;
  count: number;
}

export interface ModIndexFacets {
  tags: TagFacet[];
  mcVersions: VersionFacet[];
  loaders: NamedFacet[];
  categories: NamedFacet[];
  providers: NamedFacet[];
  games: NamedFacet[];
}

export interface ModIndexState {
  version: number;
  lastIndexedAt: string;
  items: IndexedModItem[];
  byId: Map<string, IndexedModItem>;
  tagIndex: Map<string, Set<string>>;
  tagLabels: Map<string, string>;
  versionIndex: Map<string, Set<string>>;
  loaderIndex: Map<string, Set<string>>;
  categoryIndex: Map<string, Set<string>>;
  tokenIndex: Map<string, Set<string>>;
}

export interface ModIndexQueryOptions {
  q?: string;
  tags?: string[];
  tagMode?: TagFilterMode;
  mcVersion?: string;
  compatibility?: CompatibilityFilterMode;
  loader?: string;
  category?: string;
  provider?: string;
  gameId?: string;
  sort?: 'relevance' | 'downloads' | 'name';
  limit?: number;
}

export interface ModIndexSearchResponse {
  total: number;
  totalIndexed: number;
  lastIndexedAt: string;
  items: ModIndexSearchResultItem[];
  facets: ModIndexFacets;
}

export interface ModIndexControllerDeps {
  managerStateDir: string;
  recordAuditLog?: (entry: any) => void;
}

const KNOWN_LOADERS = [
  'Paper',
  'Purpur',
  'Spigot',
  'Bukkit',
  'Fabric',
  'Forge',
  'NeoForge',
  'Quilt',
  'Velocity',
  'BungeeCord',
  'Oxide',
  'uMod',
  'BepInEx',
  'tModLoader',
  'UE4SS',
  'SourceMod',
  'AMXModX',
  'Native',
  'Steam Workshop'
];

const PLUGIN_LOADERS = new Set(['paper', 'purpur', 'spigot', 'bukkit', 'folia']);
const PROXY_LOADERS = new Set(['velocity', 'bungeecord', 'waterfall']);

const DEFAULT_MINECRAFT_PLUGIN_VERSIONS = [
  '1.21.4',
  '1.21.3',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.18.2',
  '1.16.5'
];

const DEFAULT_MINECRAFT_PROXY_VERSIONS = [
  '1.21.4',
  '1.21.1',
  '1.20.4',
  '1.19.4',
  '1.18.2',
  '1.16.5',
  '1.12.2'
];

export function normalizeTagKey(tag: string): string {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9äöüß._+-]/gi, '');
}

export function parseDownloadsNumeric(downloads?: string | number): number {
  if (typeof downloads === 'number' && Number.isFinite(downloads)) return downloads;
  const raw = String(downloads || '').trim().toUpperCase().replace(/,/g, '');
  if (!raw) return 0;
  const match = raw.match(/^([\d.]+)\s*([KMB])?$/);
  if (!match) {
    const digits = Number(raw.replace(/[^\d.]/g, ''));
    return Number.isFinite(digits) ? digits : 0;
  }
  const value = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === 'B') return Math.round(value * 1_000_000_000);
  if (suffix === 'M') return Math.round(value * 1_000_000);
  if (suffix === 'K') return Math.round(value * 1_000);
  return Math.round(value);
}

export function extractMinorSeries(version: string): string | null {
  const clean = String(version || '').trim().replace(/^v/i, '');
  const m = clean.match(/^(\d+\.\d+)(?:\.\d+)?$/);
  return m ? m[1] : null;
}

export function isMinecraftVersionToken(val: string): boolean {
  const clean = String(val || '').trim();
  return /^(1\.\d{1,2}(\.\d{1,2})?|26\.\d(\.\d)?)$/.test(clean);
}

export function compareMcVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return db - da;
  }
  return b.localeCompare(a);
}

function tokenizeText(parts: string[]): string[] {
  const set = new Set<string>();
  for (const part of parts) {
    const clean = String(part || '').toLowerCase();
    const matches = clean.match(/[a-z0-9äöüß._+-]+/gi) || [];
    for (const tok of matches) {
      if (tok.length >= 2) set.add(tok);
      // Also index sub-parts split by punctuation
      for (const sub of tok.split(/[._+-]+/)) {
        if (sub.length >= 2) set.add(sub);
      }
    }
  }
  return Array.from(set);
}

function inferLoaders(mod: ModItem): string[] {
  const found = new Map<string, string>();
  const addLoader = (raw: string) => {
    const lower = raw.trim().toLowerCase();
    const canonical = KNOWN_LOADERS.find(k => k.toLowerCase() === lower);
    if (canonical) {
      found.set(canonical.toLowerCase(), canonical);
    } else if (lower.length > 0) {
      found.set(lower, raw.trim());
    }
  };

  if (Array.isArray(mod.loaders)) {
    for (const l of mod.loaders) addLoader(l);
  }
  if (Array.isArray(mod.tags)) {
    for (const t of mod.tags) {
      const lower = t.trim().toLowerCase();
      const canonical = KNOWN_LOADERS.find(k => k.toLowerCase() === lower);
      if (canonical) found.set(canonical.toLowerCase(), canonical);
    }
  }
  if (found.size === 0 && mod.gameId === 'minecraft') {
    const src = String(mod.source || '');
    if (src === 'SpigotMC' || src === 'Hangar') {
      addLoader('Paper');
      addLoader('Spigot');
      addLoader('Purpur');
    } else if (src === 'Modrinth') {
      addLoader('Paper');
      addLoader('Fabric');
    }
  }
  return Array.from(found.values());
}

function inferVersions(
  mod: ModItem,
  loaders: string[],
  sourceHint: 'declared' | 'inferred' | 'live' = 'declared'
): { versions: string[]; versionSupportSource: 'declared' | 'inferred' | 'live' } {
  const set = new Set<string>();
  if (Array.isArray(mod.supportedVersions)) {
    for (const v of mod.supportedVersions) {
      const clean = String(v || '').trim();
      if (clean) set.add(clean);
    }
  }
  // Extract MC versions embedded in tags (e.g. from Modrinth live results)
  if (Array.isArray(mod.tags)) {
    for (const t of mod.tags) {
      if (isMinecraftVersionToken(t)) set.add(t.trim());
    }
  }

  if (set.size > 0) {
    return {
      versions: Array.from(set).sort(compareMcVersionsDesc),
      versionSupportSource: sourceHint === 'live' ? 'live' : 'declared'
    };
  }

  if (mod.gameId === 'minecraft') {
    const lowerLoaders = loaders.map(l => l.toLowerCase());
    if (lowerLoaders.some(l => PROXY_LOADERS.has(l))) {
      return {
        versions: [...DEFAULT_MINECRAFT_PROXY_VERSIONS],
        versionSupportSource: 'inferred'
      };
    }
    const src = String(mod.source || '');
    if (lowerLoaders.some(l => PLUGIN_LOADERS.has(l)) || src === 'SpigotMC' || src === 'Hangar') {
      return {
        versions: [...DEFAULT_MINECRAFT_PLUGIN_VERSIONS],
        versionSupportSource: 'inferred'
      };
    }
    // Generic Minecraft mod fallback
    return {
      versions: ['1.21.4', '1.21.1', '1.20.4', '1.20.1'],
      versionSupportSource: 'inferred'
    };
  }

  return { versions: [], versionSupportSource: sourceHint };
}

export function normalizeModForIndex(
  mod: ModItem,
  sourceHint: 'declared' | 'inferred' | 'live' = 'declared',
  nowIso: string = new Date().toISOString()
): IndexedModItem {
  const loaders = inferLoaders(mod);
  const { versions, versionSupportSource } = inferVersions(mod, loaders, sourceHint);

  const tagMap = new Map<string, string>();
  const rawTags = Array.isArray(mod.tags) ? mod.tags : [];
  for (const tag of rawTags) {
    const trimmed = String(tag || '').trim();
    if (!trimmed || isMinecraftVersionToken(trimmed)) continue;
    const key = normalizeTagKey(trimmed);
    if (key) tagMap.set(key, trimmed);
  }
  // Ensure loaders & category are discoverable as tags too (preserving existing clean tags)
  if (mod.category) {
    const catKey = normalizeTagKey(mod.category);
    if (catKey && !tagMap.has(catKey)) {
      tagMap.set(catKey, mod.category);
    }
  }
  for (const loader of loaders) {
    const lKey = normalizeTagKey(loader);
    if (lKey && !tagMap.has(lKey)) {
      tagMap.set(lKey, loader);
    }
  }

  const normalizedTags = Array.from(tagMap.keys());
  const displayTags = Array.from(tagMap.values());
  const downloadsNumeric = parseDownloadsNumeric(mod.downloads);
  const searchTokens = tokenizeText([
    mod.id,
    mod.name,
    mod.author,
    mod.description,
    mod.category,
    mod.gameId,
    mod.source,
    ...displayTags,
    ...loaders,
    ...versions
  ]);

  return {
    ...mod,
    tags: displayTags,
    loaders,
    supportedVersions: versions,
    normalizedTags,
    normalizedLoaders: loaders.map(l => l.toLowerCase()),
    normalizedVersions: versions.map(v => v.toLowerCase()),
    versionSupportSource,
    downloadsNumeric,
    searchTokens,
    indexedAt: nowIso
  };
}

export function evaluateMcVersionCompatibility(
  item: IndexedModItem,
  targetVersion: string
): { status: CompatibilityLevel; label: string; scoreBoost: number } {
  const cleanTarget = String(targetVersion || '').trim().toLowerCase();
  if (!cleanTarget || cleanTarget === 'all') {
    return { status: 'unverified', label: 'Alle Versionen', scoreBoost: 0 };
  }

  if (item.gameId !== 'minecraft') {
    return { status: 'incompatible', label: `Nicht für Minecraft (${item.gameId})`, scoreBoost: -100 };
  }

  if (item.normalizedVersions.includes(cleanTarget)) {
    return {
      status: 'exact',
      label: item.versionSupportSource === 'inferred'
        ? `Kompatibel (${targetVersion} · Plugin-API)`
        : `Exakt verifiziert (${targetVersion})`,
      scoreBoost: 45
    };
  }

  // Check minor series match (e.g., 1.21.3 <-> 1.21.4 or 1.21.1 or 1.21)
  const targetMinor = extractMinorSeries(cleanTarget);
  if (targetMinor) {
    const matchedMinor = item.normalizedVersions.find(v => extractMinorSeries(v) === targetMinor);
    if (matchedMinor) {
      return {
        status: 'minor',
        label: `Kompatibel (${targetMinor}.x Reihe)`,
        scoreBoost: 25
      };
    }
  }

  // Proxy/Bukkit/Paper plugins with broad cross-version support (e.g. ViaVersion, GeyserMC, LuckPerms)
  const isUniversalProxyOrPlugin =
    item.normalizedLoaders.some(l => PROXY_LOADERS.has(l)) ||
    item.normalizedTags.some(t => ['cross-version', 'protocol', 'bedrock', 'crossplay'].includes(t));

  if (isUniversalProxyOrPlugin) {
    return {
      status: 'universal',
      label: `Universal-Kompatibel (${targetVersion})`,
      scoreBoost: 20
    };
  }

  return {
    status: 'incompatible',
    label: `Nicht gelistet für ${targetVersion}`,
    scoreBoost: -50
  };
}

export function buildModIndex(
  mods: ModItem[] = MODS_AND_PLUGINS_DATABASE,
  nowIso: string = new Date().toISOString()
): ModIndexState {
  const byId = new Map<string, IndexedModItem>();
  const tagIndex = new Map<string, Set<string>>();
  const tagLabels = new Map<string, string>();
  const versionIndex = new Map<string, Set<string>>();
  const loaderIndex = new Map<string, Set<string>>();
  const categoryIndex = new Map<string, Set<string>>();
  const tokenIndex = new Map<string, Set<string>>();

  const addToMapSet = (map: Map<string, Set<string>>, key: string, id: string) => {
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    set.add(id);
  };

  for (const raw of mods) {
    if (!raw || !raw.id) continue;
    const item = normalizeModForIndex(raw, 'declared', nowIso);
    byId.set(item.id, item);

    for (let i = 0; i < item.normalizedTags.length; i++) {
      const key = item.normalizedTags[i];
      const label = item.tags[i] || key;
      addToMapSet(tagIndex, key, item.id);
      if (!tagLabels.has(key)) tagLabels.set(key, label);
    }

    for (const v of item.normalizedVersions) {
      addToMapSet(versionIndex, v, item.id);
    }

    for (const l of item.normalizedLoaders) {
      addToMapSet(loaderIndex, l, item.id);
    }

    if (item.category) {
      addToMapSet(categoryIndex, item.category.toLowerCase(), item.id);
    }

    for (const tok of item.searchTokens) {
      addToMapSet(tokenIndex, tok, item.id);
    }
  }

  return {
    version: 1,
    lastIndexedAt: nowIso,
    items: Array.from(byId.values()),
    byId,
    tagIndex,
    tagLabels,
    versionIndex,
    loaderIndex,
    categoryIndex,
    tokenIndex
  };
}

export function mergeLiveItemsIntoIndex(index: ModIndexState, liveItems: ModItem[]): number {
  let added = 0;
  const nowIso = new Date().toISOString();
  const addToMapSet = (map: Map<string, Set<string>>, key: string, id: string) => {
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    set.add(id);
  };

  for (const raw of liveItems) {
    if (!raw || !raw.id) continue;
    // Skip if same name already exists in curated index
    const existsByName = index.items.some(
      existing => existing.id === raw.id || existing.name.toLowerCase() === String(raw.name || '').toLowerCase()
    );
    if (existsByName) continue;

    const item = normalizeModForIndex(raw, 'live', nowIso);
    index.byId.set(item.id, item);
    index.items.push(item);

    for (let i = 0; i < item.normalizedTags.length; i++) {
      const key = item.normalizedTags[i];
      const label = item.tags[i] || key;
      addToMapSet(index.tagIndex, key, item.id);
      if (!index.tagLabels.has(key)) index.tagLabels.set(key, label);
    }
    for (const v of item.normalizedVersions) {
      addToMapSet(index.versionIndex, v, item.id);
    }
    for (const l of item.normalizedLoaders) {
      addToMapSet(index.loaderIndex, l, item.id);
    }
    if (item.category) {
      addToMapSet(index.categoryIndex, item.category.toLowerCase(), item.id);
    }
    for (const tok of item.searchTokens) {
      addToMapSet(index.tokenIndex, tok, item.id);
    }
    added++;
  }
  if (added > 0) {
    index.lastIndexedAt = nowIso;
  }
  return added;
}

export function computeFacets(items: IndexedModItem[], tagLabels: Map<string, string>): ModIndexFacets {
  const tagCounts = new Map<string, number>();
  const versionCounts = new Map<string, number>();
  const loaderCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const providerCounts = new Map<string, number>();
  const gameCounts = new Map<string, number>();

  for (const item of items) {
    for (let i = 0; i < item.normalizedTags.length; i++) {
      const key = item.normalizedTags[i];
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
      if (!tagLabels.has(key) && item.tags[i]) tagLabels.set(key, item.tags[i]);
    }
    for (const v of item.supportedVersions || []) {
      versionCounts.set(v, (versionCounts.get(v) || 0) + 1);
    }
    for (const l of item.loaders || []) {
      loaderCounts.set(l, (loaderCounts.get(l) || 0) + 1);
    }
    if (item.category) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
    }
    if (item.source) {
      providerCounts.set(item.source, (providerCounts.get(item.source) || 0) + 1);
    }
    if (item.gameId) {
      gameCounts.set(item.gameId, (gameCounts.get(item.gameId) || 0) + 1);
    }
  }

  const tags: TagFacet[] = Array.from(tagCounts.entries())
    .map(([key, count]) => ({ key, label: tagLabels.get(key) || key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const mcVersions: VersionFacet[] = Array.from(versionCounts.entries())
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => compareMcVersionsDesc(a.version, b.version));

  const loaders: NamedFacet[] = Array.from(loaderCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const categories: NamedFacet[] = Array.from(categoryCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const providers: NamedFacet[] = Array.from(providerCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const games: NamedFacet[] = Array.from(gameCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { tags, mcVersions, loaders, categories, providers, games };
}

function matchesProvider(item: IndexedModItem, provider: string): boolean {
  const p = provider.trim().toLowerCase();
  if (!p || p === 'all') return true;
  const src = String(item.source || '').toLowerCase();
  if (p === 'modrinth') return src.includes('modrinth');
  if (p === 'spigot') return src.includes('spigot') || src.includes('hangar');
  if (p === 'curseforge') return src.includes('curseforge');
  if (p === 'steam_workshop') return src.includes('steam') || src.includes('workshop');
  if (p === 'local') return true;
  return src.includes(p);
}

export function queryModIndex(
  index: ModIndexState,
  options: ModIndexQueryOptions = {}
): ModIndexSearchResponse {
  const queryStr = String(options.q || '').trim().toLowerCase();
  const queryTokens = queryStr ? tokenizeText([queryStr]) : [];
  const requestedTags = (options.tags || [])
    .map(normalizeTagKey)
    .filter(Boolean);
  const tagMode: TagFilterMode = options.tagMode === 'any' ? 'any' : 'all';
  const mcVersion = String(options.mcVersion || '').trim();
  const compatibilityMode: CompatibilityFilterMode =
    options.compatibility === 'strict'
      ? 'strict'
      : options.compatibility === 'all'
      ? 'all'
      : 'compatible';
  const loaderFilter = String(options.loader || '').trim().toLowerCase();
  const categoryFilter = String(options.category || '').trim().toLowerCase();
  const providerFilter = String(options.provider || '').trim().toLowerCase();
  const gameIdFilter = String(options.gameId || '').trim().toLowerCase();
  const sortMode = options.sort || 'relevance';
  const limit = Math.min(Math.max(Number(options.limit) || 120, 1), 500);

  // Use inverted tag index to narrow candidate IDs quickly when tag filters are active
  let candidateIds: Set<string> | null = null;
  if (requestedTags.length > 0) {
    if (tagMode === 'all') {
      for (const tagKey of requestedTags) {
        const setForTag = index.tagIndex.get(tagKey) || new Set<string>();
        if (candidateIds === null) {
          candidateIds = new Set(setForTag);
        } else {
          const next = new Set<string>();
          for (const id of candidateIds) {
            if (setForTag.has(id)) next.add(id);
          }
          candidateIds = next;
        }
      }
    } else {
      candidateIds = new Set<string>();
      for (const tagKey of requestedTags) {
        const setForTag = index.tagIndex.get(tagKey);
        if (setForTag) {
          for (const id of setForTag) candidateIds.add(id);
        }
      }
    }
  }

  // Further narrow by loader inverted index if set
  if (loaderFilter && loaderFilter !== 'all') {
    const loaderIds = index.loaderIndex.get(loaderFilter) || new Set<string>();
    if (candidateIds === null) {
      candidateIds = new Set(loaderIds);
    } else {
      const next = new Set<string>();
      for (const id of candidateIds) {
        if (loaderIds.has(id)) next.add(id);
      }
      candidateIds = next;
    }
  }

  const candidateItems =
    candidateIds !== null
      ? Array.from(candidateIds)
          .map(id => index.byId.get(id))
          .filter((x): x is IndexedModItem => Boolean(x))
      : index.items;

  const results: ModIndexSearchResultItem[] = [];

  for (const item of candidateItems) {
    if (providerFilter && providerFilter !== 'all' && !matchesProvider(item, providerFilter)) {
      continue;
    }
    if (categoryFilter && categoryFilter !== 'all' && item.category.toLowerCase() !== categoryFilter) {
      continue;
    }
    if (gameIdFilter && gameIdFilter !== 'all' && item.gameId.toLowerCase() !== gameIdFilter) {
      continue;
    }

    // Minecraft Version Compatibility evaluation
    const compat = evaluateMcVersionCompatibility(item, mcVersion);
    if (mcVersion && mcVersion !== 'all') {
      if (compatibilityMode === 'strict' && compat.status !== 'exact') {
        continue;
      }
      if (
        compatibilityMode === 'compatible' &&
        compat.status !== 'exact' &&
        compat.status !== 'minor' &&
        compat.status !== 'universal'
      ) {
        continue;
      }
    }

    // Text search & relevance scoring
    let relevanceScore = 0;
    if (queryStr) {
      const nameLower = item.name.toLowerCase();
      const descLower = item.description.toLowerCase();
      const authorLower = item.author.toLowerCase();
      const tagStr = item.tags.join(' ').toLowerCase();

      if (nameLower === queryStr) relevanceScore += 120;
      else if (nameLower.startsWith(queryStr)) relevanceScore += 85;
      else if (nameLower.includes(queryStr)) relevanceScore += 65;

      if (tagStr.includes(queryStr)) relevanceScore += 40;
      if (authorLower.includes(queryStr)) relevanceScore += 30;
      if (descLower.includes(queryStr)) relevanceScore += 20;

      // Token-level fuzzy match
      let matchedTokenCount = 0;
      for (const qTok of queryTokens) {
        if (item.searchTokens.some(tok => tok === qTok || tok.startsWith(qTok) || tok.includes(qTok))) {
          matchedTokenCount++;
        }
      }
      if (queryTokens.length > 0) {
        relevanceScore += Math.round((matchedTokenCount / queryTokens.length) * 35);
      }

      if (relevanceScore === 0) continue;
    } else {
      relevanceScore = 10;
    }

    const matchedTags = requestedTags.filter(t => item.normalizedTags.includes(t));
    relevanceScore += matchedTags.length * 18 + compat.scoreBoost;

    results.push({
      ...item,
      compatibilityStatus: compat.status,
      compatibilityLabel: compat.label,
      matchedTags,
      relevanceScore
    });
  }

  results.sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name);
    if (sortMode === 'downloads') return b.downloadsNumeric - a.downloadsNumeric || a.name.localeCompare(b.name);
    // Default: relevance, then downloads
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return b.downloadsNumeric - a.downloadsNumeric || a.name.localeCompare(b.name);
  });

  const facets = computeFacets(results, index.tagLabels);

  return {
    total: results.length,
    totalIndexed: index.items.length,
    lastIndexedAt: index.lastIndexedAt,
    items: results.slice(0, limit),
    facets
  };
}

async function fetchLiveModrinthForIndex(query: string, mcVersion?: string, loader?: string): Promise<ModItem[]> {
  try {
    const facets: string[][] = [];
    if (mcVersion && mcVersion !== 'all') {
      facets.push([`versions:${mcVersion}`]);
    }
    if (loader && loader !== 'all') {
      facets.push([`categories:${loader.toLowerCase()}`]);
    }
    const facetParam = facets.length > 0 ? `&facets=${encodeURIComponent(JSON.stringify(facets))}` : '';
    const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=18${facetParam}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Sonora-Gameserver-Manager/2.0 (mod-index)' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data: any = await res.json();
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return hits.map((hit: any): ModItem => {
      const rawCats: string[] = Array.isArray(hit.display_categories)
        ? hit.display_categories
        : Array.isArray(hit.categories)
        ? hit.categories
        : [];
      const detectedLoaders = rawCats.filter(c =>
        KNOWN_LOADERS.some(k => k.toLowerCase() === String(c).toLowerCase())
      );
      const versions = Array.isArray(hit.versions)
        ? hit.versions.filter((v: string) => isMinecraftVersionToken(v)).slice(-12)
        : [];
      const downloadsNum = Number(hit.downloads) || 0;
      const downloads =
        downloadsNum >= 1_000_000
          ? `${(downloadsNum / 1_000_000).toFixed(1)}M`
          : downloadsNum >= 1_000
          ? `${Math.round(downloadsNum / 1_000)}K`
          : String(downloadsNum);
      return {
        id: `mr_${hit.project_id}`,
        name: String(hit.title || hit.slug || 'Modrinth Projekt'),
        gameId: 'minecraft',
        category: rawCats.includes('optimization')
          ? 'Performance'
          : rawCats.includes('utility')
          ? 'Utility'
          : rawCats.includes('worldgen')
          ? 'Welt & Dimensionen'
          : 'Gameplay',
        author: String(hit.author || 'Modrinth'),
        downloads,
        version: String(hit.latest_version || 'Latest'),
        description: String(hit.description || 'Modrinth Community Projekt'),
        source: 'Modrinth',
        fileSize: 'Modrinth JAR',
        tags: rawCats.filter(c => !isMinecraftVersionToken(c)),
        loaders: detectedLoaders.length > 0 ? detectedLoaders : ['Paper', 'Fabric'],
        supportedVersions: versions
      };
    });
  } catch {
    return [];
  }
}

export function configureModIndex(app: Express, deps: ModIndexControllerDeps) {
  const indexFilePath = path.join(deps.managerStateDir, 'mod-index.json');
  let indexState: ModIndexState = buildModIndex(MODS_AND_PLUGINS_DATABASE);

  const persistIndexSnapshot = () => {
    try {
      if (!fs.existsSync(deps.managerStateDir)) {
        fs.mkdirSync(deps.managerStateDir, { recursive: true });
      }
      const snapshot = {
        version: indexState.version,
        lastIndexedAt: indexState.lastIndexedAt,
        totalIndexed: indexState.items.length,
        tagsCount: indexState.tagIndex.size,
        versionsCount: indexState.versionIndex.size,
        items: indexState.items
      };
      fs.writeFileSync(indexFilePath, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (err) {
      console.warn('[ModIndex] Persistenz-Warnung:', (err as Error).message);
    }
  };

  // Load previously cached live items if present, always keeping fresh curated catalog as base
  try {
    if (fs.existsSync(indexFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
      if (Array.isArray(parsed?.items)) {
        const cachedLive = parsed.items.filter((i: any) => i?.versionSupportSource === 'live');
        if (cachedLive.length > 0) {
          mergeLiveItemsIntoIndex(indexState, cachedLive);
        }
      }
    } else {
      persistIndexSnapshot();
    }
  } catch {
    persistIndexSnapshot();
  }

  // GET /api/mods/index/facets - Returns full server-side index facets (tags, versions, loaders, categories)
  app.get('/api/mods/index/facets', (req: Request, res: Response) => {
    const gameId = String(req.query.gameId || '').trim().toLowerCase();
    const provider = String(req.query.provider || '').trim().toLowerCase();

    let scopedItems = indexState.items;
    if (gameId && gameId !== 'all') {
      scopedItems = scopedItems.filter(i => i.gameId.toLowerCase() === gameId);
    }
    if (provider && provider !== 'all') {
      scopedItems = scopedItems.filter(i => matchesProvider(i, provider));
    }

    const facets = computeFacets(scopedItems, indexState.tagLabels);
    return res.json({
      success: true,
      indexVersion: indexState.version,
      lastIndexedAt: indexState.lastIndexedAt,
      totalIndexed: indexState.items.length,
      scopedCount: scopedItems.length,
      facets
    });
  });

  // GET /api/mods/index/search - Server-side indexed query by name, tags, MC version compatibility, loader, category
  app.get('/api/mods/index/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      const rawTags = String(req.query.tags || '').trim();
      const tags = rawTags
        ? rawTags
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];
      const tagMode: TagFilterMode = String(req.query.tagMode || 'all').toLowerCase() === 'any' ? 'any' : 'all';
      const mcVersion = String(req.query.mcVersion || '').trim();
      const compatRaw = String(req.query.compatibility || 'compatible').toLowerCase();
      const compatibility: CompatibilityFilterMode =
        compatRaw === 'strict' ? 'strict' : compatRaw === 'all' ? 'all' : 'compatible';
      const loader = String(req.query.loader || '').trim();
      const category = String(req.query.category || '').trim();
      const provider = String(req.query.provider || 'all').trim();
      const gameId = String(req.query.gameId || '').trim();
      const sortRaw = String(req.query.sort || 'relevance').toLowerCase();
      const sort = sortRaw === 'downloads' ? 'downloads' : sortRaw === 'name' ? 'name' : 'relevance';
      const limit = Number(req.query.limit) || 120;
      const refreshLive = String(req.query.refreshLive || 'false').toLowerCase() === 'true';

      let liveMergedCount = 0;
      let usedLiveApi = false;

      if (
        refreshLive &&
        (provider === 'all' || provider === 'modrinth') &&
        (q.length >= 2 || (mcVersion && mcVersion !== 'all'))
      ) {
        const liveItems = await fetchLiveModrinthForIndex(q || 'minecraft', mcVersion, loader);
        if (liveItems.length > 0) {
          usedLiveApi = true;
          liveMergedCount = mergeLiveItemsIntoIndex(indexState, liveItems);
          if (liveMergedCount > 0) persistIndexSnapshot();
        }
      }

      const result = queryModIndex(indexState, {
        q,
        tags,
        tagMode,
        mcVersion,
        compatibility,
        loader,
        category,
        provider,
        gameId,
        sort,
        limit
      });

      const sourceLabel = usedLiveApi
        ? `Serverseitiger Mod-Index + Live-Modrinth (${result.totalIndexed} indexiert)`
        : `Serverseitiger Mod-Index (${result.totalIndexed} Mods · ${indexState.tagIndex.size} Tags)`;

      return res.json({
        success: true,
        source: sourceLabel,
        isLiveApi: usedLiveApi,
        liveMergedCount,
        total: result.total,
        totalIndexed: result.totalIndexed,
        lastIndexedAt: result.lastIndexedAt,
        appliedFilters: {
          q,
          tags,
          tagMode,
          mcVersion,
          compatibility,
          loader,
          category,
          provider,
          gameId,
          sort
        },
        facets: result.facets,
        items: result.items
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Serverseitige Mod-Index-Suche fehlgeschlagen.'
      });
    }
  });

  // POST /api/mods/index/rebuild - Rebuilds the server-side index cleanly
  app.post('/api/mods/index/rebuild', (_req: Request, res: Response) => {
    indexState = buildModIndex(MODS_AND_PLUGINS_DATABASE);
    persistIndexSnapshot();
    const facets = computeFacets(indexState.items, indexState.tagLabels);
    deps.recordAuditLog?.({
      action: 'MOD_INDEX_REBUILT',
      details: `Serverseitiger Mod-Index neu aufgebaut (${indexState.items.length} Mods, ${facets.tags.length} Tags, ${facets.mcVersions.length} MC-Versionen).`
    });
    return res.json({
      success: true,
      lastIndexedAt: indexState.lastIndexedAt,
      totalIndexed: indexState.items.length,
      tagsCount: facets.tags.length,
      mcVersionsCount: facets.mcVersions.length,
      facets
    });
  });

  return {
    getIndexState: () => indexState,
    rebuildIndex: () => {
      indexState = buildModIndex(MODS_AND_PLUGINS_DATABASE);
      persistIndexSnapshot();
      return indexState;
    }
  };
}
