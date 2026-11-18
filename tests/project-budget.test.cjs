const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function load() {
  const messages = [];
  const context = { console, window: {}, gn: () => null,
    parent: { postMessage: message => messages.push(message) },
    ScratchJr: { log: () => {}, getTime: () => 0, stage: { pages: [] } },
    IO: { parseProjectData: value => value } };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/src/editor/ui/Project.js'), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace('export default class Project', 'class Project');
  vm.runInNewContext(source + '\nglobalThis.Project = Project;', context);
  return { Project: context.Project, messages, window: context.window };
}
const project = count => ({ json: { pages: ['p'], p: { sprites: ['s'],
  s: { scripts: [Array.from({length: count}, () => ['forward', 1, 0, 0])] } } } });

test('rejects oversized saved data before constructing any project objects', () => {
  const { Project, messages, window } = load();
  window.__scratchJrLoadData = 'pending';
  Project.loadData = () => assert.fail('oversized data reached rendering');
  Project.dataRecieved(JSON.stringify([project(21438)]));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'PROJECT_TOO_LARGE');
  assert.equal(window.__scratchJrLoadData, null);
  assert.equal(Project.metadata, undefined);
});

test('accepts a normal project and counts repeat bodies', () => {
  const { Project } = load();
  let loaded = 0;
  Project.loadData = () => loaded++;
  Project.dataRecieved(JSON.stringify([project(15)]));
  assert.equal(loaded, 1);
  const data = project(0).json;
  data.p.s.scripts = [[['repeat', 2, 0, 0, [['forward', 1, 0, 0], ['back', 1, 0, 0]]]]];
  assert.equal(Project.countProjectBlocks(data), 3);
  assert.equal(Project.countProjectBlocks(project(2000).json), 2000);
  assert.equal(Project.countProjectBlocks(project(10000).json), 2001);
});
