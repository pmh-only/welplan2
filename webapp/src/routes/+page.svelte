<script lang="ts">
  import { goto } from '$app/navigation'
  import { app } from '$lib/state.svelte'

  $effect(() => {
    if (app.date && app.selectedMealTimeId) {
      goto(`/menu/${app.date}/${app.selectedMealTimeId}`, { replaceState: true })
    }
  })
</script>
