const fs = require("fs");

function escapeXml(input) {
  return String(input).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function parseTap(content) {
  const lines = content.split(/\r?\n/);
  const results = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = /^(ok|not ok)\s+(\d+)(?:\s*-\s*(.*))?$/.exec(line);
    if (!match) {
      continue;
    }

    const passed = match[1] === "ok";
    const index = Number(match[2]);
    const name = match[3] && match[3].length > 0 ? match[3] : `test-${index}`;
    results.push({ passed, name, index });
  }

  return results;
}

function buildJunit(results) {
  const tests = results.length;
  const failures = results.filter((result) => !result.passed).length;

  let xml = "";
  xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites tests="${tests}" failures="${failures}">\n`;
  xml += `  <testsuite name="ava" tests="${tests}" failures="${failures}">\n`;

  for (const result of results) {
    xml += `    <testcase classname="ava" name="${escapeXml(result.name)}">`;
    if (!result.passed) {
      xml += `<failure message="failed">${escapeXml(result.name)} failed</failure>`;
    }
    xml += "</testcase>\n";
  }

  xml += "  </testsuite>\n";
  xml += "</testsuites>\n";
  return xml;
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    console.error("Usage: node scripts/tap-to-junit.cjs <tap-input> <junit-output>");
    process.exit(1);
  }

  const tapContent = fs.readFileSync(inputPath, "utf8");
  const results = parseTap(tapContent);
  const xml = buildJunit(results);
  fs.writeFileSync(outputPath, xml);
}

main();
