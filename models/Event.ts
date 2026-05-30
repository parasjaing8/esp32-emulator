export enum EventType {
  MOTOR_ON    = 1,
  MOTOR_OFF   = 2,
  WATER_ARRIVED = 3,
  TANK_LOW    = 4,
}

export enum StopReason {
  NONE        = 0,
  TANK_FULL   = 1,
  SUPPLY_CUT  = 2,
  MANUAL      = 3,
}

export interface WaterEvent {
  id:          number;
  epoch:       number;
  type:        EventType;
  tankPct:     number;
  flowLpm:     number;
  stopReason:  StopReason;
  durationSec: number;
  synced:      boolean;
}

export interface DailyStats {
  day:      string;
  totalSec: number;
  runs:     number;
}

export type AuthState =
  | 'pending'
  | 'ok'
  | 'fail'
  | 'setup_required'
  | 'unclaimed';

export interface DeviceState {
  connected:     boolean;
  pumpState:     number;
  motorOn:       boolean;
  authState:     AuthState;
  fillTarget?:   number;
  firmwareVersion: string | null;
}

export const DEFAULT_DEVICE_STATE: DeviceState = {
  connected:      false,
  pumpState:      0,
  motorOn:        false,
  authState:      'pending',
  fillTarget:     undefined,
  firmwareVersion: null,
};
