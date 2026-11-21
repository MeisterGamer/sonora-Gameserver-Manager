export type WindowsRuntimeOption = 'none' | 'auto' | 'wine' | 'podman' | 'docker';

export interface ExecutableValidationInput {
  executablePath: string;
  targetOS: 'linux' | 'windows' | 'macos';
  useWindowsContainer?: boolean;
  envFlagAllowWindowsExe?: boolean;
  windowsRuntimeMode?: WindowsRuntimeOption;
}

export interface ExecutableValidationResult {
  valid: boolean;
  isWindowsExe: boolean;
  requiresLinuxExecutable: boolean;
  suggestedLinuxPath?: string;
  error?: string;
  info?: string;
}

/**
 * Checks whether a file path targets a Windows executable (.exe).
 */
export function isExeFilePath(filePath: string): boolean {
  return /\.exe$/i.test(String(filePath || '').trim());
}

/**
 * Suggests a Linux-compatible shell script replacement for a given .exe path.
 */
export function suggestLinuxExecutable(filePath: string): string {
  const clean = String(filePath || '').trim().replace(/^\.\//, '');
  if (!clean) return 'start.sh';
  if (/\.exe$/i.test(clean)) {
    return clean.replace(/\.exe$/i, '.sh');
  }
  return clean;
}

/**
 * Validates that a file path ending in `.exe` is ONLY permitted on Linux/macOS
 * when either a Windows-based container (Docker/Podman) OR an environment variable
 * flag (e.g. SONORA_ALLOW_WIN_EXE=true / ALLOW_WINDOWS_EXE=true) is active.
 * Otherwise forces the user to provide a Linux-compatible shell script or binary.
 */
export function validateServerExecutablePath(
  input: ExecutableValidationInput
): ExecutableValidationResult {
  const trimmed = String(input.executablePath || '').trim();
  const isExe = isExeFilePath(trimmed);

  if (!trimmed) {
    return {
      valid: false,
      isWindowsExe: false,
      requiresLinuxExecutable: input.targetOS !== 'windows',
      error:
        input.targetOS === 'windows'
          ? 'Bitte gib eine gültige Start-Executable an.'
          : 'Bitte gib ein Linux-kompatibles Shell-Skript (.sh) oder eine Linux-Binary an.'
    };
  }

  // Native Windows targets can run .exe directly
  if (input.targetOS === 'windows') {
    return {
      valid: true,
      isWindowsExe: isExe,
      requiresLinuxExecutable: false
    };
  }

  if (isExe) {
    const hasContainer =
      Boolean(input.useWindowsContainer) ||
      input.windowsRuntimeMode === 'docker' ||
      input.windowsRuntimeMode === 'podman';
    const hasEnvFlag = Boolean(input.envFlagAllowWindowsExe);

    if (hasContainer || hasEnvFlag) {
      const reason = hasContainer
        ? `Windows-Container (${input.windowsRuntimeMode === 'docker' ? 'Docker' : 'Podman'}) aktiviert`
        : 'Umgebungs-Flag (SONORA_ALLOW_WIN_EXE / ALLOW_WINDOWS_EXE) gesetzt';
      return {
        valid: true,
        isWindowsExe: true,
        requiresLinuxExecutable: false,
        info: `Windows-Executable (.exe) zulässig: ${reason}. Vor dem Start prüft der Pre-Flight Checker die Host-Runtime (Wine / Docker / Podman).`
      };
    }

    return {
      valid: false,
      isWindowsExe: true,
      requiresLinuxExecutable: true,
      suggestedLinuxPath: suggestLinuxExecutable(trimmed),
      error:
        'Dateipfade mit der Endung .exe sind unter Linux nur zulässig, wenn ein Windows-Container (Docker/Podman) aktiviert oder das Umgebungs-Flag (SONORA_ALLOW_WIN_EXE=true) gesetzt ist. Bitte gib stattdessen ein Linux-kompatibles Shell-Skript (.sh) oder eine native Linux-Binary an.'
    };
  }

  return {
    valid: true,
    isWindowsExe: false,
    requiresLinuxExecutable: false
  };
}
