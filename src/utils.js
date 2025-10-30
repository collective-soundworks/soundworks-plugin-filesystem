/**
 *
 * @param {*} tree
 * @param {String} filterExt - File extension to retrieve in the list
 * @param {Boolean} [keepExtension=false] - Keep or remove the file extension
 *  from the keys
 * @returns
 */
export function formatTreeAsUrlMap(tree, filterExt, keepExtension) {
  let map = {};

  if (!('url' in tree)) {
    throw new Error(`Cannot execute 'getTreeAsUrlMap' on ClientPluginFilesystem: Current filesystem configuration does not expose urls. You must define server "options.publicPath" to expose public urls`);
  }

  // eslint-disable-next-line no-useless-escape
  let regexp = new RegExp(`\.?${filterExt}$`);

  (function populateMap(node) {
    if (('extension' in node) && regexp.test(node.extension)) {
      let { name, url } = node;

      if (keepExtension === false) {
        const replace = new RegExp(`${node.extension}$`);
        name = name.replace(replace, '');
      }

      map[name] = url;
    }

    if (node.children) {
      node.children.forEach(child => populateMap(child));
    }
  }(tree));

  return map;
}
