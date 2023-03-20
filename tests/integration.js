import { fork, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { assert } from 'chai';
import puppeteer from 'puppeteer';

const appPath = path.join(process.cwd(), 'tests', 'integration');
const fsPath = path.join(appPath, 'test-fs');

if (!fs.existsSync(path.join(appPath, 'node_modules'))) {
  console.log('> Installing deps');

  execSync('npm install', {
    cwd: appPath,
    stdio: 'inherit',
  });
}

console.log('> Building app');

execSync('npm run build', {
  cwd: appPath,
  stdio: 'inherit',
});


let forkedServer = null;

before(async function() {
  this.timeout(5 * 1000);

  return new Promise(resolve => {
    const serverIndex = path.join(appPath, '.build', 'server', 'index.js');
    forkedServer = fork(serverIndex, { cwd: appPath });

    forkedServer.on('message', async msg => {
      if (msg === 'soundworks:server:started') {
        console.log('');
        resolve();
      }
    });
  });
});

after(async function() {
  console.log('> clean test directory');
  fs.rmSync(fsPath, { recursive: true });

  console.log('> exit server');
  forkedServer.kill();
});

describe(`unauthorized node client`, () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(fsPath, 'thing-rename.txt'), 'thing-rename');
    fs.writeFileSync(path.join(fsPath, 'thing-rm.txt'), 'thing-rm');
  });

  it(`should not access protected methods`, async function() {
    this.timeout(10 * 1000);

    return new Promise(resolve => {
      const thingIndex = path.join(appPath, '.build', 'clients', 'thing', 'index.js');
      const forked = fork(thingIndex, {
        cwd: appPath,
        stdio: 'inherit',
      });

      let index = 0;

      forked.on('message', async (msg) => {
        if (msg.startsWith('soundworks:client:')) {
          return;
        }

        console.log(index, msg);

        if (index === 0) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'thing-writeFile-1.txt'));
          assert.equal(exists, false);
        }

        if (index === 1) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'thing-writeFile-2.txt'));
          assert.equal(exists, false);
        }

        if (index === 2) {
          {
            assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'thing-rename.txt'));
            assert.equal(exists, true);
          }
          {
            assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'thing-renamed.txt'));
            assert.equal(exists, false);
          }

        }

        if (index === 3) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'thing-mkdir.txt'));
          assert.equal(exists, false);
        }

        if (index === 4) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'thing-rm.txt'));
          assert.equal(exists, true);
        }

        index += 1;

        if (index === 5) {
          console.log('> exit thing client');
          forked.kill();
          resolve();
        }
      });
    });
  });
});

describe(`unauthorized browser client`, () => {
  let browser;
  let page;

  beforeEach(() => {
    fs.writeFileSync(path.join(fsPath, 'unauthorized-browser-rename.txt'), 'unauthorized-browser-rename');
    fs.writeFileSync(path.join(fsPath, 'unauthorized-browser-rm.txt'), 'unauthorized-browser-rm');
  });

  afterEach(async () => {
    console.log('> close unauthorized client');
    await browser.close();
  });

  it(`should not access protected methods`, async function() {
    this.timeout(10 * 1000);

    browser = await puppeteer.launch();
    page = await browser.newPage();

    return new Promise(async (resolve, reject) => {
      let index = 0;

      page.on('console', msg => {
        msg = msg.text();

        if (!msg.startsWith(`[soundworks:PluginFilesystem]`)) {
          return;
        }

        console.log(index, msg);

        if (index === 0) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-writeFile-1.txt'));
          assert.equal(exists, false);
        }

        if (index === 1) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-writeFile-2.txt'));
          assert.equal(exists, false);
        }

        if (index === 2) {
          {
            assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-rename.txt'));
            assert.equal(exists, true);
          }
          {
            assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-renamed.txt'));
            assert.equal(exists, false);
          }

        }

        if (index === 3) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-mkdir'));
          assert.equal(exists, false);
        }

        if (index === 4) {
          assert.equal(msg, '[soundworks:PluginFilesystem] Action is not permitted');
          const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-rm.txt'));
          assert.equal(exists, true);
        }

        index += 1;

        if (index === 5) {
          resolve();
        }
      });

      await page.goto(`http://127.0.0.1:8080/not-authorized`);
    });
  });
});

describe(`authorized browser client`, () => {
  let browser;
  let page;

  beforeEach(() => {
    fs.writeFileSync(path.join(fsPath, 'authorized-browser-rename.txt'), 'authorized-browser-rename');
    fs.writeFileSync(path.join(fsPath, 'authorized-browser-rm.txt'), 'authorized-browser-rm');
  });

  afterEach(async () => {
    console.log('> close authorized client');
    await browser.close();
  });

  it(`should not access protected methods`, async function() {
    this.timeout(10 * 1000);

    browser = await puppeteer.launch();
    page = await browser.newPage();

    return new Promise(async (resolve, reject) => {
      let index = 0;

      page.on('console', msg => {
        msg = msg.text();

        if (!msg.startsWith(`[soundworks:PluginFilesystem]`)) {
          return;
        }

        console.log(index, msg);

        if (index === 0) {
          assert.equal(msg, '[soundworks:PluginFilesystem] done');
          const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-writeFile-1.txt'));
          assert.equal(exists, true);
        }

        if (index === 1) {
          assert.equal(msg, '[soundworks:PluginFilesystem] done');
          const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-writeFile-2.txt'));
          assert.equal(exists, true);
        }

        if (index === 2) {
          {
            assert.equal(msg, '[soundworks:PluginFilesystem] done');
            const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-rename.txt'));
            assert.equal(exists, false);
          }
          {
            assert.equal(msg, '[soundworks:PluginFilesystem] done');
            const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-renamed.txt'));
            assert.equal(exists, true);
          }

        }

        if (index === 3) {
          assert.equal(msg, '[soundworks:PluginFilesystem] done');
          const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-mkdir'));
          assert.equal(exists, true);
        }

        if (index === 4) {
          assert.equal(msg, '[soundworks:PluginFilesystem] done');
          const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-rm.txt'));
          assert.equal(exists, false);
        }

        index += 1;

        if (index === 5) {
          resolve();
        }
      });

      await page.authenticate({ 'username': 'login', 'password': 'password' });
      await page.goto(`http://127.0.0.1:8080/authorized`);
    });
  });
});
