import React, { useState } from 'react';
import { 
  X, 
  Coffee, 
  Sparkles, 
  Cpu, 
  CheckCircle2, 
  RotateCw, 
  Layers,
  Terminal,
  Zap,
  HardDrive
} from 'lucide-react';
import { ServerInstance, JavaVersion } from '../types/game';
import { JAVA_VERSIONS } from '../data/minecraftTypes';

interface JavaRuntimeModalProps {
  server: ServerInstance;
  isOpen: boolean;
  onClose: () => void;
  onSaveJava: (serverId: string, newJava: JavaVersion, restart: boolean) => void;
}

export const JavaRuntimeModal: React.FC<JavaRuntimeModalProps> = ({
  server,
  isOpen,
  onClose,
  onSaveJava
}) => {
  if (!isOpen) return null;

  const [selectedJava, setSelectedJava] = useState<JavaVersion>(server.javaVersion || 'Java 21');
  const [gcPreset, setGcPreset] = useState<'aikar' | 'zgc' | 'shenandoah' | 'parallel'>('aikar');
  const [heapRam, setHeapRam] = useState<number>(server.allocatedRamGb || 8);
  const [useCompactHeaders, setUseCompactHeaders] = useState<boolean>(true);
  const [useAlwaysPreTouch, setUseAlwaysPreTouch] = useState<boolean>(true);
  const [useVectorApi, setUseVectorApi] = useState<boolean>(true);
  const [disableExplicitGc, setDisableExplicitGc] = useState<boolean>(true);

  const isModern = selectedJava.startsWith('Java 2') || selectedJava.includes('21') || selectedJava.includes('GraalVM') || selectedJava.includes('Temurin') || selectedJava.includes('Corretto') || selectedJava.includes('Zulu');

  // Build generated flags
  const generateFlags = (): string => {
    const parts: string[] = [`-Xms${heapRam}G`, `-Xmx${heapRam}G`];
    
    if (gcPreset === 'zgc') {
      parts.push('-XX:+UseZGC', '-XX:+ZGenerational');
    } else if (gcPreset === 'shenandoah') {
      parts.push('-XX:+UseShenandoahGC', '-XX:ShenandoahGCMode=iu');
    } else if (gcPreset === 'parallel') {
      parts.push('-XX:+UseParallelGC');
    } else {
      // Aikar's G1GC
      parts.push('-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200');
    }

    if (disableExplicitGc) parts.push('-XX:+DisableExplicitGC');
    if (useAlwaysPreTouch) parts.push('-XX:+AlwaysPreTouch');
    if (useCompactHeaders && (selectedJava === 'Java 24' || selectedJava === 'Java 25' || selectedJava === 'Java 26')) {
      parts.push('-XX:+UnlockExperimentalVMOptions', '-XX:+UseCompactObjectHeaders');
    }
    if (useVectorApi && isModern) {
      parts.push('--add-modules jdk.incubator.vector');
    }

    const jarName = server.minecraftType === 'fabric' ? 'fabric-server-launch.jar' : `${server.minecraftType || 'paper'}.jar`;
    return `java ${parts.join(' ')} -jar ${jarName} nogui`;
  };

  const currentObj = JAVA_VERSIONS.find(j => j.id === selectedJava) || JAVA_VERSIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-neutral-100 text-base">Java Runtime & JVM-Flags Manager</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                  Java 21+ Standard
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Server: <span className="text-neutral-200 font-medium">{server.name}</span> ({server.version})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Active Version Info Card */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-neutral-950 to-neutral-900 border border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-100 text-sm">{currentObj.name}</span>
                  <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-900/60 text-emerald-300 font-mono font-medium border border-emerald-700/50">
                    {currentObj.tag}
                  </span>
                </div>
                <p className="text-neutral-400 mt-0.5 text-xs">
                  {currentObj.description}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] text-neutral-400 block">Optimiert für</span>
              <span className="text-xs font-mono text-emerald-400 font-semibold">{currentObj.recommendedFor}</span>
            </div>
          </div>

          {/* Section: Select Java Runtime */}
          <div>
            <label className="block text-xs font-bold text-neutral-200 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>1. Java-Version auswählen</span>
              <span className="text-[11px] font-normal text-emerald-400">Erforderlich für Minecraft 1.20.5+ & 1.21+</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {JAVA_VERSIONS.map((jv) => {
                const isSelected = selectedJava === jv.id;
                return (
                  <button
                    key={jv.id}
                    type="button"
                    onClick={() => setSelectedJava(jv.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-neutral-800/90 border-emerald-500 ring-1 ring-emerald-500/50 shadow-md'
                        : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <span className={`font-semibold text-xs ${isSelected ? 'text-emerald-400' : 'text-neutral-200'}`}>
                        {jv.id}
                      </span>
                      {jv.isModern21Plus && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-950 text-emerald-400 font-mono border border-emerald-800/60">
                          21+ Modern
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-400 line-clamp-2">
                      {jv.tag} · {jv.recommendedFor}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Garbage Collector & Memory */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-neutral-800">
            {/* GC Presets */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-neutral-200 uppercase tracking-wider">
                2. Garbage Collector (GC) Preset
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setGcPreset('aikar')}
                  className={`w-full p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between cursor-pointer ${
                    gcPreset === 'aikar'
                      ? 'bg-neutral-800 border-emerald-500 text-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <div>
                    <span className="font-semibold block text-xs">Aikar's G1GC Flags (Empfohlen)</span>
                    <span className="text-[11px] text-neutral-400">Verhindert TPS-Drops & Lag-Spikes</span>
                  </div>
                  {gcPreset === 'aikar' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => setGcPreset('zgc')}
                  className={`w-full p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between cursor-pointer ${
                    gcPreset === 'zgc'
                      ? 'bg-neutral-800 border-emerald-500 text-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <div>
                    <span className="font-semibold block text-xs">Generational ZGC (Java 21+)</span>
                    <span className="text-[11px] text-neutral-400">Ultra-niedrige Latenzen &lt; 1ms bei viel RAM (&gt;10GB)</span>
                  </div>
                  {gcPreset === 'zgc' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => setGcPreset('shenandoah')}
                  className={`w-full p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between cursor-pointer ${
                    gcPreset === 'shenandoah'
                      ? 'bg-neutral-800 border-emerald-500 text-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <div>
                    <span className="font-semibold block text-xs">Shenandoah GC</span>
                    <span className="text-[11px] text-neutral-400">Geringe Pausezeiten bei Modpacks</span>
                  </div>
                  {gcPreset === 'shenandoah' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              </div>
            </div>

            {/* Java 21+ Modern Performance Features */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center justify-between">
                <span>3. Java 21+ Optimierungen</span>
                <span className="text-emerald-400 font-mono text-[10px]">Active Tuning</span>
              </label>

              <div className="space-y-2.5 bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <div>
                    <span className="font-medium text-neutral-200 block text-xs">Compact Object Headers (JEP 450)</span>
                    <span className="text-[10px] text-neutral-500">Reduziert RAM-Verbrauch um bis zu 25% (Java 24+)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={useCompactHeaders}
                    onChange={(e) => setUseCompactHeaders(e.target.checked)}
                    className="rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer pt-2 border-t border-neutral-900">
                  <div>
                    <span className="font-medium text-neutral-200 block text-xs">Always PreTouch (-XX:+AlwaysPreTouch)</span>
                    <span className="text-[10px] text-neutral-500">Allokiert RAM vor dem Serverstart gegen Page-Fault Lags</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={useAlwaysPreTouch}
                    onChange={(e) => setUseAlwaysPreTouch(e.target.checked)}
                    className="rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer pt-2 border-t border-neutral-900">
                  <div>
                    <span className="font-medium text-neutral-200 block text-xs">Vector API Beschleunigung (SIMD)</span>
                    <span className="text-[10px] text-neutral-500">Beschleunigt Mathe- und Vektor-Berechnungen von Mods</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={useVectorApi}
                    onChange={(e) => setUseVectorApi(e.target.checked)}
                    className="rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer pt-2 border-t border-neutral-900">
                  <div>
                    <span className="font-medium text-neutral-200 block text-xs">Disable Explicit GC</span>
                    <span className="text-[10px] text-neutral-500">Verhindert schädliche System.gc() Plugin-Aufrufe</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={disableExplicitGc}
                    onChange={(e) => setDisableExplicitGc(e.target.checked)}
                    className="rounded bg-neutral-900 border-neutral-700 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* JVM Command Preview */}
          <div className="space-y-1.5 pt-2">
            <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              <span>Generierter Startbefehl (Preview)</span>
            </span>
            <div className="bg-black/90 p-3 rounded-xl border border-neutral-800 font-mono text-[11px] text-emerald-400 overflow-x-auto select-all">
              {generateFlags()}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Abbrechen
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSaveJava(server.id, selectedJava, false);
                onClose();
              }}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Laufzeit speichern
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveJava(server.id, selectedJava, true);
                onClose();
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Speichern & Neustarten</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
