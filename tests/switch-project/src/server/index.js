import '@soundworks/helpers/polyfills.js';
import { Server } from '@soundworks/core/server.js';

import { loadConfig } from '../utils/load-config.js';
import '../utils/catch-unhandled-errors.js';

import pluginFilesystem from '../../../../src/server/plugin-filesystem.js';

// - General documentation: https://soundworks.dev/
// - API documentation:     https://soundworks.dev/api
// - Issue Tracker:         https://github.com/collective-soundworks/soundworks/issues
// - Wizard & Tools:        `npx soundworks`

const config = loadConfig(process.env.ENV, import.meta.url);

console.log(`
--------------------------------------------------------
- launching "${config.app.name}" in "${process.env.ENV || 'default'}" environment
- [pid: ${process.pid}]
--------------------------------------------------------
`);

/**
 * Create the soundworks server
 */
const server = new Server(config);
// configure the server for usage within this application template
server.useDefaultApplicationTemplate();

/**
 * Register plugins and schemas
 */
// watch first level in projects directory to get the different project dir
server.pluginManager.register('project-list', pluginFilesystem, {
  dirname: 'projects',
  depth: 0, // we are only interested in first level directories
});

// watch selected project
server.pluginManager.register('project', pluginFilesystem);

server.stateManager.registerSchema('globals', {
  projectList: {
    type: 'any',
    default: null,
    nullable: true,
  },
  currentProject: {
    type: 'any',
    default: null,
    nullable: true,
  },
});

/**
 * Launch application (init plugins, http server, etc.)
 */
await server.start();

const globals = await server.stateManager.create('globals');

const projectList = await server.pluginManager.get('project-list');
const project = await server.pluginManager.get('project');

globals.onUpdate(updates => {
  if ('currentProject' in updates) {
    const { currentProject } = updates;
    project.switch({
      dirname: currentProject.path,
      publicPath: 'project',
    });
  }
});

projectList.onUpdate(({ tree }) => {
  const list = tree.children
    .filter(node => node.type === 'directory')
    .map(node => { return { path: node.path, name: node.name } })
    .sort((a, b) => a.name < b.name ? -1 : 1);

  globals.set({ projectList: list });
}, true);
