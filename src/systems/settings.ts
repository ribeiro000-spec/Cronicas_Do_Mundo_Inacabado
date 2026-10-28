import { safeLocalGet, safeLocalSet } from '../core/util';

export interface Settings {
  volume: number;
  /** 0 = automático; -1 = mais longe; 1 = mais perto (valores antigos 2..5 contam como automático) */
  zoom: number;
  /** desenha na resolução real da tela (mais nítido; desligue em aparelhos fracos) */
  hiRes: boolean;
  controlsScale: number;
  leftHanded: boolean;
  vibration: boolean;
  damageNumbers: boolean;
  particles: boolean;
  autoAim: boolean;
  showFps: boolean;
  screenShake: boolean;
  language: 'pt-BR';
}

const KEY = 'cronicas-settings-v1';

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.6,
  zoom: 0,
  hiRes: true,
  controlsScale: 1,
  leftHanded: false,
  vibration: true,
  damageNumbers: true,
  particles: true,
  autoAim: true,
  showFps: false,
  screenShake: true,
  language: 'pt-BR',
};

export function loadSettings(): Settings {
  const raw = safeLocalGet(KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  safeLocalSet(KEY, JSON.stringify(s));
}
