import type { PageLoad } from './$types'

export const load: PageLoad = ({ params, url }) => {
  const test = url.searchParams.get('test')
  return {
    internalId: params.id,
    creationTest: test === 'sent' || test === 'skipped' || test === 'failed' ? test : undefined
  }
}
