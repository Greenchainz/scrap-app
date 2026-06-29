import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { trpc } from '../utils/trpc.js';
import YardMapView from '../components/YardMapView.js';
import Constants from 'expo-constants';

const AZURE_MAPS_KEY = (Constants.expoConfig?.extra as { azureMapsKey?: string })?.azureMapsKey
  ?? process.env.EXPO_PUBLIC_AZURE_MAPS_KEY
  ?? '';

type Metal = {
  type: string;
  weightRange: string;
  percentage: number;
};

type YardRow = {
  yard: {
    id: string;
    name: string;
    city: string;
    state: string;
    address: string | null;
    phone: string | null;
    website: string | null;
  };
  latitude: number;
  longitude: number;
  distanceMiles: number | null;
  totalLow: number;
  totalHigh: number;
};

type Props = {
  metals: Metal[];
  latitude?: number;
  longitude?: number;
  state?: string;
};

// City preset chips for the "explore another city" mode.
const CITY_PRESETS = ['New York City', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Seattle'];

const FALLBACK_MESSAGES: Record<string, string> = {
  state: '📍 No yards found nearby — showing yards in your state.',
  national: '🌎 No regional yards found — showing a national sample.',
};

export default function YardComparison({ metals, latitude, longitude, state }: Props) {
  const [exploreCity, setExploreCity] = useState('');
  const [cityInputValue, setCityInputValue] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // -- compareYards query (nearby / regional) --------------------------------
  const compareQuery = trpc.scrap.compareYards.useQuery(
    { metals, latitude, longitude, state, limit: 8 },
    { enabled: metals.length > 0 },
  );

  // -- estimateInCity query (for-fun explore mode) ---------------------------
  const cityQuery = trpc.scrap.estimateInCity.useQuery(
    { metals, city: exploreCity },
    { enabled: exploreCity.length > 0 && metals.length > 0 },
  );

  const handleExploreCity = (city: string) => {
    setExploreCity(city.trim());
    setCityInputValue(city.trim());
  };

  const handleCityInputSubmit = () => {
    if (cityInputValue.trim()) setExploreCity(cityInputValue.trim());
  };

  // ---------------------------------------------------------------------------
  // Compute delta vs. best payout
  // ---------------------------------------------------------------------------
  const nearbyYards = compareQuery.data?.yards ?? [];
  const fallbackMode = compareQuery.data?.fallbackMode;
  const bestPayout = nearbyYards[0]?.totalHigh ?? 0;

  const mapYards = nearbyYards.map((row) => ({
    id: row.yard.id,
    name: row.yard.name,
    city: row.yard.city,
    state: row.yard.state,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceMiles: row.distanceMiles,
    totalLow: row.totalLow,
    totalHigh: row.totalHigh,
  }));

  return (
    <View>
      {/* ---- "How much you'd make" section --------------------------------- */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>💰 How Much You'd Make</Text>
        {nearbyYards.length > 0 && (
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
              onPress={() => setViewMode('list')}
            >
              <Text style={[styles.toggleBtnText, viewMode === 'list' && styles.toggleBtnTextActive]}>List</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
              onPress={() => setViewMode('map')}
            >
              <Text style={[styles.toggleBtnText, viewMode === 'map' && styles.toggleBtnTextActive]}>Map</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <Text style={styles.subtitle}>
        Ranked by payout — best yard first. Prices are estimates based on 2026 baselines.
      </Text>

      {/* Fallback banner when no local yards were found */}
      {fallbackMode && fallbackMode !== 'nearby' && (
        <View style={styles.fallbackBanner}>
          <Text style={styles.fallbackText}>{FALLBACK_MESSAGES[fallbackMode]}</Text>
        </View>
      )}

      {compareQuery.isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#1a7f4b" />
          <Text style={styles.loadingText}>Finding nearby yards…</Text>
        </View>
      )}

      {compareQuery.isError && (
        <Text style={styles.errorText}>Could not load yard comparison. Check connection.</Text>
      )}

      {nearbyYards.length > 0 && viewMode === 'map' && (
        <YardMapView
          yards={mapYards}
          userLatitude={latitude}
          userLongitude={longitude}
          azureMapsKey={AZURE_MAPS_KEY}
          style={styles.mapView}
        />
      )}

      {nearbyYards.length > 0 && viewMode === 'list' && (
        <View style={styles.yardsContainer}>
          {nearbyYards.map((row, index) => {
            const isBest = index === 0;
            const delta = isBest ? null : parseFloat((bestPayout - row.totalHigh).toFixed(2));
            return (
              <YardCard
                key={row.yard.id}
                row={row}
                rank={index + 1}
                isBest={isBest}
                delta={delta}
              />
            );
          })}
        </View>
      )}

      {/* ---- "Explore another city" section -------------------------------- */}
      <Text style={styles.sectionTitle}>🌎 Explore Another City</Text>
      <Text style={styles.subtitle}>Curious what you'd make somewhere else? Just for fun.</Text>

      {/* City chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContainer}
      >
        {CITY_PRESETS.map((city) => (
          <TouchableOpacity
            key={city}
            style={[styles.chip, exploreCity === city && styles.chipActive]}
            onPress={() => handleExploreCity(city)}
          >
            <Text style={[styles.chipText, exploreCity === city && styles.chipTextActive]}>
              {city}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Free-text city input */}
      <View style={styles.cityInputRow}>
        <TextInput
          style={styles.cityInput}
          placeholder="Or type any city…"
          placeholderTextColor="#aaa"
          value={cityInputValue}
          onChangeText={setCityInputValue}
          onSubmitEditing={handleCityInputSubmit}
          returnKeyType="search"
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TouchableOpacity style={styles.goButton} onPress={handleCityInputSubmit}>
          <Text style={styles.goButtonText}>Go</Text>
        </TouchableOpacity>
      </View>

      {cityQuery.isLoading && exploreCity.length > 0 && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#1a7f4b" />
          <Text style={styles.loadingText}>Looking up {exploreCity}…</Text>
        </View>
      )}

      {cityQuery.data && cityQuery.data.yards.length === 0 && (
        <Text style={styles.errorText}>No yards found for "{exploreCity}". Try another city.</Text>
      )}

      {cityQuery.data && cityQuery.data.yards.length > 0 && (
        <View style={styles.yardsContainer}>
          <View style={styles.cityBestBanner}>
            <Text style={styles.cityBestLabel}>
              🏆 Best payout in {cityQuery.data.city}
            </Text>
            <Text style={styles.cityBestAmount}>
              ${cityQuery.data.cityBestPayout.totalLow.toFixed(2)} – $
              {cityQuery.data.cityBestPayout.totalHigh.toFixed(2)}
            </Text>
          </View>
          {cityQuery.data.yards.map((row, index) => (
            <YardCard
              key={row.yard.id}
              row={row}
              rank={index + 1}
              isBest={index === 0}
              delta={
                index === 0
                  ? null
                  : parseFloat(
                      (cityQuery.data!.cityBestPayout.totalHigh - row.totalHigh).toFixed(2),
                    )
              }
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// YardCard sub-component
// ---------------------------------------------------------------------------

type YardCardProps = {
  row: YardRow;
  rank: number;
  isBest: boolean;
  /** Payout delta vs the best yard in the list (null for the top-ranked card). */
  delta: number | null;
};

function YardCard({ row, rank, isBest, delta }: YardCardProps) {
  return (
    <View style={[styles.yardCard, isBest && styles.yardCardBest]}>
      {isBest && (
        <View style={styles.bestBadge}>
          <Text style={styles.bestBadgeText}>BEST PAYOUT</Text>
        </View>
      )}
      <View style={styles.yardCardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <View style={styles.yardInfo}>
          <Text style={[styles.yardName, isBest && styles.yardNameBest]} numberOfLines={1}>
            {row.yard.name}
          </Text>
          <Text style={styles.yardLocation}>
            {row.yard.city}, {row.yard.state}
            {row.distanceMiles != null ? `  ·  ${row.distanceMiles} mi` : ''}
          </Text>
        </View>
        <View style={styles.payoutBox}>
          <Text style={[styles.payoutAmount, isBest && styles.payoutAmountBest]}>
            ${row.totalLow.toFixed(2)}–${row.totalHigh.toFixed(2)}
          </Text>
          {delta != null && delta > 0 && (
            <Text style={styles.deltaText}>-${delta.toFixed(2)} vs best</Text>
          )}
        </View>
      </View>
      {(row.yard.phone || row.yard.address || row.yard.website) && (
        <View style={styles.yardContact}>
          {row.yard.address ? (
            <Text style={styles.contactText} numberOfLines={1}>📍 {row.yard.address}</Text>
          ) : null}
          {row.yard.phone ? (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${row.yard.phone}`)}>
              <Text style={styles.contactLink}>📞 {row.yard.phone}</Text>
            </TouchableOpacity>
          ) : null}
          {row.yard.website ? (
            <TouchableOpacity onPress={() => Linking.openURL(row.yard.website!)}>
              <Text style={styles.contactLink} numberOfLines={1}>🌐 {row.yard.website}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#1a7f4b',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  toggleBtnTextActive: {
    color: '#fff',
  },
  mapView: {
    marginBottom: 16,
  },
  fallbackBanner: {
    backgroundColor: '#fff8e1',
    borderLeftWidth: 3,
    borderLeftColor: '#e08a00',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  fallbackText: {
    fontSize: 12,
    color: '#7a5a00',
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#666',
  },
  errorText: {
    fontSize: 13,
    color: '#c0392b',
    marginBottom: 12,
  },
  yardsContainer: {
    marginBottom: 16,
    gap: 8,
  },
  // Yard card
  yardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  yardCardBest: {
    borderColor: '#1a7f4b',
    borderWidth: 2,
    backgroundColor: '#f0fff7',
  },
  bestBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a7f4b',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 6,
  },
  bestBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  yardCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1a7f4b',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  rankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  yardInfo: {
    flex: 1,
  },
  yardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  yardNameBest: {
    color: '#1a7f4b',
    fontWeight: '800',
  },
  yardLocation: {
    fontSize: 12,
    color: '#888',
    marginTop: 1,
  },
  payoutBox: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  payoutAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#222',
  },
  payoutAmountBest: {
    fontSize: 15,
    color: '#1a7f4b',
    fontWeight: '800',
  },
  deltaText: {
    fontSize: 11,
    color: '#c0392b',
    marginTop: 2,
  },
  // City explore
  chipsScroll: {
    marginBottom: 8,
  },
  chipsContainer: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipActive: {
    backgroundColor: '#1a7f4b',
    borderColor: '#1a7f4b',
  },
  chipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  cityInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  cityInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#222',
  },
  goButton: {
    backgroundColor: '#1a7f4b',
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  cityBestBanner: {
    backgroundColor: '#1a7f4b',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cityBestLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  cityBestAmount: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  // Contact info on yard cards
  yardContact: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 3,
  },
  contactText: {
    fontSize: 11,
    color: '#666',
  },
  contactLink: {
    fontSize: 11,
    color: '#1a7f4b',
    textDecorationLine: 'underline',
  },
});
