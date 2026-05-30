import { useTheme } from "@/context/ThemeContext";
import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 * Reads from ThemeContext (user preference persisted in AsyncStorage),
 * defaulting to light mode.
 */
export function useColors() {
  const { colorScheme } = useTheme();
  const palette = colorScheme === 'dark' ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
