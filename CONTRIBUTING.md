# Contributing

Yinsen is MIT licensed; contributions use the same license. This package supports
one operator and client accounts per independently owned installation. Keep
changes focused, explain the user-visible problem and include meaningful checks.

Use Node22.21.1/npm10.9.4, ripgrep (`rg`), `npm ci` and the private configuration in
[INSTALL.md](INSTALL.md). Use isolated synthetic PostgreSQL databases named
`yinsen_test_…`, with separate runtime/migrator roles. Export matching
`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DATABASE_SSL=disable` for local fixtures,
`APP_ORIGIN` and `TEST_ISOLATED_DATABASE=1`, then run `npm run check`. Tests refuse
the preserved installation database. Run builds/checks serially and do not share
live `.next` output between development and production builds.

For an installed distribution check, build from clean committed source with a
positive increasing `RELEASE_SEQUENCE`, then run `npm run package:qualify` as
documented. Its strict checks, installed HTTP/domain/security suites and Chromium
journey exercise the exact images. New behavior also needs actual runtime proof;
compilation or a mocked helper alone is insufficient. Preserve migration history,
authorization, privacy, accessibility and real failure/replay behavior. Never
include private environments, credentials, screenshots of real clients, raw proof
logs or database/file backups in a contribution.

The repository owner controls publication and deployment. Use
[DB-Conneely/Yinsen](https://github.com/DB-Conneely/Yinsen) for contributions and
[its issues](https://github.com/DB-Conneely/Yinsen/issues) for ordinary reproducible
bugs. See [SUPPORT.md](SUPPORT.md) for safe issue and security reporting.
