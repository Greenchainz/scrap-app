import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EraInfo } from '../screens/CameraScreen.js';

const CACHE_KEY = 'scrap_scan_cache';
const MAX_CACHED = 10;

export type CachedScan = {
  scanId?: number;
  objectName: string;
  metals: Array<{
    type: string;
    weightRange: string;
    percentage: number;
    valueLow: number;
    valueHigh: number;
  }>;
  extractionSteps: string[];
  difficulty: 'easy' | 'moderate' | 'hard';
  safetyWarnings: string[];
  batteryPassport: {
    stateOfHealthPct: number | null;
    cycleCount: number | null;
    manufacturer: string | null;
    chemistry: string | null;
    passportId: string | null;
    complianceStatus: 'compliant' | 'partial' | 'missing';
    captureRecommendations: string[];
  };
  batteryPassportHooks: {
    ready: boolean;
    capturePath: string;
    uploadPath: string;
    fields: {
      stateOfHealthPct: number | null;
      cycleCount: number | null;
      manufacturer: string | null;
      chemistry: string | null;
      passportId: string | null;
      vinOrSerial: string | null;
    };
  };
  liveBatteryPricingRoadmap: string[];
  estimatedValueLow: number;
  estimatedValueHigh: number;
  imageUrl: string;
  era?: EraInfo | null;
  cachedAt: string;
};

export async function cacheScan(scan: CachedScan): Promise<void> {
  const existing = await getCachedScans();
  const updated = [scan, ...existing].slice(0, MAX_CACHED);
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
}

export async function getCachedScans(): Promise<CachedScan[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CachedScan[];
  } catch {
    return [];
  }
}
