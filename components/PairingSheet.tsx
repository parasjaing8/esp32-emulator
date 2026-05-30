import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface Props {
  visible: boolean;
  isFirstTimeSetup: boolean;
  onSetupRequired: () => void;
  onSubmit: (password: string) => Promise<"ok" | "fail" | "setup_required">;
}

export function PairingSheet({ visible, isFirstTimeSetup, onSetupRequired, onSubmit }: Props) {
  const colors = useColors();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleConnect = async () => {
    if (!password.trim() || loading) return;
    setLoading(true);
    setError(false);
    try {
      const result = await onSubmit(password.trim());
      if (result === "setup_required") {
        setPassword("");
        onSetupRequired();
      } else if (result === "fail") {
        setError(true);
      }
      // 'ok' → BLEService emits authState:'ok', modal auto-hides via visible prop
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {}}>
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
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: colors.primary + "18",
                alignItems: "center", justifyContent: "center",
                marginRight: 10,
              }}>
                <Feather name="lock" size={18} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
                {t("authEnterPassword")}
              </Text>
            </View>

            {isFirstTimeSetup && (
              <Text style={{
                fontSize: 13,
                fontFamily: "Inter_400Regular",
                color: colors.mutedForeground,
                marginBottom: 16,
                marginLeft: 46,
              }}>
                {t("authPasswordHint")}
              </Text>
            )}

            <View style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: error ? colors.destructive : colors.border,
              borderRadius: 10,
              backgroundColor: colors.background,
              marginTop: isFirstTimeSetup ? 0 : 16,
              marginBottom: error ? 4 : 12,
            }}>
              <TextInput
                value={password}
                onChangeText={(v) => { setPassword(v); setError(false); }}
                placeholder={t("authEnterPassword")}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
                autoFocus
                style={{
                  flex: 1,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  fontSize: 16,
                  fontFamily: "Inter_400Regular",
                  color: colors.foreground,
                }}
                onSubmitEditing={handleConnect}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={{ paddingHorizontal: 14 }}
                accessibilityLabel="Toggle password visibility"
              >
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {error && (
              <Text style={{
                fontSize: 13,
                color: colors.destructive,
                fontFamily: "Inter_400Regular",
                marginBottom: 10,
              }}>
                {t("authWrongPassword")}
              </Text>
            )}

            <TouchableOpacity
              onPress={handleConnect}
              disabled={loading || !password.trim()}
              activeOpacity={0.8}
              style={{
                backgroundColor: loading || !password.trim() ? colors.muted : colors.primary,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading && <ActivityIndicator size="small" color="#FFF" />}
              <Text style={{
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
                color: loading || !password.trim() ? colors.mutedForeground : "#FFF",
              }}>
                {loading ? t("authConnecting") : t("authConnect")}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}
