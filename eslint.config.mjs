import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Never lint build/generated output: dist, the Prisma-generated client (src/generated),
    // and emitted .d.ts declarations — they aren't hand-authored source.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/generated/**',
      '**/*.d.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        // `_`-named discards are intentional (e.g. `const { x: _, ...rest } = obj` to omit a key);
        // ignoreRestSiblings covers the destructure-omit pattern specifically.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
)
