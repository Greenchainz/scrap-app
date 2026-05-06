import React, { useState } from 'react';
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
    }
  };

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="light" />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Scrappalot</Text>
            <TouchableOpacity onPress={() => setScreen(screen === 'history' ? 'camera' : 'history')}>
              <Text style={styles.headerAction}>{screen === 'history' ? 'Camera' : 'History'}</Text>
            </TouchableOpacity>
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
