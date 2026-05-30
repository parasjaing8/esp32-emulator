import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';
import { DeviceScanSheet } from '@/components/DeviceScanSheet';

export default function BoardScreen() {
  const { boardInfo, connected, connecting, disconnect } = useDevice();
  const [showScan, setShowScan] = useState(false);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ESP32 Emulator</Text>
        {connected && (
          <TouchableOpacity onPress={disconnect} style={styles.disconnectBtn}>
            <Feather name="bluetooth-off" size={18} color={colors.destructive} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.primary} />}
      >
        {!connected ? (
          <View style={styles.emptyState}>
            <Feather name="bluetooth" size={48} color={colors.mutedForeground} />
            <Text style={styles.emptyTitle}>No board connected</Text>
            <Text style={styles.emptySub}>Scan for ESP32 boards running OS firmware</Text>
            <TouchableOpacity style={styles.scanBtn} onPress={() => setShowScan(true)} activeOpacity={0.8}>
              <Feather name="search" size={16} color="#fff" />
              <Text style={styles.scanBtnText}>Scan for Boards</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Connection status */}
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Connected</Text>
            </View>

            {/* Board info card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Board Info</Text>
              <InfoRow label="Chip"     value={boardInfo?.chip ?? '—'} />
              <InfoRow label="Revision" value={boardInfo?.revision ?? '—'} />
              <InfoRow label="MAC"      value={boardInfo?.mac ?? '—'} mono />
              <InfoRow label="Flash"    value={boardInfo ? `${boardInfo.flash_mb} MB` : '—'} />
              <InfoRow label="PSRAM"    value={boardInfo ? `${boardInfo.psram_mb} MB` : '—'} />
              <InfoRow label="OS ver"   value={boardInfo?.fw_version ?? '—'} />
            </View>

            {/* Active partition */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Partitions</Text>
              <PartitionRow
                name="OS Firmware"
                active={boardInfo?.app_partition === 'os'}
                version={boardInfo?.fw_version}
              />
              <PartitionRow
                name="App Firmware"
                active={boardInfo?.app_partition === 'app'}
                version={boardInfo?.app_version}
              />
            </View>
          </>
        )}
      </ScrollView>

      {showScan && <DeviceScanSheet onClose={() => setShowScan(false)} />}
    </SafeAreaView>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

function PartitionRow({ name, active, version }: { name: string; active: boolean; version?: string }) {
  return (
    <View style={[styles.partitionRow, active && styles.partitionActive]}>
      <View style={styles.partitionLeft}>
        <Text style={[styles.partitionName, active && { color: colors.foreground }]}>{name}</Text>
        {version && <Text style={styles.partitionVersion}>{version}</Text>}
      </View>
      {active && (
        <View style={styles.activePill}>
          <Text style={styles.activePillText}>RUNNING</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: colors.background },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerTitle:   { fontSize: 18, fontWeight: '700', color: colors.foreground, flex: 1 },
  disconnectBtn: { padding: 6 },
  content:       { padding: 16, gap: 12 },
  emptyState:    { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle:    { fontSize: 18, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  emptySub:      { fontSize: 14, color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 32 },
  scanBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  scanBtnText:   { color: '#fff', fontSize: 15, fontWeight: '600' },
  statusBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  statusText:    { fontSize: 13, color: colors.success, fontWeight: '600' },
  card:          { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 2 },
  cardTitle:     { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.mutedForeground, marginBottom: 8 },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  infoLabel:     { fontSize: 13, color: colors.mutedForeground },
  infoValue:     { fontSize: 13, color: colors.foreground, maxWidth: 200, textAlign: 'right' },
  mono:          { fontFamily: 'monospace', fontSize: 12 },
  partitionRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  partitionActive:{ borderColor: colors.success + '80', backgroundColor: colors.success + '10' },
  partitionLeft: { gap: 2 },
  partitionName: { fontSize: 14, color: colors.mutedForeground, fontWeight: '500' },
  partitionVersion:{ fontSize: 11, color: colors.mutedForeground },
  activePill:    { backgroundColor: colors.success, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  activePillText:{ fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
