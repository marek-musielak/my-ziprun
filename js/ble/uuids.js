// Skróty do 16-bitowych UUID Bluetooth SIG oraz UUID protokołów własnościowych.

export const u16 = (n) =>
  `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;

export const FTMS = {
  service: u16(0x1826),
  feature: u16(0x2acc),            // Fitness Machine Feature
  treadmillData: u16(0x2acd),      // Treadmill Data (notify)
  trainingStatus: u16(0x2ad3),
  speedRange: u16(0x2ad4),         // Supported Speed Range
  inclineRange: u16(0x2ad5),       // Supported Inclination Range
  controlPoint: u16(0x2ad9),       // Control Point (write + indicate)
  machineStatus: u16(0x2ada),      // Fitness Machine Status (notify)
};

export const HRS = {
  service: u16(0x180d),
  measurement: u16(0x2a37),
};

// Protokoły własnościowe spotykane w bieżniach obsługiwanych przez FitShow.
// Nie wiemy z góry, którego używa dana bieżnia — dlatego wszystkie są
// deklarowane jako optionalServices i sprawdzane po połączeniu.
export const PROPRIETARY = [
  u16(0xfff0),                                // FitShow / iConsole (najczęstszy)
  u16(0xffe0),                                // warianty Zhirun / Yijian
  u16(0xfee7),                                // Telink
  u16(0xff00),
  u16(0xfe00),
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',     // Nordic UART Service
  '0000ffe5-0000-1000-8000-00805f9b34fb',
];

export const DEVICE_INFO = {
  service: u16(0x180a),
  manufacturer: u16(0x2a29),
  model: u16(0x2a24),
  firmware: u16(0x2a26),
  software: u16(0x2a28),
  serial: u16(0x2a25),
};

export const ALL_OPTIONAL = [
  FTMS.service,
  HRS.service,
  DEVICE_INFO.service,
  u16(0x1800), // Generic Access
  u16(0x180f), // Battery
  ...PROPRIETARY,
];

// Ładne nazwy dla widoku diagnostyki.
export const KNOWN_NAMES = {
  [FTMS.service]: 'Fitness Machine Service (FTMS)',
  [FTMS.feature]: 'FTMS Feature',
  [FTMS.treadmillData]: 'Treadmill Data',
  [FTMS.trainingStatus]: 'Training Status',
  [FTMS.speedRange]: 'Supported Speed Range',
  [FTMS.inclineRange]: 'Supported Inclination Range',
  [FTMS.controlPoint]: 'Control Point',
  [FTMS.machineStatus]: 'Machine Status',
  [HRS.service]: 'Heart Rate Service',
  [HRS.measurement]: 'Heart Rate Measurement',
  [DEVICE_INFO.service]: 'Device Information',
  [u16(0xfff0)]: 'Prawdopodobnie protokół FitShow / iConsole',
  [u16(0xfff1)]: 'FitShow: kanał notyfikacji (dane z bieżni)',
  [u16(0xfff2)]: 'FitShow: kanał zapisu (komendy do bieżni)',
  [u16(0xfff3)]: 'FitShow: dodatkowy kanał zapisu',
  [u16(0x180f)]: 'Battery Service',
  ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']: 'Nordic UART Service',
  ['6e400002-b5a3-f393-e0a9-e50e24dcca9e']: 'Nordic UART RX (zapis)',
  ['6e400003-b5a3-f393-e0a9-e50e24dcca9e']: 'Nordic UART TX (notyfikacje)',
};

export const hex = (buf) => {
  const b = buf instanceof DataView ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
                                    : new Uint8Array(buf);
  return [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
};

export const parseHex = (str) =>
  new Uint8Array(
    str.trim().split(/[\s,]+/).filter(Boolean).map((t) => parseInt(t.replace(/^0x/i, ''), 16))
  );
