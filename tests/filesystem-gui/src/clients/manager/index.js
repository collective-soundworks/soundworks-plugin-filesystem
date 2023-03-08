import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import launcher from '@soundworks/helpers/launcher.js';
import { html } from 'lit';

import filesystemPlugin from '../../../../../src/client/plugin-filesystem-module.js';
import '../../../../../src/client/sw-filesystem.js';

import createLayout from './views/layout.js';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

const config = window.SOUNDWORKS_CONFIG;

async function main($container) {
  const client = new Client(config);

  client.pluginManager.register('filesystem', filesystemPlugin);

  launcher.register(client, {
    initScreensContainer: $container,
    reloadOnVisibilityChange: false,
  });

  await client.start();

  const filesystem = await client.pluginManager.get('filesystem');

  const $layout = createLayout(client, $container);
  $layout.addComponent({
    render() {
      return html`
        <sw-filesystem
          .plugin="${filesystem}"
        ></sw-filesystem>
      `
    }
  });
}

launcher.execute(main, {
  numClients: parseInt(new URLSearchParams(window.location.search).get('emulate')) || 1,
  width: '50%',
});
