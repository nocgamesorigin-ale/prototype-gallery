// Device presets for the phone frame — CSS viewport sizes in portrait,
// the same list as the GameKit preview so a game looks the same in both.

const iphone = (id, label, width, height, radius, cutout, safeTop, safeBottom = 34) =>
  ({ id, label, group: 'iphone', width, height, radius, cutout, safeTop, safeBottom, kind: 'phone' });
const android = (id, label, width, height, radius, safeTop = 24, safeBottom = 16) =>
  ({ id, label, group: 'android', width, height, radius, cutout: 'punch', safeTop, safeBottom, kind: 'phone' });
const tablet = (id, label, width, height, radius, safeTop = 24, safeBottom = 20) =>
  ({ id, label, group: 'tablet', width, height, radius, cutout: 'none', safeTop, safeBottom, kind: 'tablet' });

export const FILL_ID = 'fill';
export const CUSTOM_ID = 'custom';
export const BEZEL = 12;

export const DEVICES = [
  { id: FILL_ID, label: 'Vừa khung', group: 'free', width: 0, height: 0, radius: 0, cutout: 'none', safeTop: 0, safeBottom: 0, kind: 'free' },
  { id: CUSTOM_ID, label: 'Tuỳ chỉnh', group: 'free', width: 360, height: 640, radius: 0, cutout: 'none', safeTop: 0, safeBottom: 0, kind: 'free' },

  iphone('iphone-se', 'iPhone SE', 375, 667, 0, 'none', 20, 0),
  iphone('iphone-xr', 'iPhone XR', 414, 896, 41, 'notch', 48),
  iphone('iphone-12-pro', 'iPhone 12 Pro', 390, 844, 47, 'notch', 47),
  iphone('iphone-14', 'iPhone 14', 390, 844, 47, 'notch', 47),
  iphone('iphone-14-pro-max', 'iPhone 14 Pro Max', 430, 932, 55, 'island', 59),
  iphone('iphone-15-pro', 'iPhone 15 Pro', 393, 852, 55, 'island', 59),
  iphone('iphone-15-pro-max', 'iPhone 15 Pro Max', 430, 932, 55, 'island', 59),
  iphone('iphone-16-pro', 'iPhone 16 Pro', 402, 874, 62, 'island', 62),
  iphone('iphone-16-pro-max', 'iPhone 16 Pro Max', 440, 956, 62, 'island', 62),

  android('galaxy-z-fold5', 'Galaxy Z Fold5 (màn ngoài)', 344, 882, 22),
  android('galaxy-s23', 'Galaxy S23', 360, 780, 28),
  android('galaxy-s24-ultra', 'Galaxy S24 Ultra', 384, 832, 16),
  android('galaxy-a54', 'Galaxy A54', 412, 915, 28),
  android('pixel-7', 'Pixel 7', 412, 915, 28),
  android('pixel-8-pro', 'Pixel 8 Pro', 448, 998, 32),

  tablet('ipad-mini', 'iPad mini', 744, 1133, 18),
  tablet('ipad-10', 'iPad (gen 10)', 820, 1180, 18),
  tablet('ipad-pro-11', 'iPad Pro 11"', 834, 1194, 18),
  tablet('ipad-pro-13', 'iPad Pro 12.9"', 1024, 1366, 18),
  tablet('galaxy-tab-s9', 'Galaxy Tab S9', 800, 1280, 16),
];

export const GROUPS = [
  { id: 'free', label: 'Kích thước tự do' },
  { id: 'iphone', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'tablet', label: 'Máy tính bảng' },
];

export const DEFAULT_DEVICE_ID = 'iphone-14';

export function deviceById(id) {
  return DEVICES.find((d) => d.id === id) || DEVICES.find((d) => d.id === DEFAULT_DEVICE_ID);
}

export function parseSize(text) {
  const m = String(text).trim().match(/^(\d{2,4})\s*[x×,*\s]\s*(\d{2,4})$/i);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (width < 100 || height < 100 || width > 4000 || height > 4000) return null;
  return { width, height };
}

export function sizeLabel(d) {
  return `${d.width} × ${d.height}`;
}

/**
 * Screen and frame size for a device inside availW × availH CSS px.
 * Fill takes the whole area; everything else is scaled down to fit (never up).
 */
export function frameGeometry(device, landscape, availW, availH) {
  if (device.id === FILL_ID) {
    const w = Math.max(100, Math.floor(availW));
    const h = Math.max(100, Math.floor(availH));
    return { screenW: w, screenH: h, frameW: w, frameH: h, bezel: 0, scale: 1 };
  }
  const bezel = device.kind === 'free' ? 0 : BEZEL;
  const screenW = landscape ? device.height : device.width;
  const screenH = landscape ? device.width : device.height;
  const frameW = screenW + bezel * 2;
  const frameH = screenH + bezel * 2;
  const margin = 32;
  let scale = Math.min((availW - margin) / frameW, (availH - margin) / frameH, 1);
  scale = Math.max(0.1, Math.floor(scale * 100) / 100);
  return { screenW, screenH, frameW, frameH, bezel, scale };
}

/** Safe-area insets (CSS px) for the current orientation. */
export function safeInsets(device, landscape) {
  if (!device || device.kind === 'free') return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!landscape) return { top: device.safeTop, right: 0, bottom: device.safeBottom, left: 0 };
  // Landscape: the cutout side gets the top inset; iPhones mirror it on the other side
  // and keep a shorter home-indicator band at the bottom.
  const cut = device.cutout === 'notch' || device.cutout === 'island';
  return {
    top: device.kind === 'tablet' ? device.safeTop : 0,
    left: cut || device.cutout === 'punch' ? device.safeTop : 0,
    right: cut ? device.safeTop : 0,
    bottom: device.safeBottom ? Math.min(21, device.safeBottom) : 0,
  };
}
