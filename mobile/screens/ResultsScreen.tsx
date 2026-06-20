import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import type { ScanResult } from './CameraScreen.js';

type Props = {
  result: ScanResult;
  onScanAgain: () => void;
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#1a7f4b',
  moderate: '#e08a00',
  hard: '#c0392b',
};

export default function ResultsScreen({ result, onScanAgain }: Props) {
  const totalLow = result.estimatedValueLow.toFixed(2);
  const totalHigh = result.estimatedValueHigh.toFixed(2);
  const difficultyColor = DIFFICULTY_COLORS[result.difficulty] ?? '#555';
  const detectedManufacturer = result.batteryPassport.manufacturer ?? 'Unknown';
  const detectedChemistry = result.batteryPassport.chemistry ?? 'Unknown';

  // Value card slide-up entrance
  const cardSlide = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  // Value amount glow pulse
  const valueGlow = useRef(new Animated.Value(0)).current;
  // Staggered metal rows
  const metalAnims = useRef(result.metals.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Card entrance
    Animated.parallel([
      Animated.timing(cardSlide, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();

    // Staggered metal rows (start after card)
    Animated.stagger(
      80,
      metalAnims.map((anim: Animated.Value) =>
        Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ),
    ).start();

    // Value glow pulse (loops)
    Animated.loop(
      Animated.sequence([
        Animated.timing(valueGlow, { toValue: 1, duration: 1200, useNativeDriver: false }),
        Animated.timing(valueGlow, { toValue: 0, duration: 1200, useNativeDriver: false }),
      ]),
    ).start();
  }, [cardSlide, cardOpacity, valueGlow, metalAnims]);

  const glowColor = valueGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1a7f4b', '#5dffa8'],
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.objectName}>{result.objectName}</Text>

      <Animated.View
        style={[
          styles.valueCard,
          { opacity: cardOpacity, transform: [{ translateY: cardSlide }] },
        ]}
      >
        <Text style={styles.valueLabel}>Estimated Scrap Value</Text>
        <Animated.Text style={[styles.valueAmount, { color: glowColor }]}>
          ${totalLow} – ${totalHigh}
        </Animated.Text>
        <View style={[styles.difficultyBadge, { backgroundColor: difficultyColor }]}>
          <Text style={styles.difficultyText}>{result.difficulty.toUpperCase()} to disassemble</Text>
        </View>
      </Animated.View>

      {result.era && (
        <View style={styles.eraCard}>
          <Text style={styles.eraTitle}>🏭 Manufacturing Era</Text>
          {result.era.profile ? (
            <>
              <Text style={styles.eraLabel}>{result.era.profile.label}</Text>
              <Text style={styles.eraYears}>
                {result.era.profile.yearsLabel}
                {result.era.decoded.year ? `  ·  Built ~${result.era.decoded.year}` : ''}
                {`  ·  ${result.era.decoded.confidence} confidence`}
              </Text>
              <View style={styles.eraSpecRow}>
                <Text style={styles.eraSpecLabel}>Structure</Text>
                <Text style={styles.eraSpecValue}>{result.era.profile.structuralMaterial}</Text>
              </View>
              <View style={styles.eraSpecRow}>
                <Text style={styles.eraSpecLabel}>Motor winding</Text>
                <Text style={styles.eraSpecValue}>{result.era.profile.motorWinding}</Text>
              </View>
              <View style={styles.eraSpecRow}>
                <Text style={styles.eraSpecLabel}>Typical washer wt.</Text>
                <Text style={styles.eraSpecValue}>
                  {result.era.profile.washerWeightLbs.low}–{result.era.profile.washerWeightLbs.high} lbs
                </Text>
              </View>
              {result.era.profile.insights.map((insight, i) => (
                <Text key={i} style={styles.eraInsight}>• {insight}</Text>
              ))}
            </>
          ) : (
            <Text style={styles.eraNote}>
              {result.era.decoded.note ?? 'Could not determine the manufacturing year from this serial number.'}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Metal Breakdown</Text>
      {result.metals.map((metal, i) => (
        <Animated.View
          key={i}
          style={[
            styles.metalRow,
            {
              opacity: metalAnims[i],
              transform: [
                {
                  translateX: metalAnims[i]!.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            },
          ]}
        >
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
        </Animated.View>
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

      <Text style={styles.sectionTitle}>🔋 Battery Passport</Text>
      <View style={styles.eraCard}>
        <Text style={styles.eraLabel}>{result.batteryPassport.complianceStatus.toUpperCase()}</Text>
        <View style={styles.eraSpecRow}>
          <Text style={styles.eraSpecLabel}>State of health</Text>
          <Text style={styles.eraSpecValue}>
            {result.batteryPassport.stateOfHealthPct != null ? `${result.batteryPassport.stateOfHealthPct}%` : 'Not detected'}
          </Text>
        </View>
        <View style={styles.eraSpecRow}>
          <Text style={styles.eraSpecLabel}>Cycle count</Text>
          <Text style={styles.eraSpecValue}>
            {result.batteryPassport.cycleCount != null ? result.batteryPassport.cycleCount : 'Not detected'}
          </Text>
        </View>
        <View style={styles.eraSpecRow}>
          <Text style={styles.eraSpecLabel}>Manufacturer</Text>
          <Text style={styles.eraSpecValue}>{detectedManufacturer}</Text>
        </View>
        <View style={styles.eraSpecRow}>
          <Text style={styles.eraSpecLabel}>Chemistry</Text>
          <Text style={styles.eraSpecValue}>{detectedChemistry}</Text>
        </View>
        {result.batteryPassport.captureRecommendations.map((r, i) => (
          <Text key={i} style={styles.eraInsight}>• {r}</Text>
        ))}
      </View>

      <Text style={styles.sectionTitle}>📈 Live Battery Pricing Roadmap</Text>
      {result.liveBatteryPricingRoadmap.map((step, i) => (
        <View key={i} style={styles.stepRow}>
          <Text style={styles.stepNumber}>{i + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

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
  eraCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#1a7f4b',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  eraTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  eraLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a7f4b',
  },
  eraYears: {
    fontSize: 12,
    color: '#777',
    marginBottom: 10,
    textTransform: 'capitalize',
  },
  eraSpecRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  eraSpecLabel: {
    fontSize: 13,
    color: '#888',
    flexShrink: 0,
    marginRight: 12,
  },
  eraSpecValue: {
    fontSize: 13,
    color: '#222',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  eraInsight: {
    fontSize: 13,
    color: '#444',
    lineHeight: 20,
    marginTop: 8,
  },
  eraNote: {
    fontSize: 13,
    color: '#777',
    fontStyle: 'italic',
    marginTop: 4,
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
