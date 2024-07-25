import fs from 'node:fs';
import path from 'node:path';

import { assert } from 'chai';
import express from 'express';
// @note - native node global.fetch introduce weird problems and timeouts
import fetch from 'node-fetch';

import { Server } from '@soundworks/core/server.js';
import serverFilesystemPlugin from '../src/PluginFilesystemServer.js';

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

describe(`[server] PluginFilesystem`, () => {
  beforeEach(() => {
    [
      path.join('tests', 'assets'),
      path.join('tests', 'public'),
    ].forEach(testDir => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });
  });

  afterEach(() => {
    [
      path.join('tests', 'assets'),
      path.join('tests', 'public'),
    ].forEach(testDir => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });
  });

  describe('# plugin.constructor(server, id, options)', async () => {
    it(`should support no options`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin);

      await server.start();
      await server.stop();
    });

    it(`should support options.dirname = null`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: null,
      });

      await server.start();
      await server.stop();
    });
  });

  describe('# async plugin.switch(options)', async () => {
    it(`should throw if "options" is not an object`, async () => {
      const server = new Server(config);

      server.pluginManager.register('filesystem', serverFilesystemPlugin);
      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');
      let errored = false;

      try {
        await filesystem.switch(null);
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it(`should throw if "options.dirname" is not present`, async () => {
      const server = new Server(config);

      server.pluginManager.register('filesystem', serverFilesystemPlugin);
      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');
      let errored = false;

      try {
        await filesystem.switch({ noDirname: 42 });
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it(`should assert "options.dirname" (string or null)`, async () => {
      { // accept null
        const server = new Server(config);

        server.pluginManager.register('filesystem', serverFilesystemPlugin);
        await server.start();

        const filesystem = await server.pluginManager.get('filesystem');
        await filesystem.switch({ dirname: null });
        await server.stop();
      }

      { // accept string
        const server = new Server(config);

        server.pluginManager.register('filesystem', serverFilesystemPlugin);
        await server.start();

        const filesystem = await server.pluginManager.get('filesystem');
        await filesystem.switch({ dirname: 'tests/assets' });
        await server.stop();
      }

      { // else throw
        const server = new Server(config);

        server.pluginManager.register('filesystem', serverFilesystemPlugin);
        await server.start();

        const filesystem = await server.pluginManager.get('filesystem');
        let errored = false;

        try {
          await filesystem.switch({ dirname: 42 });
        } catch(err) {
          console.log(err.message);
          errored = true;
        }

        await server.stop();

        if (!errored) {
          assert.fail('should have thrown');
        }
      }
    });

    it(`should throw if "options.publicPath" is not a string`, async () => {
      const server = new Server(config);

      server.pluginManager.register('filesystem', serverFilesystemPlugin);
      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');
      let errored = false;

      try {
        await filesystem.switch({ dirname: 'tests/assets', publicPath: 42 });
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it(`should throw if "options.publicPath" entries as already been registered`, async () => {
      const server = new Server(config);
      server.router.use('test', async () => {});

      server.pluginManager.register('filesystem', serverFilesystemPlugin);
      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');
      let errored = false;

      try {
        await filesystem.switch({ dirname: 'tests/assets', publicPath: 'test' });
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it(`should create dirname if not exists`, async () => {
      const dirname = path.join('tests', 'assets', 'b');

      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, { dirname });

      await server.start();

      const exists = fs.existsSync(dirname);
      assert.equal(exists, true);

      await server.stop();
    });

    // `fetch` triggers some kind of weird timeout
    it(`should open a route for static assets according to publicPath`, async () => {
      const data = { a: true, b: 42};
      const testFilename = path.join('tests', 'assets', 'my-file.json');
      const testFilePath = `http://127.0.0.1:${config.env.port}/tests/my-file.json`;
      // create dummy test file
      fs.mkdirSync(path.join('tests', 'assets'));
      fs.writeFileSync(testFilename, JSON.stringify(data));

      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
        publicPath: 'tests',
      });

      await server.start();

      const json = await fetch(testFilePath).then(res => res.json());
      assert.deepEqual(json, data);
      // console.log(json, data);

      await server.stop();
    });

    // @todo - review, there might be some hidden bug here as when we run all
    // the tests we cannot access the file using fetch.
    // works well if it's the only test that is run though
    it(`should be able to watch public dir and have url in tree in default template`, async () => {
      const data = { a: true, b: 42};
      const testFilename = path.join('tests', 'public', 'my-file.json');
      const testFilePath = `http://127.0.0.1:${config.env.port}/my-file.json`;
      // create dummy test file
      fs.mkdirSync(path.join('tests', 'public'));
      fs.writeFileSync(testFilename, JSON.stringify(data));

      const server = new Server(config);
      // mimic default template route we can't use `server.useDefaultApplicationTemplate`
      // here, because process.cwd is not what we expect, but the principle is the similar
      server.router.use(express.static('tests/public'));

      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/public',
        publicPath: '/',
      });

      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');
      const tree = filesystem.getTree();
      // console.dir(tree);

      assert.equal(tree.path, 'tests/public');
      assert.equal(tree.name, 'public');
      assert.equal(tree.type, 'directory');
      assert.equal('size' in tree, true);

      assert.equal(tree.children[0].path, 'tests/public/my-file.json');
      assert.equal(tree.children[0].name, 'my-file.json');
      assert.equal(tree.children[0].url, '/my-file.json');
      assert.equal(tree.children[0].type, 'file');
      assert.equal(tree.children[0].extension, '.json');
      assert.equal('size' in tree.children[0], true);

      const json = await fetch(testFilePath).then(res => res.json());
      assert.deepEqual(json, data);

      await server.stop();
    });

    it(`should properly switch`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin);

      const projectAPath = path.join('tests', 'assets', 'project-a');
      fs.mkdirSync(projectAPath, { recursive: true });
      fs.writeFileSync(path.join(projectAPath, 'a.txt'), 'coucou project A');

      const projectBPath = path.join('tests', 'assets', 'project-b');
      fs.mkdirSync(projectBPath, { recursive: true });
      fs.writeFileSync(path.join(projectBPath, 'b.txt'), 'coucou project A');

      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');

      let index = 0;
      filesystem.onUpdate(updates => {
        const { tree } = updates;
        if (index === 0) {
          assert.equal(tree.path, 'tests/assets/project-a');
          assert.equal(tree.children[0].path, 'tests/assets/project-a/a.txt');
        } else {
          assert.equal(tree.path, 'tests/assets/project-b');
          assert.equal(tree.children[0].path, 'tests/assets/project-b/b.txt');
        }

        index++;
      });

      {
        await filesystem.switch({ dirname: projectAPath });
        const tree = filesystem.getTree();
        // console.log(tree);
        assert.equal(tree.path, 'tests/assets/project-a');
        assert.equal(tree.children[0].path, 'tests/assets/project-a/a.txt');
      }

      {
        await filesystem.switch({ dirname: projectBPath });
        const tree = filesystem.getTree();

        assert.equal(tree.path, 'tests/assets/project-b');
        assert.equal(tree.children[0].path, 'tests/assets/project-b/b.txt');
      }

      await server.stop();
    });

    it(`should properly switch publicPath`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin);

      const projectAPath = path.join('tests', 'assets', 'project-a');
      fs.mkdirSync(projectAPath, { recursive: true });
      fs.writeFileSync(path.join(projectAPath, 'a.txt'), 'project A');

      const projectBPath = path.join('tests', 'assets', 'project-b');
      fs.mkdirSync(projectBPath, { recursive: true });
      fs.writeFileSync(path.join(projectBPath, 'b.txt'), 'project B');

      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');

      {
        await filesystem.switch({
          dirname: projectAPath,
          publicPath: 'project-a',
        });
        const tree = filesystem.getTree();
        // console.log(tree);
        assert.equal(tree.url, '/project-a/');
        assert.equal(tree.children[0].url, '/project-a/a.txt');

        const txt = await fetch(
          `http://127.0.0.1:${config.env.port}${tree.children[0].url}`,
        ).then(res => res.text());


        assert.equal(txt, 'project A');
      }

      {
        await filesystem.switch({
          dirname: projectBPath,
          publicPath: 'project-b',
        });
        const tree = filesystem.getTree();
        // console.log(tree);
        assert.equal(tree.url, '/project-b/');
        assert.equal(tree.children[0].url, '/project-b/b.txt');

        const txt = await fetch(
          `http://127.0.0.1:${config.env.port}${tree.children[0].url}`,
        ).then(res => res.text());

        assert.equal(txt, 'project B');
      }

      await server.stop();
    });

    it(`should handle "option.depth"`, async () => {
      const projectAPath = path.join('tests', 'assets', 'project-a');
      fs.mkdirSync(projectAPath, { recursive: true });
      fs.writeFileSync(path.join(projectAPath, 'a.txt'), 'coucou project A');

      const projectBPath = path.join('tests', 'assets', 'project-b');
      fs.mkdirSync(projectBPath, { recursive: true });
      fs.writeFileSync(path.join(projectBPath, 'b.txt'), 'coucou project A');

      // wait to clean remaining fs events from previous tests
      await new Promise(resolve => setTimeout(resolve, 500));

      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
        depth: 0,
      });

      await server.start();

      const filesystem = await server.pluginManager.get('filesystem');
      const tree = filesystem.getTree();

      tree.children.forEach(node => {
        assert.equal(node.type,  'directory');
        assert.equal('children' in node, false);
      });

      // make sure chokidar does not watch innner files
      let updateTriggered = false;
      filesystem.onUpdate(() => updateTriggered = true);
      fs.writeFileSync(path.join(projectAPath, 'a.txt'), 'changed project A');

      await new Promise(resolve => setTimeout(resolve, 500));
      assert.equal(updateTriggered, false);

      await server.stop();
    })
  });

  describe(`# plugin.getTree() -> FileTree`, () => {
    beforeEach(() => {
      const data = { a: true, b: 42};
      const testFilename = path.join('tests', 'assets', 'my-file.json');
      fs.mkdirSync(path.join('tests', 'assets'));
      fs.writeFileSync(testFilename, JSON.stringify(data));
    });

    it(`should return a correct tree`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');
      const tree = filesystem.getTree();
      // console.dir(tree);

      assert.equal(tree.path, 'tests/assets');
      assert.equal(tree.relPath, '');
      assert.equal(tree.name, 'assets');
      assert.equal(tree.type, 'directory');
      assert.equal('size' in tree, true);

      assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
      assert.equal(tree.children[0].relPath, 'my-file.json');
      assert.equal(tree.children[0].name, 'my-file.json');
      assert.equal(tree.children[0].type, 'file');
      assert.equal(tree.children[0].extension, '.json');
      assert.equal('size' in tree.children[0], true);

      await server.stop();
    });

    it(`should contain url according to publicPath`, async () => {
      const publicPaths = ['niap', '/niap', '/niap/'];

      for (let publicPath of publicPaths) {
        const server = new Server(config);
        server.pluginManager.register('filesystem', serverFilesystemPlugin, {
          dirname: 'tests/assets', publicPath: 'niap'
        });

        await server.start();
        const filesystem = await server.pluginManager.get('filesystem');
        const tree = filesystem.getTree();

        assert.equal(tree.path, 'tests/assets');
        assert.equal(tree.relPath, '');
        assert.equal(tree.name, 'assets');
        assert.equal(tree.type, 'directory');
        assert.equal('size' in tree, true);
        assert.equal('mimeType' in tree, false);

        assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
        assert.equal(tree.children[0].relPath, 'my-file.json');
        assert.equal(tree.children[0].url, '/niap/my-file.json');
        assert.equal(tree.children[0].name, 'my-file.json');
        assert.equal(tree.children[0].type, 'file');
        assert.equal(tree.children[0].extension, '.json');
        assert.equal(tree.children[0].mimeType, 'application/json');

        assert.equal('size' in tree.children[0], true);

        await server.stop();
      }
    });

    it(`should handle config.env.subpath in urls`, async () => {
      const publicPaths = ['niap', '/niap', '/niap/'];

      for (let publicPath of publicPaths) {
        const server = new Server({
          app: config.app,
          env: {
            subpath: 'nginx-front',
            ...config.env,
          }
        });
        server.pluginManager.register('filesystem', serverFilesystemPlugin, {
          dirname: 'tests/assets', publicPath: 'niap'
        });

        await server.start();
        const filesystem = await server.pluginManager.get('filesystem');
        const tree = filesystem.getTree();
        // console.dir(tree);

        assert.equal(tree.path, 'tests/assets');
        assert.equal(tree.relPath, '');
        assert.equal(tree.name, 'assets');
        assert.equal(tree.type, 'directory');
        assert.equal('size' in tree, true);

        assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
        assert.equal(tree.children[0].relPath, 'my-file.json');
        assert.equal(tree.children[0].url, '/nginx-front/niap/my-file.json');
        assert.equal(tree.children[0].name, 'my-file.json');
        assert.equal(tree.children[0].type, 'file');
        assert.equal(tree.children[0].extension, '.json');
        assert.equal('size' in tree.children[0], true);

        await server.stop();
      }
    });
  });

  describe('# plugin.findInTree(path) -> TreeNode', () => {
    beforeEach(() => {
      const data = { a: true, b: 42};
      const testFilename = path.join('tests', 'assets', 'my-file.json');
      fs.mkdirSync(path.join('tests', 'assets'));
      fs.writeFileSync(testFilename, JSON.stringify(data));
    });

    it(`should return a tree node from a path`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });
      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      const node = filesystem.findInTree('my-file.json');

      assert.equal(node.path, 'tests/assets/my-file.json');
      assert.equal(node.relPath, 'my-file.json');
      assert.equal(node.name, 'my-file.json');
      assert.equal(node.type, 'file');
      assert.equal(node.extension, '.json');
      assert.equal('size' in node, true);

      await server.stop();
    });
  });

  describe(`plugin.onUpdate(updates => {}, executeListener = false) -> unsubscribe`, () => {
    // @note - the file system is a slow thing, this might break on other
    // platform to be tested and eventuallly reviewed
    it(`should report updates`, async function() {
      // this.timeout(4000);

      const testFilename = path.join('tests', 'assets', 'my-file.json');
      const otherFilename = path.join('tests', 'assets', 'other-file.json');

      fs.mkdirSync(path.join('tests', 'assets'));
      fs.writeFileSync(testFilename, '0');

      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      let counter = 0;

      filesystem.onUpdate(updates => {
        const { tree, events } = updates;
        // make sure children are in alphabetical order for tests
        tree.children.sort((a, b) => a.path < b.path ? -1 : 1);

        // console.log(counter, '------------------------------');
        // console.log(tree, events)

        if (counter === 0) {
          assert.equal(tree.path, 'tests/assets');
          assert.equal(tree.children.length, 1);
          assert.equal(tree.children[0].path, 'tests/assets/my-file.json');

          assert.equal(events, null);
        } else if (counter === 1) {
          assert.equal(tree.path, 'tests/assets');
          assert.equal(tree.children.length, 1);
          assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
          // @note there is a weird issue when running all the test at once
          // which trigger additionnal events, so don't test events.length
          // assert.equal(events.length, 1);
          const { type, node } = events[0];
          assert.equal(type, 'update');
          assert.equal(node.path, 'tests/assets/my-file.json');
        } else if (counter === 2) {
          assert.equal(tree.path, 'tests/assets');
          assert.equal(tree.children.length, 2);
          assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
          assert.equal(tree.children[1].path, 'tests/assets/other-file.json');
          // @note there is a weird issue when running all the test at once
          // which trigger additionnal events, so don't test events.length
          // assert.equal(events.length, 1);
          const { type, node } = events[0];
          assert.equal(type, 'create');
          assert.equal(node.path, 'tests/assets/other-file.json');
        } else if (counter === 3) {
          assert.equal(tree.path, 'tests/assets');
          assert.equal(tree.children.length, 1);
          assert.equal(tree.children[0].path, 'tests/assets/my-file.json');
          // @note there is a weird issue when running all the test at once
          // which trigger additionnal events, so don't test events.length
          // assert.equal(events.length, 1);
          const { type, node } = events[0];
          assert.equal(type, 'delete');
          assert.equal(node.path, 'tests/assets/other-file.json');
        }

        counter += 1;
      }, true);

      // make sure events are not batched together by the plugin
      fs.writeFileSync(testFilename, '1');
      await new Promise(resolve => setTimeout(resolve, 500));
      fs.writeFileSync(otherFilename, '2');
      await new Promise(resolve => setTimeout(resolve, 500));
      fs.rmSync(otherFilename);
      await new Promise(resolve => setTimeout(resolve, 500));

      await server.stop();

      if (counter !== 4) {
        assert.fail(`onUpdate should be called 4 time, called only ${counter}`);
      }
    });
  });

  describe.only('# await plugin.readFile(filename)', () => {
    it('should retrieve a blob', async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();

      fs.writeFileSync('tests/assets/my-file.json', '{"a":true}');

      const filesystem = await server.pluginManager.get('filesystem');
      const blob = await filesystem.readFile('my-file.json');
      const text = await blob.text();

      assert.equal(text, '{"a":true}');
      await server.stop();
    });

    it('should throw if file not found', async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');
      let errored = false;

      try {
        const blob = await filesystem.readFile('do-not-exists.txt');
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      assert.isTrue(errored);
      await server.stop();
    });

    it('should throw if pathname points to a directory', async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');
      let errored = false;

      try {
        const blob = await filesystem.readFile(''); // root dir
      } catch(err) {
        console.log(err.message);
        errored = true;
      }

      assert.isTrue(errored);
      await server.stop();
    });
  });

  describe('# async plugin.writeFile(filename, content)', () => {
    it(`should write a file`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      await filesystem.writeFile('test-write.txt', 'coucou');

      const filename = path.join('tests', 'assets', 'test-write.txt');
      assert.equal(fs.existsSync(filename), true);
      assert.equal(fs.readFileSync(filename).toString(), 'coucou');

      await server.stop();
    });

    it(`should throw if trying to writeFile outside dirname`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.writeFile('../test-write.txt', 'coucou');
      } catch (err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });
  });

  describe('# async plugin.mkdir(filename)', () => {
    it(`should create a directory`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      await filesystem.mkdir('sub-dir');

      const filename = path.join('tests', 'assets', 'sub-dir');
      assert.equal(fs.existsSync(filename), true);

      await server.stop();
    });

    it(`should throw if trying to mkdir outside dirname`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.mkdir('../test-sub-dir');
      } catch (err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });
  });

  describe('# async plugin.rename(oldPath, newPath)', () => {
    it(`should rename a file`, async () => {
      fs.mkdirSync(path.join('tests', 'assets'));
      fs.writeFileSync(path.join('tests', 'assets', 'my-file.json'), 'coucou');

      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      await filesystem.rename('my-file.json', 'my-file-2.json');

      const oldPath = path.join('tests', 'assets', 'my-file.json');
      assert.equal(fs.existsSync(oldPath), false);

      const newPath = path.join('tests', 'assets', 'my-file-2.json');
      assert.equal(fs.existsSync(newPath), true);

      await server.stop();
    });

    it(`should throw if trying to rename outside dirname (oldPath)`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.rename('../some-file', 'new-file');
      } catch (err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it(`should throw if trying to rename outside dirname (newPath)`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.rename('some-file', '../new-file');
      } catch (err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });
  });

  describe('# async plugin.rm(filename)', () => {
    it(`should remove a file`, async () => {
      fs.mkdirSync(path.join('tests', 'assets'));
      fs.writeFileSync(path.join('tests', 'assets', 'my-file.json'), 'coucou');

      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      await filesystem.rm('my-file.json');

      const filename = path.join('tests', 'assets', 'my-file.json');
      assert.equal(fs.existsSync(filename), false);

      await server.stop();
    });

    it(`should throw if trying to rm outside dirname`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      let errored = false;

      try {
        await filesystem.rm('../test-sub-dir');
      } catch (err) {
        console.log(err.message);
        errored = true;
      }

      await server.stop();

      if (!errored) {
        assert.fail('should have thrown');
      }
    });
  });

  describe('# [private] plugin._checkInDir(filename)', () => {
    it(`should write a file`, async () => {
      const server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });

      await server.start();
      const filesystem = await server.pluginManager.get('filesystem');

      {
        let filename = 'tests/assets/in-dir.txt';
        let res = filesystem._checkInDir(filename);
        assert.equal(res, true);
      }

      {
        let filename = 'not-in-dir.txt';
        let res = filesystem._checkInDir(filename);
        assert.equal(res, false);
      }

      {
        let filename = 'tests/assets/../not-in-dir.txt';
        let res = filesystem._checkInDir(filename);
        assert.equal(res, false);
      }

      {
        let filename = 'tests/assets/../assets/./../not-in-dir.txt';
        let res = filesystem._checkInDir(filename);
        assert.equal(res, false);
      }

      {
        let filename = '/etc/group';
        let res = filesystem._checkInDir(filename);
        assert.equal(res, false);
      }

      await server.stop();
    });
  });

  describe('# plugin in idle state (dirname is null)', () => {
    let server;
    let filesystem;

    before(async () => {
      server = new Server(config);
      server.pluginManager.register('filesystem', serverFilesystemPlugin, {
        dirname: 'tests/assets',
      });
      await server.start();

      filesystem = await server.pluginManager.get('filesystem');
      await filesystem.switch({ dirname: null });
    });

    after(async () => {
      await server.stop();
    });

    it('getTree should return null', () => {
      assert.equal(filesystem.getTree(), null);
    });

    it('writeFile should throw', async () => {
      let errored = false;
      try {
        await filesystem.writeFile('coucou', 'coucou');
      } catch(err) {
        console.log(err.message);
        errored = true;
      }
      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it('mkdir should throw', async () => {
      let errored = false;
      try {
        await filesystem.mkdir('coucou', 'coucou');
      } catch(err) {
        console.log(err.message);
        errored = true;
      }
      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it('rename should throw', async () => {
      let errored = false;
      try {
        await filesystem.rename('coucou', 'coucou');
      } catch(err) {
        console.log(err.message);
        errored = true;
      }
      if (!errored) {
        assert.fail('should have thrown');
      }
    });

    it('rm should throw', async () => {
      let errored = false;
      try {
        await filesystem.rm('coucou', 'coucou');
      } catch(err) {
        console.log(err.message);
        errored = true;
      }
      if (!errored) {
        assert.fail('should have thrown');
      }
    });
  });
});
