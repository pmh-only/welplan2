import type { Restaurant } from './types'

export const DEFAULT_RESTAURANTS: Restaurant[] = [
  { id: 'REST000007', name: 'R5 B1F', vendor: 'welstory' },
  { id: 'REST000008', name: 'R5 B2F', vendor: 'welstory' },
  { id: 'REST000003', name: 'R4 레인보우(B1F)', vendor: 'welstory' },
  { id: 'REST000005', name: 'R4 오아시스(B1F)', vendor: 'welstory' },
  { id: 'REST000013', name: 'R3 하모니(B1F)', vendor: 'welstory' },
  { id: 'CAF04', name: '패밀리홀', vendor: 'shinsegae', busiCd: 'RH3_K_001', compCd: 'K_KR_017', storCd: 'CAF04', orgTreeId: '0:0:10' } as unknown as Restaurant
]
