export default {
  testEnvironment: 'node',
  transform: {},
  // extensionsToTreatAsEsm: ['.js'], // Remove this as it's inferred from package.json type: module
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  verbose: true,
  // Allow for ESM support in Jest
  transformIgnorePatterns: [],
  // Setup test environment for ESM
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
};
