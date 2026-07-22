import React, { useState, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTrpcClient } from './utils/trpc.js';
import CameraScreen, { type ScanResult } from './screens/CameraScreen.js';
import ResultsScreen from './screens/ResultsScreen.js';
import VehicleValuationScreen from './screens/VehicleValuationScreen.js';
import YardProfileScreen from './screens/YardProfileScreen.js';
import SubmitReviewScreen from './screens/SubmitReviewScreen.js';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { type CachedScan } from './utils/cache.js';
import HistoryScreen from './screens/HistoryScreen.js';
import SnowOverlay from './components/SnowOverlay.js';
import { C, aquaGlow } from './theme.js';

type Screen = 'camera' | 'results' | 'history' | 'vehicle' | 'yard_profile' | 'submit_review';

type YardNav = {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  phone: string | null;
  website: string | null;
};

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
  const [activeYard, setActiveYard] = useState<YardNav | null>(null);
  const [reviewYard, setReviewYard] = useState<{ id: string; name: string } | null>(null);

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

  const handleOpenYard = (yard: YardNav) => {
    setActiveYard(yard);
    setScreen('yard_profile');
  };

  const handleLeaveReview = (yardId: string, yardName: string) => {
    setReviewYard({ id: yardId, name: yardName });
    setScreen('submit_review');
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
      case 'vehicle':
        return <VehicleValuationScreen onBack={() => setScreen('camera')} />;
      case 'yard_profile':
        return activeYard ? (
          <YardProfileScreen
            yard={activeYard}
            onBack={() => setScreen('camera')}
            onLeaveReview={handleLeaveReview}
          />
        ) : null;
      case 'submit_review':
        return reviewYard ? (
          <SubmitReviewScreen
            yardId={reviewYard.id}
            yardName={reviewYard.name}
            onDone={() => setScreen(activeYard ? 'yard_profile' : 'camera')}
            onSkip={() => setScreen(activeYard ? 'yard_profile' : 'camera')}
          />
        ) : null;
    }
  };

  const hideAppHeader = screen === 'vehicle' || screen === 'yard_profile' || screen === 'submit_review';
  const isVehicleMode = screen === 'vehicle';

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
          {!hideAppHeader && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Scrappalot</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.modePill, isVehicleMode && styles.modePillActive]}
                  onPress={() => setScreen(isVehicleMode ? 'camera' : 'vehicle')}>
                  <Text style={[styles.modePillText, isVehicleMode && styles.modePillTextActive]}>
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
    backgroundColor: C.bg,
  },
  header: {
    backgroundColor: '#0a0822',
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    ...aquaGlow,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    shadowOpacity: 0.25,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: C.aqua,
    letterSpacing: 0.5,
    textShadowColor: C.aqua,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    fontSize: 14,
    color: C.textSub,
    fontWeight: '600',
  },
  modePill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bgCard,
  },
  modePillActive: {
    backgroundColor: C.purple,
    borderColor: C.purple,
  },
  modePillText: {
    color: C.textSub,
    fontWeight: '700',
    fontSize: 13,
  },
  modePillTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    backgroundColor: C.bg,
  },
});


