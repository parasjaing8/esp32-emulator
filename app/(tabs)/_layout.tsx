import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 0,
          shadowOpacity: 0,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Board',
          tabBarIcon: ({ color }) => <Feather name="cpu" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gpio"
        options={{
          title: 'GPIO',
          tabBarIcon: ({ color }) => <Feather name="sliders" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          title: 'Terminal',
          tabBarIcon: ({ color }) => <Feather name="terminal" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="firmware"
        options={{
          title: 'Firmware',
          tabBarIcon: ({ color }) => <Feather name="upload-cloud" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
