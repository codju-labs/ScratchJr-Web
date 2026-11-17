const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');

function getProjectModule() {
  const noOp = () => {};
  const stub = { selectCategory: noOp, layout: noOp, needsScroll: noOp,
    parseProjectData: value => value };
  const context = {
    window: {}, parent: { postMessage: noOp }, setTimeout: noOp, console,
    ScratchJr: { log: noOp, getTime: () => 0, stage: { currentPage: { update: noOp } } },
    IO: stub, Palette: stub, Paint: stub, UI: stub, isAndroid: false,
  };
  const source = fs.readFileSync(path.join(root, 'src/app/src/editor/ui/Project.js'), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export default class Project', 'class Project');
  vm.runInNewContext(source + '\nglobalThis.Project = Project;', context);
  const Project = context.Project;
  Project.setProgress = noOp;
  Project.liftCurtain = noOp;
  return { Project, window: context.window, scratch: context.ScratchJr };
}

test('queued project is consumed once even when loading completes synchronously', () => {
  const { Project, window } = getProjectModule();
  const data = JSON.stringify([{ json: { pages: [] } }]);
  window.__scratchJrLoadData = data;
  let loads = 0;
  Project.loadData = (_, done) => {
    assert.ok(++loads <= 2, 'reentrant load loop');
    done();
  };
  Project.dataRecieved(data);
  assert.equal(loads, 2); // Initial project, then the one queued replacement.
  assert.equal(window.__scratchJrLoadData, null);
});

function getBridge() {
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let listener;
  const parent = {};
  const window = { parent, location: { hash: '', search: '', origin: 'https://codju.test' },
    addEventListener: (_, callback) => { listener = callback; } };
  vm.runInNewContext(script, { window, URLSearchParams });
  return { window, send: data => listener({ data, origin: window.location.origin, source: parent }) };
}

test('ready bridge loads once without leaving a queued copy', () => {
  const { window, send } = getBridge();
  window.__scratchJrReady = true;
  let loads = 0;
  window.__loadExternalProject = () => { loads++; };
  send({ type: 'LOAD_DATA', data: 'project' });
  assert.equal(loads, 1);
  assert.ok(!window.__scratchJrLoadData);
});

test('bridge queues only the latest project until ready', () => {
  const { window, send } = getBridge();
  send({ type: 'LOAD_DATA', data: 'old' });
  send({ type: 'LOAD_DATA', data: 'new' });
  assert.equal(window.__scratchJrLoadData, 'new');
});


test('replacing a project releases the old stage before recreating pages', () => {
  const { Project, scratch } = getProjectModule();
  const calls = [];
  scratch.runtime = { stopThreads: () => calls.push('stop') };
  Project.clear = () => calls.push('clear');
  Project.recreatePage = name => calls.push(name);
  Project.recreate({ pages: ['replacement'], currentPage: 'replacement' });
  assert.deepEqual(calls, ['stop', 'clear', 'replacement']);
});

test('external loads are serialized and keep only the latest pending project', () => {
  const { Project, window } = getProjectModule();
  const data = name => JSON.stringify([{ name, json: { pages: [] } }]);
  let finish;
  const loaded = [];
  Project.loadData = (_, done) => {
    loaded.push(Project.metadata.name);
    finish = done;
  };
  Project.dataRecieved(data('initial'));
  finish();
  window.__loadExternalProject(data('second'));
  const finishSecond = finish;
  window.__loadExternalProject(data('third'));
  window.__loadExternalProject(data('latest'));
  assert.deepEqual(loaded, ['initial', 'second']);
  finishSecond();
  assert.deepEqual(loaded, ['initial', 'second', 'latest']);
  finish();
  assert.equal(Project.loading, false);
  assert.equal(window.__scratchJrLoadData, null);
});


test('loading another project reuses the existing paint editor', () => {
  let built = false;
  let layouts = 0;
  const noOp = () => {};
  const paintFrame = { style: {}, querySelector: () => built ? {} : null };
  const context = {
    document: { getElementById: () => paintFrame }, window: {},
    BlockSpecs: { loadCount: 0 }, IO: { requestFromServer: noOp },
    newHTML: (_, className) => {
      if (className === 'innerpaint') built = true;
      return { setAttribute: noOp };
    },
  };
  const source = fs.readFileSync(path.join(root, 'src/app/src/painteditor/Paint.js'), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export default class Paint', 'class Paint');
  vm.runInNewContext(source + '\nglobalThis.Paint = Paint;', context);
  const Paint = context.Paint;
  Paint.init(1024, 768);
  Paint.topbar = () => { layouts++; };
  for (const method of ['leftPalette', 'rightPalette', 'colorPalette', 'selectButton', 'createSVGeditor']) {
    Paint[method] = noOp;
  }
  Paint.layout();
  Paint.layout();
  assert.equal(layouts, 1);
});
