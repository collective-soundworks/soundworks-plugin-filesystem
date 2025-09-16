/**
 * Client-side representation of the soundworks' filesystem plugin.
 *
 * The constructor should never be called manually. The plugin will be
 * instantiated when registered in the `pluginManager`
 */
export default class ClientPluginFilesystem {
    /** @hideconstructor */
    constructor(client: any, id: any, options: any);
    options: any;
    /** @private */
    private start;
    /**
     * Return the current filesystem tree.
     * @return {Object}
     */
    getTree(): any;
    /**
     * Register a callback to execute when a file is created, modified or deleted
     * on the underlying directory. The callback will receive the updated `tree`
     * and the list of `events` describing the modifications made on the tree.
     *
     * @param {Function} callback - Callback function to execute
     * @param {boolean} [executeListener=false] - If true, execute the given
     *  callback immediately.
     * @return {Function} Function that unregister the listener when executed.
     */
    onUpdate(callback: Function, executeListener?: boolean): Function;
    /**
     * Return the tree as flat map of `<filename, url>`
     *
     * @param {String} filterExt - File extension to retrieve in the list
     * @param {Boolean} [keepExtension=false] - Keep or remove the file extension
     *  from the keys
     * @return {Object} Map of `<filename, url>`
     */
    getTreeAsUrlMap(filterExt: string, keepExtension?: boolean): any;
    /**
     * Return a node from the tree matching the given path.
     * @param {String} pathOrUrl - Path of the node to be retrieved, relative to
     *  `options.dirname` or URL of the node.
     * @return {Object}
     */
    findInTree(pathOrUrl: string): any;
    /**
     * Read a file
     *
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @return {Promise<Blob>}
     */
    readFile(pathname: string): Promise<Blob>;
    /**
     * Write a file
     *
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @param {String|File|Blob} [data=''] - Content of the file.
     * @return {Promise}
     */
    writeFile(pathname: string, data?: string | File | Blob): Promise<any>;
    /**
     * Create a directory
     *
     * @param {String} pathname - Path of the directory, relative to `options.dirname`.
     * @return {Promise}
     */
    mkdir(pathname: string): Promise<any>;
    /**
     * Rename a file or directory
     *
     * @param {String} oldPath - Current pathname, relative to `options.dirname`.
     * @param {String} newPath - New pathname, relative to `options.dirname`.
     * @return {Promise}
     */
    rename(oldPath: string, newPath: string): Promise<any>;
    /**
     * Delete a file or directory
     *
     * @param {String} pathname - Pathname, relative to `options.dirname`.
     * @return {Promise}
     */
    rm(pathname: string): Promise<any>;
    #private;
}
