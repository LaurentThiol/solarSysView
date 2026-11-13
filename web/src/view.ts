export interface ViewSettings {
  exponent: number;
  size: number;
  orbits: boolean;
  names: boolean;
  belt: boolean;
  follow: boolean;
}

export const defaultView: ViewSettings = {
  exponent: 0.55,
  size: 16,
  orbits: true,
  names: true,
  belt: true,
  follow: false,
};
