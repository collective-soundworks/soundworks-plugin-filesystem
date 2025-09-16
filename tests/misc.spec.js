import fs from 'node:fs';
import path from 'node:path';

import { delay } from '@ircam/sc-utils';

import { Server } from '@soundworks/core/server.js';
import { Client } from '@soundworks/core/client.js';
import ServerFilesystemPlugin from '../src/ServerPluginFilesystem.js';
import ClientFilesystemPlugin from '../src/ClientPluginFilesystem.node.js';

import config from './config.js';

describe(`[client] PluginFilesystem`, () => {
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
  });

  afterEach(async () => {
    fs.rmSync(path.join('tests', 'assets'), { recursive: true });
  });

  // cf. https://github.com/collective-soundworks/soundworks-plugin-filesystem/issues/10
  it(`should be able to stop client after server`, async () => {
    // launch server
    const server = new Server(config);
    server.pluginManager.register('filesystem', ServerFilesystemPlugin, {
      dirname: 'tests/assets',
      publicPath: 'public',
    });
    await server.start();

    const client = new Client({ role: 'test', ...config });
    client.pluginManager.register('filesystem', ClientFilesystemPlugin)
    await client.start();

    await delay(500);

    await server.stop();
    await client.stop();
  });
});
