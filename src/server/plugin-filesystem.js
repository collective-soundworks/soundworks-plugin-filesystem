import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import dirTree from 'directory-tree';
import mkdirp from 'mkdirp';
import debounce from 'lodash.debounce';

const defaultSchema = {

}

const cwd = process.cwd();

function parseTree(tree, config) {
  if (config.publicDirectory) {
    function addUrl(obj) {
      // we need these two steps to handle properly absolute and relative paths
      // 1. relative from cwd (harmonize abs and rel)
      const pathFromCwd = path.relative(cwd, obj.path);
      // 2. relative from the watched path
      const relPath = path.relative(config.path, pathFromCwd);
      // 3. then we just need to join publicDirectory w/ relpath to obtain the url
      let url = path.join(config.publicDirectory, relPath);

      if (obj.type === 'directory') {
        url += '/';
      }

      obj.path = pathFromCwd; // better to not expose the server guts client-side
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

const pluginFactory = function(AbstractPlugin) {

  return class PluginFilesystem extends AbstractPlugin {
    constructor(server, name, options) {
      super(server, name);

      this.excludeDotFiles = /(^|[\/\\])\../; // dot files

      const defaults = {
        directories: [],
        debounce: 50,
        // cf. https://www.npmjs.com/package/directory-tree
        dirTreeOptions: {
          attributes: ["size", "type", "extension"],
          normalizePath: true,
          exclude: this.excludeDotFiles,
        }
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

        if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
          await mkdirp(rootPath);
        }

        return new Promise((resolve, reject) => {
          let watcher = null;

          const watch = async (firstLaunch = false) => {
            // initial tree update or after chokidar relaunch
            let tree = dirTree(rootPath, this.options.dirTreeOptions);
            tree = parseTree(tree, config);
            await this.state.set({ [config.name]: tree });

            // run chokidar.on('all') => getTree, parseTree
            const watcher = chokidar.watch(rootPath, {
              ignored: this.excludeDotFiles, // ignore dotfiles
              persistent: true,
              ignoreInitial: true,
            });

            // @todo - add debounce function
            watcher.on('all', debounce((event, path) => {
              // update because of change
              let tree = dirTree(rootPath, this.options.dirTreeOptions);
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

    subscribe(callback) {
      const unsubscribe = this.state.subscribe(callback);
      return unsubscribe;
    }

    getValues() {
      return this.state.getValues();
    }

    get(name) {
      return this.state.get(name);
    }
  }
}

export default pluginFactory;
