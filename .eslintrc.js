module.exports = {
    env: {
        node: true,
        es2021: true,
        browser: true,
    },
    extends: [
        'eslint:recommended',
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    rules: {
        'no-unusued-vars': 'warn',
        'no-console': 'warn',
        'indent': ['error', 2],
        'quotes': ['error', 'single'],
        'semi': ['error', 'always'],
        'comma-dangle': ['error', 'always-multiline'],
        'no-trailing-spaces': 'error',
        'eol-last': ['error', 'always'],
    },
    overrides: [
        {
            files: ['frontend/**/*.{js,jsx}'],
            extends: ['eslint:recommended'],
            env: {
                browser: true,
                es6: true,
            },
            parserOptions: {
                ecmaFeatures: {
                jsx: true,
                },
            },
        },
        {
            files: ['backend/**/*.js'],
            env: {
                node: true,
                jest: true,
            },
        },
    ],
};