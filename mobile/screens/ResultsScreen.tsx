import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import type { ScanResult } from './CameraScreen.js';

type Props = {
  result: ScanResult;
  onScanAgain: () => void;
  sessionCount: number;
  sessionTotalLow: number;
  sessionTotalHigh: number;
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#1a7f4b',
  moderate: '#e08a00',
  hard: '#c0392b',
};

export default function ResultsScreen({ result, onScanAgain, sessionCount, sessionTotalLow, sessionTotalHigh }: Props) {
  const totalLow = result.estimatedValueLow.toFixed(2);
  const totalHigh = result.estimatedValueHigh.toFixed(2);
  const difficultyColor = DIFFICULTY_COLORS[result.difficulty] ?? '#555';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.objectName}>{result.objectName}</Text>

      <View style={styles.valueCard}>
        <Text style={styles.valueLabel}>Estimated Scrap Value</Text>
        <Text style={styles.valueAmount}>
          ${totalLow} – ${totalHigh}
        </Text>
        <View style={[styles.difficultyBadge, { backgroundColor: difficultyColor }]}>
          <Text style={styles.difficultyText}>{result.difficulty.toUpperCase()} to disassemble</Text>
        </View>
      </View>

      {sessionCount > 1 && (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionLabel}>Session Total ({sessionCount} items)</Text>
          <Text style={styles.sessionAmount}>
            ${sessionTotalLow.toFixed(2)} – ${sessionTotalHigh.toFixed(2)}
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Metal Breakdown</Text>
      {result.metals.map((metal, i) => (
        <View key={i} style={styles.metalRow}>
          <View style={styles.metalInfo}>
            <Text style={styles.metalType}>{metal.type}</Text>
            <Text style={styles.metalWeight}>{metal.weightRange}</Text>
          </View>
          <View style={styles.metalValue}>
            <Text style={styles.metalValueText}>
              ${metal.valueLow.toFixed(2)} – ${metal.valueHigh.toFixed(2)}
            </Text>
            <Text style={styles.metalPercent}>{metal.percentage}%</Text>
          </View>
        </View>
      ))}

      {result.safetyWarnings.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>⚠️ Safety Warnings</Text>
          {result.safetyWarnings.map((w, i) => (
            <View key={i} style={styles.warningRow}>
              <Text style={styles.warningText}>• {w}</Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>Extraction Steps</Text>
      {result.extractionSteps.map((step, i) => (
        <View key={i} style={styles.stepRow}>
          <Text style={styles.stepNumber}>{i + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.scanAgainButton} onPress={onScanAgain}>
        <Text style={styles.scanAgainText}>Scan Another Item</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  objectName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  valueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
    alignItems: 'center',
  },
  valueLabel: {
    fontSize: 13,
    color: '#777',
    marginBottom: 4,
  },
  valueAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1a7f4b',
    marginBottom: 12,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  difficultyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionCard: {
    backgroundColor: '#e8f5ee',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1a7f4b',
  },
  sessionLabel: {
    fontSize: 12,
    color: '#1a7f4b',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a7f4b',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    marginTop: 8,
  },
  metalRow: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metalInfo: {
    flex: 1,
  },
  metalType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
    textTransform: 'capitalize',
  },
  metalWeight: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  metalValue: {
    alignItems: 'flex-end',
  },
  metalValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a7f4b',
  },
  metalPercent: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  warningRow: {
    backgroundColor: '#fff3e0',
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#e08a00',
  },
  warningText: {
    fontSize: 13,
    color: '#7a4a00',
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a7f4b',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
    flexShrink: 0,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  scanAgainButton: {
    backgroundColor: '#1a7f4b',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  scanAgainText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
