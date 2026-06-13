/**
 * Assigns a consistent colour identity to each pet.
 *
 * Colours are assigned by the order pets appear in the sorted list (stable).
 * The same pet always gets the same colour within a session.
 * The palette is designed to be clearly distinct at small sizes (avatars, chips).
 */

export const PET_COLORS = [
  { bg: 'bg-pet-blue',   text: 'text-pet-blue',   hex: '#4A7FB5', label: 'Blue'   },
  { bg: 'bg-pet-violet', text: 'text-pet-violet',  hex: '#8B6BAF', label: 'Violet' },
  { bg: 'bg-pet-amber',  text: 'text-pet-amber',   hex: '#C98445', label: 'Amber'  },
  { bg: 'bg-pet-teal',   text: 'text-pet-teal',    hex: '#3D8B7F', label: 'Teal'   },
] as const

export type PetColorEntry = typeof PET_COLORS[number]

/** Map from pet ID to color index, maintained as a module-level cache. */
const colorCache = new Map<number, number>()

/**
 * Given an ordered list of pet IDs, assigns and caches a colour index to each.
 * Call this once after the pets list loads.
 */
export function assignPetColors(petIds: number[]): void {
  petIds.forEach((id, idx) => {
    if (!colorCache.has(id)) {
      colorCache.set(id, idx % PET_COLORS.length)
    }
  })
}

/** Return the colour entry for a pet ID. Falls back to the first colour. */
export function getPetColor(petId: number): PetColorEntry {
  const idx = colorCache.get(petId) ?? 0
  return PET_COLORS[idx % PET_COLORS.length]
}

/** CSS hex value for a pet, useful for inline styles. */
export function getPetColorHex(petId: number): string {
  return getPetColor(petId).hex
}

/** Meal type display labels */
export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  snack:     'Snack',
  dinner:    'Dinner',
  ad_hoc:    'Ad hoc',
}

/** Meal type display order for dogs */
export const MEAL_TYPE_ORDER = ['breakfast', 'snack', 'dinner', 'ad_hoc']

/** Format HH:MM:SS time string to HH:MM */
export function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

/** Format an ISO datetime to a human-readable time (local) */
export function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format an ISO date string to a readable date */
export function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Current datetime as ISO string (for fed_at field) */
export function nowISO(): string {
  return new Date().toISOString()
}

/** Format deviation minutes to a readable string */
export function formatDeviation(minutes: number): string {
  if (minutes === 0) return 'On time'
  const abs = Math.abs(minutes)
  const sign = minutes < 0 ? 'early' : 'late'
  if (abs < 60) return `${abs}m ${sign}`
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m > 0 ? `${h}h ${m}m ${sign}` : `${h}h ${sign}`
}

/** Score label helpers */
export const STOOL_QUALITY_LABELS: Record<number, string> = {
  1: '1 — Liquid',
  2: '2 — Very soft',
  3: '3 — Ideal',
  4: '4 — Firm',
  5: '5 — Very firm',
  6: '6 — Hard pellets',
  7: '7 — Chalky',
}
