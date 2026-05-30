import React, { useState } from "react";
import {
  ActivityIndicator,
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
  onSubmit: (name: string, password: string) => Promise<void>;
}

export function DeviceSetupModal({ visible, onSubmit }: Props) {
  const colors = useColors();
  const { t } = useLanguage();
  const [name, setName] = useState("WaterTank");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const validate = (): string | null => {
    if (!name.trim()) return "Device name is required.";
    if (password.length < 4) return t("setupPasswordTooShort");
    if (password !== confirm) return t("setupPasswordMismatch");
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(name.trim(), password);
    } catch {
      setError("Setup failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: colors.background,
      zIndex: 100,
    }}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <View style={{
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: colors.primary + "18",
          alignItems: "center", justifyContent: "center",
          marginBottom: 20,
        }}>
          <Feather name="shield" size={28} color={colors.primary} />
        </View>

        <Text style={{ fontSize: 22, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 8 }}>
          {t("setupTitle")}
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 20, marginBottom: 32 }}>
          {t("setupSubtitle")}
        </Text>

        {/* Device name */}
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8, marginBottom: 6 }}>
          {t("setupDeviceName").toUpperCase()}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("setupDeviceNamePlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontSize: 16,
            fontFamily: "Inter_400Regular",
            color: colors.foreground,
            marginBottom: 24,
          }}
        />

        {/* New password */}
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8, marginBottom: 6 }}>
          {t("setupNewPassword").toUpperCase()}
        </Text>
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: colors.card,
          borderWidth: 1, borderColor: colors.border, borderRadius: 10,
          marginBottom: 16,
        }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            placeholder="••••"
            placeholderTextColor={colors.mutedForeground}
            style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: "Inter_400Regular", color: colors.foreground }}
          />
          <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={{ paddingHorizontal: 14 }}>
            <Feather name={showPw ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Confirm password */}
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8, marginBottom: 6 }}>
          {t("setupConfirmPassword").toUpperCase()}
        </Text>
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: colors.card,
          borderWidth: 1, borderColor: colors.border, borderRadius: 10,
          marginBottom: 28,
        }}>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showConfirm}
            placeholder="••••"
            placeholderTextColor={colors.mutedForeground}
            style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: "Inter_400Regular", color: colors.foreground }}
            onSubmitEditing={handleSave}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} style={{ paddingHorizontal: 14 }}>
            <Feather name={showConfirm ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {error && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={{ fontSize: 13, color: colors.destructive, fontFamily: "Inter_400Regular", flex: 1 }}>
              {error}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            backgroundColor: loading ? colors.muted : colors.primary,
            borderRadius: 10,
            paddingVertical: 15,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {loading && <ActivityIndicator size="small" color="#FFF" />}
          <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: loading ? colors.mutedForeground : "#FFF" }}>
            {loading ? t("setupSaving") : t("setupSave")}
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
