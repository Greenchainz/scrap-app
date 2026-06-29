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
import YardComparison from './YardComparison.js';
import { C, purpleGlow, aquaGlow, softShadow } from '../theme.js';

type Props = {
  result: ScanResult;
  onScanAgain: () => void;
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy:     C.success,
  moderate: C.warning,
  hard:     C.danger,
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
    outputRange: [C.aqua, C.aquaBright],
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
      {/* Battery compliance info (when AI detected a battery) */}
      {result.battery && (
        <View style={styles.batteryCard}>
          <Text style={styles.batteryTitle}>🔋 Battery Info</Text>
          {result.battery.chemistry && (
            <View style={styles.batteryRow}>
              <Text style={styles.batteryLabel}>Chemistry</Text>
              <Text style={styles.batteryValue}>{result.battery.chemistry}</Text>
            </View>
          )}
          {result.battery.stateOfHealth && (
            <View style={styles.batteryRow}>
              <Text style={styles.batteryLabel}>State of Health</Text>
              <Text style={styles.batteryValue}>{result.battery.stateOfHealth}</Text>
            </View>
          )}
          {result.battery.cycleCount != null && (
            <View style={styles.batteryRow}>
              <Text style={styles.batteryLabel}>Cycle Count</Text>
              <Text style={styles.batteryValue}>{result.battery.cycleCount}</Text>
            </View>
          )}
          <View style={styles.batteryRow}>
            <Text style={styles.batteryLabel}>Digital Battery Passport</Text>
            <Text style={styles.batteryValue}>
              {result.battery.batteryPassportPresent === true
                ? '✅ Present'
                : result.battery.batteryPassportPresent === false
                  ? '❌ Not visible'
                  : 'Unknown'}
            </Text>
          </View>
          {result.battery.batteryPassportPresent !== true && (
            <Text style={styles.batteryNote}>
              EU Battery Regulation 2023/1542: Digital Battery Passport mandatory for traction
              batteries ≥ 2 kWh from Feb 2027. Scan QR/NFC label if present.
            </Text>
          )}
        </View>
      )}

      {/* Per-yard payout comparison */}
      <YardComparison
        metals={result.metals}
        latitude={result.latitude}
        longitude={result.longitude}
        state={result.state}
      />

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
    backgroundColor: C.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  objectName: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    marginBottom: 16,
    textShadowColor: C.aquaDim,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  valueCard: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 16,
    padding: 22,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.borderPurple,
    ...purpleGlow,
  },
  valueLabel: {
    fontSize: 13,
    color: C.textSub,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  valueAmount: {
    fontSize: 38,
    fontWeight: '800',
    color: C.aqua,
    marginBottom: 12,
    textShadowColor: C.aqua,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    opacity: 0.9,
  },
  difficultyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  eraCard: {
    backgroundColor: C.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    borderLeftColor: C.aqua,
    ...softShadow,
  },
  eraTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
  },
  eraLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: C.aqua,
  },
  eraYears: {
    fontSize: 12,
    color: C.textSub,
    marginBottom: 10,
    textTransform: 'capitalize',
  },
  eraSpecRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
  },
  eraSpecLabel: {
    fontSize: 13,
    color: C.textMuted,
    flexShrink: 0,
    marginRight: 12,
  },
  eraSpecValue: {
    fontSize: 13,
    color: C.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  eraInsight: {
    fontSize: 13,
    color: C.textSub,
    lineHeight: 20,
    marginTop: 8,
  },
  eraNote: {
    fontSize: 13,
    color: C.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textAqua,
    marginBottom: 8,
    marginTop: 10,
    letterSpacing: 0.2,
  },
  metalRow: {
    backgroundColor: C.bgCard,
    borderRadius: 10,
    padding: 12,
    marginBottom: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  metalInfo: {
    flex: 1,
  },
  metalType: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
    textTransform: 'capitalize',
  },
  metalWeight: {
    fontSize: 12,
    color: C.textSub,
    marginTop: 2,
  },
  metalValue: {
    alignItems: 'flex-end',
  },
  metalValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.aqua,
  },
  metalPercent: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  warningRow: {
    backgroundColor: 'rgba(255,190,11,0.10)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: C.warning,
  },
  warningText: {
    fontSize: 13,
    color: C.warning,
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
    backgroundColor: C.purple,
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
    color: C.textSub,
    lineHeight: 22,
  },
  scanAgainButton: {
    backgroundColor: C.aqua,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
    ...aquaGlow,
  },
  scanAgainText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: '800',
  },
  batteryCard: {
    backgroundColor: C.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.borderPurple,
    borderLeftWidth: 3,
    borderLeftColor: C.purpleLight,
    ...softShadow,
  },
  batteryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    marginBottom: 10,
  },
  batteryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
  },
  batteryLabel: {
    fontSize: 13,
    color: C.textMuted,
    flexShrink: 0,
    marginRight: 12,
  },
  batteryValue: {
    fontSize: 13,
    color: C.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  batteryNote: {
    fontSize: 11,
    color: C.textMuted,
    lineHeight: 16,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
