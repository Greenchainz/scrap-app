import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { trpc } from '../utils/trpc.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

type VehicleIdentity = {
  vin?: string;
  year?: number;
  make?: string;
  vehicleClass: string;
  curbWeightLbs?: number;
  vehicleLabel?: string; // e.g. "2012 Honda Accord · 3,279 lbs"
  nhtsa: boolean;        // true = weight came from NHTSA
};

type Props = {
  onBack: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND_GREEN = '#1a7f4b';
const CONDITION_OPTIONS = [
  { id: 'runs_drives',   emoji: '✅', label: 'Runs & Drives',      sub: 'Drives under its own power' },
  { id: 'starts_moves',  emoji: '🟡', label: 'Starts / Limps',     sub: 'Engine starts, limited movement' },
  { id: 'dead_no_start', emoji: '🔴', label: 'Dead / No Start',    sub: 'Won\'t start at all' },
  { id: 'junk_stripped', emoji: '⚫', label: 'Stripped / Junk',    sub: 'Parts removed, shell only' },
] as const;

const VEHICLE_CLASS_OPTIONS = [
  { id: 'subcompact_car',  label: 'Subcompact Car' },
  { id: 'compact_car',     label: 'Compact Car' },
  { id: 'midsize_sedan',   label: 'Mid-Size Sedan' },
  { id: 'fullsize_sedan',  label: 'Full-Size Sedan' },
  { id: 'compact_suv',     label: 'Compact SUV/Crossover' },
  { id: 'midsize_suv',     label: 'Mid-Size SUV' },
  { id: 'fullsize_suv',    label: 'Full-Size SUV' },
  { id: 'compact_pickup',  label: 'Compact Pickup' },
  { id: 'fullsize_pickup', label: 'Full-Size Pickup' },
  { id: 'minivan',         label: 'Minivan' },
  { id: 'sports_car',      label: 'Sports Car/Coupe' },
  { id: 'large_van',       label: 'Large Van' },
] as const;

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function VehicleValuationScreen({ onBack }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [vinScanActive, setVinScanActive] = useState(false);
  const [identity, setIdentity] = useState<VehicleIdentity>({ vehicleClass: 'midsize_sedan', nhtsa: false });
  const [yearText, setYearText]   = useState('');
  const [makeText, setMakeText]   = useState('');
  const [weightLoading, setWeightLoading] = useState(false);

  // Step 2
  const [condition, setCondition] = useState('dead_no_start');
  const [mileageText, setMileageText] = useState('');
  const [mileageScanActive, setMileageScanActive] = useState(false);
  const [mileageOcrLoading, setMileageOcrLoading] = useState(false);

  // Step 3
  const [hasCat, setHasCat] = useState<boolean | null>(null);
  const [catIsOem, setCatIsOem] = useState(true);
  const [catType, setCatType] = useState('unknown');
  const [catScanActive, setCatScanActive] = useState(false);
  const [catOcrLoading, setCatOcrLoading] = useState(false);
  const [catOcrResult, setCatOcrResult] = useState<{ catType: string; valueLow: number; valueHigh: number; confidence: string; notes: string } | null>(null);

  // Step 4
  const [result, setResult] = useState<any>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  const [location, setLocation] = useState<{ latitude: number; longitude: number; state?: string } | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Animated value for step 4 results entrance
  const resultSlide = useRef(new Animated.Value(40)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  // tRPC mutations / queries
  const lookupWeight    = trpc.vehicle.lookupVehicleWeight.useQuery(
    { vin: identity.vin, year: identity.vin ? undefined : Number(yearText) || undefined, make: identity.vin ? undefined : makeText || undefined },
    { enabled: false },
  );
  const inferCatType    = trpc.vehicle.inferCatType.useQuery(
    { make: makeText || identity.make || 'unknown' },
    { enabled: false },
  );
  const getSasToken     = trpc.scrap.getSasToken.useMutation();
  const analyzeCat      = trpc.vehicle.analyzeCatFromImage.useMutation();
  const extractMileage  = trpc.vehicle.extractMileageFromImage.useMutation();
  const estimateVehicle = trpc.vehicle.estimateVehicle.useMutation();

  // ── Location helper ──────────────────────────────────────────────────────────
  const getLocation = useCallback(async () => {
    if (location) return location;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({});
      const geo = await Location.reverseGeocodeAsync(pos.coords);
      const loc = {
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
        state:     geo[0]?.region ?? undefined,
      };
      setLocation(loc);
      return loc;
    } catch { return null; }
  }, [location]);

  // ── Photo upload helper ───────────────────────────────────────────────────────
  const takePhotoAndUpload = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    if (!photo) return null;
    const filename = `vehicle-${Date.now()}.jpg`;
    const { uploadUrl, blobUrl } = await getSasToken.mutateAsync({ filename });
    const blob = await (await fetch(photo.uri)).blob();
    const res  = await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'image/jpeg' },
    });
    return res.ok ? blobUrl : null;
  }, [getSasToken]);

  // ── Step 1: VIN barcode scanned ───────────────────────────────────────────────
  const handleVinScanned = useCallback(async ({ data }: { data: string }) => {
    // Extract 17-char VIN (strips padding from some barcode formats)
    const vin = data.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(-17);
    if (vin.length !== 17) return;
    setVinScanActive(false);
    setWeightLoading(true);
    try {
      const res = await lookupWeight.refetch();
      const wt  = res.data?.curbWeightLbs;
      setIdentity(prev => ({
        ...prev,
        vin,
        curbWeightLbs: wt ?? undefined,
        vehicleLabel:  wt ? `VIN: ${vin.slice(0, 8)}… · ${wt.toLocaleString()} lbs` : `VIN: ${vin.slice(0, 8)}…`,
        nhtsa: !!wt,
      }));
    } catch {
      setIdentity(prev => ({ ...prev, vin }));
    } finally {
      setWeightLoading(false);
    }
  }, [lookupWeight]);

  // ── Step 1 → 2: look up weight from year/make ─────────────────────────────────
  const handleStep1Continue = useCallback(async () => {
    const year = Number(yearText);
    const make = makeText.trim();
    if (!identity.vin && (!year || year < 1970 || year > 2030 || !make)) {
      Alert.alert('Missing info', 'Enter a year and make — or scan the VIN barcode.');
      return;
    }
    // Try to look up NHTSA weight if we have year+make but no VIN
    if (!identity.vin && year && make && !identity.curbWeightLbs) {
      setWeightLoading(true);
      try {
        const res = await lookupWeight.refetch();
        const wt  = res.data?.curbWeightLbs;
        if (wt) {
          setIdentity(prev => ({
            ...prev,
            year, make,
            curbWeightLbs: wt,
            vehicleLabel:  `${year} ${make} · ${wt.toLocaleString()} lbs (NHTSA)`,
            nhtsa: true,
          }));
        } else {
          setIdentity(prev => ({ ...prev, year, make }));
        }
      } catch {
        setIdentity(prev => ({ ...prev, year, make }));
      } finally {
        setWeightLoading(false);
      }
    }
    // Infer cat type from make
    try {
      const res = await inferCatType.refetch();
      if (res.data?.catType) setCatType(res.data.catType);
    } catch { /* best effort */ }
    setStep(2);
  }, [yearText, makeText, identity, lookupWeight, inferCatType]);

  // ── Step 3: cat photo OCR ─────────────────────────────────────────────────────
  const handleCatPhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    setCatOcrLoading(true);
    try {
      const blobUrl = await takePhotoAndUpload();
      if (!blobUrl) throw new Error('Upload failed');
      const res = await analyzeCat.mutateAsync({ imageUrl: blobUrl });
      setCatOcrResult(res);
      setCatType(res.catType);
      if (res.isOem !== null) setCatIsOem(res.isOem);
      if (res.catType !== 'ev') setHasCat(true);
      if (res.catType === 'ev') setHasCat(false);
    } catch (e) {
      Alert.alert('Scan failed', 'Could not identify the converter — try better lighting.');
    } finally {
      setCatOcrLoading(false);
      setCatScanActive(false);
    }
  }, [takePhotoAndUpload, analyzeCat]);

  // ── Step 2: mileage OCR ───────────────────────────────────────────────────────
  const handleMileagePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    setMileageOcrLoading(true);
    try {
      const blobUrl = await takePhotoAndUpload();
      if (!blobUrl) throw new Error('Upload failed');
      const res = await extractMileage.mutateAsync({ imageUrl: blobUrl });
      if (res.mileage) setMileageText(String(res.mileage));
      else Alert.alert('Could not read', 'Point directly at the odometer digits and try again.');
    } catch {
      Alert.alert('Scan failed', 'Odometer scan failed — enter mileage manually.');
    } finally {
      setMileageOcrLoading(false);
      setMileageScanActive(false);
    }
  }, [takePhotoAndUpload, extractMileage]);

  // ── Step 4: get estimate ──────────────────────────────────────────────────────
  const handleGetEstimate = useCallback(async () => {
    if (hasCat === null) {
      Alert.alert('Missing info', 'Tell us whether the car has a catalytic converter.');
      return;
    }
    setEstimateLoading(true);
    setStep(4);
    try {
      const loc = await getLocation();
      const res = await estimateVehicle.mutateAsync({
        vehicleClass:    identity.vehicleClass as any,
        condition:       condition as any,
        hasCatConverter: hasCat,
        catType:         catType as any,
        catIsOem,
        make:            identity.make ?? makeText.trim() || undefined,
        year:            identity.year ?? Number(yearText) || undefined,
        mileage:         Number(mileageText) || undefined,
        curbWeightLbs:   identity.curbWeightLbs,
        latitude:        loc?.latitude,
        longitude:       loc?.longitude,
        state:           loc?.state,
      });
      setResult(res);
      Animated.parallel([
        Animated.timing(resultSlide,   { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(resultOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]).start();
    } catch (e) {
      Alert.alert('Error', 'Could not get estimate — check your connection.');
      setStep(3);
    } finally {
      setEstimateLoading(false);
    }
  }, [hasCat, catType, catIsOem, condition, identity, makeText, yearText, mileageText, estimateVehicle, getLocation, resultSlide, resultOpacity]);

  // ─── Camera overlay (shared for VIN, mileage, cat) ───────────────────────────

  const isCameraActive = vinScanActive || mileageScanActive || catScanActive;
  const cameraMode: 'vin' | 'mileage' | 'cat' | null =
    vinScanActive ? 'vin' : mileageScanActive ? 'mileage' : catScanActive ? 'cat' : null;

  if (isCameraActive) {
    if (!cameraPermission?.granted) {
      return (
        <View style={styles.permBox}>
          <Text style={styles.permText}>Camera access required.</Text>
          <TouchableOpacity style={styles.btn} onPress={requestCameraPermission}>
            <Text style={styles.btnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnOutline, { marginTop: 8 }]}
            onPress={() => { setVinScanActive(false); setMileageScanActive(false); setCatScanActive(false); }}>
            <Text style={[styles.btnText, { color: BRAND_GREEN }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={cameraMode === 'vin'
            ? { barcodeTypes: ['code39', 'code128', 'pdf417', 'datamatrix', 'qr'] }
            : undefined}
          onBarcodeScanned={cameraMode === 'vin' ? handleVinScanned : undefined}
        >
          <View style={styles.camOverlay}>
            {/* Targeting guide */}
            <View style={cameraMode === 'vin' ? styles.vinGuide : styles.catGuide}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {cameraMode === 'vin' && (
                <Text style={styles.guideLabel}>Aim at VIN barcode on dash or door jamb</Text>
              )}
              {(cameraMode === 'mileage' || cameraMode === 'cat') && (
                <Text style={styles.guideLabel}>
                  {cameraMode === 'mileage' ? 'Aim at odometer' : 'Point at catalytic converter or vehicle'}
                </Text>
              )}
            </View>

            {/* Action row */}
            <View style={styles.camBottom}>
              {(mileageOcrLoading || catOcrLoading) ? (
                <View style={styles.analyzeRow}>
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={styles.analyzeText}>
                    {catOcrLoading ? 'Identifying converter…' : 'Reading mileage…'}
                  </Text>
                </View>
              ) : (
                <View style={styles.camActionRow}>
                  <TouchableOpacity
                    style={styles.camCancelBtn}
                    onPress={() => { setVinScanActive(false); setMileageScanActive(false); setCatScanActive(false); }}>
                    <Text style={styles.camCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  {(cameraMode === 'mileage' || cameraMode === 'cat') && (
                    <TouchableOpacity
                      style={styles.captureBtn}
                      onPress={cameraMode === 'mileage' ? handleMileagePhoto : handleCatPhoto}>
                      <View style={styles.captureInner} />
                    </TouchableOpacity>
                  )}

                  {cameraMode === 'vin' && (
                    <Text style={styles.vinScanHint}>Auto-detects VIN barcode</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // ─── Step renders ─────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={step > 1 ? () => setStep(s => (s - 1) as Step) : onBack}>
          <Text style={styles.headerBack}>← {step > 1 ? 'Back' : 'Scan Metal'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🚗 Whole Car Value</Text>
        <View style={styles.stepDots}>
          {([1, 2, 3, 4] as const).map(s => (
            <View key={s} style={[styles.stepDot, s === step && styles.stepDotActive, s < step && styles.stepDotDone]} />
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        {step === 1 && (
          <Step1
            identity={identity}
            yearText={yearText}
            makeText={makeText}
            weightLoading={weightLoading}
            vehicleClass={identity.vehicleClass}
            onYearChange={setYearText}
            onMakeChange={setMakeText}
            onVehicleClassChange={vc => setIdentity(p => ({ ...p, vehicleClass: vc }))}
            onScanVin={() => setVinScanActive(true)}
            onContinue={handleStep1Continue}
          />
        )}
        {step === 2 && (
          <Step2
            condition={condition}
            mileageText={mileageText}
            mileageOcrLoading={mileageOcrLoading}
            onConditionChange={setCondition}
            onMileageChange={setMileageText}
            onScanMileage={() => setMileageScanActive(true)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3
            hasCat={hasCat}
            catIsOem={catIsOem}
            catType={catType}
            catOcrResult={catOcrResult}
            catOcrLoading={catOcrLoading}
            make={identity.make ?? makeText}
            onHasCatChange={setHasCat}
            onCatIsOemChange={setCatIsOem}
            onCatTypeChange={setCatType}
            onScanCat={() => setCatScanActive(true)}
            onGetEstimate={handleGetEstimate}
          />
        )}
        {step === 4 && (
          <Step4
            loading={estimateLoading}
            result={result}
            slideAnim={resultSlide}
            opacityAnim={resultOpacity}
            onStartOver={() => {
              setStep(1);
              setIdentity({ vehicleClass: 'midsize_sedan', nhtsa: false });
              setYearText(''); setMakeText('');
              setCondition('dead_no_start'); setMileageText('');
              setHasCat(null); setCatType('unknown'); setCatIsOem(true);
              setCatOcrResult(null); setResult(null);
              resultSlide.setValue(40); resultOpacity.setValue(0);
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ─── Step 1 — Vehicle Identity ────────────────────────────────────────────────

function Step1({ identity, yearText, makeText, weightLoading, vehicleClass, onYearChange, onMakeChange, onVehicleClassChange, onScanVin, onContinue }: {
  identity: VehicleIdentity; yearText: string; makeText: string;
  weightLoading: boolean; vehicleClass: string;
  onYearChange: (t: string) => void; onMakeChange: (t: string) => void;
  onVehicleClassChange: (id: string) => void;
  onScanVin: () => void; onContinue: () => void;
}) {
  return (
    <View>
      <Text style={styles.stepTitle}>What vehicle are you selling?</Text>

      {/* VIN scan CTA */}
      <TouchableOpacity style={styles.vinScanBtn} onPress={onScanVin}>
        <Text style={styles.vinScanBtnIcon}>📷</Text>
        <View>
          <Text style={styles.vinScanBtnTitle}>Scan VIN Barcode</Text>
          <Text style={styles.vinScanBtnSub}>Dashboard or driver's door jamb · auto-fills vehicle</Text>
        </View>
      </TouchableOpacity>

      {identity.vehicleLabel && (
        <View style={styles.nhtsaBadge}>
          <Text style={styles.nhtsaBadgeText}>✅ {identity.vehicleLabel}</Text>
          {identity.nhtsa && <Text style={styles.nhtsaSource}>Weight from NHTSA</Text>}
        </View>
      )}

      {weightLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={BRAND_GREEN} />
          <Text style={styles.loadingText}>Looking up vehicle…</Text>
        </View>
      )}

      <Text style={styles.orDivider}>— or enter manually —</Text>

      <Text style={styles.fieldLabel}>Year</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2012"
        placeholderTextColor="#999"
        value={yearText}
        onChangeText={onYearChange}
        keyboardType="number-pad"
        maxLength={4}
      />

      <Text style={styles.fieldLabel}>Make</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Honda"
        placeholderTextColor="#999"
        value={makeText}
        onChangeText={onMakeChange}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <Text style={styles.fieldLabel}>Vehicle Type</Text>
      <View style={styles.chipGrid}>
        {VEHICLE_CLASS_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.chip, vehicleClass === opt.id && styles.chipActive]}
            onPress={() => onVehicleClassChange(opt.id)}>
            <Text style={[styles.chipText, vehicleClass === opt.id && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 2 — Condition + Mileage ─────────────────────────────────────────────

function Step2({ condition, mileageText, mileageOcrLoading, onConditionChange, onMileageChange, onScanMileage, onContinue }: {
  condition: string; mileageText: string; mileageOcrLoading: boolean;
  onConditionChange: (id: string) => void; onMileageChange: (t: string) => void;
  onScanMileage: () => void; onContinue: () => void;
}) {
  const miles = Number(mileageText);
  const mileageNote =
    miles > 250_000 ? '⚠️ >250k miles — running premium removed, scrap value only' :
    miles > 150_000 ? '🟡 150k–250k miles — reduced running premium' :
    miles > 0       ? '✅ Under 150k — full running premium applies' : null;

  return (
    <View>
      <Text style={styles.stepTitle}>How does it run?</Text>
      {CONDITION_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.id}
          style={[styles.conditionRow, condition === opt.id && styles.conditionRowActive]}
          onPress={() => onConditionChange(opt.id)}>
          <Text style={styles.conditionEmoji}>{opt.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.conditionLabel, condition === opt.id && styles.conditionLabelActive]}>
              {opt.label}
            </Text>
            <Text style={styles.conditionSub}>{opt.sub}</Text>
          </View>
          {condition === opt.id && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>
      ))}

      <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Mileage (optional)</Text>
      <Text style={styles.fieldHint}>Affects running car premium — skip if you don't know</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1, marginRight: 8 }]}
          placeholder="e.g. 145000"
          placeholderTextColor="#999"
          value={mileageText}
          onChangeText={onMileageChange}
          keyboardType="number-pad"
        />
        <TouchableOpacity style={styles.ocrBtn} onPress={onScanMileage} disabled={mileageOcrLoading}>
          {mileageOcrLoading
            ? <ActivityIndicator size="small" color={BRAND_GREEN} />
            : <Text style={styles.ocrBtnText}>📷 Scan</Text>}
        </TouchableOpacity>
      </View>
      {mileageNote && <Text style={styles.mileageNote}>{mileageNote}</Text>}

      <TouchableOpacity style={styles.primaryBtn} onPress={onContinue}>
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 3 — Catalytic Converter ────────────────────────────────────────────

function Step3({ hasCat, catIsOem, catType, catOcrResult, catOcrLoading, make, onHasCatChange, onCatIsOemChange, onCatTypeChange, onScanCat, onGetEstimate }: {
  hasCat: boolean | null; catIsOem: boolean; catType: string;
  catOcrResult: any; catOcrLoading: boolean; make: string;
  onHasCatChange: (v: boolean) => void; onCatIsOemChange: (v: boolean) => void;
  onCatTypeChange: (id: string) => void; onScanCat: () => void; onGetEstimate: () => void;
}) {
  return (
    <View>
      <Text style={styles.stepTitle}>Catalytic Converter</Text>

      {/* Big camera CTA */}
      <TouchableOpacity style={styles.catScanCTA} onPress={onScanCat} disabled={catOcrLoading}>
        <Text style={styles.catScanIcon}>{catOcrLoading ? '⏳' : '📷'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.catScanTitle}>
            {catOcrLoading ? 'Identifying converter…' : 'Photo ID — Point & Shoot'}
          </Text>
          <Text style={styles.catScanSub}>
            Point at the converter, car underside, or full vehicle — AI identifies type + value
          </Text>
        </View>
        {catOcrLoading && <ActivityIndicator size="small" color={BRAND_GREEN} />}
      </TouchableOpacity>

      {/* OCR result badge */}
      {catOcrResult && (
        <View style={styles.catResultBadge}>
          <View style={styles.catResultHeader}>
            <Text style={styles.catResultTitle}>
              {catOcrResult.confidence === 'high' ? '✅' : catOcrResult.confidence === 'medium' ? '🟡' : '⚠️'} AI Identified
            </Text>
            <Text style={styles.catResultValue}>
              ${catOcrResult.valueLow}–${catOcrResult.valueHigh}
            </Text>
          </View>
          <Text style={styles.catResultNotes}>{catOcrResult.notes}</Text>
          <Text style={styles.catResultConfidence}>Confidence: {catOcrResult.confidence}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Has a catalytic converter?</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.toggleBtn, hasCat === true && styles.toggleBtnActive]}
          onPress={() => onHasCatChange(true)}>
          <Text style={[styles.toggleBtnText, hasCat === true && styles.toggleBtnTextActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, hasCat === false && styles.toggleBtnActive]}
          onPress={() => onHasCatChange(false)}>
          <Text style={[styles.toggleBtnText, hasCat === false && styles.toggleBtnTextActive]}>No / Missing</Text>
        </TouchableOpacity>
      </View>

      {hasCat && (
        <>
          <Text style={styles.sectionLabel}>OEM or Aftermarket?</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleBtn, catIsOem && styles.toggleBtnActive]}
              onPress={() => onCatIsOemChange(true)}>
              <Text style={[styles.toggleBtnText, catIsOem && styles.toggleBtnTextActive]}>🏭 OEM (Factory)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, !catIsOem && styles.toggleBtnDanger]}
              onPress={() => onCatIsOemChange(false)}>
              <Text style={[styles.toggleBtnText, !catIsOem && styles.toggleBtnTextActive]}>🔧 Aftermarket</Text>
            </TouchableOpacity>
          </View>
          {!catIsOem && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠️ Aftermarket cats have minimal PGM content — worth only $5–$50 for scrap.</Text>
            </View>
          )}

          {!catOcrResult && (
            <>
              <Text style={styles.sectionLabel}>Converter Type</Text>
              <Text style={styles.fieldHint}>
                {make ? `Pre-filled from ${make} — adjust if different` : 'Select your converter type'}
              </Text>
            </>
          )}
        </>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, { marginTop: 32, backgroundColor: hasCat === null ? '#aaa' : BRAND_GREEN }]}
        onPress={onGetEstimate}
        disabled={hasCat === null}>
        <Text style={styles.primaryBtnText}>Get Estimate →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 4 — Results ─────────────────────────────────────────────────────────

function Step4({ loading, result, slideAnim, opacityAnim, onStartOver }: {
  loading: boolean; result: any;
  slideAnim: Animated.Value; opacityAnim: Animated.Value; onStartOver: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={BRAND_GREEN} />
        <Text style={styles.loadingBigText}>Calculating value…</Text>
        <Text style={styles.loadingSubText}>Checking local yard prices</Text>
      </View>
    );
  }
  if (!result) return null;

  const low  = result.estimateLow.toFixed(0);
  const high = result.estimateHigh.toFixed(0);
  const condPct = Math.round((result.conditionMultiplier - 1) * 100);

  return (
    <Animated.View style={{ transform: [{ translateY: slideAnim }], opacity: opacityAnim }}>
      {/* Value hero */}
      <View style={styles.valueHero}>
        <Text style={styles.valueLabel}>Estimated Scrap Value</Text>
        <Text style={styles.valueAmount}>${Number(low).toLocaleString()} – ${Number(high).toLocaleString()}</Text>
        <Text style={styles.valueSub}>
          {result.usedLiveData ? '📍 Using live local yard prices' : '📊 Based on market estimates'}
        </Text>
      </View>

      {/* Breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Breakdown</Text>

        {/* Metal line items */}
        {result.metalBreakdown.map((m: any) => (
          <View key={m.metalType} style={styles.lineItem}>
            <Text style={styles.lineItemLabel}>{m.label}</Text>
            <Text style={styles.lineItemValue}>
              ${m.valueLow.toFixed(0)}–${m.valueHigh.toFixed(0)}
            </Text>
          </View>
        ))}

        {/* Cat converter */}
        {result.catConverter.included && (
          <View style={[styles.lineItem, { borderTopWidth: 1, borderTopColor: '#eee', marginTop: 8, paddingTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineItemLabel}>Catalytic Converter</Text>
              <Text style={styles.lineItemSub}>
                {result.catConverter.isOem ? 'OEM' : 'Aftermarket'} · {result.catConverter.catType.replace(/_/g, ' ')}
              </Text>
            </View>
            <Text style={styles.lineItemValue}>
              ${result.catConverter.low}–${result.catConverter.high}
            </Text>
          </View>
        )}

        {/* Condition */}
        <View style={[styles.lineItem, { borderTopWidth: 1, borderTopColor: '#eee', marginTop: 8, paddingTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.lineItemLabel}>Condition Multiplier</Text>
            {result.mileageLimitedPremium && (
              <Text style={styles.lineItemSub}>⚠️ High mileage reduced premium</Text>
            )}
          </View>
          <Text style={[styles.lineItemValue, { color: condPct > 0 ? BRAND_GREEN : condPct < 0 ? '#c0392b' : '#333' }]}>
            {condPct > 0 ? `+${condPct}%` : condPct === 0 ? 'Baseline' : `${condPct}%`}
          </Text>
        </View>

        {/* Weight */}
        <View style={styles.lineItem}>
          <Text style={styles.lineItemLabel}>Vehicle Weight</Text>
          <Text style={styles.lineItemSub2}>{result.vehicleWeightLbs.toLocaleString()} lbs</Text>
        </View>
      </View>

      {/* Start over */}
      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16, backgroundColor: '#555' }]} onPress={onStartOver}>
        <Text style={styles.primaryBtnText}>Value Another Vehicle</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    backgroundColor: BRAND_GREEN,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  headerBack:  { color: '#a8f0c8', fontSize: 14 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  stepDots: { flexDirection: 'row', gap: 6, marginTop: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  stepDotActive: { backgroundColor: '#ffffff' },
  stepDotDone: { backgroundColor: '#a8f0c8' },
  scrollContent: { padding: 16, paddingBottom: 48 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 20, marginBottom: 8 },

  vinScanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: BRAND_GREEN, borderRadius: 12, padding: 16, marginBottom: 12,
  },
  vinScanBtnIcon:  { fontSize: 28 },
  vinScanBtnTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  vinScanBtnSub:   { color: '#a8f0c8', fontSize: 12, marginTop: 2 },

  nhtsaBadge: {
    backgroundColor: '#e8f8f0', borderRadius: 8, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#b8ecd4',
  },
  nhtsaBadgeText: { color: '#1a7f4b', fontWeight: '700', fontSize: 14 },
  nhtsaSource:    { color: '#1a7f4b', fontSize: 11, marginTop: 2 },

  orDivider: { textAlign: 'center', color: '#999', fontSize: 13, marginVertical: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  fieldHint:  { fontSize: 12, color: '#888', marginBottom: 8, marginTop: -4 },

  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#222', backgroundColor: '#fff', marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: '#ccc', backgroundColor: '#f9f9f9',
  },
  chipActive: { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
  chipText:   { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  conditionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, marginBottom: 8, backgroundColor: '#fff',
  },
  conditionRowActive: { borderColor: BRAND_GREEN, backgroundColor: '#e8f8f0' },
  conditionEmoji: { fontSize: 22 },
  conditionLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  conditionLabelActive: { color: BRAND_GREEN },
  conditionSub: { fontSize: 12, color: '#888', marginTop: 2 },
  checkmark: { color: BRAND_GREEN, fontSize: 18, fontWeight: '700' },

  ocrBtn: {
    backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 14,
    paddingVertical: 10, borderWidth: 1, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center', minWidth: 80, marginBottom: 12,
  },
  ocrBtnText: { color: BRAND_GREEN, fontWeight: '600', fontSize: 13 },

  mileageNote: {
    fontSize: 12, color: '#555', backgroundColor: '#fffbe6',
    padding: 10, borderRadius: 8, marginBottom: 8, marginTop: -4,
  },

  catScanCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff7e6', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#f0a500',
  },
  catScanIcon:  { fontSize: 28 },
  catScanTitle: { color: '#7a5000', fontSize: 15, fontWeight: '700' },
  catScanSub:   { color: '#9a7000', fontSize: 12, marginTop: 2 },

  catResultBadge: {
    backgroundColor: '#e8f8f0', borderRadius: 10, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#b8ecd4',
  },
  catResultHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catResultTitle:  { fontWeight: '700', color: '#1a7f4b', fontSize: 14 },
  catResultValue:  { fontWeight: '800', color: BRAND_GREEN, fontSize: 16 },
  catResultNotes:  { color: '#333', fontSize: 13, lineHeight: 18 },
  catResultConfidence: { color: '#888', fontSize: 11, marginTop: 4 },

  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#ddd', alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  toggleBtnActive: { borderColor: BRAND_GREEN, backgroundColor: BRAND_GREEN },
  toggleBtnDanger: { borderColor: '#c0392b', backgroundColor: '#c0392b' },
  toggleBtnText:   { fontWeight: '600', color: '#555', fontSize: 14 },
  toggleBtnTextActive: { color: '#fff' },

  warningBox: {
    backgroundColor: '#fff3cd', borderRadius: 8, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#ffc107',
  },
  warningText: { color: '#7a4f00', fontSize: 13 },

  primaryBtn: {
    backgroundColor: BRAND_GREEN, borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: BRAND_GREEN },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  loadingText: { color: '#666', fontSize: 13 },
  loadingCenter: { alignItems: 'center', paddingTop: 80, gap: 12 },
  loadingBigText: { fontSize: 18, fontWeight: '600', color: '#333' },
  loadingSubText: { fontSize: 14, color: '#888' },

  valueHero: {
    backgroundColor: BRAND_GREEN, borderRadius: 16, padding: 24, marginBottom: 16, alignItems: 'center',
  },
  valueLabel:  { color: '#a8f0c8', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  valueAmount: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  valueSub:    { color: '#a8f0c8', fontSize: 12, marginTop: 8 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#eee',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 12 },
  lineItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  lineItemLabel:  { fontSize: 14, color: '#444' },
  lineItemSub:    { fontSize: 11, color: '#888', marginTop: 1 },
  lineItemSub2:   { fontSize: 13, color: '#666' },
  lineItemValue:  { fontSize: 14, fontWeight: '700', color: '#222' },

  // Camera overlay
  camOverlay: { flex: 1, justifyContent: 'space-between', padding: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32 },
  vinGuide: {
    alignSelf: 'center', marginTop: 80,
    width: 300, height: 100, position: 'relative', justifyContent: 'center', alignItems: 'center',
  },
  catGuide: {
    alignSelf: 'center', marginTop: 60,
    width: 280, height: 200, position: 'relative', justifyContent: 'center', alignItems: 'center',
  },
  guideLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, textAlign: 'center', marginTop: 8 },

  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#fff', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },

  camBottom: { width: '100%' },
  camActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  camCancelBtn: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  camCancelText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 3, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  vinScanHint: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  analyzeRow: { alignItems: 'center', gap: 12, paddingBottom: 16 },
  analyzeText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  permBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permText: { fontSize: 16, textAlign: 'center', marginBottom: 24, color: '#333' },
  btn: { backgroundColor: BRAND_GREEN, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
