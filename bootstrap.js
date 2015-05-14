/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported startup, shutdown, install, uninstall */

"use strict";

const Ci = Components.interfaces;
const Cu = Components.utils;

let { Services } = Cu.import("resource://gre/modules/Services.jsm");
let { gDevTools } = Cu.import("resource:///modules/devtools/gDevTools.jsm");

const { devtools } = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
const { ActorRegistryFront } = devtools.require("devtools/server/actors/actor-registry");
devtools.require("devtools/server/actors/inspector");
var gAccessibilityActorRegistrar;

function debug() {
  dump("accessibility-devtools bootstrap: " + Array.prototype.join.call(arguments, " ") + "\n");
}

function startup(data, reason) {
  let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  let alias = Services.io.newFileURI(data.installPath);
  if (!data.installPath.isDirectory())
    alias = Services.io.newURI("jar:" + alias.spec + "!/", null, null);
  resource.setSubstitution("accessibility-devtools", alias);

  gDevTools.on("inspector-build", (evtName, toolbox, panel) => {
    let popup = panel.panelDoc.getElementById("inspector-node-popup");
    let menuitem = panel.panelDoc.createElement("menuitem");
    menuitem.id = "node-menu-accessible";
    menuitem.setAttribute("label", "Get Accessible");
    menuitem.addEventListener("command", () => {
      toolbox.selectTool("a11y-tools").then(accPanel => {
        accPanel.getAccessibleForDomNode(toolbox.selection.nodeFront);
      });
    });
    popup.insertBefore(menuitem, popup.querySelector("menuseparator"));
  });

  let { AccessibilityToolActor, AccessibilityToolFront } =
    devtools.require("resource://accessibility-devtools/actors/accessibility-tool.js");
  // XXX This code is Firefox only and should not be loaded in b2g-desktop.
  try {
    // Register a new devtool panel with various OS controls
    gDevTools.registerTool({
      id: "a11y-tools",
      key: "V",
      modifiers: "accel,shift",
      icon: "chrome://accessibility-devtools/content/panel/icon.png",
      invertIconForLightTheme: true,
      url: "chrome://accessibility-devtools/content/panel/accessibility-devtools.xul",
      label: "Accessibility",
      tooltip: "Accessibility developer tools",
      inMenu: true,
      isTargetSupported: function(target) {
        debug('wut?', target);
        return true;
      },
      build: function(iframeWindow, toolbox) {
        toolbox.target.client.listTabs((response) => {
          let registryFront = ActorRegistryFront(toolbox.target.client, response);
          let options = {
            prefix: AccessibilityToolActor.prototype.typeName,
            constructor: "AccessibilityToolActor",
            type: {
              tab: true
            }
          };
          registryFront
            .registerActor("resource://accessibility-devtools/actors/accessibility-tool.js", options)
            .then(actorRegistrar => {
              gAccessibilityActorRegistrar = actorRegistrar;
              toolbox.target.client.listTabs((r) => {
                let tab = r.tabs[r.selected];
                let accessiblityFront = AccessibilityToolFront(toolbox.target.client, tab);
                iframeWindow.accessibilityTool.init(toolbox, accessiblityFront);
              });
            }, e => {
              debug("ERROR: " + e);
            });
        });
        iframeWindow.wrappedJSObject.tab = toolbox.target.window;
        return iframeWindow.accessibilityTool;
      }
    });
  } catch (e) {
    debug("Can\"t load the devtools panel. Likely because this version of Gecko is too old");
  }
}

function shutdown(data, reason) {
  if (gAccessibilityActorRegistrar) {
    gAccessibilityActorRegistrar.unregister();
  }
  try {
    gDevTools.unregisterTool("a11y-tools");
  } catch (e) {
    debug("Something went wrong while trying to stop: " + e);
  }
}

function install(data, reason) {}

function uninstall(data, reason) {}