export const WORD_CATEGORIES = {
  ENVIRONMENTS: [
    'forest', 'mountain', 'river', 'lake', 'ocean', 'meadow',
    'valley', 'glacier', 'spring', 'desert', 'canyon', 'plateau',
    'prairie', 'coast', 'cliff', 'waterfall'
  ],
  FLORA: [
    'tree', 'flower', 'leaf', 'grass', 'moss', 'fern',
    'willow', 'cedar', 'oak', 'maple',
    'pine', 'birch', 'elm', 'sycamore'
  ],
  WATER: [
    'tide', 'current', 'ripple', 'cascade'
  ],
  LIGHT: [
    'glow', 'shimmer', 'sparkle', 'glimmer', 'radiance',
    'shine', 'dusk', 'dawn', 'twilight', 'penumbra',
    'glare', 'moonlight', 'glint'
  ]
};

export const WORDS = Object.values(WORD_CATEGORIES).flat();



