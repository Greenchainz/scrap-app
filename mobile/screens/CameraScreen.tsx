import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { trpc } from '../utils/trpc.js';
import { cacheScan } from '../utils/cache.js';

type Props = {
  onScanComplete: (result: ScanResult) => void;
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
};

export default function CameraScreen({ onScanComplete }: Props) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [facing] = useState<CameraType>('back');
  const [analyzing, setAnalyzing] = useState(false);
  const [yearInput, setYearInput] = useState('');
  const cameraRef = useRef<CameraView>(null);

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
        manufactureYear: (() => {
          const y = parseInt(yearInput, 10);
          return !isNaN(y) && y >= 1900 && y <= 2026 ? y : undefined;
        })(),
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.overlay}>
          <View style={styles.yearRow}>
            <TextInput
              style={styles.yearInput}
              placeholder="Year made (optional)"
              placeholderTextColor="rgba(255,255,255,0.6)"
              keyboardType="number-pad"
              maxLength={4}
              value={yearInput}
              onChangeText={setYearInput}
              returnKeyType="done"
            />
          </View>
          {analyzing ? (
            <View style={styles.analyzingContainer}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.analyzingText}>Analyzing metals...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          )}
        </View>
      </CameraView>
    </KeyboardAvoidingView>
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
  yearRow: {
    width: '100%',
    paddingHorizontal: 32,
    marginBottom: 20,
    alignItems: 'center',
  },
  yearInput: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    width: 200,
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
  analyzingContainer: {
    alignItems: 'center',
    gap: 12,
    paddingBottom: 48,
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
