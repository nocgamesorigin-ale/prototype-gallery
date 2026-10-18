#!/usr/bin/env node
// Package this folder as a .vsix without extra tools (needs the `zip` command, built into macOS/Linux).
//
//   node tools/gamekit-submit/pack.mjs          → tools/gamekit-submit/gamekit-gallery-submit-<version>.vsix
//   code --install-extension tools/gamekit-submit/gamekit-gallery-submit-<version>.vsix
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const out = path.join(here, `${pkg.name}-${pkg.version}.vsix`);

const tmp = mkdtempSync(path.join(os.tmpdir(), 'vsix-'));
try {
  for (const f of ['package.json', 'extension.js', 'README.md']) cpSync(path.join(here, f), path.join(tmp, 'extension', f));
  writeFileSync(path.join(tmp, '[Content_Types].xml'), `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>
`);
  writeFileSync(path.join(tmp, 'extension.vsixmanifest'), `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${esc(pkg.name)}" Version="${esc(pkg.version)}" Publisher="${esc(pkg.publisher)}"/>
    <DisplayName>${esc(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${esc(pkg.description)}</Description>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${esc(pkg.engines.vscode)}"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>
`);
  rmSync(out, { force: true });
  const r = spawnSync('zip', ['-qr', '-X', out, '[Content_Types].xml', 'extension.vsixmanifest', 'extension'], { cwd: tmp, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('zip lỗi — máy có lệnh `zip` không?');
  console.log(`✔ ${path.relative(process.cwd(), out)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
