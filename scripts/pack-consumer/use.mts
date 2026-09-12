import { defaultConfig, scan, validate, type LintReport } from "screenproof";
import { inspectBrowserFixtures } from "screenproof/browser";

const config = defaultConfig();
const report: LintReport = validate(await scan("./missing-screenshots", config), config);
const browserReport: LintReport = inspectBrowserFixtures([]);

if (typeof report.ok !== "boolean" || typeof report.gate !== "string") {
  throw new Error("root package runtime contract is invalid");
}
if (typeof browserReport.ok !== "boolean" || typeof browserReport.gate !== "string") {
  throw new Error("browser package runtime contract is invalid");
}

console.log(`root=${report.gate} browser=${browserReport.gate}`);
