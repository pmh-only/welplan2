<script lang="ts">
  import MenuPage from '$lib/components/MenuPage.svelte'
  import GalleryPage from './gallery/+page.svelte'

  let { data } = $props()
</script>

{#if data.rootMode === 'takein'}
  <MenuPage {data} kind="takein" />
{:else}
  <GalleryPage {data} />
{/if}
