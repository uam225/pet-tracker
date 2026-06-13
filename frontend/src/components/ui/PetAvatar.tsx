import { getPetColorHex } from '@/utils/petColors'
import type { Species } from '@/types/api'

interface PetAvatarProps {
  petId: number
  name: string
  species: Species
  size?: 'sm' | 'md' | 'lg'
}

const SIZE = {
  sm: { container: 'w-8 h-8 text-sm',  emoji: 'text-base' },
  md: { container: 'w-11 h-11 text-lg', emoji: 'text-xl'  },
  lg: { container: 'w-16 h-16 text-2xl', emoji: 'text-3xl' },
}

const SPECIES_EMOJI: Record<Species, string> = {
  dog: '🐕',
  cat: '🐈',
}

export function PetAvatar({ petId, name, species, size = 'md' }: PetAvatarProps) {
  const color = getPetColorHex(petId)
  const s = SIZE[size]

  return (
    <div
      className={`${s.container} rounded-full flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: color + '22', border: `2px solid ${color}44` }}
      aria-label={name}
    >
      <span className={s.emoji} role="img" aria-hidden>
        {SPECIES_EMOJI[species]}
      </span>
    </div>
  )
}

/** Inline colour dot, used in list items */
export function PetColorDot({ petId }: { petId: number }) {
  const color = getPetColorHex(petId)
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}
