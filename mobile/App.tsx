import React, { useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTrpcClient } from './utils/trpc.js';
import CameraScreen, { type ScanResult } from './screens/CameraScreen.js';
import ResultsScreen from './screens/ResultsScreen.js';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { type CachedScan } from './utils/cache.js';
import HistoryScreen from './screens/HistoryScreen.js';

type Screen = 'camera' | 'results' | 'history';

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(createTrpcClient);
  const [screen, setScreen] = useState<Screen>('camera');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [sessionScans, setSessionScans] = useState<ScanResult[]>([]);

  const sessionTotalLow = useMemo(
    () => parseFloat(sessionScans.reduce((sum, s) => sum + s.estimatedValueLow, 0).toFixed(2)),
    [sessionScans],
  );
  const sessionTotalHigh = useMemo(
    () => parseFloat(sessionScans.reduce((sum, s) => sum + s.estimatedValueHigh, 0).toFixed(2)),
    [sessionScans],
  );

  const handleScanComplete = (result: ScanResult) => {
    setScanResult(result);
    setSessionScans((prev) => [...prev, result]);
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

  const handleResetSession = () => {
    setSessionScans([]);
    setScanResult(null);
    setScreen('camera');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'camera':
        return <CameraScreen onScanComplete={handleScanComplete} />;
      case 'results':
        return scanResult ? (
          <ResultsScreen
            result={scanResult}
            onScanAgain={handleScanAgain}
            sessionCount={sessionScans.length}
            sessionTotalLow={sessionTotalLow}
            sessionTotalHigh={sessionTotalHigh}
          />
        ) : null;
      case 'history':
        return <HistoryScreen onSelectScan={handleSelectHistory} />;
    }
  };

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Scrappalot</Text>
            <View style={styles.headerActions}>
              {sessionScans.length > 0 && (
                <TouchableOpacity onPress={handleResetSession} style={styles.resetButton}>
                  <Text style={styles.resetText}>Reset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setScreen(screen === 'history' ? 'camera' : 'history')}>
                <Text style={styles.headerAction}>{screen === 'history' ? 'Camera' : 'History'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.content}>{renderScreen()}</View>
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
    gap: 16,
  },
  resetButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  resetText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
  },
  headerAction: {
    fontSize: 15,
    color: '#a8f0c8',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
});
