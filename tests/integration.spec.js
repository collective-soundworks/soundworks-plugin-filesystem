import { fork, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { delay } from '@ircam/sc-utils';
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

describe('# Integration test', () => {

  let forkedServer = null;

  beforeEach(async function() {
    this.timeout(5 * 1000);

    fs.rmSync(fsPath, { recursive: true, force: true });
    fs.mkdirSync(fsPath);

    return new Promise(resolve => {
      const serverIndex = path.join(appPath, '.build',  'server.js');
      forkedServer = fork(serverIndex, { cwd: appPath });

      forkedServer.on('message', async msg => {
        if (msg === 'soundworks:server:started') {
          resolve();
        }
      });
    });
  });

  afterEach(async function() {
    this.timeout(5 * 1000);

    console.log('> clean test directory');
    fs.rmSync(fsPath, { recursive: true, force: true });

    console.log('> exit server');
    // this is not really synchronous, so we need to wait to not crash other tests
    forkedServer.kill();
    await delay(2000);
  });

  describe(`unauthorized node client`, () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(fsPath, 'thing-rename.txt'), 'thing-rename');
      fs.writeFileSync(path.join(fsPath, 'thing-rm.txt'), 'thing-rm');
    });

    it(`should not access protected methods`, async function() {
      this.timeout(10 * 1000);

      return new Promise(resolve => {
        const thingIndex = path.join(appPath, '.build', 'clients', 'thing.js');
        const forked = fork(thingIndex, {
          cwd: appPath,
          stdio: 'inherit',
        });

        let index = 0;

        forked.on('message', (msg) => {
          if (msg.startsWith('soundworks:client:')) {
            return;
          }

          if (index === 0) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'thing-writeFile-1.txt'));
            assert.equal(exists, false);
          }

          if (index === 1) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'thing-writeFile-2.txt'));
            assert.equal(exists, false);
          }

          if (index === 2) {
            {
              assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
              const exists = fs.existsSync(path.join(fsPath, 'thing-rename.txt'));
              assert.equal(exists, true);
            }
            {
              assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
              const exists = fs.existsSync(path.join(fsPath, 'thing-renamed.txt'));
              assert.equal(exists, false);
            }

          }

          if (index === 3) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'thing-mkdir.txt'));
            assert.equal(exists, false);
          }

          if (index === 4) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
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

      browser = await puppeteer.launch({
        headless: true,
        ignoreDefaultArgs: ["--disable-extensions"],
        args: ["--no-sandbox", '--use-fake-ui-for-media-stream'],
      });
      page = await browser.newPage();

      return new Promise(async (resolve, reject) => {
        let index = -1;

        page.on('console', msg => {
          msg = msg.text();
          // Discard all message that are not error messages
          if (!msg.startsWith(`Invalid execution`)) {
            return;
          }

          index += 1;
          console.log(index, msg);

          if (index === 0) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-writeFile-1.txt'));
            assert.equal(exists, false);
          }

          if (index === 1) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-writeFile-2.txt'));
            assert.equal(exists, false);
          }

          if (index === 2) {
            {
              assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
              const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-rename.txt'));
              assert.equal(exists, true);
            }
            {
              assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
              const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-renamed.txt'));
              assert.equal(exists, false);
            }

          }

          if (index === 3) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-mkdir'));
            assert.equal(exists, false);
          }

          if (index === 4) {
            assert.equal(msg, 'Invalid execution on ClientPluginFileSystem: Operation is not permitted');
            const exists = fs.existsSync(path.join(fsPath, 'unauthorized-browser-rm.txt'));
            assert.equal(exists, true);
          }

          if (index === 4) {
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
      fs.writeFileSync(path.join(fsPath, 'authorized-browser-read.txt'), 'authorized-browser-read');
      fs.writeFileSync(path.join(fsPath, 'authorized-browser-rename.txt'), 'authorized-browser-rename');
      fs.writeFileSync(path.join(fsPath, 'authorized-browser-rm.txt'), 'authorized-browser-rm');
    });

    afterEach(async () => {
      console.log('> close authorized client');
      await browser.close();
    });

    it(`should access protected methods`, async function() {
      this.timeout(5 * 1000);

      browser = await puppeteer.launch({
        headless: true,
        ignoreDefaultArgs: ["--disable-extensions"],
        args: ["--no-sandbox", '--use-fake-ui-for-media-stream'],
      });
      page = await browser.newPage();

      return new Promise(async (resolve, reject) => {
        let index = -1;

        page.on('console', msg => {
          msg = msg.text();
          console.log('[browser console]', msg);

          if (!msg.startsWith(`ClientPluginFilesystem`)) {
            return;
          }

          index += 1;

          if (index === 0) {
            assert.equal(msg, 'ClientPluginFilesystem writeFile-1 done');
            const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-writeFile-1.txt'));
            console.log('- writefile', exists, 'should be', true);
            assert.equal(exists, true);
          }

          if (index === 1) {
            assert.equal(msg, 'ClientPluginFilesystem writeFile-2 done');
            const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-writeFile-2.txt'));
            console.log('- writefile blob', exists, 'should be', true);
            assert.equal(exists, true);
          }

          if (index === 2) {
            assert.equal(msg, 'ClientPluginFilesystem rename done');

            {
              const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-rename.txt'));
              console.log('- rename', exists, 'should be', false);
              assert.equal(exists, false);
            }
            {
              const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-renamed.txt'));
              console.log('- rename', exists, 'should be', true);
              assert.equal(exists, true);
            }

          }

          if (index === 3) {
            assert.equal(msg, 'ClientPluginFilesystem mkdir done');
            const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-mkdir'));
            console.log('- mkdir', exists, 'should be', true);
            assert.equal(exists, true);
          }

          if (index === 4) {
            assert.equal(msg, 'ClientPluginFilesystem rm done');
            const exists = fs.existsSync(path.join(fsPath, 'authorized-browser-rm.txt'));
            console.log('- rm', exists, 'should be', true);
            assert.equal(exists, false);
          }

          if (index === 4) {
            resolve();
          }
        });

        await page.authenticate({ 'username': 'login', 'password': 'password' });
        await page.goto(`http://127.0.0.1:8080/authorized`);
      });
    });
  });
});
