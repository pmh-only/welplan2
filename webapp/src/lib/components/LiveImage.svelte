<script lang="ts">
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
    }
    pendingSrc = src
  })

  function handlePendingLoad () {
    if (!pendingSrc) return
    overlaySrc = pendingSrc
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
  }
</script>

<span class="live-image-stack" class:fill class:thumb={isThumb} class:lightbox={isLightbox}>
  <img class={imageClass} src={baseSrc} {alt} {loading} decoding="async" {fetchpriority} onerror={() => onerror?.(baseSrc)} />
  {#if pendingSrc}
    <img class={`${imageClass} live-image-pending`} src={pendingSrc} alt="" aria-hidden="true" decoding="async" onload={handlePendingLoad} onerror={handlePendingError} />
  {/if}
  {#if overlaySrc}
    <img class={`${imageClass} live-image-overlay`} src={overlaySrc} alt="" aria-hidden="true" decoding="async" onerror={handleOverlayError} />
  {/if}
</span>

<style>
  .live-image-stack {
    position: relative;
    display: block;
  }

  .live-image-stack img {
    display: block;
  }

  .live-image-stack.fill {
    position: absolute;
    inset: 0;
    overflow: hidden;
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
    background: var(--surface);
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

  .live-image-overlay,
  .live-image-pending {
    position: absolute;
    inset: 0;
  }
</style>
