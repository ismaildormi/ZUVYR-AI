'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '../results');
const BLOCKING_SECURITY_SEVERITY = 7.0;

function listSarifFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSarifFiles(full));
    else if (entry.isFile() && /\.sarif(?:\.json)?$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const files = listSarifFiles(root);
if (!files.length) {
  console.error(`CODEQL_POLICY_FAIL: no SARIF files found under ${root}`);
  process.exit(2);
}

const securityFindings = [];
let totalResults = 0;

for (const file of files) {
  const sarif = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const run of Array.isArray(sarif.runs) ? sarif.runs : []) {
    const rules = Array.isArray(run?.tool?.driver?.rules) ? run.tool.driver.rules : [];
    const byId = new Map(rules.map((rule, index) => [String(rule?.id || index), rule]));
    const results = Array.isArray(run.results) ? run.results : [];
    totalResults += results.length;

    for (const result of results) {
      const rule =
        Number.isInteger(result?.ruleIndex) && rules[result.ruleIndex]
          ? rules[result.ruleIndex]
          : byId.get(String(result?.ruleId || '')) || null;
      const properties = rule?.properties || {};
      const tags = Array.isArray(properties.tags) ? properties.tags.map(String) : [];
      const securitySeverity = numberOrNull(
        properties['security-severity'] ?? properties.securitySeverity
      );
      const securityTagged =
        securitySeverity !== null ||
        tags.some(tag => /(^|\/)security($|\/)|cwe-|external\/cwe/i.test(tag));

      if (!securityTagged) continue;

      const location = result?.locations?.[0]?.physicalLocation;
      securityFindings.push({
        ruleId: String(result?.ruleId || rule?.id || 'unknown'),
        level: String(result?.level || 'warning'),
        securitySeverity,
        message: String(result?.message?.text || '').replace(/\s+/g, ' ').trim().slice(0, 500),
        file: String(location?.artifactLocation?.uri || ''),
        line: Number(location?.region?.startLine || 0) || null
      });
    }
  }
}

securityFindings.sort((a, b) =>
  (b.securitySeverity ?? -1) - (a.securitySeverity ?? -1) ||
  a.ruleId.localeCompare(b.ruleId)
);

console.log(`CodeQL SARIF policy: ${files.length} file(s), ${totalResults} total result(s), ${securityFindings.length} security-tagged result(s).`);
for (const finding of securityFindings) {
  const severity = finding.securitySeverity === null ? 'n/a' : finding.securitySeverity.toFixed(1);
  const where = finding.file ? ` ${finding.file}${finding.line ? ':' + finding.line : ''}` : '';
  console.log(`[security ${severity}] ${finding.ruleId}${where} — ${finding.message}`);
}

const blocking = securityFindings.filter(
  finding => finding.securitySeverity !== null && finding.securitySeverity >= BLOCKING_SECURITY_SEVERITY
);

if (blocking.length) {
  console.error(
    `CODEQL_POLICY_FAIL: ${blocking.length} High/Critical security finding(s) at severity >= ${BLOCKING_SECURITY_SEVERITY.toFixed(1)}.`
  );
  process.exit(1);
}

console.log(
  `PASS: no CodeQL High/Critical security findings at severity >= ${BLOCKING_SECURITY_SEVERITY.toFixed(1)}.`
);
