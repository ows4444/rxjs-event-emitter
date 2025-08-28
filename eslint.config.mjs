// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**/*',
      'node_modules/**/*',
      '*.js',
      '*.mjs',
      'coverage/**/*',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // TypeScript-specific rules for NestJS/RxJS patterns
      '@typescript-eslint/no-explicit-any': 'off', // Required for NestJS DI and RxJS patterns
      '@typescript-eslint/no-unsafe-assignment': 'warn', // Warn instead of error for flexibility
      '@typescript-eslint/no-unsafe-member-access': 'warn', // Common in NestJS DI patterns
      '@typescript-eslint/no-unsafe-call': 'warn', // Common in RxJS and NestJS patterns
      '@typescript-eslint/no-unsafe-argument': 'warn', // Allow for NestJS providers
      '@typescript-eslint/no-unsafe-return': 'warn', // Common in handler patterns
      '@typescript-eslint/no-floating-promises': 'warn', // Important for RxJS
      
      // Async/await rules - relaxed for NestJS patterns
      '@typescript-eslint/require-await': 'off', // Many NestJS methods are async by contract
      
      // Code style and formatting
      'max-len': [
        'error',
        {
          code: 160,
          ignoreComments: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
          ignoreUrls: true,
        },
      ],
      
      // Prettier configuration
      'prettier/prettier': [
        'error', 
        { 
          printWidth: 160,
          singleQuote: true,
          trailingComma: 'all',
          tabWidth: 2,
          semi: true,
        }
      ],
      
      // NestJS and RxJS specific patterns
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      
      // Allow empty functions for NestJS lifecycle hooks
      '@typescript-eslint/no-empty-function': [
        'error',
        {
          allow: ['constructors', 'methods'],
        },
      ],
      
      // Interface and type preferences
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      
      // RxJS-specific rules
      '@typescript-eslint/prefer-promise-reject-errors': 'off', // RxJS error patterns
      
      // Performance and best practices
      '@typescript-eslint/prefer-readonly': 'warn',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off', // Too strict for NestJS
      
      // Allow console in logger patterns
      'no-console': 'off', // NestJS Logger patterns
      
      // Complexity rules
      complexity: ['warn', 25], // Allow reasonable complexity for event processing
      'max-depth': ['warn', 4],
      'max-params': ['warn', 5], // NestJS constructors can have many params
      
      // Import rules
      'import/prefer-default-export': 'off',
      'import/no-default-export': 'off',
    },
  },
  {
    // Test-specific overrides
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off', // Common in Jest patterns
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'max-len': 'off', // Test descriptions can be long
      'max-params': 'off', // Test setups can have many parameters
      '@typescript-eslint/no-floating-promises': 'off', // Test async patterns
    },
  },
  {
    // Interface files - stricter typing
    files: ['**/*.interfaces.ts', '**/types.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // Prefer proper typing in interfaces
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    },
  },
  {
    // Service files - NestJS patterns
    files: ['**/*.service.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off', // Common in DI patterns
      '@typescript-eslint/no-unsafe-member-access': 'off', // Common in NestJS services
      'max-params': ['warn', 6], // NestJS services can have many dependencies
    },
  },
  {
    // Module files - NestJS patterns  
    files: ['**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off', // Module configurations
      'max-params': 'off', // Module constructors can be complex
    },
  },
);
