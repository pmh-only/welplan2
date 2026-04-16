<script lang="ts">
  import GalleryPage from './gallery/+page.svelte'

  let { data } = $props()
</script>

<GalleryPage {data} />
