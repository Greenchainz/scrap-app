import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTrpcClient } from './utils/trpc.js';
import CameraScreen, { type ScanResult } from './screens/CameraScreen.js';
import ResultsScreen from './screens/ResultsScreen.js';
import VehicleValuationScreen from './screens/VehicleValuationScreen.js';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { type CachedScan } from './utils/cache.js';
import HistoryScreen from './screens/HistoryScreen.js';
import SnowOverlay from './components/SnowOverlay.js';

type Screen = 'camera' | 'results' | 'history' | 'vehicle';

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(createTrpcClient);
  const [screen, setScreen] = useState<Screen>('camera');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const handleScanComplete = (result: ScanResult) => {
    setScanResult(result);
    setScreen('results');
  };

  const handleScanAgain = () => {
    setScanResult(null);
    setScreen('camera');
  };

  const handleSelectHistory = (scan: CachedScan) => {
    setScanResult({ ...scan });
    setScreen('results');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'camera':
        return <CameraScreen onScanComplete={handleScanComplete} />;
      case 'results':
        return scanResult ? (
          <ResultsScreen result={scanResult} onScanAgain={handleScanAgain} />
        ) : null;
      case 'history':
        return <HistoryScreen onSelectScan={handleSelectHistory} />;
      case 'vehicle':
        return <VehicleValuationScreen onBack={() => setScreen('camera')} />;
    }
  };

  // Header nav: vehicle screen has its own header, suppress ours
  const hideAppHeader = screen === 'vehicle';

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          {!hideAppHeader && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Scrappalot</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.modePill, screen === 'vehicle' && styles.modePillActive]}
                  onPress={() => setScreen(screen === 'vehicle' ? 'camera' : 'vehicle')}>
                  <Text style={[styles.modePillText, screen === 'vehicle' && styles.modePillTextActive]}>
                    🚗 Whole Car
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setScreen(screen === 'history' ? 'camera' : 'history')}>
                  <Text style={styles.headerAction}>{screen === 'history' ? 'Camera' : 'History'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <View style={styles.content}>{renderScreen()}</View>
          <SnowOverlay />
        </SafeAreaView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a7f4b',
  },
  header: {
    backgroundColor: '#1a7f4b',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAction: {
    fontSize: 15,
    color: '#a8f0c8',
    fontWeight: '600',
  },
  modePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  modePillActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  modePillText: {
    color: '#a8f0c8',
    fontWeight: '700',
    fontSize: 13,
  },
  modePillTextActive: {
    color: '#1a7f4b',
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});

