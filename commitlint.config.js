/** @format */

// Conventional Commits — `type(scope): subject`
// Messages MUST be in English (ASCII only). Example: feat(web): seller profile tabs
module.exports = {
	extends: ['@commitlint/config-conventional'],
	plugins: [
		{
			rules: {
				// English-only: reject non-ASCII in the header (Turkish chars, emoji, …).
				'header-ascii-only': ({ header }) => [
					/^[\x00-\x7F]*$/.test(header || ''),
					'commit header must be in English (ASCII only) — no Turkish characters or emoji',
				],
			},
		},
	],
	rules: {
		// English only, enforced on the header (also the squash-merge commit title).
		'header-ascii-only': [2, 'always'],
		// Allow any subject case (e.g. "Add …" or "add …").
		'subject-case': [0],
		'body-max-line-length': [0],
		// Scope optional but recommended (warning → does not block the commit).
		'scope-enum': [
			1,
			'always',
			[
				'web',
				'admin',
				'api',
				'mobile',
				'ui',
				'ui-native',
				'auth',
				'shared',
				'types',
				'design-tokens',
				'infra',
				'ci',
				'deps',
				'release',
			],
		],
	},
};
