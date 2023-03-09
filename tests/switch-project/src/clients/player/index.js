import '@soundworks/helpers/polyfills.js';
import { Client } from '@soundworks/core/client.js';
import launcher from '@soundworks/helpers/launcher.js';
import { html, nothing } from 'lit';

import pluginFilesystem from '../../../../../src/client/plugin-filesystem-module.js';
import createLayout from './views/layout.js';

import '@ircam/simple-components/sc-button.js';


// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

/**
 * Grab the configuration object written by the server in the `index.html`
 */
const config = window.SOUNDWORKS_CONFIG;

/**
 * If multiple clients are emulated you might to want to share some resources
 */
// const audioContext = new AudioContext();

async function main($container) {
  /**
   * Create the soundworks client
   */
  const client = new Client(config);

  /**
   * Register some soundworks plugins, you will need to install the plugins
   * before hand (run `npx soundworks` for help)
   */
  client.pluginManager.register('project', pluginFilesystem);


  launcher.register(client, { initScreensContainer: $container });

  /**
   * Launch application
   */
  await client.start();

  const project = await client.pluginManager.get('project');
  const globals = await client.stateManager.attach('globals');

  // The `$layout` is provided as a convenience and is not required by soundworks,
  // its full source code is located in the `./views/layout.js` file, so feel free
  // to edit it to match your needs or even to delete it.
  const $layout = createLayout(client, $container);

  $layout.addComponent({
    render() {
      const { currentProject, projectList } = globals.getValues();
      const tree = project.getTree();

      return html`
        <div>
          ${projectList.map(project => {
            return html`
              <sc-button
                ?selected="${currentProject && project.name === currentProject.name}"
                value="${project.name}"
                @input="${e => globals.set({ currentProject: project })}"
              ></sc-button>
            `;
          })}
        </div>
        <div>
          <ul>
          ${tree && tree.children ? tree.children.map(file => {
            if (file.type === 'file') {
              return html`<li>${file.name} - ${file.url}</li>`;
            } else {
              return nothing;
            }
          }) : nothing}
          </ul>
        </div>
      `;
    }
  });

  globals.onUpdate(() => $layout.requestUpdate());
  project.onUpdate(() => $layout.requestUpdate());

}

// The launcher enables instanciation of multiple clients in the same page to
// facilitate development and testing.
// e.g. `http://127.0.0.1:8000?emulate=10` to run 10 clients side-by-side
launcher.execute(main, {
  numClients: parseInt(new URLSearchParams(window.location.search).get('emulate')) || 1,
});
