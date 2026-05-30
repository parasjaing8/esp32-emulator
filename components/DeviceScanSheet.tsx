import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  FlatList, Animated, Easing,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type DiscoveredDevice } from '@/context/DeviceContext';
import { colors } from '@/constants/theme';

function RssiBar({ rssi }: { rssi: number }) {
  const bars = rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <View style={DS.rssiRow}>
      {[1,2,3,4].map((b) => (
        <View
          key={b}
          style={[DS.rssiBar, { height: 4 + b * 3 }, b <= bars && DS.rssiBarActive]}
        />
      ))}
    </View>
  );
}

function PulsingRings({ active }: { active: boolean }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { ring1.setValue(0); ring2.setValue(0); return; }
    const pulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const a1 = pulse(ring1, 0);
    const a2 = pulse(ring2, 700);
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, [active, ring1, ring2]);

  const ringStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 2, borderColor: colors.primary,
    opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.3, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.8] }) }],
  });

  return (
    <View style={DS.pulseContainer}>
      <Animated.View style={ringStyle(ring1)} />
      <Animated.View style={ringStyle(ring2)} />
      <View style={DS.pulseCenter}>
        <Feather name="bluetooth" size={28} color={colors.primary} />
      </View>
    </View>
  );
}

interface Props {
  visible:        boolean;
  onClose:        () => void;
  onSelectDevice: (device: DiscoveredDevice) => void;
  devices:        DiscoveredDevice[];
  isScanning:     boolean;
  onScan:         () => void;
}

export function DeviceScanSheet({ visible, onClose, onSelectDevice, devices, isScanning, onScan }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={DS.overlay}>
        <TouchableOpacity style={DS.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[DS.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={DS.handle} />

          {/* Header */}
          <View style={DS.sheetHeader}>
            <View>
              <Text style={DS.sheetTitle}>Scan for Boards</Text>
              <Text style={DS.sheetSub}>
                {isScanning ? 'Searching for ESP32-OS devices…' : `${devices.length} board${devices.length !== 1 ? 's' : ''} found`}
              </Text>
            </View>
            <TouchableOpacity
              style={[DS.rescanBtn, isScanning && DS.rescanBtnBusy]}
              onPress={onScan}
              disabled={isScanning}
              activeOpacity={0.7}
            >
              <Feather name="refresh-cw" size={16} color={isScanning ? colors.mutedForeground : colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Scanning animation */}
          {isScanning && (
            <View style={DS.scanningArea}>
              <PulsingRings active={isScanning} />
              <Text style={DS.scanningText}>Scanning for BLE devices…</Text>
            </View>
          )}

          {/* Device list */}
          {!isScanning && devices.length === 0 && (
            <View style={DS.noDevices}>
              <Feather name="bluetooth-off" size={32} color={colors.mutedForeground} />
              <Text style={DS.noDevicesTitle}>No boards found</Text>
              <Text style={DS.noDevicesSub}>Make sure your ESP32 is powered on and running OS firmware.</Text>
              <TouchableOpacity style={DS.scanAgainBtn} onPress={onScan} activeOpacity={0.8}>
                <Feather name="search" size={15} color="#fff" />
                <Text style={DS.scanAgainText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isScanning && devices.length > 0 && (
            <FlatList
              data={devices}
              keyExtractor={(d) => d.id}
              style={DS.list}
              scrollEnabled={devices.length > 3}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={DS.deviceRow}
                  onPress={() => onSelectDevice(item)}
                  activeOpacity={0.7}
                >
                  <View style={DS.deviceIcon}>
                    <Feather name="cpu" size={18} color={colors.primary} />
                  </View>
                  <View style={DS.deviceInfo}>
                    <Text style={DS.deviceName}>{item.name}</Text>
                    <Text style={DS.deviceId}>{item.isSim ? 'Simulation Mode' : item.id}</Text>
                  </View>
                  <View style={DS.deviceRight}>
                    <RssiBar rssi={item.rssi} />
                    <Text style={DS.rssiText}>{item.rssi} dBm</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const DS = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:         { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 12 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 18 },
  sheetHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle:    { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.foreground },
  sheetSub:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
  rescanBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  rescanBtnBusy: { opacity: 0.4 },
  scanningArea:  { alignItems: 'center', paddingVertical: 40, gap: 20 },
  pulseContainer:{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  pulseCenter:   { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary + '40' },
  scanningText:  { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
  noDevices:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  noDevicesTitle:{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  noDevicesSub:  { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 16, lineHeight: 19 },
  scanAgainBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 },
  scanAgainText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  list:          { maxHeight: 280 },
  deviceRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  deviceIcon:    { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center' },
  deviceInfo:    { flex: 1 },
  deviceName:    { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
  deviceId:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
  deviceRight:   { alignItems: 'flex-end', gap: 3 },
  rssiRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  rssiBar:       { width: 4, borderRadius: 1, backgroundColor: colors.border },
  rssiBarActive: { backgroundColor: colors.success },
  rssiText:      { fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
});
