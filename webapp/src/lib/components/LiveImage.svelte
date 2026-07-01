<script lang="ts">
  import { tick } from 'svelte'

  let {
    src,
    alt,
    imageClass = '',
    loading = undefined,
    fetchpriority = undefined,
    fill = false,
    onerror = undefined
  }: {
    src: string
    alt: string
    imageClass?: string
    loading?: 'eager' | 'lazy'
    fetchpriority?: 'high' | 'low' | 'auto'
    fill?: boolean
    onerror?: (src: string) => void
  } = $props()

  let baseSrc = $state(src)
  let pendingSrc = $state<string | null>(null)
  let overlaySrc = $state<string | null>(null)
  let baseLoaded = $state(false)
  let overlayLoaded = $state(false)
  let baseImage = $state<HTMLImageElement | null>(null)
  const isThumb = $derived(imageClass.includes('thumb'))
  const isLightbox = $derived(imageClass.includes('lightbox-img'))

  $effect(() => {
    if (src === baseSrc || src === pendingSrc || src === overlaySrc) return

    if (!baseSrc) {
      baseSrc = src
      pendingSrc = null
      overlaySrc = null
      return
    }

    if (overlaySrc) {
      baseSrc = overlaySrc
      overlaySrc = null
      overlayLoaded = false
    }
    pendingSrc = src
  })

  $effect(() => {
    const _baseSrc = baseSrc
    baseLoaded = false

    tick().then(() => {
      if (baseImage?.complete && baseImage.naturalWidth > 0) baseLoaded = true
    })
  })

  function handleBaseLoad () {
    baseLoaded = true
  }

  function handlePendingLoad () {
    if (!pendingSrc) return
    overlaySrc = pendingSrc
    overlayLoaded = false
    pendingSrc = null
  }

  function handlePendingError () {
    if (!pendingSrc) return
    onerror?.(pendingSrc)
    pendingSrc = null
  }

  function handleOverlayError () {
    if (!overlaySrc) return
    onerror?.(overlaySrc)
    overlaySrc = null
    overlayLoaded = false
  }
</script>

<span class="live-image-stack" class:fill class:thumb={isThumb} class:lightbox={isLightbox} class:loaded={baseLoaded || overlayLoaded}>
  <span class="live-image-placeholder" aria-hidden="true"></span>
  <img bind:this={baseImage} class={`${imageClass} live-image-base`} class:loaded={baseLoaded} src={baseSrc} {alt} {loading} decoding="async" {fetchpriority} onload={handleBaseLoad} onerror={() => onerror?.(baseSrc)} />
  {#if pendingSrc}
    <img class={`${imageClass} live-image-pending`} src={pendingSrc} alt="" aria-hidden="true" decoding="async" onload={handlePendingLoad} onerror={handlePendingError} />
  {/if}
  {#if overlaySrc}
    <img class={`${imageClass} live-image-overlay`} class:loaded={overlayLoaded} src={overlaySrc} alt="" aria-hidden="true" decoding="async" onload={() => { overlayLoaded = true }} onerror={handleOverlayError} />
  {/if}
</span>

<style>
  .live-image-stack {
    position: relative;
    display: block;
    overflow: hidden;
    background: #fff;
  }

  .live-image-stack img {
    display: block;
  }

  .live-image-placeholder {
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(circle at 30% 22%, rgba(255, 255, 255, 0.9), transparent 28%),
      linear-gradient(135deg, #fff 0%, #f8fafc 48%, #fff 100%);
    filter: blur(10px);
    transform: scale(1.08);
    opacity: 1;
    transition: opacity 0.22s ease;
  }

  .live-image-stack.loaded .live-image-placeholder {
    opacity: 0;
  }

  .live-image-stack.fill {
    position: absolute;
    inset: 0;
  }

  .live-image-stack.fill img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .live-image-stack.thumb {
    width: 52px;
    height: 52px;
    border-radius: 6px;
    overflow: hidden;
  }

  .live-image-stack.thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .live-image-stack.lightbox {
    width: 100%;
    aspect-ratio: 1;
    background: #fff;
  }

  .live-image-stack.lightbox img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
  }

  .live-image-pending {
    opacity: 0;
    pointer-events: none;
  }

  .live-image-base,
  .live-image-overlay {
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .live-image-base.loaded,
  .live-image-overlay.loaded {
    opacity: 1;
  }

  .live-image-base,
  .live-image-overlay,
  .live-image-pending {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .live-image-overlay {
    z-index: 2;
  }
</style>
