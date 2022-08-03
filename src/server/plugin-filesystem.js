import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import dirTree from 'directory-tree';
import mkdirp from 'mkdirp';
import debounce from 'lodash.debounce';
import normalize from 'normalize-path';
import urljoin from 'url-join';
import fileUpload from 'express-fileupload';


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
      // 3. normalize according to platform (relPath could be in windows style)
      const normalizedPath = normalize(relPath);
      // 4. then we just need to join publicDirectory w/ relpath to obtain the url
      // @note: using `path.join` will renormalize back to \\ on windows
      let url = urljoin('/', config.publicDirectory, normalizedPath);

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
          filterChange: false,
        }
      });

      this.server.stateManager.registerSchema(`s:${this.name}`, schema);

      this.server.router.use(fileUpload());
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


          // uploading file
          this.server.router.post(`/s-${this.name}-upload`, (req, res) => {
            let dirPath;
            if (req.body) {
              dirPath = this.state.get(req.body.directory).path;
            } else {
              const dirName = this.options.directories[0].name;
              dirPath = this.state.get(dirName).path;
            }
            Object.entries(req.files).forEach(([filename, file]) => {
              const filePath = path.join(dirPath, filename);
              fs.writeFile(filePath, file.data, (err) => {
                if (err) {
                  console.log('Error: ', err);
                }
              });
            });
          });

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

      // deleting file
      client.socket.addListener(`s:${this.name}:command`, data => {
        switch (data.action) {
          case 'delete':
            if (data.payload.directory === null) {
              this._delete(data.payload.filename);
            } else {
              this._delete(data.payload.directory, data.payload.filename);
            }
            break;
        }
      }) 
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

    _delete(...args) {
      let filename, directory = null;
      if (args.length === 1) {
        filename = args[0];
      } else if (args.length === 2) {
        directory = args[0];
        filename = args[1];
      } else {
        throw Error("@soundworks/plugin-filesystem's delete method only accepts 1 or 2 arguments");
      }

      let dirPath;
      if (directory) {
        dirPath = this.state.get(directory).path;
      } else {
        const dirName = this.options.directories[0].name;
        dirPath = this.state.get(dirName).path;
      }

      const filePath = path.join(dirPath, filename);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.log('Error: ', err);
        }
      });
    }

  }
}

export default pluginFactory;
