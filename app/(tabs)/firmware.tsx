import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Feather } from '@expo/vector-icons';
import { useDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';

export default function FirmwareScreen() {
  const { connected, boardInfo, flashFirmware, otaProgress, bootPartition } = useDevice();
  const [selectedFile, setSelectedFile] = useState<{ name: string; uri: string; size: number } | null>(null);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const f = result.assets[0];
    if (!f.name.endsWith('.bin')) {
      Alert.alert('Wrong file type', 'Select an ESP32 firmware .bin file');
      return;
    }
    setSelectedFile({ name: f.name, uri: f.uri, size: f.size ?? 0 });
  }

  async function flash() {
    if (!selectedFile) return;
    Alert.alert(
      'Flash Firmware',
      `Flash "${selectedFile.name}" to the app partition?\n\nThe board will reboot after flashing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Flash', style: 'destructive', onPress: () => flashFirmware(selectedFile.uri) },
      ]
    );
  }

  if (!connected) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.notConnected}>
          <Feather name="upload-cloud" size={40} color={colors.mutedForeground} />
          <Text style={styles.notConnectedText}>Connect a board to flash firmware</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isFlashing = otaProgress !== null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Firmware</Text>
        <Text style={styles.headerSub}>{boardInfo?.chip} · {boardInfo?.fw_version}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Partition switcher */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Boot Partition</Text>
          <View style={styles.partitionRow}>
            <PartitionBtn
              label="OS Firmware"
              sub="BLE control panel"
              active={boardInfo?.app_partition === 'os'}
              onPress={() => bootPartition('os')}
            />
            <PartitionBtn
              label="App Firmware"
              sub="Your project"
              active={boardInfo?.app_partition === 'app'}
              onPress={() => bootPartition('app')}
            />
          </View>
        </View>

        {/* Flash new firmware */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Flash New Firmware</Text>
          <Text style={styles.helpText}>
            Select an ESP32 .bin file. It will be written to the app partition via BLE OTA.
            The OS partition stays intact — you can always switch back.
          </Text>

          <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={isFlashing} activeOpacity={0.8}>
            <Feather name="folder" size={16} color={colors.primary} />
            <Text style={styles.pickBtnText}>
              {selectedFile ? selectedFile.name : 'Choose .bin file…'}
            </Text>
          </TouchableOpacity>

          {selectedFile && (
            <Text style={styles.fileSize}>
              {(selectedFile.size / 1024).toFixed(0)} KB
            </Text>
          )}

          {/* OTA progress */}
          {isFlashing && (
            <View style={styles.progressSection}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${otaProgress}%` as any }]} />
              </View>
              <Text style={styles.progressText}>{otaProgress}% — Do not disconnect</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.flashBtn, (!selectedFile || isFlashing) && styles.flashBtnDisabled]}
            onPress={flash}
            disabled={!selectedFile || isFlashing}
            activeOpacity={0.8}
          >
            <Feather name="zap" size={16} color="#fff" />
            <Text style={styles.flashBtnText}>{isFlashing ? 'Flashing…' : 'Flash Firmware'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.warning}>
          ⚠ Flashing overwrites the app partition. The OS firmware (partition A) is never touched by this operation.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PartitionBtn({ label, sub, active, onPress }: {
  label: string; sub: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.partBtn, active && styles.partBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.partBtnLabel, active && { color: colors.foreground }]}>{label}</Text>
      <Text style={styles.partBtnSub}>{sub}</Text>
      {active && <Text style={styles.partBtnRunning}>● ACTIVE</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1, backgroundColor: colors.background },
  header:          { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerTitle:     { fontSize: 18, fontWeight: '700', color: colors.foreground },
  headerSub:       { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  notConnected:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notConnectedText:{ fontSize: 15, color: colors.mutedForeground },
  content:         { padding: 16, gap: 12 },
  card:            { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  cardTitle:       { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.mutedForeground },
  partitionRow:    { flexDirection: 'row', gap: 10 },
  partBtn:         { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  partBtnActive:   { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  partBtnLabel:    { fontSize: 13, fontWeight: '600', color: colors.mutedForeground },
  partBtnSub:      { fontSize: 11, color: colors.mutedForeground },
  partBtnRunning:  { fontSize: 10, color: colors.primary, fontWeight: '700', marginTop: 4 },
  helpText:        { fontSize: 13, color: colors.mutedForeground, lineHeight: 19 },
  pickBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, borderStyle: 'dashed' },
  pickBtnText:     { fontSize: 14, color: colors.primary, flex: 1 },
  fileSize:        { fontSize: 11, color: colors.mutedForeground, textAlign: 'right' },
  progressSection: { gap: 6 },
  progressBar:     { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill:    { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  progressText:    { fontSize: 12, color: colors.mutedForeground, textAlign: 'center' },
  flashBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.destructive, borderRadius: 10, padding: 14 },
  flashBtnDisabled:{ opacity: 0.4 },
  flashBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  warning:         { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 8, lineHeight: 18 },
});
