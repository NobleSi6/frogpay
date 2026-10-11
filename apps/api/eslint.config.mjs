import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/modules/payments/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'stripe',
              message: 'Payments must call providers only through PaymentProviderRegistry.',
            },
            {
              name: '@stripe/stripe-js',
              message: 'Payments must call providers only through PaymentProviderRegistry.',
            },
            {
              name: '@stripe/react-stripe-js',
              message: 'Payments must call providers only through PaymentProviderRegistry.',
            },
          ],
          patterns: [
            {
              group: [
                '**/provider-adapters/adapters/**',
                '**/adapters/**',
                '**/providers/**',
              ],
              message: 'Payments must not import provider adapters or SDK wrappers directly.',
            },
          ],
        },
      ],
    },
  },
);