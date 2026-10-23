#!/usr/bin/env node
// Writes the JSON Schema for lab.json, so editors autocomplete via "$schema".
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { LabManifest } from "./manifest.ts";

const out = resolve(process.argv[2] ?? "lab.schema.json");
const schema = z.toJSONSchema(LabManifest, { io: "input" });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ title: "lab.json", ...schema }, null, 2)}\n`);
console.log(`wrote ${out}`);
