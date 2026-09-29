export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__tests__/**',
    '!src/index.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000
};
