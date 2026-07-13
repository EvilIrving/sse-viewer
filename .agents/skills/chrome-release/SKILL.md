---
name: chrome-release
description: Generate Chrome Web Store submission package (store listing, questionnaire, privacy disclosure) in English. Use when the user mentions publishing to Chrome Web Store, preparing a release, writing store listing, or updating the extension version. Also use when the user says "chrome-release", "release info", "store listing", or "上架".
---

# Chrome Web Store Release Info Generator

You are generating a complete **Chrome Web Store submission package**: store listing, questionnaire, and privacy disclosure. All output is in **English only**.

**You must NOT generate:** promotional images, screenshots, changelogs, or Chinese translations.

## Step 1: Gather information

Run these in parallel where possible:

### Project state
- Read `manifest.json` — capture `version`, `name` (or `__MSG_*__` key), `description`, `permissions`, `host_permissions`, `default_locale`
- Read `_locales/<default_locale>/messages.json` — capture `extName.message`, `extDesc.message`
- Read existing `store/` documents for tone and past answers on permissions/data collection

### Permission check
- Confirm the privacy claim matches actual code — grep for `fetch(`, `XMLHttpRequest`, analytics, external URLs
- Note every permission in `manifest.json` (both `permissions` and `host_permissions`) — each one needs a justification in the questionnaire

## Step 2: Generate the release document

Write to `store/release-v<version>.md` (e.g., `store/release-v1.1.0.md`).

### Output format

Each section maps to a specific field in the Chrome Web Store submission form. Include character limits so the user can copy-paste directly.

```markdown
# Chrome Web Store Submission — v<version>

## Package Info
- Title (软件包中的标题): <English name, max 75 chars>
- Summary (软件包中的摘要): <one sentence, max 132 chars>
- Description (说明): <explain what it does and why users should install, plain text paragraphs>
- Category (分类): <pick one from the list below>

## Single Purpose (单一用途)
0/1000
<One sentence describing the extension's single, specific purpose. Must be easy to understand.>

## Permission Justifications (需请求权限的理由)
- `storage` (0/1000): <why storage permission is needed>

- Host permissions (0/1000): <why host permissions are needed — note this is for content_scripts matches patterns, explain exactly what the content script does and why it needs these URL patterns>

## Remote Code (远程代码)
- Using remote code? No
- Reason (0/1000): <only if Yes, otherwise skip>

## Data Usage (数据使用)

### Data Collection Categories
Mark which user data the extension collects (check = collects, no check = does not collect):
- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity
- [ ] Website content

### Data Use Certifications
All three must be checked:
- [x] I do not sell or transfer user data to third parties for uses outside of approved use cases
- [x] I do not use or transfer user data for purposes unrelated to my product's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending

## Official URLs
- Associated website: None (or add from Google Search Console)
- Homepage URL (首页网址, max 2048 chars): <optional, link to project homepage/GitHub>
- Support page URL (支持信息页面网址, max 2048 chars): <optional, link to support page or GitHub issues>

## Adult Content
- Contains adult content? No

## Privacy Policy (隐私权政策)
- URL (max 2048 chars): <public HTTPS URL where `store/privacy.html` is hosted>

## Product Support
- Enable product support? <on/off — if on, users can submit support requests>

## Distribution
- Payment: Free
- Visibility: Public
```

## Step 3: Key rules

### Content guidelines
- **Title**: Must match the extension name, max 75 characters.
- **Summary**: Must fit Chrome Web Store's 132-character limit.
- **Description**: Substantive — Chrome's review team reads it, users use it to decide whether to install. No character limit shown but keep it focused.
- **Single purpose**: Max 1000 characters. Be specific. One clear sentence about what the extension does.
- **Permission justifications**: Max 1000 characters each. Every permission must be justified. Remove unneeded permissions before submitting.
- **Host permissions**: Adding host permissions may trigger deeper review and delay publishing.
- **Category**: Must be one from the CWS category list:
  - 工具 (Tools)
  - 工作流程与规划 (Workflow & Planning)
  - 开发者工具 (Developer Tools)
  - 教育 (Education)
  - 沟通 (Communication)
  - 健康 (Health)
  - 娱乐 (Entertainment)
  - 家居 (Home)
  - 新闻与天气 (News & Weather)
  - 旅游 (Travel)
  - 游戏 (Games)
  - 社交 (Social)
  - 艺术与设计 (Art & Design)
  - 购物 (Shopping)
  - 趣味休闲 (Fun)
  - 功能与界面 (Functionality & UI)
  - 无障碍 (Accessibility)
  - 隐私与安全 (Privacy & Security)
- **Tags**: Not part of the form above but useful for discoverability — include 5-10 comma-separated keywords in the store listing.
- Never include placeholder text like "[TODO]" or "[fill in later]" — if information is missing, note it explicitly.
- All output is **English only**. No Chinese translations anywhere.

### Data collection checkboxes
- The 9 data categories map directly to the CWS form. Check only what the extension actually collects.
- If the extension collects nothing, all boxes should be unchecked `[ ]`.
- The three certifications are MANDATORY — all must be `[x]` to comply with developer program policies.

### Remote code
- Remote code = any JS or Wasm NOT bundled in the extension package. Includes `<script>` external references, external module imports, `eval()`.
- Almost always "No" for MV3 extensions.

### Official URLs
- Homepage and support URLs are optional but recommended — they improve user experience and make ratings/reviews more meaningful.
- Max 2048 characters each. Use the project's GitHub repo or a dedicated landing page.

### Adult content
- Marks content as mature if the extension contains sexual, violent, or substance-related content.
- Almost always "No" for productivity extensions.

### Product support
- A toggle that enables a "Product Support" section on the store listing page where users submit support requests.

### Privacy policy
- Required if the extension collects any user data.
- URL field accepts up to 2048 characters.
- If the extension collects no data, the privacy policy can be a simple statement page — still required by CWS policy.

### Sensitive checks
- Questionnaire is **mandatory** for every release — always include it.
- If `host_permissions` or content_script `matches` includes `*://*/*` or broad patterns, explain the justification clearly.
- Confirm the privacy claim ("No data collected") matches the actual code behavior — check for any `fetch()`, `XMLHttpRequest`, analytics, or external URLs in the codebase.

### What NOT to include
- No promotional images, screenshots, or image placeholder sections
- No changelog or version history
- No Chinese or other language translations
- No HTML (except what Chrome Web Store allows in descriptions, which is minimal)
- No markdown links to local files (use public URLs or plain text)
