<script lang="ts">
  import { goto } from '$app/navigation'
  import { onMount } from 'svelte'
  import RestaurantGalleryPage from '$lib/components/RestaurantGalleryPage.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  onMount(() => {
    goto(data.detailPath, { replaceState: true })
  })
</script>

<RestaurantGalleryPage {data} />
