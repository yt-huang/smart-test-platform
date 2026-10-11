#!/usr/bin/env node
import { runCommand } from './run.js';
process.exitCode = await runCommand(process.argv.slice(2));
