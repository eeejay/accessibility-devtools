/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global dump, require */

"use strict";

const { Cu } = require("chrome");
const { Promise: promise } = Cu.import("resource://gre/modules/Promise.jsm", {});
const { Rect } = Cu.import("resource://gre/modules/Geometry.jsm");
const events = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");
const { EventTarget } = require("sdk/event/target");

function debug() {
  dump("accessibility-treeview.js: " + Array.prototype.join.call(arguments, " ") + "\n");
}

/*
 * Some terminology: an "accessible" is an AccessibleFront, a "node" is the
 * container (<li>) that represents the "accessible" in the tree.
 * to get an "accessible" from a "node", use the accessible property.
 * To get the "node" of an "accessible", look it up in the _nodes map
 */
exports.AccessibleTreeView = Class({
  extends: EventTarget,

  initialize: function(aWalker, aTrunk, aToolbox) {
    this.walker = aWalker;
    this.trunk = aTrunk;
    this.toolbox = aToolbox;
    this.trunk.addEventListener("click", this, true);
    this.trunk.addEventListener("dblclick", this, true);
    this.trunk.addEventListener("mousedown", this, true);
    this.trunk.addEventListener("mousemove", this, true);
    this.trunk.addEventListener("mouseenter", this, true);
    this.trunk.addEventListener("mouseleave", this, true);
    this.trunk.addEventListener("keydown", this, false);
    this.toolbox.on("select", () => {
      this.highlightRect(null);
    });

    this.doc = aTrunk.ownerDocument;

    this.walker.on("accessible-destroy", accessible => {
      let node = AccessibleNode.getNodeForAccessible(accessible);
      if (this.selected && this.selected.isDescendent(node)) {
        this.selectNode(null);
      }

      if (node) {
        let parent = node.parent;
        if (parent) {
          parent.removeNode(node);
        } else if (node.container.parentNode.id == "trunk") {
          node.container.parentNode.removeChild(node.container);
        }
      }
    });

    this.selected = null;
    this.hovered = null;
    this._highlighterDeferred = null;
  },

  setup: function() {
    return this.walker.getRoot().then(root => {
      this.docNode = new AccessibleNode(root.docAccessible, this.doc);
      this.trunk.appendChild(this.docNode.container);
      this.accRoot = root;
      root.on("document-changed", docAcc => {
        this.trunk.innerHTML = "";
        this.docNode = new AccessibleNode(docAcc, this.doc);
        this.trunk.appendChild(this.docNode.container);
        this._highlighterDeferred = null;
        this.selectNode(null);
        this.docNode.flash();
      });
    });
  },

  handleEvent: function(evt) {
    let node = AccessibleNode.getContainingNode(evt.target);

    switch (evt.type) {
      case "click":
        if (!node) {
          break;
        }
        if (evt.target.classList.contains("expander")) {
          if (node.expanded) {
            node.collapse();
          } else {
            node.expand();
          }
        } else if (evt.target.classList.contains("open-inspector")) {
          this.openAccessibleInDomInspector(node);
        }
        break;
      case "dblclick":
        this.highlightRect(node);
        break;
      case "mousedown":
        this.selectNode(node);
        break;
      case "mousemove":
        break;
      case "mouseenter":
        if (evt.target.classList.contains("tag-line")) {
          this.hoverNode(node);
        } else if (evt.target.classList.contains("open-inspector")) {
          this.hoverNode(null);
          this.highlightDomNode(node);
        }
        break;
      case "mouseleave":
        if (evt.target.classList.contains("tag-line")) {
          this.hoverNode(null);
          this.highlightDomNode(null);
        } else if (evt.target.classList.contains("open-inspector")) {
          this.hoverNode(node);
          this.highlightDomNode(null);
        }
        break;
      case "keydown":
        this.handleKey(evt);
        break;
      default:
        break;
    }
  },

  handleKey: function(evt) {
    switch (evt.key) {
      case "ArrowDown":
        if (this.selected) {
          this.selectNode(this.selected.nextShowing);
          this.selected.scrollIntoView();
        } else {
          this.selectNode(this.docNode);
        }
        break;
      case "ArrowUp":
        if (this.selected) {
          this.selectNode(this.selected.previousShowing);
          this.selected.scrollIntoView();
        } else {
          this.selectNode(this.docNode);
        }
        break;
      case "ArrowRight":
        if (this.selected) {
          this.selected.expand();
        }
        break;
      case "ArrowLeft":
        if (this.selected) {
          this.selected.collapse();
        }
        break;
      default:
        return;
    }

    evt.preventDefault();
  },

  selectNode: function(node) {
    if (this.selected) {
      this.selected.selected = false;
    }

    if (node != this.hovered) {
      this.highlightRect(node);
    }

    this.selected = node;
    if (node) {
      this.selected.selected = true;
      events.emit(this, "selection-changed", this.selected.accessible);
    } else {
      events.emit(this, "selection-changed", null);
    }
  },

  getHighlighter: function() {
    if (!this._highlighterDeferred) {
      this._highlighterDeferred =
        this.toolbox.highlighterUtils.getHighlighterByType("RectHighlighter");
    }

    return this._highlighterDeferred;
  },

  getBody: function() {
    if (!this._bodyDeferred) {
      this._bodyDeferred = promise.defer();
      if (!this.walker.domWalker) {
        this._bodyDeferred.resolve(null);
      } else {
        this.walker.domWalker.getRootNode().then(root => {
          this.walker.domWalker.querySelector(root, "body").then(body => {
            this._bodyDeferred.resolve(body);
          });
        });
      }
    }

    return this._bodyDeferred.promise;
  },

  highlightRect: function(node) {
    this.getHighlighter().then(highlighter => {
      this.getBody().then(body => {
        if (!body) return;
        if (!node) {
          highlighter.show(body, {
            rect: {
              x: 0,
              y: 0,
              width: 0,
              height: 0
            }
          });
          return;
        }
        node.accessible.getBounds().then(bounds => {
          let b = new Rect(bounds.bounds.x, bounds.bounds.y,
            bounds.bounds.width, bounds.bounds.height);
          b = b.scale(1 / bounds.devicePixelRatio, 1 / bounds.devicePixelRatio);
          b = b.translate(-bounds.offset.x, -bounds.offset.y);
          highlighter.show(body, {
            rect: {
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height
            },
            fill: "rgba(255,164,0,0.5);"
          });
        });
      });
    });
  },

  hoverNode(node) {
    if (this.hovered == node) {
      return;
    }

    this.highlightRect(node);

    if (this.hovered) {
      this.hovered.hovered = false;
    }
    if (node) {
      node.hovered = true;
    }

    this.hovered = node;
  },

  highlightDomNode: function(node) {
    if (!node) {
      this.toolbox.highlighterUtils.unhighlight();
      return;
    }

    node.accessible.getDOMNode().then(domnode => {
      this.toolbox.highlighterUtils.highlightNodeFront(domnode);
    });
  },

  openAccessibleInDomInspector: function(node) {
    this.toolbox.selectTool("inspector").then(() => {
      node.accessible.getDOMNode().then(domnode => {
        this.toolbox.walker.isInDOMTree(domnode).then(isInDom => {
          if (!isInDom) throw "not in dom!";
          this.highlightRect(null);
          this.toolbox.selection.setNodeFront(domnode);
        });
      });
    });
  },

  selectAccessibleForDomNode: function(domnode) {
    this.walker.getAccessibleForDomNode(domnode).then(accInfo => {
      if (!accInfo) {
        debug("got nothing");
        return;
      }

      if (accInfo.path[0] != this.docNode.accessible) {
        debug("path does not start at document");
        return;
      }

      this.docNode.expand(accInfo.path.slice(1)).then(() => {
        let node = AccessibleNode.getNodeForAccessible(accInfo.accessible);
        if (!node) {
          debug("could not get right node");
          return;
        }
        this.selectNode(node);
      });
    });
  }


});

function AccessibleNode(accessible, doc) {
  this.accessible = accessible;
  AccessibleNode._accessibleToNodes.set(accessible, this);
  this.container = this.createMarkup(doc);
  AccessibleNode._containersToNodes.set(this.container, this);
  this.children = [];

  this.accessible.on("name-change", name => {
    let nameElem = this.container.querySelector(".name");
    nameElem.textContent = name;
    this.flash(nameElem);
  });

  this.accessible.on("child-reorder", childCount => {
    this.container.classList.toggle("leaf", !childCount);
    if (this.expanded) {
      this.populateDescendents();
      this.flash();
    }
  });
}

AccessibleNode._accessibleToNodes = new WeakMap();
AccessibleNode._containersToNodes = new WeakMap();
AccessibleNode.getContainingNode = function(elem) {
  return AccessibleNode._containersToNodes.get(elem.closest(".child"));
};
AccessibleNode.getNodeForAccessible = function(accessible) {
  return AccessibleNode._accessibleToNodes.get(accessible);
};

AccessibleNode.prototype = {
  get childList() {
    return this.container.querySelector("ul");
  },

  get expander() {
    return this.container.querySelector(".expander");
  },

  get expanded() {
    return !this.container.classList.contains("collapsed");
  },

  get parent() {
    let containerParent = this.container.parentNode;
    if (!containerParent) return null;
    return AccessibleNode._containersToNodes.get(containerParent.closest(".child"));
  },

  get nextSibling() {
    return AccessibleNode._containersToNodes.get(
      this.container.nextElementSibling);
  },

  get previousSibling() {
    return AccessibleNode._containersToNodes.get(
      this.container.previousElementSibling);
  },

  get firstChild() {
    return AccessibleNode._containersToNodes.get(
      this.childList.firstElementChild);
  },

  get lastChild() {
    return AccessibleNode._containersToNodes.get(
      this.childList.lastElementChild);
  },

  get nextShowing() {
    let next;
    if (this.expanded) {
      next = this.firstChild;
      if (next) {
        return next;
      }
    }

    for (let parent = this; parent; parent = parent.parent) { // jshint ignore:line
      next = parent.nextSibling;
      if (next) {
        return next;
      }
    }

    return this;
  },

  get previousShowing() {
    let prev = this.previousSibling;
    if (prev) {
      if (prev.expanded && prev.lastChild) {
        return prev.lastChild;
      }
      return prev;
    }

    prev = this.parent;
    if (prev) {
      return prev;
    }

    return this;
  },

  set selected(value) {
    this.container.setAttribute("aria-selected", value);
    if (value) {
      this.container.closest("#trunk").setAttribute("aria-activedescendant",
        this.container.id);
      this.container.setAttribute("selected", "");
      this.container.querySelector(".tag-state").classList.add("theme-selected");
    } else {
      this.container.removeAttribute("selected");
      this.container.querySelector(".tag-state").classList.remove("theme-selected");
    }
  },

  get selected() {
    return this.container.hasAttribute("selected");
  },

  set hovered(value) {
    let tagState = this.container.querySelector(".tag-state");
    tagState.classList.remove("flash-out");
    tagState.classList.toggle("theme-bg-darker", value);
  },

  get hovered() {
    return this.container.querySelector(".tag-state").contains("theme-bg-darker");
  },

  isDescendent: function(node) {
    return !!this.container.closest("#" + node.container.id);
  },

  scrollIntoView: function() {
    let viewport = this.container.closest("#trunk").getBoundingClientRect();
    let bb = this.container.querySelector(".tag-line").getBoundingClientRect();
    if (bb.top < viewport.top) {
      this.container.querySelector(".tag-line").scrollIntoView(true);
    } else if (bb.bottom > viewport.bottom) {
      this.container.querySelector(".tag-line").scrollIntoView(false);
    }
  },

  appendNode: function(childNode) {
    this.childList.appendChild(childNode.container);
    this.children.push(childNode);
    this.container.classList.remove("leaf");
  },

  removeNode: function(childNode) {
    this.childList.removeChild(childNode.container);
    this.children.splice(this.children.indexOf(childNode), 1);
    this.container.classList.toggle("leaf", !this.accessible.childCount);
  },

  populateDescendents: function() {
    if (!this.expanded) {
      // If we are collapsed, just remove all the children and we will
      // get them when we expand.
      for (let child of this.children.slice()) {
        this.removeNode(child);
      }
      return promise.resolve();
    }

    return this.accessible.children().then(children => {
      return promise.all(children.map(child => {
        debug("got child", child.toString());
        let childNode = AccessibleNode._accessibleToNodes.get(child) ||
          new AccessibleNode(child, this.container.ownerDocument);
        let parent = childNode.parent;
        if (parent) {
          parent.removeNode(childNode);
        }
        this.appendNode(childNode);
        if (childNode.expanded) {
          return childNode.populateDescendents();
        } else {
          return promise.resolve();
        }
      }));
    });
  },

  expand: function(path) {
    if (this.container.classList.contains("leaf")) {
      return;
    }

    this.container.classList.remove("collapsed");
    this.container.setAttribute("aria-expanded", true);
    this.expander.setAttribute("open", "");
    if (!this.children.length) {
      return this.populateDescendents().then(() => {
        if (path && path.length) {
          let node = AccessibleNode.getNodeForAccessible(path[0]);
          return node.expand(path.slice(1));
        }
        return promise.resolve();
      });
    }

    if (path && path.length) {
      let node = AccessibleNode.getNodeForAccessible(path[0]);
      return node.expand(path.slice(1));
    }

    return promise.resolve();
  },

  collapse: function() {
    if (this.container.classList.contains("leaf")) {
      return;
    }

    this.container.classList.add("collapsed");
    this.container.setAttribute("aria-expanded", false);
    this.expander.removeAttribute("open");
  },

  createMarkup: function(doc) {
    let container = doc.createElement("li");
    container.id = this.accessible.actorID.split("/").pop();
    container.setAttribute("role", "treeitem");
    container.className = "child collapsed";
    container.setAttribute("aria-selected", false);
    if (this.accessible.childCount) {
      container.setAttribute("aria-expanded", false);
    } else {
      container.classList.add("leaf");
    }
    container.classList.toggle("leaf", this.accessible.childCount === 0);

    let div = doc.createElement("div");
    div.setAttribute("role", "presentation");
    div.className = "tag-line";
    container.appendChild(div);

    let state = doc.createElement("span");
    state.setAttribute("role", "presentation");
    state.className = "tag-state";
    div.appendChild(state);

    let expander = doc.createElement("span");
    expander.setAttribute("role", "presentation");
    expander.className = "theme-twisty expander";
    div.appendChild(expander);

    let role = doc.createElement("span");
    role.textContent = this.accessible.role;
    role.className = "role";
    div.appendChild(role);

    let name = doc.createElement("span");
    name.className = "name";
    name.textContent = this.accessible.name;
    div.appendChild(name);

    if (this.accessible.domNodeType == doc.ELEMENT_NODE) {
      let domnode = doc.createElement("span");
      domnode.setAttribute("role", "presentation"); // TODO: Expose to a11y
      domnode.className = "open-inspector";
      div.appendChild(domnode);
    }

    let children = doc.createElement("ul");
    children.setAttribute("role", "group");
    children.className = "children";
    container.appendChild(children);

    return container;
  },

  flash(element) {
    let elem = element || this.container;
    elem.classList.remove("flash-out");
    elem.classList.add("theme-bg-contrast");
    elem.classList.add("theme-fg-contrast");
    elem.ownerDocument.defaultView.setTimeout(() => {
      elem.classList.add("flash-out");
      elem.classList.remove("theme-bg-contrast");
      elem.classList.remove("theme-fg-contrast");
    }, 500);
  },

};