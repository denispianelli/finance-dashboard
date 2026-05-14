module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'ci', 'perf', 'style', 'build', 'spike'],
    ],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
