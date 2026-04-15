<script lang="ts">
  import MenuPage from '$lib/components/MenuPage.svelte'

  let { data } = $props()
</script>

<MenuPage data={data} kind="takeout" />
