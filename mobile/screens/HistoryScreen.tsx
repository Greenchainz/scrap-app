import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { getCachedScans, type CachedScan } from '../utils/cache.js';

type Props = {
  onSelectScan: (scan: CachedScan) => void;
};

export default function HistoryScreen({ onSelectScan }: Props) {
  const [scans, setScans] = useState<CachedScan[]>([]);

  useEffect(() => {
    getCachedScans().then(setScans).catch(() => setScans([]));
  }, []);

  if (scans.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No scans yet. Start by photographing a scrap item.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={scans}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.row} onPress={() => onSelectScan(item)}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowName}>{item.objectName}</Text>
            <Text style={styles.rowDate}>{new Date(item.cachedAt).toLocaleDateString()}</Text>
          </View>
          <Text style={styles.rowValue}>
            ${item.estimatedValueLow.toFixed(2)} – ${item.estimatedValueHigh.toFixed(2)}
          </Text>
        </TouchableOpacity>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f5f5f5',
  },
  emptyText: {
    fontSize: 15,
    color: '#777',
    textAlign: 'center',
  },
  row: {
    backgroundColor: '#fff',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  rowDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a7f4b',
  },
  separator: {
    height: 1,
    backgroundColor: '#e5e5e5',
  },
});
