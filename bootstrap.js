/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported startup, shutdown, install, uninstall */

"use strict";

const Ci = Components.interfaces;
const Cu = Components.utils;

let { Services } = Cu.import("resource://gre/modules/Services.jsm");
let { gDevTools } = Cu.import("resource:///modules/devtools/gDevTools.jsm");
const {Promise: promise} = Cu.import("resource://gre/modules/Promise.jsm", {});

const { devtools } = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
const require = devtools.require;
const { ActorRegistryFront } = require("devtools/server/actors/actor-registry");
const { InspectorFront } = require("devtools/server/actors/inspector");

const ACTOR_SCRIPT = "resource://accessibility-devtools/actors/accessibility-actors.js";
var gAccessibilityActorRegistrar;
var gRegistryFront;

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
        return true;
      },
      build: function(iframeWindow, toolbox) {
        iframeWindow.accessibilityPanel = new iframeWindow.AccessibilityPanel();
        let docElement = toolbox.frame.ownerDocument.documentElement;
        let isWebIde = docElement.getAttribute("windowtype") == "devtools:webide";
        getUrl(iframeWindow, toolbox.target).then(url => {
          setupToolFront(toolbox.target, url, isWebIde).then(toolFront => {
            iframeWindow.accessibilityPanel.setup(toolbox, toolFront);
          });
        });
        iframeWindow.wrappedJSObject.tab = toolbox.target.window;
        return iframeWindow.accessibilityPanel;
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

// actor setup functions

function getTargetForm(target, rootActor, isWebIde) {
  if (isWebIde) {
    let { AppManager } = require("devtools/webide/app-manager");
    let manifestURL = AppManager.getProjectManifestURL(AppManager.selectedProject);
    let deferred = promise.defer();
    let req = {
      to: rootActor.webappsActor,
      type: "getAppActor",
      manifestURL: manifestURL
    };
    target.client.request(req, (appActor) => {
      deferred.resolve(appActor.actor);
    });
    return deferred.promise;
  } else {
    return target.client.mainRoot.getTab().then(tab => tab.tab);
  }
}

function setupToolFront(target, url, isWebIde) {
  let { AccessibilityToolActor, AccessibilityToolFront } = require(ACTOR_SCRIPT);
  let options = {
    prefix: AccessibilityToolActor.prototype.typeName,
    constructor: "AccessibilityToolActor",
    type: {
      tab: true
    }
  };
  let deferred = promise.defer();

  if (target.form[options.prefix]) {
    deferred.resolve(AccessibilityToolFront(target.client, target.form));
  } else {
    target.client.listTabs(tabs => {
      gRegistryFront = gRegistryFront || ActorRegistryFront(target.client, tabs);
      gRegistryFront.registerActor(url, options).then(actorRegistrar => {
        gAccessibilityActorRegistrar = actorRegistrar;
        getTargetForm(target, tabs, isWebIde).then(result => {
          deferred.resolve(AccessibilityToolFront(target.client, result));
        });
      }, e => {
        throw new Error(e.message);
      });
    });
  }

  return deferred.promise;
}

function getUrl(win, target) {
  let deferred = promise.defer();
  if (target.isLocalTab) {
    deferred.resolve(ACTOR_SCRIPT);
  } else {
    let xhr = new win.XMLHttpRequest();
    xhr.onload = () => {
      deferred.resolve("data:text/javascript;base64," + win.btoa(xhr.response));
    };
    xhr.open("get", ACTOR_SCRIPT, true);
    xhr.send();
  }

  return deferred.promise;
}