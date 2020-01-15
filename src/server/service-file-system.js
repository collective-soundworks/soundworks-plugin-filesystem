import chokidar from 'chokidar';
import dirTree from 'directory-tree';
import path from 'path';
import debounce from 'lodash.debounce';

const defaultSchema = {

}

// Example of a more typical implementation structure:
/*
// Initialize watcher.
const watcher = chokidar.watch('file, dir, glob, or array', {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true
});

// Something to use when events are received.
const log = console.log.bind(console);
// Add event listeners.
watcher
  .on('add', path => log(`File ${path} has been added`))
  .on('change', path => log(`File ${path} has been changed`))
  .on('unlink', path => log(`File ${path} has been removed`));

// More possible events.
watcher
  .on('addDir', path => log(`Directory ${path} has been added`))
  .on('unlinkDir', path => log(`Directory ${path} has been removed`))
  .on('error', error => log(`Watcher error: ${error}`))
  .on('ready', () => log('Initial scan complete. Ready for changes'))
  .on('raw', (event, path, details) => { // internal
    log('Raw event info:', event, path, details);
  });

// 'add', 'addDir' and 'change' events also receive stat() results as second
// argument when available: http://nodejs.org/api/fs.html#fs_class_fs_stats
watcher.on('change', (path, stats) => {
  if (stats) console.log(`File ${path} changed size to ${stats.size}`);
});

// Watch new files.
watcher.add('new-file');
// watcher.add(['new-file-2', 'new-file-3', '/other-file*']);

// Get list of actual paths being watched on the filesystem
var watchedPaths = watcher.getWatched();

// Un-watch some files.
watcher.unwatch('new-file*');

// Stop watching.
watcher.close();

// Full list of options. See below for descriptions. (do not use this example)
chokidar.watch('file', {
  persistent: true,

  ignored: '*.txt',
  ignoreInitial: false,
  followSymlinks: true,
  cwd: '.',
  disableGlobbing: false,

  usePolling: true,
  interval: 100,
  binaryInterval: 300,
  alwaysStat: false,
  depth: 99,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100
  },

  ignorePermissionErrors: false,
  atomic: true // or a custom 'atomicity delay', in milliseconds (default 100)
});
*/

function parseTree(tree, config) {
  if (config.publicDirectory) {
    const { publicDirectory } = config;

    function addUrl(obj) {
      const url = path.relative(publicDirectory, obj.path);
      obj.url = url;

      if (obj.children) {
        obj.children.forEach(addUrl);
      }
    }

    addUrl(tree);
  }

  return tree;
}

// class Node

const serviceFactory = function(Service) {

  return class ServiceFileSystem extends Service {
    constructor(server, name, options) {
      super(server, name);

      const defaults = {
        directories: [],
        debounce: 50,
      }

      this.options = this.configure(defaults, options);
      // regenerate schema from directories config
      const schema = Object.assign({}, defaultSchema);

      this.options.directories.forEach(config => {
        schema[config.name] = {
          type: 'any',
          nullable: true,
          default: null,
        }
      });

      this.server.stateManager.registerSchema(`s:${this.name}`, schema);
    }

    async start() {
      this.state = await this.server.stateManager.create(`s:${this.name}`);

      this.started();

      const promises = this.options.directories.map(async (config) => {
        const rootPath = config.path;
        const exclude = /(^|[\/\\])\../;

        if (config.watch) {
          return new Promise((resolve, reject) => {
            let watcher = null;

            const watch = async (firstLaunch = false) => {
              // initial tree update or after chokidar relaunch
              let tree = dirTree(rootPath, { exclude });
              tree = parseTree(tree, config);
              await this.state.set({ [config.name]: tree });

              // run chokidar.on('all') => getTree, parseTree
              const watcher = chokidar.watch(rootPath, {
                ignored: exclude, // ignore dotfiles
                persistent: true,
                ignoreInitial: true,
              });

              // @todo - add debounce function
              watcher.on('all', debounce((event, path) => {
                // update because of change
                let tree = dirTree(rootPath, { exclude });
                tree = parseTree(tree, config);
                this.state.set({ [config.name]: tree });
              }, this.options.debounce));

              watcher.on('ready', () => {
                if (firstLaunch) {
                  resolve();
                }
              });

              watcher.on('error', (err) => {
                console.log(`${this.name}: chokidar error watching ${rootPath}`);
                console.error(err);
                reject(err);
              });

              // workaround `chokidar` problem
              // we need to relaunch everything because when recreating
              // a folder with the same name as one that as been previously
              // unlinked, its content is not watched.
              //
              // @note - maybe its when creating a folder w/ content (but probably not)
              // @todo - open an issue with a proper report file
              const unlinkedDir = new Set();

              watcher.on('unlinkDir', path => unlinkedDir.add(path));

              watcher.on('addDir', path => {
                if (unlinkedDir.has(path)) {
                  watcher.close();
                  watch(false);
                }
              });
            };

            watch(true); // init first watch
          });
        } else {
          let tree = dirTree(rootPath, { exclude });
          tree = parseTree(tree, config);
          await this.state.set({ [config.name]: tree });

          return Promise.resolve();
        }
      });

      try {
        await Promise.all(promises);
        this.ready();
      } catch(err) {
        this.error(err.message);
      }
    }

    connect(client) {
      super.connect(client);
    }

    disconnect(client) {
      super.disconnect(client);
    }
  }
}

// not mandatory
serviceFactory.defaultName = 'file-system';

export default serviceFactory;
