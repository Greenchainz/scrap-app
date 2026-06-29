/**
 * YardProfileScreen — the "yard page."
 * Shows: yard info, live crowdsourced metal prices, aggregate rating,
 * verdict breakdown, and recent reviews.
 *
 * Accessible from YardComparison when user taps a yard row.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { trpc } from '../utils/trpc.js';

const BRAND_GREEN = '#1a7f4b';

type Yard = {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  phone: string | null;
  website: string | null;
};

type Props = {
  yard: Yard;
  onBack: () => void;
  onLeaveReview: (yardId: string, yardName: string) => void;
};

const VERDICT_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  great:         { emoji: '🟢', label: 'Great',          color: '#1a7f4b' },
  fair:          { emoji: '🟡', label: 'Fair',           color: '#7a5f00' },
  fair_but_slow: { emoji: '🕐', label: 'Fair/Slow',      color: '#7a5f00' },
  lowballed:     { emoji: '🔴', label: 'Lowballed',      color: '#c0392b' },
  avoid:         { emoji: '⛔', label: 'Avoid',          color: '#7b0000' },
};

const METAL_LABELS: Record<string, string> = {
  copper:           'Copper',
  aluminum:         'Aluminum',
  steel:            'Steel',
  stainless_steel:  'Stainless Steel',
  brass:            'Brass',
  iron:             'Cast Iron',
  lead:             'Lead',
  zinc:             'Zinc',
  nickel:           'Nickel',
  tin:              'Tin',
};

function StarDisplay({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Text key={s} style={{ fontSize: 18, color: s <= Math.round(rating) ? '#f0a500' : '#ddd' }}>★</Text>
      ))}
    </View>
  );
}

export default function YardProfileScreen({ yard, onBack, onLeaveReview }: Props) {
  const [tab, setTab] = useState<'prices' | 'reviews'>('prices');

  const { data, isLoading, error, refetch } = trpc.yards.getYardProfile.useQuery(
    { yardId: yard.id },
    { staleTime: 2 * 60 * 1000 },
  );

  const handleCall = () => {
    if (yard.phone) Linking.openURL(`tel:${yard.phone.replace(/\D/g, '')}`);
  };

  const handleDirections = () => {
    if (yard.address) {
      const encoded = encodeURIComponent(`${yard.address}, ${yard.city}, ${yard.state}`);
      Linking.openURL(`https://maps.apple.com/?q=${encoded}`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.yardName} numberOfLines={2}>{yard.name}</Text>
          <Text style={styles.yardLocation}>{yard.city}, {yard.state}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Action buttons */}
        <View style={styles.actionRow}>
          {yard.phone && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
              <Text style={styles.actionBtnEmoji}>📞</Text>
              <Text style={styles.actionBtnText}>Call</Text>
            </TouchableOpacity>
          )}
          {yard.address && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleDirections}>
              <Text style={styles.actionBtnEmoji}>📍</Text>
              <Text style={styles.actionBtnText}>Directions</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() => onLeaveReview(yard.id, yard.name)}>
            <Text style={styles.actionBtnEmoji}>✍️</Text>
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>Leave Review</Text>
          </TouchableOpacity>
        </View>

        {/* Aggregate rating */}
        {data && data.reviewCount > 0 && (
          <View style={styles.ratingCard}>
            <View style={styles.ratingLeft}>
              <Text style={styles.ratingNumber}>{data.avgRating?.toFixed(1)}</Text>
              <StarDisplay rating={data.avgRating ?? 0} />
              <Text style={styles.ratingCount}>{data.reviewCount} review{data.reviewCount !== 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.verdictBreakdown}>
              {Object.entries(VERDICT_LABELS).map(([key, v]) => {
                const ct = data.verdictBreakdown[key] ?? 0;
                if (ct === 0) return null;
                return (
                  <View key={key} style={styles.verdictStat}>
                    <Text style={styles.verdictStatEmoji}>{v.emoji}</Text>
                    <Text style={styles.verdictStatLabel}>{v.label}</Text>
                    <Text style={[styles.verdictStatCount, { color: v.color }]}>{ct}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Tab bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, tab === 'prices' && styles.tabActive]}
            onPress={() => setTab('prices')}>
            <Text style={[styles.tabText, tab === 'prices' && styles.tabTextActive]}>💰 Prices</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'reviews' && styles.tabActive]}
            onPress={() => setTab('reviews')}>
            <Text style={[styles.tabText, tab === 'reviews' && styles.tabTextActive]}>
              ⭐ Reviews {data && data.reviewCount > 0 ? `(${data.reviewCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={BRAND_GREEN} />
            <Text style={styles.loadingText}>Loading yard data…</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Could not load yard data.</Text>
            <TouchableOpacity onPress={() => refetch()}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Prices tab */}
        {!isLoading && data && tab === 'prices' && (
          <View>
            {data.prices.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>📋</Text>
                <Text style={styles.emptyTitle}>No prices yet</Text>
                <Text style={styles.emptySub}>
                  Be the first to report what {yard.name} is paying.
                  {'\n'}Visit and come back to let the community know.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionNote}>
                  Crowdsourced prices — submitted by scrappers like you
                </Text>
                {data.prices.map((p, i) => (
                  <View key={i} style={styles.priceRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.metalName}>
                        {METAL_LABELS[p.metalType] ?? p.metalType}
                      </Text>
                      <Text style={styles.priceAge}>
                        {p.verified ? '✅ Verified' : `Reported ${p.ageHours < 24 ? `${p.ageHours}h ago` : `${Math.round(p.ageHours / 24)}d ago`}`}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.priceValue}>${p.pricePerLb.toFixed(2)}/lb</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* Reviews tab */}
        {!isLoading && data && tab === 'reviews' && (
          <View>
            {data.reviews.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyTitle}>No reviews yet</Text>
                <Text style={styles.emptySub}>
                  Have you been to {yard.name}?
                  {'\n'}Leave the first review and help other scrappers.
                </Text>
                <TouchableOpacity
                  style={styles.reviewCTA}
                  onPress={() => onLeaveReview(yard.id, yard.name)}>
                  <Text style={styles.reviewCTAText}>Leave a Review</Text>
                </TouchableOpacity>
              </View>
            ) : (
              data.reviews.map(r => (
                <View key={r.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <StarDisplay rating={r.rating} />
                    <View style={[styles.verdictBadge, { backgroundColor: VERDICT_LABELS[r.verdict]?.color + '22' }]}>
                      <Text style={{ fontSize: 12 }}>{VERDICT_LABELS[r.verdict]?.emoji} </Text>
                      <Text style={[styles.verdictBadgeText, { color: VERDICT_LABELS[r.verdict]?.color }]}>
                        {VERDICT_LABELS[r.verdict]?.label}
                      </Text>
                    </View>
                  </View>

                  {/* Sale type + price comparison */}
                  <Text style={styles.reviewMeta}>
                    Sold: {r.saleType.replace(/_/g, ' ')}
                    {r.offeredPrice && r.actualPrice
                      ? `  ·  Expected $${r.offeredPrice.toFixed(0)}, Got $${r.actualPrice.toFixed(0)}`
                      : r.actualPrice
                      ? `  ·  Got $${r.actualPrice.toFixed(0)}`
                      : ''}
                  </Text>

                  {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}

                  <Text style={styles.reviewDate}>
                    {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>

                  {/* Yard response */}
                  {r.yardResponded && r.yardResponse && (
                    <View style={styles.yardResponseBox}>
                      <Text style={styles.yardResponseLabel}>🏭 Yard Response</Text>
                      <Text style={styles.yardResponseText}>{r.yardResponse}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: BRAND_GREEN,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn:      { color: '#a8f0c8', fontSize: 14, paddingTop: 2 },
  yardName:     { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  yardLocation: { color: '#a8f0c8', fontSize: 13, marginTop: 2 },

  scroll: { padding: 16, paddingBottom: 48 },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fff',
  },
  actionBtnPrimary: { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
  actionBtnEmoji:   { fontSize: 16 },
  actionBtnText:    { fontSize: 13, fontWeight: '700', color: '#333' },

  ratingCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#eee', gap: 16,
  },
  ratingLeft:    { alignItems: 'center', minWidth: 70 },
  ratingNumber:  { fontSize: 40, fontWeight: '900', color: '#222', lineHeight: 44 },
  ratingCount:   { fontSize: 11, color: '#888', marginTop: 4 },
  verdictBreakdown: { flex: 1, justifyContent: 'center', gap: 6 },
  verdictStat:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verdictStatEmoji: { fontSize: 14 },
  verdictStatLabel: { flex: 1, fontSize: 13, color: '#555' },
  verdictStatCount: { fontSize: 14, fontWeight: '800' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#eee', marginBottom: 16, overflow: 'hidden',
  },
  tab:           { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:     { backgroundColor: BRAND_GREEN },
  tabText:       { fontSize: 14, fontWeight: '700', color: '#666' },
  tabTextActive: { color: '#fff' },

  loadingBox:  { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { color: '#888', fontSize: 14 },
  errorBox:    { alignItems: 'center', paddingVertical: 48, gap: 8 },
  errorText:   { color: '#c0392b', fontSize: 14 },
  retryText:   { color: BRAND_GREEN, fontSize: 14, fontWeight: '600' },

  sectionNote: {
    fontSize: 12, color: '#888', marginBottom: 10,
    fontStyle: 'italic',
  },

  priceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#eee',
  },
  metalName:  { fontSize: 15, fontWeight: '700', color: '#222' },
  priceAge:   { fontSize: 12, color: '#888', marginTop: 2 },
  priceValue: { fontSize: 20, fontWeight: '900', color: BRAND_GREEN },

  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  emptySub:   { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  reviewCTA: {
    marginTop: 16, backgroundColor: BRAND_GREEN, borderRadius: 10,
    paddingHorizontal: 32, paddingVertical: 12,
  },
  reviewCTAText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  reviewCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#eee',
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  verdictBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  verdictBadgeText: { fontSize: 12, fontWeight: '700' },
  reviewMeta:    { fontSize: 12, color: '#888', marginBottom: 6 },
  reviewComment: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 6 },
  reviewDate:    { fontSize: 11, color: '#bbb' },

  yardResponseBox: {
    backgroundColor: '#f0f8f4', borderRadius: 8, padding: 12,
    marginTop: 10, borderLeftWidth: 3, borderLeftColor: BRAND_GREEN,
  },
  yardResponseLabel: { fontSize: 12, fontWeight: '700', color: BRAND_GREEN, marginBottom: 4 },
  yardResponseText:  { fontSize: 13, color: '#333', lineHeight: 18 },
});
