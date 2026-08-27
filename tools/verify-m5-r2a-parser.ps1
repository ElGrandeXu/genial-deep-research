$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Assert-M5R2A {
    param([bool]$Condition, [string]$Finding)
    if (-not $Condition) { throw "M5_R2A_VERIFY_FAILED: $Finding" }
}

$parse5Integrity = 'sha512-z1e/HMG90obSGeidlli3hj7cbocou0/wa5HacvI3ASx34PecNjNQeaHNo5WIZpWofN9kgkqV1q5YvXe3F0FoPw=='
$entitiesIntegrity = 'sha512-zwfzJecQ/Uej6tusMqwAqU/6KL2XaB2VZ2Jg54Je6ahNBGNH6Ek6g3jjNCF0fG9EWQKGZNddNjU5F1ZQn/sBnA=='

$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
Assert-M5R2A ($package.dependencies.parse5 -ceq '8.0.1') 'parse5 must be an exact runtime dependency'
Assert-M5R2A (-not ($package.devDependencies.PSObject.Properties.Name -contains 'parse5')) 'parse5 must not be a dev dependency'

$otherParsers = @('cheerio', 'htmlparser2', 'linkedom', 'jsdom')
foreach ($name in $otherParsers) {
    Assert-M5R2A (-not ($package.dependencies.PSObject.Properties.Name -contains $name)) "unexpected runtime parser: $name"
    Assert-M5R2A (-not ($package.devDependencies.PSObject.Properties.Name -contains $name)) "unexpected development parser: $name"
}

$lock = Get-Content -LiteralPath (Join-Path $repoRoot 'pnpm-lock.yaml') -Raw
Assert-M5R2A ($lock -match '(?m)^      parse5:\r?\n        specifier: 8\.0\.1\r?\n        version: 8\.0\.1$') 'importer is not locked to parse5 8.0.1'
Assert-M5R2A ([regex]::Matches($lock, '(?m)^  parse5@8\.0\.1:$').Count -eq 2) 'parse5 package and snapshot entries differ'
Assert-M5R2A ([regex]::Matches($lock, '(?m)^  entities@8\.0\.0:$').Count -eq 1) 'entities package entry differs'
Assert-M5R2A ([regex]::Matches($lock, '(?m)^  entities@8\.0\.0: \{\}$').Count -eq 1) 'entities snapshot entry differs'
Assert-M5R2A ([regex]::Matches($lock, '(?m)^  parse5@(?!8\.0\.1:)').Count -eq 0) 'another parse5 version is locked'
Assert-M5R2A ([regex]::Matches($lock, '(?m)^  entities@(?!8\.0\.0:)').Count -eq 0) 'another entities version is locked'
Assert-M5R2A ($lock.Contains("resolution: {integrity: $parse5Integrity}")) 'parse5 integrity differs from registry metadata'
Assert-M5R2A ($lock.Contains("resolution: {integrity: $entitiesIntegrity}")) 'entities integrity differs from registry metadata'
Assert-M5R2A ($lock -match '(?ms)^  parse5@8\.0\.1:\r?\n    dependencies:\r?\n      entities: 8\.0\.0$') 'parse5 runtime dependency graph differs'

$parse5PackagePath = Join-Path $repoRoot 'node_modules\parse5\package.json'
$entitiesPackagePath = Join-Path $repoRoot 'node_modules\.pnpm\entities@8.0.0\node_modules\entities\package.json'
foreach ($path in @($parse5PackagePath, $entitiesPackagePath)) {
    Assert-M5R2A (Test-Path -LiteralPath $path -PathType Leaf) "installed package metadata missing: $path"
}

$parse5Package = Get-Content -LiteralPath $parse5PackagePath -Raw | ConvertFrom-Json
$entitiesPackage = Get-Content -LiteralPath $entitiesPackagePath -Raw | ConvertFrom-Json
Assert-M5R2A ($parse5Package.name -ceq 'parse5' -and $parse5Package.version -ceq '8.0.1') 'installed parse5 identity differs'
Assert-M5R2A ($parse5Package.license -ceq 'MIT') 'installed parse5 license differs'
Assert-M5R2A ($parse5Package.dependencies.entities -ceq '^8.0.0') 'installed parse5 dependency range differs'
Assert-M5R2A ($entitiesPackage.name -ceq 'entities' -and $entitiesPackage.version -ceq '8.0.0') 'installed entities identity differs'
Assert-M5R2A ($entitiesPackage.license -ceq 'BSD-2-Clause') 'installed entities license differs'
Assert-M5R2A ($entitiesPackage.engines.node -ceq '>=20.19.0') 'installed entities engine constraint differs'

foreach ($metadata in @($parse5Package, $entitiesPackage)) {
    $scriptNames = @($metadata.scripts.PSObject.Properties.Name)
    foreach ($forbidden in @('preinstall', 'install', 'postinstall')) {
        Assert-M5R2A ($forbidden -notin $scriptNames) "$($metadata.name) declares forbidden lifecycle script: $forbidden"
    }
}

$nodeVersion = [version](& node -p 'process.versions.node')
Assert-M5R2A ($nodeVersion -ge [version]'20.19.0') "Node runtime is incompatible: $nodeVersion"

$smoke = @'
import * as parse5 from "parse5";
import ts from "typescript";
import path from "node:path";

const document = parse5.parse("<!doctype html><html><head><title>Parser &amp; Types</title></head><body><p>Texte &amp; entité</p></body></html>");
const walk = (node, visit) => {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
  if (node.content) walk(node.content, visit);
};
let title = null;
let body = null;
let decodedText = false;
walk(document, (node) => {
  if (node.tagName === "title") title = node;
  if (node.tagName === "body") body = node;
  if (node.nodeName === "#text" && node.value.includes("Texte & entité")) decodedText = true;
});
if (document.nodeName !== "#document" || !title || !body || !decodedText) {
  throw new Error("PARSE5_SYNTHETIC_PARSE_FAILED");
}

const virtualFile = path.join(process.cwd(), "tools", "__m5_r2a_virtual__.ts");
const source = `import { parse, type DefaultTreeAdapterMap } from "parse5";
const document: DefaultTreeAdapterMap["document"] = parse("<html><body>&amp;</body></html>");
void document;`;
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: ["node"],
};
const host = ts.createCompilerHost(options);
const originalFileExists = host.fileExists.bind(host);
const originalReadFile = host.readFile.bind(host);
const originalGetSourceFile = host.getSourceFile.bind(host);
const pathKey = (fileName) => path.resolve(fileName).replaceAll("\\", "/").toLowerCase();
const virtualKey = pathKey(virtualFile);
host.fileExists = (fileName) => pathKey(fileName) === virtualKey || originalFileExists(fileName);
host.readFile = (fileName) => pathKey(fileName) === virtualKey ? source : originalReadFile(fileName);
host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
  pathKey(fileName) === virtualKey
    ? ts.createSourceFile(fileName, source, languageVersion, true)
    : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
const program = ts.createProgram([virtualFile], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length > 0) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }));
}

process.stdout.write(JSON.stringify({
  public_import: "parse5",
  document: true,
  title: true,
  body: true,
  decoded_entity_text: "Texte & entité",
  typescript_diagnostics: diagnostics.length,
}));
'@

$smokeOutput = & node --input-type=module --eval $smoke
if ($LASTEXITCODE -ne 0) { throw 'M5_R2A_VERIFY_FAILED: parse5 runtime or TypeScript smoke failed' }
$smokeResult = $smokeOutput | ConvertFrom-Json
Assert-M5R2A ($smokeResult.public_import -ceq 'parse5') 'public package import was not used'
Assert-M5R2A ($smokeResult.document -and $smokeResult.title -and $smokeResult.body) 'synthetic document structure differs'
Assert-M5R2A ($smokeResult.decoded_entity_text -ceq 'Texte & entité') 'HTML entity was not decoded'
Assert-M5R2A ($smokeResult.typescript_diagnostics -eq 0) 'public TypeScript declarations failed'

Write-Output "M5_R2A_PARSER_VERIFY_OK: parse5=8.0.1 entities=8.0.0 node=$nodeVersion typescript_diagnostics=0"
