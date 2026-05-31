/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
      },
    }],
  },
  // Skip RN/Expo modules that aren't testable in node env
  transformIgnorePatterns: [
    'node_modules/(?!(buffer)/)',
  ],
  collectCoverageFrom: [
    'services/FirmwareUpdateService.ts',
    'services/AuthService.ts',
    'constants/gpio.ts',
  ],
};
