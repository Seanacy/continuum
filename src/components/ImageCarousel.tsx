'use client'

import { useState, useRef, useEffect } from 'react'

interface CarouselImage {
  imageType: string
  imageUrl: string
}

const TYPE_LABELS: Record<string, string> = {
  head_front: 'Front',
  head_left: 'Left',
  head_right: 'Right',
  body_front: 'Body',
  body_left: 'Body L',
  body_right: 'Body R',
}

export default function ImageCarousel({
  images,
  size = 'md',
}: {
  images: CarouselImage[]
  size?: 'sm' | 'md' | 'lg'
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sort images by type order
  const typeOrder = ['head_front', 'head_left', 'head_right', 'body_front', 'body_left', 'body_right']
  const sorted = [...images].sort((a, b) => {
    return typeOrder.indexOf(a.imageType) - typeOrder.indexOf(b.imageType)
  })

  // Size configs
  const sizeConfig = {
    sm: { width: 'w-12 h-12', dot: 'w-1.5 h-1.5' },
    md: { width: 'w-48 h-64', dot: 'w-2 h-2' },
    lg: { width: 'w-64 h-80', dot: 'w-2.5 h-2.5' },
  }
  const config = sizeConfig[size]

  // For small (avatar) size, just show the first image as a circle
  if (size === 'sm') {
    if (sorted.length === 0) return null
    return (
      <img
        src={sorted[0].imageUrl}
        alt="Character"
        className="w-12 h-12 rounded-full object-cover flex-shrink-0"
      />
    )
  }

  if (sorted.length === 0) return null

  // Handle scroll snap position detection
  function handleScroll() {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const scrollLeft = container.scrollLeft
    const itemWidth = container.offsetWidth
    const newIndex = Math.round(scrollLeft / itemWidth)
    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < sorted.length) {
      setActiveIndex(newIndex)
    }
  }

  // Scroll to a specific index
  function scrollTo(index: number) {
    if (!scrollRef.current) return
    const itemWidth = scrollRef.current.offsetWidth
    scrollRef.current.scrollTo({ left: itemWidth * index, behavior: 'smooth' })
    setActiveIndex(index)
  }

  return (
    <div className="w-full">
      {/* Scroll container with snap */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`${config.width} rounded-xl overflow-hidden flex snap-x snap-mandatory overflow-x-auto scrollbar-hide`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {sorted.map((img, i) => (
          <div
            key={img.imageType}
            className={`${config.width} flex-shrink-0 snap-center`}
          >
            <img
              src={img.imageUrl}
              alt={TYPE_LABELS[img.imageType] || img.imageType}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {sorted.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {sorted.map((img, i) => (
            <button
              key={img.imageType}
              type="button"
              onClick={() => scrollTo(i)}
              className={`${config.dot} rounded-full transition-all ${
                i === activeIndex
                  ? 'bg-continuum-accent scale-125'
                  : 'bg-continuum-border hover:bg-continuum-muted'
              }`}
              aria-label={TYPE_LABELS[img.imageType] || `Image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
