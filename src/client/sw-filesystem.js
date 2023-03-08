import { LitElement, html, render, css, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

import '@ircam/simple-components/sc-editor.js';

export const arrow = css`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAADZc7J/AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAAmJLR0QA/4ePzL8AAAAJcEhZcwAADsQAAA7EAZUrDhsAAAAHdElNRQfkCAUKBTL+mGjUAAAAeUlEQVRIx+3OMQ6AIBBE0a93sMLEk1h4Y7Ww9mRiRUIM6jJUGob6/QXqfrCGkbbAHw0bE14+v8PAjBffwgDgWCS+4sJXlETElcSF5yYSPCdxw62JB25JvPC3hIE/JYz8LpHBU4lMfk0IPE6IPCRWepUDdHQlvO4jOwFwgu1NCrBo/wAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyMC0wOC0wNVQxMDowNTo0OSswMDowMBWQx3oAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjAtMDgtMDVUMTA6MDU6NDkrMDA6MDBkzX/GAAAAIHRFWHRzb2Z0d2FyZQBodHRwczovL2ltYWdlbWFnaWNrLm9yZ7zPHZ0AAAAYdEVYdFRodW1iOjpEb2N1bWVudDo6UGFnZXMAMaf/uy8AAAAYdEVYdFRodW1iOjpJbWFnZTo6SGVpZ2h0ADUxMo+NU4EAAAAXdEVYdFRodW1iOjpJbWFnZTo6V2lkdGgANTEyHHwD3AAAABl0RVh0VGh1bWI6Ok1pbWV0eXBlAGltYWdlL3BuZz+yVk4AAAAXdEVYdFRodW1iOjpNVGltZQAxNTk2NjIxOTQ5QVn8gAAAABJ0RVh0VGh1bWI6OlNpemUAMzI2MEJCw0lk+gAAAFR0RVh0VGh1bWI6OlVSSQBmaWxlOi8vLi91cGxvYWRzLzU2L2V4dHg3bGQvMjQ1Ni9pbmRpY2F0b3JfYXJyb3dfdHJpYW5nbGVfaWNvbl8xNDkwMjAucG5n2GvxiAAAAABJRU5ErkJggg==`;

export const arrowRight = css`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAAmJLR0QA/4ePzL8AAAAJcEhZcwAA7DgAAOw4AXEryjgAAAAHdElNRQflAxQLDS8ArDZ8AAACgklEQVRo3u3ZT0gUURzA8e+sstgSlmtg9MeCIoKKIIQCu0TZIbxIBdmhKDxZhw7mQYICQRCsU1B4CA8ReJEg+nMpKQjBTT0UERHlYmQGGUWYmOt0aHm9Ic2ZN7/9LYRvbnvY+fDmz/e9XVgaRR4l837qkSbFdPFYh3nGEGdYUZzTVzCIj88Mt9lNQh9QTRY/f3yglVXFBPjM8oC9uvMQBPj4THCJ1fqAKcaYyxNyPKaOUl3AKAe5wXczD5N0sk4TkKWaJI2MmHmYI0MDSU0AwEau8dXMwzeuskkXAEkaGCRnEM85zjJNAMBauvhsCFP0sE0XACUc4qk1D685zXJNAEAV7UwYwjS97MLTBECCfTxk1iCynJWO1r8BAJW08d4QxKO1OAA89nCHmcJEKwwAoJxzvCtEtMICwGMnvfyQjlZ4AECKJl4ZQo4n8aMVDQCwlR7JaEUHQJlktFwAIBgtV4BYtNwBIBKteACBaMUFQMxoSQB+R+tRIFqNugCANG18MYQM6fmchR0/8aOfS+oS1HLfugRjnNIEVHGBj9ZN2EeN3k1YygH6rcfwDc2aj+Ea2gMvoltsj/oVcV7F9QyYJPm84KTmq3gDlwMx6mazwww6Aso4wrCV42GOauZ4C92BBckV1ruePDogxQleWkuyAer1lmQeO7hpLUo/0aG5KC2nmbfWsryf/XrL8gQ19Fkbk3Euam5MKmkJbM3uUau3Nfs7Mq2slDv5YoBYkYkLiB2ZeACByLgDhCLjChCLjAsgKRmZqIBR6rguGZmogOCP1QKRiQr4cwhFxg0gGBkXgGhkwo40mXxk7spGJvw4xhAjnNf4285b4NMKPCatfd3S+H/HLwusPWkzmFSAAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDIxLTAzLTIwVDExOjEzOjQ3KzAwOjAwRxN4GAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyMS0wMy0yMFQxMToxMzo0NyswMDowMDZOwKQAAAAgdEVYdHNvZnR3YXJlAGh0dHBzOi8vaW1hZ2VtYWdpY2sub3JnvM8dnQAAABh0RVh0VGh1bWI6OkRvY3VtZW50OjpQYWdlcwAxp/+7LwAAABh0RVh0VGh1bWI6OkltYWdlOjpIZWlnaHQANTEyj41TgQAAABd0RVh0VGh1bWI6OkltYWdlOjpXaWR0aAA1MTIcfAPcAAAAGXRFWHRUaHVtYjo6TWltZXR5cGUAaW1hZ2UvcG5nP7JWTgAAABd0RVh0VGh1bWI6Ok1UaW1lADE2MTYyMzg4MjfA6B9qAAAAEnRFWHRUaHVtYjo6U2l6ZQA1MTU5QkJP1GlWAAAAUHRFWHRUaHVtYjo6VVJJAGZpbGU6Ly8uL3VwbG9hZHMvNTYvaEpIZnVxcC8yOTAyL2Fycm93X3JpZ2h0X3RyaWFuZ2xlX2ljb25fMTgzMTIxLnBuZ8GglZQAAAAASUVORK5CYII=`;

export const arrowDown = css`data:image/png;base64,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`;

class SwFilesystem extends LitElement {

  static get properties() {
    return {
      width: { type: String },
      height: { type: String },
    }
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        box-sizing: border-box;
        font-size: 0 !important;
        flex-direction: row;
      }

      nav {
        background-color: #21262a;
        color: black;
        height: 100%;
        width: 100%;
        display: inline-block;
        overflow: auto;
        color: #cccccc;
        padding: 10px 0;
      }

      nav ul {
        font-size: 11px;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      nav li {
        cursor: default;
        position: relative;
        min-height: 22px;
        vertical-align: middle;
      }

      nav li span {
        height: 22px;
        line-height: 22px;
        display: inline-block;
      }

      nav li .hover, nav li .hover-bg {
        position: absolute;
        top: 0;
        left: 0;
        height: 22px;
        width: 100%;
        background-color: transparent;
        z-index: 0;
      }

      nav li .content {
        position: relative;
        z-index: 1;
      }

      nav li .hover {
        z-index: 2;
      }

      nav li .hover:hover + .hover-bg {
        background-color: #282d33;
      }

      nav li.active > .hover-bg, li.active .hover:hover + .hover-bg {
        background-color: #383f47;
      }

      nav li.directory + li {
        display: none;
      }

      nav li.open + li {
        display: block;
      }


      /*li.open > ul {
        display: block;
      }*/

      nav li.directory::before {
        content: '';
        display: inline-block;
        font-size: 0;
        background-image: url(${arrowRight});
        background-position: 0 50%;
        background-size: 14px;
        background-repeat: no-repeat;
        position: absolute;
        width: 22px;
        height: 22px;
        z-index: 1;
        /*left: -22px;*/
      }

      nav li.directory.open::before {
        background-image: url(${arrowDown});
        background-position: 20% 70%;
      }
    `;
  }

  constructor() {
    super();


    this._previewNode = null;
    // this.requestUpdate = this.requestUpdate.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();

    this.unsubscribe = this.plugin.onUpdate(() => this.requestUpdate());
    // window.addEventListener('resize', this.requestUpdate);
  }

  disconnectedCallback() {

    this.unsubscribe();

    super.disconnectedCallback();
    // window.removeEventListener('resize', this.requestUpdate);
  }

  _renderNode(node, depth) {
    if (!node) {
      return nothing;
    }

    const classes = {
      directory: (node.type === 'directory'),
      open: (depth === 0),
    }

    return html`
      <li
        style="
          text-indent: ${depth * 20 + 20}px;
        "
        class="${classMap(classes)}"
        @click="${e => this._onTreeItemClick(e, node)}"
      >
        <div class="hover"></div>
        <div class="hover-bg"></div><!-- must be after .hover -->
        <div class="content">
          <span style="
            text-indent: ${node.type === 'directory' ? 20 : 0}px;
          ">${node.name}</span>
        </div>
      </li>
      ${node.type === 'directory' ?
        html`
          <li>
            <ul>
              ${node.children.map(child => this._renderNode(child, depth + 1))}
            </ul>
          </li>
        `
      : nothing}
    `
  }

  render() {
    const tree = this.plugin.getTree();
    const { width, height } = this.parentElement.getBoundingClientRect();

    let inner = null;

    if (this._previewNode !== null) {
      const mimeType = this._previewNode.mimeType;

      if (/^image\//.test(mimeType)) {
        inner = html`
          <img src="${this._previewNode.url}"></audio>
        `;
      } else if (/^audio\//.test(mimeType)) {
        inner = html`
          <audio
            style="display: block; margin: 20px auto"
            src="${this._previewNode.url}"
            controls
          ></audio>
        `
      } else if (/^video\//.test(mimeType)) {
        inner = html`
          <video
            style="display: block; margin: 20px auto"
            src="${this._previewNode.url}"
            controls
          ></video>
        `
      } else if (this._previewNode.content) {
        inner = html`
          <sc-editor
            width="${width * 0.85}"
            height="${height}"
            value="${this._previewNode.content}"
          ></sc-editor>
        `;
      }
    }

    return html`
      <nav style="
        width: ${width * 0.15}px;
        height: ${height}px;
      ">
        <ul>
          ${this._renderNode(tree, 0)}
        </ul>
      </nav>
      <section
        style="
          width: ${width * 0.85}px;
          height: ${height}px;
        "
      >
        ${inner ? inner : nothing}
      </section>
    `
  }

  _onTreeItemClick(e, node) {
    e.stopPropagation();

    if (node.type === 'directory') {
      e.currentTarget.classList.toggle('open');
    } else {
      if (this._currentActive) {
        this._currentActive.classList.toggle('active');
      }

      e.currentTarget.classList.toggle('active');
      this._currentActive = e.currentTarget;

      this._preview(node);
    }
  }

  async _preview(node) {
    console.log(node);

    // do nothing for directories
    if (node.directory) {
      return;
    }

    // if (const code = fetch(this._previewNode.url).then(v => v.text());
    //     console.log(code);)

    this._previewNode = node;

    if (/text\//.test(node.mimeType) || /application\//.test(node.mimeType)) {
      this._previewNode.content = await fetch(this._previewNode.url).then(v => v.text());
    }

    this.requestUpdate();
  }

}

customElements.define('sw-filesystem', SwFilesystem);
