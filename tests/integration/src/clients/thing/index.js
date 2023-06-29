import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import launcher from '@soundworks/helpers/launcher.js';

import { loadConfig } from '../../utils/load-config.js';
import createLayout from './views/layout.js';

import pluginFilesystem from '../../../../../src/PluginFilesystemClient.node.js';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

async function bootstrap() {
  /**
   * Load configuration from config files and create the soundworks client
   */
  const config = loadConfig(process.env.ENV, import.meta.url);
  const client = new Client(config);

  /**
   * Register some soundworks plugins, you will need to install the plugins
   * before hand (run `npx soundworks` for help)
   */
  client.pluginManager.register('filesystem', pluginFilesystem);

  /**
   * Register the soundworks client into the launcher
   *
   * Automatically restarts the process when the socket closes or when an
   * uncaught error occurs in the program.
   */
  launcher.register(client);

  /**
   * Launch application
   */
  await client.start();

  const filesystem = await client.pluginManager.get('filesystem');

  try {
    await filesystem.writeFile('thing-writeFile-1.txt', 'thing-writeFile-1');
  } catch (err) {
    process.send(err.message);
  }

  try {
    await filesystem.writeFile('thing-writeFile-2.txt', new Blob(['thing-writeFile-1']));
  } catch (err) {
    process.send(err.message);
  }

  try {
    await filesystem.rename('thing-rename.txt', 'thing-renamed.txt');
  } catch (err) {
    process.send(err.message);
  }

  try {
    await filesystem.mkdir('thing-mkdir');
  } catch (err) {
    process.send(err.message);
  }

  try {
    await filesystem.rm('thing-rm.txt');
  } catch (err) {
    process.send(err.message);
  }
}

bootstrap();

// // The launcher allows to fork multiple clients in the same terminal window
// // by defining the `EMULATE` env process variable
// // e.g. `EMULATE=10 npm run watch-process thing` to run 10 clients side-by-side
// launcher.execute(bootstrap, {
//   numClients: process.env.EMULATE ? parseInt(process.env.EMULATE) : 1,
//   moduleURL: import.meta.url,
// });
