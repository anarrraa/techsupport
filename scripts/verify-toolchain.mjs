import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const expectedNode = readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim();
const packageJson = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const packageManager = packageJson.packageManager;
if (typeof packageManager !== 'string' || !packageManager.startsWith('npm@')) {
	throw new Error('package.json packageManager must pin npm with npm@<version>');
}

const expectedNpm = packageManager.slice('npm@'.length);
const actualNode = process.versions.node;
const actualNpm = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();

console.log(`Node v${actualNode}; expected v${expectedNode}`);
console.log(`npm ${actualNpm}; expected ${expectedNpm}`);

if (actualNode !== expectedNode || actualNpm !== expectedNpm) {
	process.exitCode = 1;
}
