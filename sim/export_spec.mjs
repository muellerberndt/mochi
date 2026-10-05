// Write mochi/spec.json from web/js/spec.js. A test keeps the two equal.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { SPEC } from "../web/js/spec.js";
import { ROOT } from "./brain_proc.mjs";

writeFileSync(join(ROOT, "mochi", "spec.json"), JSON.stringify(SPEC, null, 1) + "\n");
console.log("mochi/spec.json:", SPEC.inputs, "inputs,", SPEC.actions.length, "actions");
