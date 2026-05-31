// GPIO pin maps per ESP32 chip variant
// Used to render the pin control dashboard

export type PinMode = 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP' | 'INPUT_PULLDOWN' | 'ADC' | 'PWM' | 'SYSTEM';

export interface PinDef {
  gpio: number;       // GPIO number
  label: string;      // human label (e.g. "GPIO4", "TX0")
  modes: PinMode[];   // supported modes
  adcChannel?: number;
  defaultMode: PinMode;
  systemNote?: string; // e.g. "USB D+" — warn if user tries to reconfigure
}

export type ChipVariant = 'ESP32' | 'ESP32-C3' | 'ESP32-S3' | 'ESP32-C6' | 'ESP32-S2';

const INPUT_OUTPUT: PinMode[] = ['INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'PWM'];
const INPUT_ADC: PinMode[]    = ['INPUT', 'ADC', 'INPUT_PULLUP'];
const INPUT_ONLY: PinMode[]   = ['INPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN'];

export const PIN_MAP: Record<ChipVariant, PinDef[]> = {
  'ESP32-C3': [
    { gpio: 0,  label: 'GPIO0',  modes: INPUT_OUTPUT, defaultMode: 'INPUT', systemNote: 'Boot mode' },
    { gpio: 1,  label: 'GPIO1',  modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 1 },
    { gpio: 2,  label: 'GPIO2',  modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 2 },
    { gpio: 3,  label: 'GPIO3',  modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 3 },
    { gpio: 4,  label: 'GPIO4',  modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 4 },
    { gpio: 5,  label: 'GPIO5',  modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 6,  label: 'GPIO6',  modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 7,  label: 'GPIO7',  modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 8,  label: 'GPIO8',  modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 9,  label: 'GPIO9',  modes: INPUT_ONLY,   defaultMode: 'INPUT', systemNote: 'Boot strapping' },
    { gpio: 10, label: 'GPIO10', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 18, label: 'GPIO18', modes: INPUT_ONLY, defaultMode: 'INPUT', systemNote: 'USB D- — OUTPUT unsafe' },
    { gpio: 19, label: 'GPIO19', modes: INPUT_ONLY, defaultMode: 'INPUT', systemNote: 'USB D+ — OUTPUT unsafe' },
    { gpio: 20, label: 'GPIO20 / RX0', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 21, label: 'GPIO21 / TX0', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
  ],

  'ESP32': [
    { gpio: 0,  label: 'GPIO0',  modes: INPUT_OUTPUT, defaultMode: 'INPUT', systemNote: 'Boot mode' },
    { gpio: 1,  label: 'TX0',    modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 2,  label: 'GPIO2',  modes: INPUT_OUTPUT, defaultMode: 'OUTPUT' },
    { gpio: 3,  label: 'RX0',    modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 4,  label: 'GPIO4',  modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 5,  label: 'GPIO5',  modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 12, label: 'GPIO12', modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 15 },
    { gpio: 13, label: 'GPIO13', modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 14 },
    { gpio: 14, label: 'GPIO14', modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 16 },
    { gpio: 15, label: 'GPIO15', modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 13 },
    { gpio: 16, label: 'GPIO16', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 17, label: 'GPIO17', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 18, label: 'GPIO18', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 19, label: 'GPIO19', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 21, label: 'GPIO21 / SDA', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 22, label: 'GPIO22 / SCL', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 23, label: 'GPIO23', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 25, label: 'GPIO25 / DAC1', modes: INPUT_ADC, defaultMode: 'INPUT', adcChannel: 8 },
    { gpio: 26, label: 'GPIO26 / DAC2', modes: INPUT_ADC, defaultMode: 'INPUT', adcChannel: 9 },
    { gpio: 27, label: 'GPIO27', modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 7 },
    { gpio: 32, label: 'GPIO32', modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 4 },
    { gpio: 33, label: 'GPIO33', modes: INPUT_ADC,    defaultMode: 'INPUT', adcChannel: 5 },
    { gpio: 34, label: 'GPIO34', modes: INPUT_ONLY,   defaultMode: 'INPUT', adcChannel: 6 },
    { gpio: 35, label: 'GPIO35', modes: INPUT_ONLY,   defaultMode: 'INPUT', adcChannel: 7 },
    { gpio: 36, label: 'VP / ADC0', modes: INPUT_ONLY, defaultMode: 'INPUT', adcChannel: 0 },
    { gpio: 39, label: 'VN / ADC3', modes: INPUT_ONLY, defaultMode: 'INPUT', adcChannel: 3 },
  ],

  'ESP32-S3': [
    ...Array.from({ length: 22 }, (_, i) => ({
      gpio: i,
      label: `GPIO${i}`,
      modes: INPUT_OUTPUT as PinMode[],
      defaultMode: 'INPUT' as PinMode,
    })),
    { gpio: 38, label: 'GPIO38', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 39, label: 'GPIO39', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 40, label: 'GPIO40', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 41, label: 'GPIO41', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 42, label: 'GPIO42', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 43, label: 'GPIO43 / TX0', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 44, label: 'GPIO44 / RX0', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 45, label: 'GPIO45', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 46, label: 'GPIO46', modes: INPUT_ONLY,   defaultMode: 'INPUT' },
    { gpio: 47, label: 'GPIO47', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 48, label: 'GPIO48', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
  ],

  'ESP32-C6': [
    ...Array.from({ length: 23 }, (_, i) => ({
      gpio: i,
      label: `GPIO${i}`,
      modes: INPUT_OUTPUT as PinMode[],
      defaultMode: 'INPUT' as PinMode,
    })),
  ],

  'ESP32-S2': [
    ...Array.from({ length: 22 }, (_, i) => ({
      gpio: i,
      label: `GPIO${i}`,
      modes: INPUT_OUTPUT as PinMode[],
      defaultMode: 'INPUT' as PinMode,
    })),
    { gpio: 33, label: 'GPIO33', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 34, label: 'GPIO34', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 35, label: 'GPIO35', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 36, label: 'GPIO36', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 37, label: 'GPIO37', modes: INPUT_OUTPUT, defaultMode: 'INPUT' },
    { gpio: 38, label: 'GPIO38 / USB D-', modes: INPUT_OUTPUT, defaultMode: 'INPUT', systemNote: 'USB D-' },
    { gpio: 39, label: 'GPIO39 / USB D+', modes: INPUT_OUTPUT, defaultMode: 'INPUT', systemNote: 'USB D+' },
    { gpio: 45, label: 'GPIO45', modes: INPUT_ONLY,   defaultMode: 'INPUT' },
    { gpio: 46, label: 'GPIO46', modes: INPUT_ONLY,   defaultMode: 'INPUT' },
  ],
};
