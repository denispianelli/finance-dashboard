# Changelog

All notable changes to this project are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
From v0.1.0 onward this file is generated automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org/). Do not edit
released sections by hand.

## [0.7.0](https://github.com/denispianelli/finance-dashboard/compare/v0.6.1...v0.7.0) (2026-06-16)


### Features

* **investment:** import Fortuneo bourse CSV (operations → flows + shares) ([#234](https://github.com/denispianelli/finance-dashboard/issues/234)) ([588e6b1](https://github.com/denispianelli/finance-dashboard/commit/588e6b1c9544c9e1601a5ed168566e6e81684cdc))
* **investment:** opt-in market-price feed (Phase B) ([#235](https://github.com/denispianelli/finance-dashboard/issues/235)) ([4ba2aaf](https://github.com/denispianelli/finance-dashboard/commit/4ba2aaf078f7f2c766314b18441105b81733228b))
* **investment:** per-support TRI/TTWROR tracking (Phase A) ([#233](https://github.com/denispianelli/finance-dashboard/issues/233)) ([5adab3a](https://github.com/denispianelli/finance-dashboard/commit/5adab3acf89616b6f9f403f9ef471d835a4672b2))
* **patrimoine:** allocation by asset class with targets ([#232](https://github.com/denispianelli/finance-dashboard/issues/232)) ([e2f83f7](https://github.com/denispianelli/finance-dashboard/commit/e2f83f7d87919398b74707ce521c6b4402c2027d))
* **patrimoine:** mortgage module v1 (import amortization table + net worth) ([#227](https://github.com/denispianelli/finance-dashboard/issues/227)) ([de97bc6](https://github.com/denispianelli/finance-dashboard/commit/de97bc65b759d5343fa3c1c916fd0bd8b1e48dda))
* **patrimoine:** split mortgage payments in reports (brick 2) ([#228](https://github.com/denispianelli/finance-dashboard/issues/228)) ([9739edb](https://github.com/denispianelli/finance-dashboard/commit/9739edbc81656edc27b492b1c9208b0c0a31c809))


### Bug Fixes

* **categories:** scroll the cards internally so the page stays fixed ([#225](https://github.com/denispianelli/finance-dashboard/issues/225)) ([e7f74d0](https://github.com/denispianelli/finance-dashboard/commit/e7f74d0e8110080a41a13a7720943c7e9063e16e))

## [0.6.1](https://github.com/denispianelli/finance-dashboard/compare/v0.6.0...v0.6.1) (2026-06-12)


### Bug Fixes

* **shell:** refresh sidebar net worth after account create/rename/delete ([#222](https://github.com/denispianelli/finance-dashboard/issues/222)) ([5b44dc4](https://github.com/denispianelli/finance-dashboard/commit/5b44dc49d3959d8a8d34085a2e4c902a732f2d5d))

## [0.6.0](https://github.com/denispianelli/finance-dashboard/compare/v0.5.0...v0.6.0) (2026-06-12)

### Features

- **backup:** local rotating snapshots + read-only JSON export ([#220](https://github.com/denispianelli/finance-dashboard/issues/220)) ([c5341b2](https://github.com/denispianelli/finance-dashboard/commit/c5341b2c85bafa877c05200113d2b2bdeb1b0f91))
- **reports:** kit tooltips on the flow bars and donut slices ([#217](https://github.com/denispianelli/finance-dashboard/issues/217)) ([cb1a035](https://github.com/denispianelli/finance-dashboard/commit/cb1a0353e3a58f11fbb8e8bdb6633f44ba14e4b5))
- **sync:** encrypted sync-folder snapshots for multi-machine use ([#208](https://github.com/denispianelli/finance-dashboard/issues/208)) ([540271b](https://github.com/denispianelli/finance-dashboard/commit/540271b70a45036add713ad306c9fde04963a82e))

### Documentation

- **spec:** local rotating backups + read-only JSON export design ([#219](https://github.com/denispianelli/finance-dashboard/issues/219)) ([033b46e](https://github.com/denispianelli/finance-dashboard/commit/033b46e6686b012d49210e4d10b10bfd6e36f94d))

## [0.5.0](https://github.com/denispianelli/finance-dashboard/compare/v0.4.0...v0.5.0) (2026-06-11)

### Features

- **categorize:** auto background categorization, non-blocking ([#207](https://github.com/denispianelli/finance-dashboard/issues/207)) ([0696b3e](https://github.com/denispianelli/finance-dashboard/commit/0696b3e674ac4c78b06224914455ff13362b0ecb))
- **categorize:** one-click rules from corrections + rules audit section ([#212](https://github.com/denispianelli/finance-dashboard/issues/212)) ([f59833e](https://github.com/denispianelli/finance-dashboard/commit/f59833e12d507c7a249442cfaf0b7eb922bbaf52))
- **dashboard:** show a hover tooltip on the balance chart ([#204](https://github.com/denispianelli/finance-dashboard/issues/204)) ([47a8cc5](https://github.com/denispianelli/finance-dashboard/commit/47a8cc5530c805bde183321cfa25b32c4a3242a4))
- **dashboard:** wire chart range chips to a real balance series ([#202](https://github.com/denispianelli/finance-dashboard/issues/202)) ([3acab5a](https://github.com/denispianelli/finance-dashboard/commit/3acab5ac1f3f653f422cd1dd8790f60af8ddfc30))
- **import:** allow acknowledged import despite a failed arithmetic check ([#203](https://github.com/denispianelli/finance-dashboard/issues/203)) ([db0dbfd](https://github.com/denispianelli/finance-dashboard/commit/db0dbfde5e2ad7aac1d49650fe7b17e9437d35c8))
- **import:** capture multi-line PDF labels; key on digit-free tokens ([#205](https://github.com/denispianelli/finance-dashboard/issues/205)) ([74b9667](https://github.com/denispianelli/finance-dashboard/commit/74b9667b6e4c19325a04344f0224fac1fe27da6f))
- **import:** manual bank mapping assistant (ADR-019 phase 1b) ([#214](https://github.com/denispianelli/finance-dashboard/issues/214)) ([e6b29e1](https://github.com/denispianelli/finance-dashboard/commit/e6b29e195eeca7ee0ef4aa3dffa217e9573143d9))

### Bug Fixes

- **categorize:** key history matching on stableLabelKey ([#200](https://github.com/denispianelli/finance-dashboard/issues/200)) ([56a3d98](https://github.com/denispianelli/finance-dashboard/commit/56a3d98b3a820689da5792ebb8c6ca80d65a1f1b))
- **categorize:** match contains rules at word boundaries ([#198](https://github.com/denispianelli/finance-dashboard/issues/198)) ([d5bdc3f](https://github.com/denispianelli/finance-dashboard/commit/d5bdc3f11771ea84277d1e1a0d04c0b397716cff))
- **import:** import the selected non-duplicate rows of an already-known file ([#210](https://github.com/denispianelli/finance-dashboard/issues/210)) ([48ac51e](https://github.com/denispianelli/finance-dashboard/commit/48ac51ea71ce7538d36304b3d37f3ab07cc3127f))

### Refactoring

- remove the LLM (ADR-019 phase 2) ([#215](https://github.com/denispianelli/finance-dashboard/issues/215)) ([f7d1ea3](https://github.com/denispianelli/finance-dashboard/commit/f7d1ea36a4a45de1f0d47040551bd39690acbcde))

### Documentation

- **adr:** amend ADR-009 — personal patrimoine tool, assets & liabilities in scope ([#209](https://github.com/denispianelli/finance-dashboard/issues/209)) ([d2788b0](https://github.com/denispianelli/finance-dashboard/commit/d2788b0e141fc7dda865f3e00fcf653609d43fdf))
- **adr:** decide LLM removal — deterministic categorization and bank mapping (ADR-019) ([#211](https://github.com/denispianelli/finance-dashboard/issues/211)) ([f347a36](https://github.com/denispianelli/finance-dashboard/commit/f347a36312f46ea10aa1c6e68fa834a3134143b0))
- **claude:** add working-loop rules for single-maintainer build sessions ([#213](https://github.com/denispianelli/finance-dashboard/issues/213)) ([1c46498](https://github.com/denispianelli/finance-dashboard/commit/1c46498a72fad7ae8eacbc106c6472ec7358084c))
- realign README with ADR-009 scope; archive shipped specs and plans ([#206](https://github.com/denispianelli/finance-dashboard/issues/206)) ([a763812](https://github.com/denispianelli/finance-dashboard/commit/a763812644df4c96e9fb5a076074563368c257e2))

## [0.4.0](https://github.com/denispianelli/finance-dashboard/compare/v0.3.0...v0.4.0) (2026-06-10)

### Features

- **sidebar:** net worth anchor + manual collapse toggle ([#178](https://github.com/denispianelli/finance-dashboard/issues/178)) ([3a07c89](https://github.com/denispianelli/finance-dashboard/commit/3a07c890fec116d8c5464453e6cc0c84b916a926))

### Bug Fixes

- **import:** honour the OFX declared charset instead of forcing latin-1 ([#188](https://github.com/denispianelli/finance-dashboard/issues/188)) ([0ff47b2](https://github.com/denispianelli/finance-dashboard/commit/0ff47b2d45eabda33e19c93610ac646542d2d78a)), closes [#182](https://github.com/denispianelli/finance-dashboard/issues/182)
- **import:** robust amount/date/balance parsing for non-LCL banks ([#187](https://github.com/denispianelli/finance-dashboard/issues/187)) ([ea5ff4c](https://github.com/denispianelli/finance-dashboard/commit/ea5ff4ca55e658833ac6ffd7926b49c816c4ed21))
- **main:** backend correctness cleanup (label normalize, NaN, no-op, dates, logs) ([#190](https://github.com/denispianelli/finance-dashboard/issues/190)) ([cdf7ea3](https://github.com/denispianelli/finance-dashboard/commit/cdf7ea3e55e76b8f4dc6637ba805fe860edcafb6))
- **nav:** sidebar import opens the modal; drop dead placeholders ([#176](https://github.com/denispianelli/finance-dashboard/issues/176)) ([e951808](https://github.com/denispianelli/finance-dashboard/commit/e951808a0dfb9fbde01f0d492afb300134d1137a))
- **renderer:** consistent data invalidation and visible IPC read errors ([#192](https://github.com/denispianelli/finance-dashboard/issues/192)) ([0f2a35c](https://github.com/denispianelli/finance-dashboard/commit/0f2a35cdf08d775df42e86f272cbf65b88a00c76)), closes [#181](https://github.com/denispianelli/finance-dashboard/issues/181)
- **security:** harden renderer against egress and arbitrary file reads ([#179](https://github.com/denispianelli/finance-dashboard/issues/179)) ([028b9f4](https://github.com/denispianelli/finance-dashboard/commit/028b9f4bd9e8904ac5829d88ac9d20bd1a19bd74))
- **ui:** remove dead controls — chart range chips, CSV picker, silent categorize ([#189](https://github.com/denispianelli/finance-dashboard/issues/189)) ([4d54d90](https://github.com/denispianelli/finance-dashboard/commit/4d54d90afda28b940f587ec683c687667dd903c8)), closes [#183](https://github.com/denispianelli/finance-dashboard/issues/183)

## [0.3.0](https://github.com/denispianelli/finance-dashboard/compare/v0.2.0...v0.3.0) (2026-06-08)

### Features

- **categorize:** dedup + one-label-per-call + skeleton ([#170](https://github.com/denispianelli/finance-dashboard/issues/170)) ([04905cd](https://github.com/denispianelli/finance-dashboard/commit/04905cdb40db39dd11acbd75f1b7537fd0c0b563))
- **categorize:** passthrough payees categorized by amount ([#173](https://github.com/denispianelli/finance-dashboard/issues/173)) ([54e5e4a](https://github.com/denispianelli/finance-dashboard/commit/54e5e4a1689c845d0b9857266be0bcca3cba3423))
- **llm:** GPU (CUDA) acceleration for categorization ([#168](https://github.com/denispianelli/finance-dashboard/issues/168)) ([495a622](https://github.com/denispianelli/finance-dashboard/commit/495a6227723684fd3b011a5a513d82cd3b5baf6a))
- **llm:** hardware-tiered model selection (adopt Qwen-7B) ([#174](https://github.com/denispianelli/finance-dashboard/issues/174)) ([c4da5da](https://github.com/denispianelli/finance-dashboard/commit/c4da5da4706ef381c132f7575558a659a5e8befb))
- **model:** active-model transparency + opt-in upgrade banner (Phase B) ([#175](https://github.com/denispianelli/finance-dashboard/issues/175)) ([8541b21](https://github.com/denispianelli/finance-dashboard/commit/8541b21cc8c0e03bcb3843d6e19b809ff983f88b))

### Bug Fixes

- **llm:** model download on fresh install + CPU-only build ([#166](https://github.com/denispianelli/finance-dashboard/issues/166)) ([c51dbb7](https://github.com/denispianelli/finance-dashboard/commit/c51dbb76cd7e7af050c12757fdc5bdc709fcd68a))

## [0.2.0](https://github.com/denispianelli/finance-dashboard/compare/v0.1.0...v0.2.0) (2026-06-08)

### Features

- **reports:** filter by a specific year/month + shadcn area chart ([#154](https://github.com/denispianelli/finance-dashboard/issues/154)) ([4ab0076](https://github.com/denispianelli/finance-dashboard/commit/4ab007694a535b89b86a59d63d89ce6d839c55d3))
- **design-system:** add identity token foundation ([#156](https://github.com/denispianelli/finance-dashboard/issues/156)) ([2f6625e](https://github.com/denispianelli/finance-dashboard/commit/2f6625e20b9dae604d9c78df009a3d6b83d46ac8))
- **chrome:** show page title + breadcrumb on every route ([#157](https://github.com/denispianelli/finance-dashboard/issues/157)) ([bfabb30](https://github.com/denispianelli/finance-dashboard/commit/bfabb30adccdb6ef0df9a60dbe4e68846646a0ae))
- **design-system:** unify euro formatting and font-sans (drift #1) ([#158](https://github.com/denispianelli/finance-dashboard/issues/158)) ([59a8c88](https://github.com/denispianelli/finance-dashboard/commit/59a8c88d7d381efb0cf2396803821aecb607c5dc))
- **dashboard:** conform Dashboard + Transactions to the kit ([#159](https://github.com/denispianelli/finance-dashboard/issues/159)) ([6ffeccc](https://github.com/denispianelli/finance-dashboard/commit/6ffecccb12768451898b18d9a2c42ddb207fa35f))
- **reports:** conform Reports to the kit ([#160](https://github.com/denispianelli/finance-dashboard/issues/160)) ([1b1fed7](https://github.com/denispianelli/finance-dashboard/commit/1b1fed7acaf9fdd7bcb8a9836ac68d3210bb765f))
- **settings:** conform remaining screens + final icon sweep ([#161](https://github.com/denispianelli/finance-dashboard/issues/161)) ([38e046f](https://github.com/denispianelli/finance-dashboard/commit/38e046f7adf3321055a316984979a263f982f730))
- **reports:** conform Reports to the updated kit + fix modal chrome ([#162](https://github.com/denispianelli/finance-dashboard/issues/162)) ([a4c6814](https://github.com/denispianelli/finance-dashboard/commit/a4c68140438e87dd04aed3bea4355c170486b1e0))
- opt-in LLM model download (just-in-time, non-blocking) ([#163](https://github.com/denispianelli/finance-dashboard/issues/163)) ([e2e8637](https://github.com/denispianelli/finance-dashboard/commit/e2e8637ef9dcc80a3fe6cd261dfc5ce53597ec14))
- desktop packaging for personal Windows + macOS builds ([#164](https://github.com/denispianelli/finance-dashboard/issues/164)) ([955360a](https://github.com/denispianelli/finance-dashboard/commit/955360a3736bbb1e615a69bcd2c66d19a1d01497))
- **accounts:** create accounts and pick the target account at import ([4282c76](https://github.com/denispianelli/finance-dashboard/commit/4282c7662f0c142872aa18f027bf4ecc70a3b7e1))
- **accounts:** F2 — declared balance for unanchored accounts ([#150](https://github.com/denispianelli/finance-dashboard/issues/150)) ([893a0d4](https://github.com/denispianelli/finance-dashboard/commit/893a0d4f5238231ff18be76db2d29f393bd0fd7c))
- **accounts:** manage accounts in Settings (add, rename, delete) ([#133](https://github.com/denispianelli/finance-dashboard/issues/133)) ([a7a3d2b](https://github.com/denispianelli/finance-dashboard/commit/a7a3d2bde9fe4224614ed7ebcdb1196699bd0ca6))
- **accounts:** move account management to a dedicated view ([#135](https://github.com/denispianelli/finance-dashboard/issues/135)) ([913e8e6](https://github.com/denispianelli/finance-dashboard/commit/913e8e628350185776f4901c14cdf109001e46fc))
- add arithmetic verification guard ([#30](https://github.com/denispianelli/finance-dashboard/issues/30)) ([#52](https://github.com/denispianelli/finance-dashboard/issues/52)) ([5ec15cb](https://github.com/denispianelli/finance-dashboard/commit/5ec15cb326be2279cf8dd557d0603068dfc43930))
- add deduplication levels 2 and 3 (period overlap + transaction hash) ([#51](https://github.com/denispianelli/finance-dashboard/issues/51)) ([c486356](https://github.com/denispianelli/finance-dashboard/commit/c486356d5358f6082aa6ae98eaa5d5b3d1947838))
- app shell with sidebar navigation and routing ([#9](https://github.com/denispianelli/finance-dashboard/issues/9)) ([#19](https://github.com/denispianelli/finance-dashboard/issues/19)) ([06bab1e](https://github.com/denispianelli/finance-dashboard/commit/06bab1e230b0d4bdc672f075a07b4eea75f197ce))
- apply design system — tokens, Lucide icons, shell structure, self-hosted fonts (Story [#65](https://github.com/denispianelli/finance-dashboard/issues/65)) ([#67](https://github.com/denispianelli/finance-dashboard/issues/67)) ([893baaa](https://github.com/denispianelli/finance-dashboard/commit/893baaa0fe6d1df7cc52444a627dc107174f0790))
- **categories:** create categories and reclassify transactions inline ([058cda5](https://github.com/denispianelli/finance-dashboard/commit/058cda52b0fe4451a0e98f1c2eaed098914781b9))
- **categories:** expose taxonomy/rules over IPC and add a Catégories page ([c66dcc6](https://github.com/denispianelli/finance-dashboard/commit/c66dcc68518a4e4d11b3c7cbe4d5bd64c7fddc70))
- **categories:** leaner default set (10) and delete category ([470cafd](https://github.com/denispianelli/finance-dashboard/commit/470cafd7a1758c5f55ace10ccf1970871eaf57c3))
- **categorize:** apply rule-based categorization at import ([9521b69](https://github.com/denispianelli/finance-dashboard/commit/9521b6921bb531ab6abcf61918b251743091a53f))
- **categorize:** LLM batch categorization (cascade tier-3, progressive in Review) ([#143](https://github.com/denispianelli/finance-dashboard/issues/143)) ([e5f5828](https://github.com/denispianelli/finance-dashboard/commit/e5f58280f06a95c0a8e54a2aa9e0121017ddb8bf))
- **categorize:** move LLM categorization to an async background pass ([#146](https://github.com/denispianelli/finance-dashboard/issues/146)) ([9ae12d1](https://github.com/denispianelli/finance-dashboard/commit/9ae12d19f7d50a929d38037bb835fe69e8d70a41))
- **dashboard:** account-tab UX — create-account modal + click-through to transactions ([#134](https://github.com/denispianelli/finance-dashboard/issues/134)) ([84a2815](https://github.com/denispianelli/finance-dashboard/commit/84a2815dda538dbb8d10b7a3cf40756f1ccf8db0))
- **dashboard:** add IPC channels to read accounts, transactions and aggregates ([86596f8](https://github.com/denispianelli/finance-dashboard/commit/86596f8ae34fec0fcc642cad00420d6103778338))
- **dashboard:** allow useDashboard to fetch the full transaction history ([a4ada9c](https://github.com/denispianelli/finance-dashboard/commit/a4ada9cad2e78fadc3fd53680fd4cac54ce9625e))
- **dashboard:** drive KPIs, 12-month chart and insight from real data ([e25d55d](https://github.com/denispianelli/finance-dashboard/commit/e25d55dbf9ee4e77ce6d6b79cc47d0cc9214b0de))
- **dashboard:** F1 — consolidated cash flow + net worth (transfer-aware) ([#149](https://github.com/denispianelli/finance-dashboard/issues/149)) ([a2705d6](https://github.com/denispianelli/finance-dashboard/commit/a2705d6b26b0bca059bbf2c7cfe8d29330b6292e))
- **dashboard:** show 10 latest transactions and link Tout voir to /transactions ([7d31908](https://github.com/denispianelli/finance-dashboard/commit/7d31908ffa3dc9e5d2b11c74788cc5feb77dfd17))
- **dashboard:** show real account balance from statement closing balances ([#144](https://github.com/denispianelli/finance-dashboard/issues/144)) ([5f059ce](https://github.com/denispianelli/finance-dashboard/commit/5f059ce5f2d1f46f2d77bab6bf0e8d5f842b4df1))
- **dashboard:** wire account tabs and transactions to real data ([b3c4e62](https://github.com/denispianelli/finance-dashboard/commit/b3c4e62136c5549abd1eb537dbdc6e79a3239012))
- **db:** add versioned taxonomy schema (migration 005) ([#91](https://github.com/denispianelli/finance-dashboard/issues/91)) ([81cd726](https://github.com/denispianelli/finance-dashboard/commit/81cd726079ab7cb5044385edf252eda4d91fb0dd)), closes [#81](https://github.com/denispianelli/finance-dashboard/issues/81)
- **db:** seed LCL bank and column mapping via migration 002 ([#26](https://github.com/denispianelli/finance-dashboard/issues/26)) ([#40](https://github.com/denispianelli/finance-dashboard/issues/40)) ([33c5f83](https://github.com/denispianelli/finance-dashboard/commit/33c5f83a34f781f78ffd94d0d43a696a9370292a))
- design system primitives + populated dashboard (Story [#69](https://github.com/denispianelli/finance-dashboard/issues/69)) ([#70](https://github.com/denispianelli/finance-dashboard/issues/70)) ([307e62d](https://github.com/denispianelli/finance-dashboard/commit/307e62d6581de1cfb90b43ae90beeb478dc6fbf7))
- Electron + Vite + React + TypeScript skeleton ([#5](https://github.com/denispianelli/finance-dashboard/issues/5)) ([#15](https://github.com/denispianelli/finance-dashboard/issues/15)) ([6c22752](https://github.com/denispianelli/finance-dashboard/commit/6c2275220da2e5300dac6a921f1a2b1af5ffa553))
- ESLint strict + Playwright E2E ([#10](https://github.com/denispianelli/finance-dashboard/issues/10)) ([#20](https://github.com/denispianelli/finance-dashboard/issues/20)) ([308658d](https://github.com/denispianelli/finance-dashboard/commit/308658d4c9c85ee6a491d1670916209017e8f92a))
- import pipeline backend — extract + atomic INSERT ([#31](https://github.com/denispianelli/finance-dashboard/issues/31)a) ([#53](https://github.com/denispianelli/finance-dashboard/issues/53)) ([40277aa](https://github.com/denispianelli/finance-dashboard/commit/40277aa8d146297e002e4fd1bcb6993808755f9d))
- import review UI (Story [#31](https://github.com/denispianelli/finance-dashboard/issues/31)b) ([#64](https://github.com/denispianelli/finance-dashboard/issues/64)) ([710c2d1](https://github.com/denispianelli/finance-dashboard/commit/710c2d12a7cf0bb085b1428b5e9dffdc31a2fccf))
- **import:** 'learn this bank' flow for unknown PDF banks (option A) ([9a4bbb5](https://github.com/denispianelli/finance-dashboard/commit/9a4bbb5050918beb78f9b7041c8927459d982082))
- **import:** accept OFX from any bank, not just seeded ones ([fdba4bc](https://github.com/denispianelli/finance-dashboard/commit/fdba4bcfccece07d8bc27e2468628e77f66d3245))
- **import:** add deterministic table extraction from LCL PDF tokens ([#27](https://github.com/denispianelli/finance-dashboard/issues/27)) ([#41](https://github.com/denispianelli/finance-dashboard/issues/41)) ([562676a](https://github.com/denispianelli/finance-dashboard/commit/562676ad6d7d263a87c0b88db95b14d6f67294d8))
- **import:** add PDF text extraction with pdfjs and coordinate tokens ([#39](https://github.com/denispianelli/finance-dashboard/issues/39)) ([90e1870](https://github.com/denispianelli/finance-dashboard/commit/90e1870a2e7f0cb405bf75fad0605af00ed809d0))
- **import:** derive PDF column x-thresholds from the LLM column order ([97426a2](https://github.com/denispianelli/finance-dashboard/commit/97426a2b89cd17a115db08eac5b09e9d8818c200))
- **import:** file ingestion + type detection + SHA-256 ([#24](https://github.com/denispianelli/finance-dashboard/issues/24)) ([#35](https://github.com/denispianelli/finance-dashboard/issues/35)) ([5a54268](https://github.com/denispianelli/finance-dashboard/commit/5a54268d9f3fc9cbcf415335a7dd5332e81c3ef2))
- **import:** generalize the PDF row parser for non-LCL layouts ([2db57af](https://github.com/denispianelli/finance-dashboard/commit/2db57afcefa6e06c487d795f3c2868ccf9af88bd))
- **import:** learn + persist a bank's column mapping from a sample (LLM) ([02dab8e](https://github.com/denispianelli/finance-dashboard/commit/02dab8e4478a6cbf2aae0139e494abd6aeb64614))
- **import:** multi-file import with learned account routing ([#141](https://github.com/denispianelli/finance-dashboard/issues/141)) ([332c2c0](https://github.com/denispianelli/finance-dashboard/commit/332c2c079a85114e3fb6614587816c6c9c376792))
- **llm:** add node-llama-cpp wrapper + PDF column-order inference ([c75a1e0](https://github.com/denispianelli/finance-dashboard/commit/c75a1e090734ea19b335bdcdaae3e85b9c48794e))
- OFX ingestion as primary import path ([#58](https://github.com/denispianelli/finance-dashboard/issues/58)) ([#59](https://github.com/denispianelli/finance-dashboard/issues/59)) ([d9f0717](https://github.com/denispianelli/finance-dashboard/commit/d9f0717ffb5cf8cd07149a035ef54ca0b226f890))
- **recurring:** D1 — recurring/subscription detection ([#152](https://github.com/denispianelli/finance-dashboard/issues/152)) ([20c3028](https://github.com/denispianelli/finance-dashboard/commit/20c3028d0a8d953b95d58095c137c7d99abda21a))
- **reports:** A1 — monthly/yearly gained-lost view on a new Reports page ([#151](https://github.com/denispianelli/finance-dashboard/issues/151)) ([c1849fd](https://github.com/denispianelli/finance-dashboard/commit/c1849fd1a51d79325f28cd93e84c7c125e60d7d5))
- **reports:** A2 — complete the Reports page (seven analyses) ([#153](https://github.com/denispianelli/finance-dashboard/issues/153)) ([9e83720](https://github.com/denispianelli/finance-dashboard/commit/9e83720bbd7957abcb96085d7849ffec5d245a6e))
- **settings:** content spec + first-draft Paramètres view ([#138](https://github.com/denispianelli/finance-dashboard/issues/138)) ([0edbe0a](https://github.com/denispianelli/finance-dashboard/commit/0edbe0abf83b9820f7814f03f4f48c23937cb731))
- SQLite setup with node:sqlite, migration runner, initial schema ([#8](https://github.com/denispianelli/finance-dashboard/issues/8)) ([#18](https://github.com/denispianelli/finance-dashboard/issues/18)) ([3037cf0](https://github.com/denispianelli/finance-dashboard/commit/3037cf041d8759e254ec603313d794b2244aecb0))
- Tailwind + shadcn/ui + dark theme ([#6](https://github.com/denispianelli/finance-dashboard/issues/6)) ([#16](https://github.com/denispianelli/finance-dashboard/issues/16)) ([53e593e](https://github.com/denispianelli/finance-dashboard/commit/53e593e91ac54e712cdf624c87c8db913419efb7))
- **taxonomy:** add rename/split/merge ops (T2 of [#74](https://github.com/denispianelli/finance-dashboard/issues/74)) ([#92](https://github.com/denispianelli/finance-dashboard/issues/92)) ([dce6ebc](https://github.com/denispianelli/finance-dashboard/commit/dce6ebc72274b48e219cd0f67f82d3814711bc80))
- **taxonomy:** add resolver + as-of aggregation (T3 of [#74](https://github.com/denispianelli/finance-dashboard/issues/74)) ([#95](https://github.com/denispianelli/finance-dashboard/issues/95)) ([1d216b6](https://github.com/denispianelli/finance-dashboard/commit/1d216b69e089a098bdcf6ba00fa57220495f711a))
- **transactions:** add filterable Transactions page and enable its route ([9c7ef50](https://github.com/denispianelli/finance-dashboard/commit/9c7ef50bca6ec86f503cf91c7212ebe40a265cda))
- **transactions:** add PeriodFilter (presets + range calendar) ([262370c](https://github.com/denispianelli/finance-dashboard/commit/262370ceb64dee1fa2920899e8821ffca53ee8e8))
- **transactions:** add pure client-side transaction filter ([4e7e815](https://github.com/denispianelli/finance-dashboard/commit/4e7e8159a62ef59b34ad84346e4200588399ba02))
- **transactions:** add reusable DateInput (typed field + calendar popover) ([373946e](https://github.com/denispianelli/finance-dashboard/commit/373946e87ee52e2ecce364053144d1260d27c6eb))
- **transactions:** default to last 30 days and use Du/Au range filter on the page ([411d389](https://github.com/denispianelli/finance-dashboard/commit/411d389a152c4da4e6716e5a99e280de902214e3))
- **transactions:** drop period presets, keep just the Du/Au fields ([f0d7b99](https://github.com/denispianelli/finance-dashboard/commit/f0d7b99429bb833f26e6583ea5649f24266dab22))
- **transactions:** inline edit + delete with audit trail ([#140](https://github.com/denispianelli/finance-dashboard/issues/140)) ([e5efa20](https://github.com/denispianelli/finance-dashboard/commit/e5efa20aef773b104ed25941abaaecce54d0cbc1))
- **transactions:** integrate recent-transactions preview and filterable Transactions page ([c0c7811](https://github.com/denispianelli/finance-dashboard/commit/c0c78119b97f45694406bd65365cd7684e2fa57d))
- **transactions:** paginate the Transactions list (25 per page) ([9bf6dd9](https://github.com/denispianelli/finance-dashboard/commit/9bf6dd943f4feac32f1823a5ad9334cf64c56cca))
- **transactions:** replace pagination with virtualized continuous scroll ([74cd2dc](https://github.com/denispianelli/finance-dashboard/commit/74cd2dc5545cca7bda00ab439473964460f755aa))
- **transactions:** rework PeriodFilter into presets + Du/Au fields ([7d506b0](https://github.com/denispianelli/finance-dashboard/commit/7d506b0bd9bb16563e81c754c1c89b991147cd44))
- **transactions:** use the Période filter (presets + date range) on the page ([65d3998](https://github.com/denispianelli/finance-dashboard/commit/65d39981fc231bbeb07d737572d62afdaab9fb6f))
- **transfers:** deterministic transfer-pair neutralization (ADR-016) ([#155](https://github.com/denispianelli/finance-dashboard/issues/155)) ([5b21727](https://github.com/denispianelli/finance-dashboard/commit/5b21727599caca19b6288b6c342ad7e0931b2d20))
- typed IPC bridge between main and renderer ([#7](https://github.com/denispianelli/finance-dashboard/issues/7)) ([#17](https://github.com/denispianelli/finance-dashboard/issues/17)) ([11de4b1](https://github.com/denispianelli/finance-dashboard/commit/11de4b1104caa0939838cf17c15216bc13f8a4f9))
- **ui:** add Popover and Calendar primitives (shadcn/react-day-picker) ([264b9e1](https://github.com/denispianelli/finance-dashboard/commit/264b9e15d1aa4bfa7eaf1d15029f043a3ac127e6))
- **ui:** adopt shadcn Calendar on react-day-picker v10, re-themed to tokens ([56d33fa](https://github.com/denispianelli/finance-dashboard/commit/56d33fa47ad11813e203036d70208886b2b22e97))
- **ui:** responsive dashboard layout ([#99](https://github.com/denispianelli/finance-dashboard/issues/99)) ([0f7cb99](https://github.com/denispianelli/finance-dashboard/commit/0f7cb99434de62991606c3d8b5c7775144250491))

### Bug Fixes

- **categorization:** stop auto-filing inter-account transfers as internal ([#136](https://github.com/denispianelli/finance-dashboard/issues/136)) ([9db7e15](https://github.com/denispianelli/finance-dashboard/commit/9db7e1514ae0446cc0ac1ef47d187ec84ec4a307))
- **dashboard:** decouple categories load so its failure can't blank the view ([3e3ce72](https://github.com/denispianelli/finance-dashboard/commit/3e3ce720f9c68e40023b2a545a40dc98c7d741f1))
- **dashboard:** exclude internal transfers from Revenus/Dépenses ([c4fca31](https://github.com/denispianelli/finance-dashboard/commit/c4fca31966f4f8467b5abc9ea90261a2c6d03d5b))
- **e2e:** assert real empty state instead of deleted mock data ([9e40820](https://github.com/denispianelli/finance-dashboard/commit/9e4082035086aa6678edbfbecd65623e788a9a2d))
- **import:** base period-overlap on real transaction dates ([#142](https://github.com/denispianelli/finance-dashboard/issues/142)) ([88f334d](https://github.com/denispianelli/finance-dashboard/commit/88f334dd419b3b018aab20a8b3b33f2021c1fcfe))
- **import:** make generic PDF extraction robust on real statements ([1341345](https://github.com/denispianelli/finance-dashboard/commit/134134505c6068e0e559582b182f5a57aab1a8c0))
- **transactions:** fill viewport height so only the list scrolls ([14ea1e4](https://github.com/denispianelli/finance-dashboard/commit/14ea1e47f1681a83b8bb0fb1c0dcef5be019adbd))

### Refactoring

- **categories:** move rules under the hood, learn from history instead ([b05bf5b](https://github.com/denispianelli/finance-dashboard/commit/b05bf5b7be5f2d3abf04a7e05221d9da05c0f0f8))
- **dashboard:** split TxTable into per-row grids for virtualization ([b797946](https://github.com/denispianelli/finance-dashboard/commit/b7979468ec53211cb30cf41938c5e1ac1d24a8d2))
- drop per-transaction confidence score ([#137](https://github.com/denispianelli/finance-dashboard/issues/137)) ([17783f2](https://github.com/denispianelli/finance-dashboard/commit/17783f28f159c8e2446978e2b6e5a5e3e79a7184))
- **transactions:** filter by explicit from/to date bounds ([eb16629](https://github.com/denispianelli/finance-dashboard/commit/eb16629e8b812e094181114d3db298f4e0d38c07))

### Documentation

- add import review UI design spec ([#31](https://github.com/denispianelli/finance-dashboard/issues/31)b) ([210e907](https://github.com/denispianelli/finance-dashboard/commit/210e907d120adc24aa7a13b4cdf375868ac0c359))
- add versioned taxonomy design spec, ADR-010 and plan (T0) ([#90](https://github.com/denispianelli/finance-dashboard/issues/90)) ([d308496](https://github.com/denispianelli/finance-dashboard/commit/d3084968adf1af73d5d7904ac53bc057fd65c88f)), closes [#80](https://github.com/denispianelli/finance-dashboard/issues/80)
- adopt harness-managed worktrees, gitignore .claude/worktrees ([#125](https://github.com/denispianelli/finance-dashboard/issues/125)) ([66b0406](https://github.com/denispianelli/finance-dashboard/commit/66b040632dd3ba243e76eca2bd0fb2ebc40eb5e4))
- **adr:** renumber duplicate ADR-013 (account routing) to ADR-015 ([#147](https://github.com/denispianelli/finance-dashboard/issues/147)) ([51625f1](https://github.com/denispianelli/finance-dashboard/commit/51625f125da144d4e547c99f262e132c58e30cfa))
- collapse the duplicate ADR-004 into a single record ([#111](https://github.com/denispianelli/finance-dashboard/issues/111)) ([3513e58](https://github.com/denispianelli/finance-dashboard/commit/3513e58fdf0b781634d00b9d23ef379550feb22c)), closes [#109](https://github.com/denispianelli/finance-dashboard/issues/109)
- document the SDD pipeline ([#110](https://github.com/denispianelli/finance-dashboard/issues/110)) ([7be31b1](https://github.com/denispianelli/finance-dashboard/commit/7be31b148a3e4107664fb504a7c433398cdcfa09)), closes [#108](https://github.com/denispianelli/finance-dashboard/issues/108)
- drop Notion as a source of truth, repo becomes authoritative ([#107](https://github.com/denispianelli/finance-dashboard/issues/107)) ([344174e](https://github.com/denispianelli/finance-dashboard/commit/344174e7ac37410f1b7556c9b4bb317f3146a391)), closes [#106](https://github.com/denispianelli/finance-dashboard/issues/106)
- lock the two-role import model (T0 of [#75](https://github.com/denispianelli/finance-dashboard/issues/75)) ([#112](https://github.com/denispianelli/finance-dashboard/issues/112)) ([61d7510](https://github.com/denispianelli/finance-dashboard/commit/61d7510dcb02e2d7e657735bd9739daee0d4b760))
- **privacy:** clarify the no-network rule is about user data, not packets ([#139](https://github.com/denispianelli/finance-dashboard/issues/139)) ([1024cce](https://github.com/denispianelli/finance-dashboard/commit/1024cce9f247c7910397300dccfb33a5b8c1f0eb))
- product scope realignment — ADR-009 + reslim master spec ([#77](https://github.com/denispianelli/finance-dashboard/issues/77)) ([074eab2](https://github.com/denispianelli/finance-dashboard/commit/074eab284548633c292a2f01ba1a91218b8bdfdc))
- **scope:** MVP single-user pivot — spec, ADR-009 amendment, F1 plan ([#148](https://github.com/denispianelli/finance-dashboard/issues/148)) ([17a65db](https://github.com/denispianelli/finance-dashboard/commit/17a65db1f9823d6ee5fd4915b533b5200f6b4941))
- surface branch + commit conventions in CLAUDE.md ([#89](https://github.com/denispianelli/finance-dashboard/issues/89)) ([9594466](https://github.com/denispianelli/finance-dashboard/commit/959446630406be4420f6f9dec216df4173a9dd51)), closes [#88](https://github.com/denispianelli/finance-dashboard/issues/88)
- switch to MVP mode (commit direct to main, lighter process) ([bfede06](https://github.com/denispianelli/finance-dashboard/commit/bfede06bef2d3989beaf00853d4e80051ae2227e))
- **taxonomy:** lock taxonomy scope for MVP (amend ADR-010) ([#123](https://github.com/denispianelli/finance-dashboard/issues/123)) ([a9d9848](https://github.com/denispianelli/finance-dashboard/commit/a9d9848347094026752877bc0ebca7723caba2e4))
- **taxonomy:** promote ADR-010 and update design spec §10 ([#98](https://github.com/denispianelli/finance-dashboard/issues/98)) ([7864585](https://github.com/denispianelli/finance-dashboard/commit/78645853e83787ba5d4b703582725979071ee66f)), closes [#85](https://github.com/denispianelli/finance-dashboard/issues/85)
- **transactions:** add design spec for recent-transactions preview and full page ([648fce0](https://github.com/denispianelli/finance-dashboard/commit/648fce0ccdf9d5cfda838cda1fdc6a4c605561ba))
- **transactions:** add Du/Au date-range filter design spec (shadcn-based) ([41d2280](https://github.com/denispianelli/finance-dashboard/commit/41d2280f556d5b8dd4da0b17499e2280842dffe6))
- **transactions:** add Du/Au date-range filter implementation plan ([7052b72](https://github.com/denispianelli/finance-dashboard/commit/7052b7230d5ea38089815861c74f46a6bdf8c695))
- **transactions:** add implementation plan for recent-transactions preview and full page ([0231ac3](https://github.com/denispianelli/finance-dashboard/commit/0231ac3e136eefb8c778758af1601ef128e33a7e))
- **transactions:** add pagination design spec for the Transactions page ([91e180f](https://github.com/denispianelli/finance-dashboard/commit/91e180fa25237fda8eee56f83943071085ba5ba4))
- **transactions:** add pagination implementation plan ([213357f](https://github.com/denispianelli/finance-dashboard/commit/213357fe0007ecc81040807524e6e1f31083f2d0))
- **transactions:** add unified Période filter design spec (presets + date range) ([e8eace6](https://github.com/denispianelli/finance-dashboard/commit/e8eace695880cb5c8258d1465b83ae3e3314e3dd))
- **transactions:** add unified Période filter implementation plan ([7d36085](https://github.com/denispianelli/finance-dashboard/commit/7d36085aa5c0e41e7b3e1d13329728e4ca9918c4))
- **transactions:** add virtualized-scroll design spec (replaces pagination) ([05ea693](https://github.com/denispianelli/finance-dashboard/commit/05ea6935a4149c08407a754b4f416d316894dae6))
- **transactions:** add virtualized-scroll implementation plan ([52565b0](https://github.com/denispianelli/finance-dashboard/commit/52565b04a675c59cd07d127523f2d142cfbe83b2))
- update README to match accepted ADRs and current phase ([#43](https://github.com/denispianelli/finance-dashboard/issues/43)) ([#44](https://github.com/denispianelli/finance-dashboard/issues/44)) ([422ceb3](https://github.com/denispianelli/finance-dashboard/commit/422ceb32e44709530aa6b0e471d7f2a05cc163c0))

### Spikes

- LLM model selection — Llama 3.2 3B Q4_K_M ([#12](https://github.com/denispianelli/finance-dashboard/issues/12)) ([#22](https://github.com/denispianelli/finance-dashboard/issues/22)) ([7293a2a](https://github.com/denispianelli/finance-dashboard/commit/7293a2ad16e58eeac6ee28e8719bf6b95a72490e))

## 0.0.1-bootstrap (2026-05-14)

### Features

- Initial project bootstrap (Plan A): repo, LICENSE, design spec, plans, ADRs,
  GitHub issue/PR templates, Project board, Epic 1 + Stories, branch
  protection, Notion sync workflow.

### Notes

- Epic 1 (Setup & Foundation, Stories #5–#12) and Epic 2 Story #24 (file
  ingestion) were merged before release-please was wired. Their changes are
  captured in git history under Conventional Commits and will appear in the
  first release-please-generated section the next time a release is cut.
