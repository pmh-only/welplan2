<script lang="ts">
  import WebhookEditor from '../+page.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<WebhookEditor {data} />
