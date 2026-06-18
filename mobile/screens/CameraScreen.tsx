import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { trpc } from '../utils/trpc.js';
import { cacheScan } from '../utils/cache.js';

type Props = {
  onScanComplete: (result: ScanResult) => void;
};

export type DecodedEra = {
  brand: string;
  year: number | null;
  month: number | null;
  candidateYears: number[];
  confidence: 'high' | 'medium' | 'low';
  note?: string;
};

export type EraProfile = {
  epoch: 'heavy_iron' | 'polymer_shift' | 'high_efficiency' | 'smart_ie5';
  label: string;
  yearsLabel: string;
  structuralMaterial: string;
  motorWinding: 'copper' | 'aluminum' | 'mixed';
  washerWeightLbs: { low: number; high: number };
  insights: string[];
};

export type EraInfo = {
  decoded: DecodedEra;
  profile: EraProfile | null;
};

export type ScanResult = {
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
  estimatedValueLow: number;
  estimatedValueHigh: number;
  imageUrl: string;
  era?: EraInfo | null;
};

export default function CameraScreen({ onScanComplete }: Props) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [facing] = useState<CameraType>('back');
  const [analyzing, setAnalyzing] = useState(false);
  const [brand, setBrand] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const cameraRef = useRef<CameraView>(null);

  // Pulsing glow ring behind capture button
  const glowScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.6)).current;
  // Radar spin while analyzing — store loop ref so we can stop it cleanly
  const radarRotation = useRef(new Animated.Value(0)).current;
  const radarLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Glow pulse — always running
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 1.45, duration: 900, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    ).start();
  }, [glowScale, glowOpacity]);

  useEffect(() => {
    if (analyzing) {
      radarRotation.setValue(0);
      radarLoopRef.current = Animated.loop(
        Animated.timing(radarRotation, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      );
      radarLoopRef.current.start();
    } else {
      radarLoopRef.current?.stop();
      radarLoopRef.current = null;
      radarRotation.setValue(0);
    }
  }, [analyzing, radarRotation]);

  const radarSpin = radarRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getSasToken = trpc.scrap.getSasToken.useMutation();
  const analyzeImage = trpc.scrap.analyzeImage.useMutation();

  if (!cameraPermission) {
    return <View style={styles.container} />;
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera access is needed to scan scrap metal.</Text>
        <TouchableOpacity style={styles.button} onPress={requestCameraPermission}>
          <Text style={styles.buttonText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || analyzing) return;
    setAnalyzing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo) throw new Error('Failed to capture photo');

      const filename = `scan-${Date.now()}.jpg`;
      const { uploadUrl, blobUrl } = await getSasToken.mutateAsync({ filename });

      const photoData = await fetch(photo.uri);
      const blob = await photoData.blob();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': 'image/jpeg',
        },
      });

      if (!uploadResponse.ok) throw new Error('Upload failed');

      let latitude: number | undefined;
      let longitude: number | undefined;
      let state: string | undefined;

      const locationPermission = await Location.requestForegroundPermissionsAsync();
      if (locationPermission.status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;

        const geocode = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });
        state = geocode[0]?.region ?? undefined;
      }

      const result = await analyzeImage.mutateAsync({
        imageUrl: blobUrl,
        latitude,
        longitude,
        state,
        brand: brand.trim() || undefined,
        serialNumber: serialNumber.trim() || undefined,
      });

      const scanResult: ScanResult = { ...result, imageUrl: blobUrl };

      await cacheScan({ ...scanResult, cachedAt: new Date().toISOString() });
      onScanComplete(scanResult);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Analysis failed. Try better lighting or a clearer angle.';
      Alert.alert('Scan Failed', message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.overlay}>
          {analyzing ? (
            <View style={styles.analyzingContainer}>
              {/* Radar spin ring */}
              <View style={styles.radarWrapper}>
                <Animated.View
                  style={[styles.radarRing, { transform: [{ rotate: radarSpin }] }]}
                />
                <ActivityIndicator size="large" color="#ffffff" style={styles.radarSpinner} />
              </View>
              <Text style={styles.analyzingText}>Analyzing metals...</Text>
            </View>
          ) : (
            <>
              <View style={styles.inputPanel}>
                <Text style={styles.inputHint}>Add brand + serial to unlock manufacturing-era insights</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Brand (optional, e.g. Whirlpool)"
                  placeholderTextColor="rgba(255,255,255,0.7)"
                  value={brand}
                  onChangeText={setBrand}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Serial # (optional)"
                  placeholderTextColor="rgba(255,255,255,0.7)"
                  value={serialNumber}
                  onChangeText={setSerialNumber}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              {/* Pulsing glow ring + capture button */}
              <View style={styles.captureWrapper}>
                <Animated.View
                  style={[
                    styles.glowRing,
                    { transform: [{ scale: glowScale }], opacity: glowOpacity },
                  ]}
                />
                <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                  <View style={styles.captureInner} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  captureWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(26, 127, 75, 0.55)',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
  },
  inputPanel: {
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 24,
    gap: 8,
  },
  inputHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
  },
  analyzingContainer: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 48,
  },
  radarWrapper: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#1a7f4b',
    borderTopColor: 'transparent',
  },
  radarSpinner: {
    position: 'absolute',
  },
  analyzingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#333',
  },
  button: {
    backgroundColor: '#1a7f4b',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
