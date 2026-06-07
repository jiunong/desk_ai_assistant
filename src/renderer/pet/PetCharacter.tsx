import Lottie from 'lottie-react'
import type { PetState } from '../../shared/global.d'
import eatingAnim from './animations/eating.json'
import logoImg from './performance/logo.png'
import thinkGif from './performance/think.gif'

interface Props {
  state: PetState
  size: number
}

const IMAGE_ASPECT = 1.35

export default function PetCharacter({ state, size }: Props) {
  const width = size
  const height = Math.round(size * IMAGE_ASPECT)

  return (
    <div className="pet-character" style={{ width, height }}>
      {(state === 'eating' || state === 'talking') && (
        <div className="lottie-overlay eating">
          <Lottie
            animationData={eatingAnim}
            loop={state === 'eating'}
            style={{ width: Math.round(size * 0.75), height: Math.round(size * 0.75) }}
          />
        </div>
      )}
      <img
        src={state === 'thinking' ? thinkGif : logoImg}
        alt="桌面宠物"
        className={`pet-logo state-${state}`}
        style={{ width, height }}
        draggable={false}
      />
    </div>
  )
}
