// Labeled profile-image slots for Orbit characters (6 per character).
export const ORBIT_IMAGE_SLOTS = [
  { key: 'face_front', label: 'Front Facial Profile' },
  { key: 'face_left', label: 'Left Facial Profile' },
  { key: 'face_right', label: 'Right Facial Profile' },
  { key: 'body_front', label: 'Front Full Body Profile' },
  { key: 'body_left', label: 'Left Full Body Profile' },
  { key: 'body_right', label: 'Right Full Body Profile' },
] as const

export type OrbitImageSlotKey = (typeof ORBIT_IMAGE_SLOTS)[number]['key']
export const ORBIT_IMAGE_SLOT_KEYS: string[] = ORBIT_IMAGE_SLOTS.map((s) => s.key)
