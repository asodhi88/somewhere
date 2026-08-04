import { useEffect, useRef } from 'react'
import { largeUrl } from '../lib/format'

// Unsplash API terms: photographer credit (linked to their profile) plus a link
// to Unsplash, both carrying our utm_source. Non-negotiable — see ResultCard.
const UTM = '?utm_source=raccoon&utm_medium=referral'

/**
 * Lightbox — an enlarged view of a destination photo. Mounted only while open
 * (so its Escape/scroll-lock effects don't run otherwise). Dismissed by the
 * backdrop, the Escape key, or the close button. Attribution sits more
 * prominently here than in the card corner, since there's room.
 */
export default function Lightbox({ image, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const { url, photographer, profile_url, city, country } = image

  return (
    <div
      className="rc-lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${city} photo, enlarged`}
    >
      <div className="rc-lightbox__inner" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          type="button"
          className="rc-lightbox__close"
          onClick={onClose}
          aria-label="Close enlarged photo"
        >
          ×
        </button>
        <img
          className="rc-lightbox__img"
          src={largeUrl(url)}
          alt={`${city}, ${country}`}
        />
        <div className="rc-lightbox__attr">
          Photo by{' '}
          {profile_url ? (
            <a href={profile_url + UTM} target="_blank" rel="noreferrer noopener">
              {photographer}
            </a>
          ) : (
            photographer
          )}
          {' on '}
          <a href={'https://unsplash.com/' + UTM} target="_blank" rel="noreferrer noopener">
            Unsplash
          </a>
        </div>
      </div>
    </div>
  )
}
