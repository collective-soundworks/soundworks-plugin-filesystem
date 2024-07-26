import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Blob } from 'node:buffer';


import { assert } from 'chai';
import express from 'express';
// @note - native node global.fetch introduce weird problems and timeouts
import fetch from 'node-fetch';

import { Server } from '@soundworks/core/server.js';
import { Client } from '@soundworks/core/client.js';

import serverFilesystemPlugin from '../src/PluginFilesystemServer.js';
import clientFilesystemPlugin from '../src/PluginFilesystemClient.node.js';

const config = {
  app: {
    name: 'test-plugin-filesystem',
    clients: {
      test: { target: 'node' },
    },
  },
  env: {
    port: 8080,
    serverAddress: '127.0.0.1',
    useHttps: false,
    verbose: false,
  },
};

describe(`[client] PluginFilesystem`, () => {
  let server = null;
  const testFile = path.join('tests', 'assets', 'my-file.json');
  const fileData = { a: true }

  beforeEach(async () => {
    // clean test files
    [
      path.join('tests', 'assets'),
    ].forEach(testDir => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    // create test file
    fs.mkdirSync('tests/assets');
    fs.writeFileSync(testFile, JSON.stringify(fileData));

    // launch server
    server = new Server(config);
    server.pluginManager.register('filesystem', serverFilesystemPlugin, {
      dirname: 'tests/assets',
      publicPath: 'public',
    });

    await server.start();
  });

  afterEach(async () => {
    fs.rmSync(path.join('tests', 'assets'), { recursive: true });
    await server.stop();
  });

  describe('# plugin.constructor(server, id, name)', async () => {
    it(`should register and start properly`, async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      assert.equal(filesystem.id, 'filesystem');

      await client.stop();
    });
  });

  describe('# plugin.getTree() -> FileTree', async () => {
    it(`should retrieve the file tree`, async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const tree = filesystem.getTree();
      // console.log(tree);

      assert.equal(tree.path, 'tests/assets');
      assert.equal(tree.name, 'assets');
      assert.equal(tree.type, 'directory');
      assert.equal(tree.url, '/public/');

      assert.equal(tree.children.length, 1);
      assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
      assert.equal(tree.children[0].name, 'my-file.json');
      assert.equal(tree.children[0].type, 'file');
      assert.equal(tree.children[0].url, '/public/my-file.json');

      await client.stop();
    });
  });

  describe('# plugin.findInTree(pathOrUrl, tree = null) -> FileTree', async () => {
    it(`should find a node according to its path`, async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const node = filesystem.findInTree('my-file.json');

      assert.equal(node.path, 'tests/assets/my-file.json');
      assert.equal(node.relPath, 'my-file.json');
      assert.equal(node.name, 'my-file.json');
      assert.equal(node.type, 'file');
      assert.equal(node.url, '/public/my-file.json');

      await client.stop();
    });

    it(`should find a node according to its path even with "./" prefix)`, async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const node = filesystem.findInTree('./my-file.json');

      assert.equal(node.path, 'tests/assets/my-file.json');
      assert.equal(node.relPath, 'my-file.json');
      assert.equal(node.name, 'my-file.json');
      assert.equal(node.type, 'file');
      assert.equal(node.url, '/public/my-file.json');

      await client.stop();
    });

    it(`should find a node according to its url`, async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const node = filesystem.findInTree('/public/my-file.json');

      assert.equal(node.path, 'tests/assets/my-file.json');
      assert.equal(node.name, 'my-file.json');
      assert.equal(node.extension, '.json');
      assert.equal(node.type, 'file');
      assert.equal(node.url, '/public/my-file.json');

      await client.stop();
    });
  });

  describe('# plugin.onUpdate(updates => {})', async () => {
    it(`should retrieve the file tree`, async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      let executed = false;
      filesystem.onUpdate(updates => {
        const { tree, events } = updates;

        executed = true;

        assert.equal(tree.path, 'tests/assets');
        assert.equal(tree.name, 'assets');
        assert.equal(tree.type, 'directory');
        assert.equal(tree.url, '/public/');

        assert.equal(tree.children.length, 1);
        assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
        assert.equal(tree.children[0].name, 'my-file.json');
        assert.equal(tree.children[0].type, 'file');
        assert.equal(tree.children[0].url, '/public/my-file.json');

        const event = events[0];
        assert.equal(event.type, 'update');
        assert.equal(event.node.path, 'tests/assets/my-file.json');
        assert.equal(event.node.name, 'my-file.json');
        assert.equal(event.node.extension, '.json');
        assert.equal(event.node.type, 'file');
        assert.equal(event.node.url, '/public/my-file.json');
      });

      fs.writeFileSync(testFile, 'coucou');
      await new Promise(resolve => setTimeout(resolve, 500));

      await client.stop();

      assert.equal(executed, true);
    });
  });

  describe('# plugin.getTreeAsUrlMap(filterExt, keepExtension = false) -> { filename[.ext]: url }', () => {
    it('should retrieve a filtered filename / url map', async () => {
      // add some a file into assets
      fs.writeFileSync('tests/assets/sound.wav', 'some audio file');
      // await for the file change to be propagated
      await new Promise(resolve => setTimeout(resolve, 500));

      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      { // with leading dot
        const fileMap = filesystem.getTreeAsUrlMap('.wav');
        assert.equal(fileMap['sound'], '/public/sound.wav');
      }

      { // without leading dot
        const fileMap = filesystem.getTreeAsUrlMap('wav');
        assert.equal(fileMap['sound'], '/public/sound.wav');
      }
    });
  });

  describe('# await plugin.readFile(filename)', () => {
    it('should retrieve a blob', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const blob = await filesystem.readFile('my-file.json');
      const text = await blob.text();

      assert.equal(text, '{"a":true}');
      await client.stop();
    });

    it('should throw if file not found', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      let errored = false;

      try {
        const blob = await filesystem.readFile('do-not-exists.txt');
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      assert.isTrue(errored);
      await client.stop();
    });

    it('should throw if pathname points to a directory', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      let errored = false;

      try {
        const blob = await filesystem.readFile(''); // root dir
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      assert.isTrue(errored);
      await client.stop();
    });
  });

  describe('# await plugin.writeFile(filename, data)', () => {
    it('should work with a string', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      await filesystem.writeFile('my-string.txt', 'coucou');

      const exists = fs.existsSync('tests/assets/my-string.txt');
      assert.equal(exists, true);
      const txt = fs.readFileSync('tests/assets/my-string.txt');
      assert.equal(txt, 'coucou');

      await client.stop();
    });

    it('should work with a Blob', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const blob = new Blob(['<h1>coucou</h1>'], { type: 'text/html' });

      await filesystem.writeFile('my-page.html', blob);

      const exists = fs.existsSync('tests/assets/my-page.html');
      assert.equal(exists, true);
      const txt = fs.readFileSync('tests/assets/my-page.html');
      assert.equal(txt, '<h1>coucou</h1>');

      await client.stop();
    });

    it('should propagate errors back', async () => {
      {
        const exists = fs.existsSync('tests/assets/my-page.html');
        assert.equal(exists, false);
      }

      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const blob = new Blob(['<h1>coucou</h1>'], { type: 'text/html' });

      let errored = false;

      try {
        await filesystem.writeFile('../my-page.html', blob);
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }

      client.stop();
    });

    it.only('should throw if trying to write itself', async () => {
      {
        const exists = fs.existsSync('tests/assets/my-page.html');
        assert.equal(exists, false);
      }

      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const blob = new Blob(['<h1>coucou</h1>'], { type: 'text/html' });

      let errored = false;

      try {
        await filesystem.writeFile('.', blob);
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }

      client.stop();
    });

    it('should resolve once tree is up to date', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      await filesystem.writeFile('my-string-await.txt', 'coucou');
      const node = filesystem.findInTree('my-string-await.txt');

      assert.isNotNull(node);

      await client.stop();
    });
  });

  describe('# await plugin.mkdir(filename)', () => {
    it('should work with a string', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      await filesystem.mkdir('my-dir');

      const exists = fs.existsSync('tests/assets/my-dir');
      assert.equal(exists, true);

      await client.stop();
    });

    it('should propagate errors back', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.mkdir('../my-dir');
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it.only('should throw if trying to mkdir itself', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.mkdir('.');
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it('should resolve once tree is up to date', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      await filesystem.mkdir('my-dir-await');
      const node = filesystem.findInTree('my-dir-await');

      assert.isNotNull(node);

      await client.stop();
    });
  });

  describe('# await plugin.rename(oldPath, newPath)', () => {
    it('should work with a string', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      await filesystem.rename('my-file.json', 'my-file-renamed.json');

      {
        const exists = fs.existsSync('tests/assets/my-file.json');
        assert.equal(exists, false);
      }

      {
        const exists = fs.existsSync('tests/assets/my-file-renamed.json');
        assert.equal(exists, true);
      }

      await client.stop();
    });

    it('should propagate errors back', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.rename('my-file.json', '../my-file.json');
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it.only('should throw if trying to mkdir itself', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.rename('.', 'ko');
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it('should resolve once tree is up to date', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      await filesystem.rename('my-file.json', 'my-file-renamed-await.json');
      const node = filesystem.findInTree('./my-file-renamed-await.json');

      assert.isNotNull(node);

      await client.stop();
    });
  });

  describe('# await plugin.rm(filename)', () => {
    it('should work with a string', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin);

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      await filesystem.rm('my-file.json');

      const exists = fs.existsSync('tests/assets/my-file.json');
      assert.equal(exists, false);

      await client.stop();
    });

    it('should propagate errors back', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.rm('../my-file.json');
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it.only('should throw if trying to rm itself', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.rm('');
      } catch (err) {
        errored = true;
        console.log(err.message);
      }

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it('should resolve once tree is up to date', async () => {
      const client = new Client({ role: 'test', ...config });
      client.pluginManager.register('filesystem', clientFilesystemPlugin)

      await client.start();

      const filesystem = await client.pluginManager.get('filesystem');
      const node1 = filesystem.findInTree('my-file.json');
      assert.isNotNull(node1);

      await filesystem.rm('./my-file.json');
      const node2 = filesystem.findInTree('my-file.json');
      assert.isNull(node2);

      await client.stop();
    });
  });
});

describe(`[client] PluginFilesystem (protected)`, () => {
  let server = null;

  const config = {
    app: {
      name: 'test-plugin-filesystem',
      clients: {
        test: { target: 'node' },
      },
    },
    env: {
      type: 'production',
      port: 8080,
      serverAddress: '127.0.0.1',
      useHttps: false,
      verbose: false,
    },
  };

  beforeEach(async () => {
    // clean test files
    [
      path.join('tests', 'assets'),
    ].forEach(testDir => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    // launch server in production mode
    server = new Server(config);
    server.pluginManager.register('filesystem', serverFilesystemPlugin, {
      dirname: 'tests/assets',
    });

    await server.start();
  });

  afterEach(async () => {
    fs.rmSync(path.join('tests', 'assets'), { recursive: true });
    await server.stop();
  });

  it('should block all sensitive commands in production if not trusted', async () => {
    const client = new Client({ role: 'test', ...config });
    client.pluginManager.register('filesystem', clientFilesystemPlugin);
    await client.start();

    const filesystem = await client.pluginManager.get('filesystem');

    // write file
    {
      let writeFileErrored = false;

      try {
        await filesystem.writeFile('my-file.txt', 'my-file');
      } catch (err) {
        console.log(err.message);
        writeFileErrored = true;
      }

      const fileExists = fs.existsSync(path.join('tests', 'assets', 'my-file.txt'));
      assert.equal(fileExists, false);

      if (!writeFileErrored) {
        assert.fail('writeFile should have fail');
      }
    }

    // mkdir
    {
      let mkdirError = false;

      try {
        await filesystem.mkdir('my-dir');
      } catch (err) {
        console.log(err.message);
        mkdirError = true;
      }

      const dirExists = fs.existsSync(path.join('tests', 'assets', 'my-dir'));
      assert.equal(dirExists, false);

      if (!mkdirError) {
        assert.fail('writeFile should have fail');
      }
    }

    // rename
    {
      let renameError = false;
      fs.writeFileSync(path.join('tests', 'assets', 'a.txt'), 'coucou');

      try {
        await filesystem.rename('a.txt', 'b.txt');
      } catch (err) {
        console.log(err.message);
        renameError = true;
      }

      const aExists = fs.existsSync(path.join('tests', 'assets', 'a.txt'));
      assert.equal(aExists, true);

      const bExists = fs.existsSync(path.join('tests', 'assets', 'b.txt'));
      assert.equal(bExists, false);

      if (!renameError) {
        assert.fail('writeFile should have fail');
      }
    }

    // rm
    {
      let rmError = false;
      fs.writeFileSync(path.join('tests', 'assets', 'c.txt'), 'coucou');

      try {
        await filesystem.rm('c.txt');
      } catch (err) {
        console.log(err.message);
        rmError = true;
      }

      const cExists = fs.existsSync(path.join('tests', 'assets', 'c.txt'));
      assert.equal(cExists, true);

      if (!rmError) {
        assert.fail('writeFile should have fail');
      }
    }

    // write file (Blob)
    {
      let writeFileErrored = false;

      try {
        await filesystem.writeFile('my-file.txt', new Blob(['my-file']));
      } catch (err) {
        console.log(err.message);
        writeFileErrored = true;
      }

      const fileExists = fs.existsSync(path.join('tests', 'assets', 'my-file.txt'));
      assert.equal(fileExists, false);

      if (!writeFileErrored) {
        assert.fail('writeFile should have fail');
      }
    }
  });
});
