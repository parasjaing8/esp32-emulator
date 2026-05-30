import { DeviceState } from '@/models/Event';

type Listener = (state: DeviceState) => void;

export interface IDeviceService {
  start(): void;
  stop(): void;
  subscribe(fn: Listener): () => void;
  submitPassword(password: string): Promise<'ok' | 'fail' | 'setup_required'>;
  submitSetup(name: string, password: string): Promise<void>;
  setVisibility(on: boolean): Promise<void>;
  writeFillTarget(pct: number): Promise<void>;
  triggerSync(): void;
  getConnectedDeviceId(): string | null;
  getBleLog(): string[];
}
