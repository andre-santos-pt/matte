// jest.config.cjs
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/tests/*.test.ts'], // Looks for any file ending in .test.ts
};