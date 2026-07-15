<script lang="ts">
  import RestaurantGalleryPage from '$lib/components/RestaurantGalleryPage.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

{#await data.galleryData}
  <RestaurantGalleryPage data={{ ...data, menus: [], mealTimeMenus: [], loading: true }} />
{:then galleryData}
  <RestaurantGalleryPage data={{ ...data, ...galleryData }} />
{/await}
