import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

// `eslint-import-resolver-node` is a devDependency only because `@leyman/eslint-config` sets no import-x resolver, so
// import-x falls back to that optional peer and crashes without it. Remove it once the config sets its own resolver.
export default configGenerator({ configUrl: import.meta.url, node: true, packageJson });
