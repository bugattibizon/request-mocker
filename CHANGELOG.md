# Changelog

All notable changes to Request Mocker are recorded here. The version in
`manifest.json` is the source of truth and is shown in the popup header.
This project follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

## [1.1.1]

### Fixed
- Branch Mode: CORS error on token refresh. The credentialed `Access-Control-Allow-Origin`
  is now built from the origin the page itself reports (via the content-script bridge)
  instead of the currently focused tab, so a background refresh no longer fails when
  another tab is in focus.

## [1.1.0]

### Added
- **Branch Mode** — reroute every fetch/XHR request from one backend host to
  another (path, query and headers preserved). Runs credentialed with
  auto-detected origin, so both token auth and cookie auth work with no setup;
  Origin/Referer are stripped via declarativeNetRequest to pass origin allowlists.
- **Jenkins dev-env page mode** — a standalone header switch that redesigns the
  `jenkins.anybiz.io/job/dev-env/build` parameters form into a compact launcher.
- **Inject Headers** panel — add request headers to matching requests.
- Version shown in the popup header (read live from the manifest).

### Changed
- Popup redesigned ("Console" direction, blue brand).
- Jenkins moved out of the tab bar into a plain header switch.
- Removed the redundant "N of M active" header summary.

## [1.0.0]

### Added
- Initial release: intercept and mock fetch/XMLHttpRequest with rule matching
  (substring or regex), custom status/headers/body, delay, and import/export.
- DevTools panel for capturing real requests into mock rules.
