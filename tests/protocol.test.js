/**
 * FlashLink — protocol unit tests (plain Node.js, no framework required)
 * Run: node tests/protocol.test.js
 *
 * Tests the pure functions from FirmwareUpdateService.ts that drive the
 * NimBLEOta BLE firmware flash protocol. These are the highest-risk functions
 * in the codebase: a silent bug here corrupts a live firmware partition.
 */

// ── Re-implement pure functions (mirrors FirmwareUpdateService.ts exactly) ────

function crc16(data, len) {
  const n = len ?? data.length;
  let crc = 0;
  for (let i = 0; i < n; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc;
}

function parseSemver(v) {
  const clean = v.replace(/^v/, '').split('-')[0];
  const parts = clean.split('.').map((s) => { const n = parseInt(s, 10); return isNaN(n) ? 0 : n; });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function semverGt(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

function buildStartCommand(fileLen) {
  const buf = new Uint8Array(20);
  buf[0] = 0x01; buf[1] = 0x00;
  buf[2] = (fileLen) & 0xFF;
  buf[3] = (fileLen >> 8) & 0xFF;
  buf[4] = (fileLen >> 16) & 0xFF;
  buf[5] = (fileLen >> 24) & 0xFF;
  const c = crc16(buf, 18);
  buf[18] = c & 0xFF;
  buf[19] = (c >> 8) & 0xFF;
  return buf;
}

function isCommandAckAccepted(data) {
  if (data.length < 6) return false;
  const status = data[4] | (data[5] << 8);
  return status === 0x0000;
}

function isSectorAckSuccess(data) {
  if (data.length < 4) return false;
  const status = data[2] | (data[3] << 8);
  return status === 0x0000;
}

const SECTOR_SIZE = 4096;
const MAX_DATA_PER_PACKET = 504;

function buildSectorPackets(sectorIdx, sectorData) {
  const packets = [];
  const crcBuf = new Uint8Array(SECTOR_SIZE);
  let crcOffset = 0;
  let offset = 0;
  let packetNum = 0;

  while (offset < sectorData.length) {
    const remaining = sectorData.length - offset;
    const isLast = remaining <= MAX_DATA_PER_PACKET;
    const dataLen = Math.min(remaining, MAX_DATA_PER_PACKET);
    const chunk = sectorData.slice(offset, offset + dataLen);

    crcBuf.set(chunk, crcOffset);
    crcOffset += dataLen;

    if (isLast) {
      const c = crc16(crcBuf, crcOffset);
      const packet = new Uint8Array(3 + dataLen + 2);
      packet[0] = sectorIdx & 0xFF;
      packet[1] = (sectorIdx >> 8) & 0xFF;
      packet[2] = 0xFF;
      packet.set(chunk, 3);
      packet[3 + dataLen] = c & 0xFF;
      packet[3 + dataLen + 1] = (c >> 8) & 0xFF;
      packets.push(packet);
    } else {
      const packet = new Uint8Array(3 + dataLen);
      packet[0] = sectorIdx & 0xFF;
      packet[1] = (sectorIdx >> 8) & 0xFF;
      packet[2] = packetNum;
      packet.set(chunk, 3);
      packets.push(packet);
      packetNum++;
    }
    offset += dataLen;
  }
  return packets;
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toBeTruthy() { if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
    toBeFalsy() { if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
    toBeGreaterThan(n) { if (actual <= n) throw new Error(`Expected ${actual} > ${n}`); },
    toHaveLength(n) { if (actual.length !== n) throw new Error(`Expected length ${n}, got ${actual.length}`); },
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// ── CRC16 ─────────────────────────────────────────────────────────────────────

describe('crc16', () => {
  test('empty buffer returns 0', () => {
    expect(crc16(new Uint8Array(0))).toBe(0);
  });

  test('single zero byte', () => {
    expect(crc16(new Uint8Array([0]))).toBe(0);
  });

  test('known vector: 0x31..0x39 ("123456789") = 0x31C3', () => {
    // CRC16-CCITT-ZERO for "123456789"
    const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
    expect(crc16(data)).toBe(0x31C3);
  });

  test('deterministic: same input, same result', () => {
    const data = new Uint8Array(64).fill(0xAA);
    expect(crc16(data)).toBe(crc16(data));
  });

  test('len parameter limits processing', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 99, 99]);
    expect(crc16(a, 3)).toBe(crc16(b, 3));
  });

  test('len=0 returns 0', () => {
    const data = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    expect(crc16(data, 0)).toBe(0);
  });

  test('different data produces different CRC', () => {
    const a = crc16(new Uint8Array([1, 2, 3]));
    const b = crc16(new Uint8Array([1, 2, 4]));
    if (a === b) throw new Error('CRC collision on single bit change');
  });

  test('all-0xFF sector produces non-zero CRC', () => {
    const data = new Uint8Array(SECTOR_SIZE).fill(0xFF);
    if (crc16(data) === 0) throw new Error('CRC should not be 0 for all-0xFF');
  });
});

// ── parseSemver ───────────────────────────────────────────────────────────────

describe('parseSemver', () => {
  test('plain 1.2.3', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
  });

  test('v-prefix stripped: v1.2.3', () => {
    expect(parseSemver('v1.2.3')).toEqual([1, 2, 3]);
  });

  test('pre-release stripped: 1.2.3-rc1', () => {
    expect(parseSemver('1.2.3-rc1')).toEqual([1, 2, 3]);
  });

  test('pre-release with v-prefix: v2.0.0-beta', () => {
    expect(parseSemver('v2.0.0-beta')).toEqual([2, 0, 0]);
  });

  test('zero pads missing segments: 1.2', () => {
    expect(parseSemver('1.2')).toEqual([1, 2, 0]);
  });

  test('bad segment treated as 0: 1.x.3', () => {
    expect(parseSemver('1.x.3')).toEqual([1, 0, 3]);
  });

  test('all zeros: 0.0.0', () => {
    expect(parseSemver('0.0.0')).toEqual([0, 0, 0]);
  });

  test('large version: 99.100.255', () => {
    expect(parseSemver('99.100.255')).toEqual([99, 100, 255]);
  });
});

// ── semverGt ──────────────────────────────────────────────────────────────────

describe('semverGt', () => {
  test('1.0.1 > 1.0.0', () => expect(semverGt('1.0.1', '1.0.0')).toBeTruthy());
  test('1.1.0 > 1.0.9', () => expect(semverGt('1.1.0', '1.0.9')).toBeTruthy());
  test('2.0.0 > 1.99.99', () => expect(semverGt('2.0.0', '1.99.99')).toBeTruthy());
  test('equal is not gt: 1.2.3 vs 1.2.3', () => expect(semverGt('1.2.3', '1.2.3')).toBeFalsy());
  test('lower is not gt: 1.0.0 vs 2.0.0', () => expect(semverGt('1.0.0', '2.0.0')).toBeFalsy());
  test('v-prefix stripped: v1.2.4 > v1.2.3', () => expect(semverGt('v1.2.4', 'v1.2.3')).toBeTruthy());
  test('pre-release stripped: 1.2.3-rc2 vs 1.2.3', () => expect(semverGt('1.2.3-rc2', '1.2.3')).toBeFalsy());
  test('0.0.0 is not gt 0.0.0', () => expect(semverGt('0.0.0', '0.0.0')).toBeFalsy());
  test('patch only: 1.0.1 > 1.0.0', () => expect(semverGt('1.0.1', '1.0.0')).toBeTruthy());
});

// ── buildStartCommand ─────────────────────────────────────────────────────────

describe('buildStartCommand', () => {
  test('packet is exactly 20 bytes', () => {
    expect(buildStartCommand(1024)).toHaveLength(20);
  });

  test('command code is 0x0001 LE at bytes 0-1', () => {
    const pkt = buildStartCommand(0);
    expect(pkt[0]).toBe(0x01);
    expect(pkt[1]).toBe(0x00);
  });

  test('file length encoded LE in bytes 2-5', () => {
    const pkt = buildStartCommand(0x01020304);
    expect(pkt[2]).toBe(0x04); // low byte
    expect(pkt[3]).toBe(0x03);
    expect(pkt[4]).toBe(0x02);
    expect(pkt[5]).toBe(0x01); // high byte
  });

  test('small file length: 256 bytes', () => {
    const pkt = buildStartCommand(256);
    expect(pkt[2]).toBe(0x00);
    expect(pkt[3]).toBe(0x01);
    expect(pkt[4]).toBe(0x00);
    expect(pkt[5]).toBe(0x00);
  });

  test('bytes 6-17 are zero (reserved)', () => {
    const pkt = buildStartCommand(1024);
    for (let i = 6; i < 18; i++) {
      if (pkt[i] !== 0) throw new Error(`Byte ${i} should be 0, got ${pkt[i]}`);
    }
  });

  test('CRC at bytes 18-19 is valid (verify by recomputing)', () => {
    const fileLen = 131072; // 128KB
    const pkt = buildStartCommand(fileLen);
    const expected = crc16(pkt, 18);
    const actual = pkt[18] | (pkt[19] << 8);
    expect(actual).toBe(expected);
  });

  test('different file sizes produce different CRCs', () => {
    const a = buildStartCommand(1000);
    const b = buildStartCommand(2000);
    const crcA = a[18] | (a[19] << 8);
    const crcB = b[18] | (b[19] << 8);
    if (crcA === crcB) throw new Error('Different file sizes should produce different CRCs');
  });
});

// ── isCommandAckAccepted ──────────────────────────────────────────────────────

describe('isCommandAckAccepted', () => {
  test('accepted: status 0x0000 at bytes 4-5', () => {
    const data = new Uint8Array([0, 0, 0, 0, 0x00, 0x00]);
    expect(isCommandAckAccepted(data)).toBeTruthy();
  });

  test('rejected: status 0x0001', () => {
    const data = new Uint8Array([0, 0, 0, 0, 0x01, 0x00]);
    expect(isCommandAckAccepted(data)).toBeFalsy();
  });

  test('rejected: status 0xFFFF', () => {
    const data = new Uint8Array([0, 0, 0, 0, 0xFF, 0xFF]);
    expect(isCommandAckAccepted(data)).toBeFalsy();
  });

  test('too short: returns false', () => {
    expect(isCommandAckAccepted(new Uint8Array([0, 0, 0, 0, 0]))).toBeFalsy();
  });

  test('empty buffer: returns false', () => {
    expect(isCommandAckAccepted(new Uint8Array(0))).toBeFalsy();
  });
});

// ── isSectorAckSuccess ────────────────────────────────────────────────────────

describe('isSectorAckSuccess', () => {
  test('success: status 0x0000 at bytes 2-3', () => {
    const data = new Uint8Array([0, 0, 0x00, 0x00]);
    expect(isSectorAckSuccess(data)).toBeTruthy();
  });

  test('error: status 0x0001', () => {
    const data = new Uint8Array([0, 0, 0x01, 0x00]);
    expect(isSectorAckSuccess(data)).toBeFalsy();
  });

  test('error: status 0x0002 (CRC error from board)', () => {
    const data = new Uint8Array([0, 0, 0x02, 0x00]);
    expect(isSectorAckSuccess(data)).toBeFalsy();
  });

  test('too short (3 bytes): returns false', () => {
    expect(isSectorAckSuccess(new Uint8Array([0, 0, 0]))).toBeFalsy();
  });
});

// ── buildSectorPackets ────────────────────────────────────────────────────────

describe('buildSectorPackets', () => {
  test('tiny sector (100 bytes) produces 1 packet', () => {
    const data = new Uint8Array(100).fill(0xAB);
    const pkts = buildSectorPackets(0, data);
    expect(pkts).toHaveLength(1);
  });

  test('single packet: last-packet marker (0xFF) at byte[2]', () => {
    const data = new Uint8Array(100).fill(0xAB);
    const pkts = buildSectorPackets(0, data);
    expect(pkts[0][2]).toBe(0xFF);
  });

  test('single packet: sector index LE at bytes 0-1', () => {
    const data = new Uint8Array(10).fill(1);
    const pkts = buildSectorPackets(0x0102, data);
    expect(pkts[0][0]).toBe(0x02);
    expect(pkts[0][1]).toBe(0x01);
  });

  test('single packet: CRC appended after data (last 2 bytes)', () => {
    const data = new Uint8Array(100).fill(0x42);
    const pkts = buildSectorPackets(0, data);
    const pkt = pkts[0];
    // Packet = [sectorLo, sectorHi, 0xFF, ...data, crcLo, crcHi]
    expect(pkt.length).toBe(3 + 100 + 2);
    // Verify CRC: recompute over data portion
    const crcBuf = new Uint8Array(SECTOR_SIZE);
    crcBuf.set(data, 0);
    const expected = crc16(crcBuf, 100);
    const actual = pkt[3 + 100] | (pkt[3 + 100 + 1] << 8);
    expect(actual).toBe(expected);
  });

  test('large sector (504 bytes exactly) produces 1 packet', () => {
    const data = new Uint8Array(504).fill(0x55);
    const pkts = buildSectorPackets(0, data);
    expect(pkts).toHaveLength(1);
  });

  test('505-byte sector produces 2 packets', () => {
    const data = new Uint8Array(505).fill(0x55);
    const pkts = buildSectorPackets(0, data);
    expect(pkts).toHaveLength(2);
  });

  test('multi-packet: non-last packets have sequential packetNum at byte[2]', () => {
    const data = new Uint8Array(1500).fill(0xCC);
    const pkts = buildSectorPackets(0, data);
    // All but last should have sequential packet numbers 0, 1, 2, ...
    for (let i = 0; i < pkts.length - 1; i++) {
      expect(pkts[i][2]).toBe(i);
    }
  });

  test('multi-packet: last packet has 0xFF marker', () => {
    const data = new Uint8Array(1500).fill(0xCC);
    const pkts = buildSectorPackets(0, data);
    expect(pkts[pkts.length - 1][2]).toBe(0xFF);
  });

  test('full 4096-byte sector: correct packet count', () => {
    const data = new Uint8Array(4096).fill(0x11);
    const pkts = buildSectorPackets(0, data);
    // 4096 / 504 = 8.126... → 9 packets (8 × 504 = 4032, last = 64 bytes)
    const expected = Math.ceil(4096 / MAX_DATA_PER_PACKET);
    expect(pkts).toHaveLength(expected);
  });

  test('full sector: no data is lost (total data bytes = sectorData.length)', () => {
    const data = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) data[i] = i & 0xFF;
    const pkts = buildSectorPackets(0, data);
    // Reconstruct data from packets
    const reconstructed = [];
    for (let p = 0; p < pkts.length; p++) {
      const pkt = pkts[p];
      const isLast = pkt[2] === 0xFF;
      const dataEnd = isLast ? pkt.length - 2 : pkt.length;
      for (let i = 3; i < dataEnd; i++) reconstructed.push(pkt[i]);
    }
    if (reconstructed.length !== 4096) throw new Error(`Got ${reconstructed.length} bytes, expected 4096`);
    for (let i = 0; i < 4096; i++) {
      if (reconstructed[i] !== (i & 0xFF)) throw new Error(`Byte ${i} corrupted`);
    }
  });

  test('sector index 0 and 255 both encode correctly', () => {
    const data = new Uint8Array(10).fill(0);
    expect(buildSectorPackets(0, data)[0][0]).toBe(0);
    expect(buildSectorPackets(0, data)[0][1]).toBe(0);
    expect(buildSectorPackets(255, data)[0][0]).toBe(255);
    expect(buildSectorPackets(255, data)[0][1]).toBe(0);
  });

  test('sector index 256 encodes as [0x00, 0x01]', () => {
    const data = new Uint8Array(10).fill(0);
    const pkt = buildSectorPackets(256, data)[0];
    expect(pkt[0]).toBe(0x00);
    expect(pkt[1]).toBe(0x01);
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`✓ All ${passed} tests passed`);
} else {
  console.log(`${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
