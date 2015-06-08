/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global dump */
/* exported AccessibilityPanel */

"use strict";

const Cu = Components.utils;
const { Promise: promise } = Cu.import("resource://gre/modules/Promise.jsm", {});
const { devtools } = Cu.import("resource://gre/modules/devtools/Loader.jsm");
const events = devtools.require("sdk/event/core");
const { Class } = devtools.require("sdk/core/heritage");
const { EventTarget } = devtools.require("sdk/event/target");
const { AccessibleTreeView } = devtools.require("resource://accessibility-devtools/content/panel/accessibility-treeview.js");
const { AccessibleSidebar } = devtools.require("resource://accessibility-devtools/content/panel/accessibility-sidebar.js");

function debug() {
  dump("accessibility-panel.js: " + Array.prototype.join.call(arguments, " ") + "\n");
}

const AccessibilityPanel = Class({
  initialize: function() {
    this._treeViewDeferred = promise.defer();
  },

  setup: function(toolbox, accessibilityFront) {
    this.toolbox = toolbox;
    this.accessibilityFront = accessibilityFront;
    this.initTreeView();
    this.initSidebar();
  },

  initSidebar: function() {
    this._sidebarFrame = document.createElement("iframe");
    this._sidebarFrame.setAttribute("flex", "1");
    this._sidebarFrame.addEventListener("load", (evt) => {
      this.sidebar = new AccessibleSidebar(evt.target);
      debug('loaded sidebar!', this.sidebar);
    }, true);
    this._sidebarFrame.setAttribute(
      "src", "chrome://accessibility-devtools/content/panel/sidebar.html");
    document.getElementById("accessible-sidebar").appendChild(this._sidebarFrame);
  },

  initTreeView: function() {
    this._treeFrame = document.createElement("iframe");
    this._treeFrame.setAttribute("flex", "1");
    this._treeFrame.addEventListener("load", (evt) => {
      let doc = evt.target;
      this.toolbox.initInspector().then(() => {
        this.accessibilityFront.getWalker(this.toolbox.walker).then(walker => {
          let treeview = new AccessibleTreeView(walker, doc.getElementById("trunk"), this.toolbox);
          treeview.on("selection-changed", (accessible) => {
            this.sidebar.displayAccessible(accessible);
          });
          treeview.setup().then(() => {
            this._treeViewDeferred.resolve(treeview);
          });
        });
      });
    }, true);
    this._treeFrame.setAttribute(
      "src", "chrome://accessibility-devtools/content/panel/tree-view.html");
    document.getElementById("tree-box").appendChild(this._treeFrame);
  },

  getTreeView: function() {
    return this._treeViewDeferred.promise;
  },

  getAccessibleForDomNode: function(domnode) {
    this.getTreeView().then(treeview => {
      treeview.selectAccessibleForDomNode(domnode);
    });
  }
});
