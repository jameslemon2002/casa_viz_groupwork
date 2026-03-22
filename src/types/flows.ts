export type CompactFlow = {
  oLon: number;
  oLat: number;
  dLon: number;
  dLat: number;
  oName: string;
  dName: string;
  count: number;
  dur: number;
};

export type CompactHotspot = {
  lon: number;
  lat: number;
  name: string;
  dep: number;
  arr: number;
  act: number;
};
