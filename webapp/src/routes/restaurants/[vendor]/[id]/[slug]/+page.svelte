<script lang="ts">
  import RestaurantGalleryPage from '$lib/components/RestaurantGalleryPage.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<RestaurantGalleryPage {data} />
