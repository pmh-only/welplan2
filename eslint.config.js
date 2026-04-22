import neostandard from 'neostandard'

export default [
  ...neostandard({ ts: true }),
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.svelte-kit/**', '**/build/**']
  },
  {
    rules: {
      '@stylistic/space-before-function-paren': [
        'error',
        {
          named: 'never',
          anonymous: 'always',
          asyncArrow: 'always'
        }
      ]
    }
  }
]
