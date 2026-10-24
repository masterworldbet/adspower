export const devicePresets = {
  desktop: { name: "Desktop", width: 1280, height: 800, scale: 1 },
  android: {
    name: "Android · Mobile Emulation",
    width: 393,
    height: 851,
    scale: 2.75,
  },
  iphone: {
    name: "จอขนาด iPhone · Chrome Mobile",
    width: 390,
    height: 844,
    scale: 3,
  },
} as const;
export type DeviceMode = keyof typeof devicePresets;
