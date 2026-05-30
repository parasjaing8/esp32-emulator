import React from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { DiscoveredDevice } from "@/services/BLEService";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelectDevice: (device: DiscoveredDevice) => void;
  devices: DiscoveredDevice[];
  isScanning: boolean;
  onScan: () => void;
}

export function DeviceScanSheet({ visible, onClose, onSelectDevice, devices, isScanning, onScan }: Props) {
  const colors = useColors();
  const { t } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}>
        <KeyboardAwareScrollViewCompat
          showsVerticalScrollIndicator={false}
          bottomOffset={10}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
        >
          <View style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.border,
            padding: 24,
            paddingBottom: 40,
            minHeight: 360,
          }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: colors.primary + "18",
                  alignItems: "center", justifyContent: "center",
                  marginRight: 10,
                }}>
                  <Feather name="bluetooth" size={18} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                  {t("scanTitle")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onScan}
                disabled={isScanning}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: colors.muted,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Feather name="refresh-cw" size={16} color={isScanning ? colors.mutedForeground : colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Scanning indicator */}
            {isScanning && (
              <View style={{
                flexDirection: "row", alignItems: "center",
                paddingVertical: 12, paddingHorizontal: 16,
                backgroundColor: colors.primary + "0D",
                borderRadius: 10,
                marginBottom: 12,
              }}>
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  {t("scanSearching")}
                </Text>
              </View>
            )}

            {/* Device list */}
            {!isScanning && devices.length === 0 && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Feather name="wifi-off" size={32} color={colors.mutedForeground} style={{ marginBottom: 12 }} />
                <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground, marginBottom: 4 }}>
                  {t("scanNoDevices")}
                </Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 20 }}>
                  {t("scanNoDevicesHint")}
                </Text>
                <TouchableOpacity
                  onPress={onScan}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    flexDirection: "row", alignItems: "center", gap: 8,
                  }}
                >
                  <Feather name="search" size={15} color="#FFF" />
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFF" }}>
                    {t("scanAgain")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {devices.length > 0 && (
              <View style={{ marginTop: 4 }}>
                {devices.map((device, idx) => (
                  <TouchableOpacity
                    key={device.id}
                    onPress={() => onSelectDevice(device)}
                    activeOpacity={0.6}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      paddingVertical: 14, paddingHorizontal: 12,
                      backgroundColor: idx % 2 === 0 ? colors.background : "transparent",
                      borderRadius: 10,
                      marginBottom: 4,
                    }}
                  >
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: colors.primary + "14",
                      alignItems: "center", justifyContent: "center",
                      marginRight: 12,
                    }}>
                      <Feather name="bluetooth" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                        {device.name ?? device.localName ?? "WaterTank"}
                      </Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                        {device.id}
                      </Text>
                    </View>
                    {device.rssi !== undefined && (
                      <View style={{
                        paddingHorizontal: 8, paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: device.rssi > -60 ? colors.success + "18" : device.rssi > -75 ? colors.warning + "18" : colors.muted,
                      }}>
                        <Text style={{
                          fontSize: 11, fontFamily: "Inter_600SemiBold",
                          color: device.rssi > -60 ? colors.success : device.rssi > -75 ? colors.warning : colors.mutedForeground,
                        }}>
                          {device.rssi} dBm
                        </Text>
                      </View>
                    )}
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}
