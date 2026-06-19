// Lighting scenes & routines — reusable looks for the Govee strip.
//
// A scene is just a target { rgb, brightness }. Tapping one applies it instantly.
// Routines (Wakeup / Bedtime) are *fades*: they carry a `fade` kind + duration so
// the Pi strip agent can ramp toward the target over time. Applied from the
// dashboard they set the end-state immediately; the gradual ramp is handled by the
// agent when these are wired into the Schedule phase. `icon` names map to
// lucide-react icons resolved in the Scenes page.

export const SCENES = [
  { key: 'relax',   label: 'Relax',   icon: 'Moon',     rgb: [255, 147, 41],  brightness: 40,  desc: 'Warm, low amber glow' },
  { key: 'focus',   label: 'Focus',   icon: 'Lightbulb',rgb: [255, 244, 229], brightness: 100, desc: 'Bright neutral white' },
  { key: 'movie',   label: 'Movie',   icon: 'Film',     rgb: [90, 40, 160],   brightness: 22,  desc: 'Dim cinematic violet' },
  { key: 'reading', label: 'Reading', icon: 'BookOpen', rgb: [255, 214, 170], brightness: 75,  desc: 'Soft warm white' },
  { key: 'party',   label: 'Party',   icon: 'Sparkles', rgb: [255, 0, 128],   brightness: 100, desc: 'Vivid magenta' },
];

export const ROUTINES = [
  {
    key: 'wakeup', label: 'Wakeup', icon: 'Sunrise',
    rgb: [255, 180, 95], brightness: 100,
    fade: 'sunrise', fadeMinutes: 20,
    desc: 'Sunrise fade — off to warm full over ~20 min',
  },
  {
    key: 'bedtime', label: 'Bedtime', icon: 'Sunset',
    rgb: [255, 120, 40], brightness: 8,
    fade: 'sunset', fadeMinutes: 15,
    desc: 'Wind-down to a dim ember, then off',
  },
];

export const ALL_SCENES = [...SCENES, ...ROUTINES];
