/** @format */

// Conventional Commits: `type(scope): subject`.
// Single source of the rules: tarodan-ops docs/commit-and-branch-rules.md.
// Runs only in the local commit-msg hook (.husky/commit-msg); CI does not lint
// commit history, so tightening these rules never re-judges old commits.
// Merge commits and git's own `Revert "..."` / `Reapply "..."` messages are
// skipped (default ignores plus the explicit pattern below).
module.exports = {
	extends: ['@commitlint/config-conventional'],
	ignores: [(message) => /^(Revert|Reapply) "/.test(message)],
	plugins: [
		{
			rules: {
				// English only: reject non-ASCII in the header (Turkish characters, emoji, ...).
				'header-ascii-only': ({ header }) => [
					/^[\x00-\x7F]*$/.test(header || ''),
					'commit header must be in English (ASCII only): no Turkish characters or emoji',
				],
			},
		},
	],
	rules: {
		'header-ascii-only': [2, 'always'],
		'header-max-length': [2, 'always', 72],
		'type-enum': [
			2,
			'always',
			['feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'chore', 'build', 'ci', 'style', 'revert'],
		],
		// Lower-case subject: it must not start with a capital letter. Proper names
		// and identifiers inside the subject (PayTR, CLAUDE.md, TableBadge) stay legal.
		'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
		'body-max-line-length': [0],
		// A change that spans areas joins scopes with a comma: `fix(api,i18n): ...`.
		// Each part is checked against this list. Leave the scope out only for
		// repo-wide changes.
		'scope-enum': [
			2,
			'always',
			[
				'api',
				'web',
				'admin',
				'ui',
				'types',
				'i18n',
				'design-tokens',
				'auth',
				'shared',
				'infra',
				'ci',
				'deps',
				'release',
				'scripts',
			],
		],
	},
};
