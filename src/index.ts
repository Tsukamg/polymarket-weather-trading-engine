import { loadCal } from "./storage.js";
import { printReport, printStatus } from "./report.js";
import { runLoop } from "./scan.js";

const cmd = process.argv[2] ?? "run";

if (cmd === "run") {
  await runLoop();
} else if (cmd === "status") {
  loadCal();
  printStatus();
} else if (cmd === "report") {
  loadCal();
  printReport();
} else {
  console.log("Usage: node dist/index.js [run|status|report]");
  console.log("   or: npm start -- [run|status|report]");
  console.log("   or: npm run dev -- [run|status|report]");
  process.exit(1);
}
