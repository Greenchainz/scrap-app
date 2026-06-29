/**
 * SubmitReviewScreen — shown after a user visits a yard.
 * Captures: star rating, verdict (fair/lowballed/etc.), what they sold,
 * what they expected vs got, and an optional comment.
 *
 * This is the crowdsource engine — every submission makes the app more valuable.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { trpc } from '../utils/trpc.js';

const BRAND_GREEN = '#1a7f4b';

type Verdict = 'great' | 'fair' | 'fair_but_slow' | 'lowballed' | 'avoid';
type SaleType = 'metal' | 'whole_car' | 'catalytic_converter' | 'parts';

type Props = {
  yardId: string;
  yardName: string;
  onDone: () => void;
  onSkip: () => void;
};

const VERDICT_OPTIONS: { id: Verdict; emoji: string; label: string; sub: string }[] = [
  { id: 'great',         emoji: '🟢', label: 'Great — Fair price, no hassle',    sub: 'Would go back every time' },
  { id: 'fair',          emoji: '🟡', label: 'Fair — Got a reasonable price',     sub: 'No complaints' },
  { id: 'fair_but_slow', emoji: '🕐', label: 'Fair but slow',                     sub: 'Good price, long wait' },
  { id: 'lowballed',     emoji: '🔴', label: 'Lowballed — Tried to underpay',     sub: 'Offered way less than expected' },
  { id: 'avoid',         emoji: '⛔', label: 'Avoid — Bad experience',            sub: 'Rude, dishonest, or sketchy' },
];

const SALE_TYPE_OPTIONS: { id: SaleType; emoji: string; label: string }[] = [
  { id: 'metal',               emoji: '⚙️',  label: 'Scrap Metal'         },
  { id: 'whole_car',           emoji: '🚗',  label: 'Whole Car'           },
  { id: 'catalytic_converter', emoji: '🔩',  label: 'Catalytic Converter' },
  { id: 'parts',               emoji: '🔧',  label: 'Car Parts'           },
];

export default function SubmitReviewScreen({ yardId, yardName, onDone, onSkip }: Props) {
  const [rating, setRating]           = useState(0);
  const [verdict, setVerdict]         = useState<Verdict | null>(null);
  const [saleType, setSaleType]       = useState<SaleType>('metal');
  const [offeredText, setOfferedText] = useState('');
  const [actualText, setActualText]   = useState('');
  const [comment, setComment]         = useState('');
  const [submitted, setSubmitted]     = useState(false);

  const submitReview = trpc.yards.submitYardReview.useMutation();

  const handleSubmit = async () => {
    if (rating === 0) { Alert.alert('Rate the yard', 'Tap the stars to give a rating.'); return; }
    if (!verdict)     { Alert.alert('Pick a verdict', 'How did it go overall?'); return; }

    try {
      await submitReview.mutateAsync({
        yardId,
        rating,
        verdict,
        saleType,
        offeredPrice: offeredText ? Number(offeredText) : undefined,
        actualPrice:  actualText  ? Number(actualText)  : undefined,
        comment:      comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch {
      Alert.alert('Error', 'Could not submit review — check your connection.');
    }
  };

  if (submitted) {
    return (
      <View style={styles.successBox}>
        <Text style={styles.successEmoji}>🙌</Text>
        <Text style={styles.successTitle}>Thanks for the intel!</Text>
        <Text style={styles.successSub}>
          Your review helps other scrappers know what to expect at {yardName}.
          {'\n\n'}This is how we beat the lowballers — together.
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Rate Your Visit</Text>
          <Text style={styles.headerSub}>{yardName}</Text>
        </View>

        {/* Star rating */}
        <Text style={styles.sectionLabel}>Overall Rating</Text>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map(s => (
            <TouchableOpacity key={s} onPress={() => setRating(s)}>
              <Text style={[styles.star, s <= rating && styles.starFilled]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Verdict */}
        <Text style={styles.sectionLabel}>How did it go?</Text>
        {VERDICT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.verdictRow, verdict === opt.id && styles.verdictRowActive]}
            onPress={() => setVerdict(opt.id)}>
            <Text style={styles.verdictEmoji}>{opt.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.verdictLabel, verdict === opt.id && styles.verdictLabelActive]}>
                {opt.label}
              </Text>
              <Text style={styles.verdictSub}>{opt.sub}</Text>
            </View>
            {verdict === opt.id && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}

        {/* What did you sell */}
        <Text style={styles.sectionLabel}>What did you sell?</Text>
        <View style={styles.chipRow}>
          {SALE_TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.chip, saleType === opt.id && styles.chipActive]}
              onPress={() => setSaleType(opt.id)}>
              <Text style={styles.chipEmoji}>{opt.emoji}</Text>
              <Text style={[styles.chipText, saleType === opt.id && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Price comparison (optional) */}
        <Text style={styles.sectionLabel}>Prices (optional)</Text>
        <Text style={styles.fieldHint}>Helps others know what to expect — skip if you don't want to share</Text>
        <View style={styles.priceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.priceLabel}>You expected</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="$0"
              placeholderTextColor="#bbb"
              value={offeredText}
              onChangeText={setOfferedText}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.priceDivider}>→</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.priceLabel}>You got paid</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="$0"
              placeholderTextColor="#bbb"
              value={actualText}
              onChangeText={setActualText}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Comment */}
        <Text style={styles.sectionLabel}>Tell us more (optional)</Text>
        <TextInput
          style={styles.commentInput}
          placeholder="What happened? Would you go back? Any tips for other scrappers..."
          placeholderTextColor="#aaa"
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />
        <Text style={styles.charCount}>{comment.length}/1000</Text>

        {/* Actions */}
        <TouchableOpacity
          style={[styles.submitBtn, submitReview.isPending && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitReview.isPending}>
          {submitReview.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>Submit Review</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipBtnText}>Skip — maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },

  header: { marginBottom: 20 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#222' },
  headerSub:   { fontSize: 15, color: '#555', marginTop: 4 },

  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 20, marginBottom: 10 },
  fieldHint:    { fontSize: 12, color: '#888', marginTop: -6, marginBottom: 10 },

  starRow:   { flexDirection: 'row', gap: 8, marginBottom: 4 },
  star:       { fontSize: 40, color: '#ddd' },
  starFilled: { color: '#f0a500' },

  verdictRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, marginBottom: 8, backgroundColor: '#fff',
  },
  verdictRowActive: { borderColor: BRAND_GREEN, backgroundColor: '#e8f8f0' },
  verdictEmoji: { fontSize: 20 },
  verdictLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  verdictLabelActive: { color: BRAND_GREEN },
  verdictSub:   { fontSize: 12, color: '#888', marginTop: 2 },
  checkmark:    { color: BRAND_GREEN, fontSize: 18, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#f9f9f9',
  },
  chipActive:    { borderColor: BRAND_GREEN, backgroundColor: '#e8f8f0' },
  chipEmoji:     { fontSize: 14 },
  chipText:      { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextActive: { color: BRAND_GREEN },

  priceRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  priceLabel:  { fontSize: 12, color: '#666', marginBottom: 4, fontWeight: '600' },
  priceDivider: { fontSize: 20, color: '#aaa', marginTop: 16 },
  priceInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 18, fontWeight: '700', color: '#222', backgroundColor: '#fff',
    textAlign: 'center',
  },

  commentInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 14, fontSize: 14, color: '#222',
    backgroundColor: '#fff', textAlignVertical: 'top', minHeight: 100,
  },
  charCount: { fontSize: 11, color: '#bbb', textAlign: 'right', marginTop: 4, marginBottom: 4 },

  submitBtn: {
    backgroundColor: BRAND_GREEN, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  skipBtn:     { alignItems: 'center', paddingVertical: 16 },
  skipBtnText: { color: '#999', fontSize: 14 },

  // Success state
  successBox: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, backgroundColor: '#f5f5f5',
  },
  successEmoji: { fontSize: 64, marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#222', marginBottom: 12, textAlign: 'center' },
  successSub:   { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },
  doneBtn: {
    marginTop: 32, backgroundColor: BRAND_GREEN, borderRadius: 12,
    paddingHorizontal: 48, paddingVertical: 14,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
