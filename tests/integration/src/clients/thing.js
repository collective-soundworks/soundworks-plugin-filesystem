import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import { loadConfig, launcher } from '@soundworks/helpers/node.js';

import ClientPluginFilesystem from '../../../../src/ClientPluginFilesystem.node.js';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

async function bootstrap() {
  const config = loadConfig(process.env.ENV, import.meta.url);
  const client = new Client(config);

  // Eventually register plugins
  client.pluginManager.register('filesystem', ClientPluginFilesystem);

  // https://soundworks.dev/tools/helpers.html#nodelauncher
  launcher.register(client);

  await client.start();

  const filesystem = await client.pluginManager.get('filesystem');

  try {
    console.log('> writeFile 1');
    await filesystem.writeFile('thing-writeFile-1.txt', 'thing-writeFile-1');
  } catch (err) {
    console.log(err.message);

    if (process.send) {
      process.send(err.message);
    }
  }

  try {
    console.log('> writeFile 2');
    await filesystem.writeFile('thing-writeFile-2.txt', new Blob(['thing-writeFile-1']));
  } catch (err) {
    console.log(err.message);

    if (process.send) {
      process.send(err.message);
    }
  }

  try {
    console.log('> rename');
    await filesystem.rename('thing-rename.txt', 'thing-renamed.txt');
  } catch (err) {
    console.log(err.message);

    if (process.send) {
      process.send(err.message);
    }
  }

  try {
    console.log('> mkdir');
    await filesystem.mkdir('thing-mkdir');
  } catch (err) {
    console.log(err.message);

    if (process.send) {
      process.send(err.message);
    }
  }

  try {
    console.log('> mkdir');
    await filesystem.rm('thing-rm.txt');
  } catch (err) {
    console.log(err.message);

    if (process.send) {
      process.send(err.message);
    }
  }
}

// do not use the launcher as it swallows the IPC message
bootstrap();
// // The launcher allows to launch multiple clients in the same terminal window
// // e.g. `EMULATE=10 npm run watch thing` to run 10 clients side-by-side
// launcher.execute(bootstrap, {
//   numClients: process.env.EMULATE ? parseInt(process.env.EMULATE) : 1,
//   moduleURL: import.meta.url,
// });
