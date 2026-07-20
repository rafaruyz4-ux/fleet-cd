import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Pastas que o linter ignora.
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  // Regras-base recomendadas (JS + TypeScript).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Ajustes do projeto (backend Node).
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      // Variável não usada vira aviso; prefixo "_" significa "de propósito".
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Em alguns pontos do Express/pg o any é inevitável; vira aviso, não erro.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Arquivos servidos ao NAVEGADOR (app do motorista) — globais do browser.
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        alert: 'readonly',
      },
    },
  },

  // Desliga regras de estilo que brigam com o Prettier (Prettier cuida do formato).
  prettier,
);
