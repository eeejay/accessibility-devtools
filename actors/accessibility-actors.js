/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Cc, Ci, Cu } = require("chrome");
const {Promise: promise} = Cu.import("resource://gre/modules/Promise.jsm", {});

let protocol = require("devtools/server/protocol");
let { Arg, method, RetVal, ActorClass, FrontClass, Front, Actor, types, preEvent } = protocol;
let { Services } = Cu.import("resource://gre/modules/Services.jsm");
let events = require("sdk/event/core");
require("devtools/server/actors/inspector");

const gAccRetrieval = Cc["@mozilla.org/accessibleRetrieval;1"].
  getService(Ci.nsIAccessibleRetrieval);

var gConsole;

function debug() {
  let args = Array.prototype.slice.call(arguments);
  args.unshift("accessibility-actors.js:");
  if (gConsole) {
    gConsole.log.apply(gConsole, args);
  } else {
    dump(args.join(" ") + "\n");
  }
}

function typesRegistered() {
  try {
    types.getType("accessible");
  } catch (x) {
    return false;
  }

  return true;
}

if (!typesRegistered()) {
  types.addActorType("accessible");

  types.addDictType("disconnectedAccessible", {
    // The actual node to return
    accessible: "accessible",

    // lineage all the way to the root
    path: "array:accessible"
  });

  types.addDictType("accessibleEventData", {
    accessible: "accessible",
    eventType: "string",
  });

  types.addDictType("accessibleRootAndDoc", {
    root: "accessible",
    document: "accessible"
  });

  types.addDictType("accessibleAttribute", {
    key: "string",
    value: "string"
  });
}

let AccessibleRootActor = ActorClass({
  typeName: "accessibleRoot",

  events: {
    "document-changed" : {
      type: "documentChanged",
      eventType: Arg(0, "accessible")
    }
  },

  initialize: function(walker, acc) {
    Actor.prototype.initialize.call(this, walker.conn);
    this.rawAcc = acc;
    this.walker = walker;
    this.role = gAccRetrieval.getStringRole(this.rawAcc.role);
    this.docAccessible = walker.currentDocument;
    this.on("document-changed", (self, docAcc) => {
      this.docAccessible = docAcc;
    });
  },

  form() {
    return {
      actor: this.actorID,
      docAccessible: this.docAccessible.form(),
      walker: this.walker.form()
    };
  },

  toString: function() {
    return "[AccessibleRootActor " + this.actorID + " for " + this.role + " | " + this.name + "]";
  },

});

exports.AccessibleRootFront = FrontClass(AccessibleRootActor, {
  initialize: function(client, form) {
    Front.prototype.initialize.call(this, client, form);
  },

  form: function(form) {
    this.actorID = form.actor;
    this.docAccessible = types.getType("accessible").read(form.docAccessible, this);
    this.walker = types.getType("accessiblewalker").read(form.walker, this);
  },

  docChanged: preEvent("document-changed", function(docAcc) {
    this.docAccessible = docAcc;
  })
});

let AccessibleActor = ActorClass({
  typeName: "accessible",

  events: {
    "name-change" : {
      type: "nameChange",
      eventType: Arg(0, "string")
    },
    "child-reorder" : {
      type: "childReorder",
      eventType: Arg(0, "number")
    }
  },

  initialize: function(walker, acc) {
    Actor.prototype.initialize.call(this, walker.conn);
    this.rawAcc = acc;
    this.walker = walker;
    this.role = gAccRetrieval.getStringRole(this.rawAcc.role);
    this.name = this.rawAcc.name;
  },

  marshallPool: function() {
    return this.walker;
  },

  destroy: function() {
    debug("accessible actor destroy", this.actorID);
    Actor.prototype.destroy.call(this);
  },

  form: function() {
    return {
      actor: this.actorID,
      role: this.role,
      name: this.name,
      childCount: this.rawAcc.childCount,
      domNodeType: this.rawAcc.DOMNode ? this.rawAcc.DOMNode.nodeType : 0,
      walker: this.walker.form()
    };
  },

  get bounds() {
    let x = {}, y = {}, w = {}, h = {};
    try {
      this.rawAcc.getBounds(x, y, w, h);
    } catch (e) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: x.value, y: y.value, width: w.value, height: h.value };
  },

  toString: function() {
    return "[AccessibleActor " + this.actorID + " for " + this.role + " | " + this.name + "]";
  },

  children: method(function() {
    let children = [];
    for (let child = this.rawAcc.firstChild; child; child = child.nextSibling) {
      children.push(this.walker.ref(child));
    }
    return children;
  }, {
    response: { children: RetVal("array:accessible") }
  }),

  getBounds: method(function() {
    return {
      bounds: this.bounds,
      devicePixelRatio: this.walker.rootWin.devicePixelRatio,
      offset: { x: this.walker.rootWin.mozInnerScreenX,
       y: this.walker.rootWin.mozInnerScreenY }
    };
  }, {
    response: { bounds: RetVal("json") }
  }),

  getState: method(function() {
    let state = {};
    let extState = {};
    this.rawAcc.getState(state, extState);
    let stateStrings = gAccRetrieval.getStringStates(
      state.value, extState.value);
    let statesArray = new Array(stateStrings.length);
    for (let i = 0; i < statesArray.length; i++) {
      statesArray[i] = stateStrings.item(i);
    }

    return statesArray;
  }, {
    response: { states: RetVal("array:string") }
  }),

  getAttributes: method(function() {
    let attributes = [];

    if (this.rawAcc.attributes) {
      let attributesEnum = this.rawAcc.attributes.enumerate();

      // Populate |attributes| object with |aAccessible|'s attribute key-value
      // pairs.
      while (attributesEnum.hasMoreElements()) {
        let attribute = attributesEnum.getNext().QueryInterface(
          Ci.nsIPropertyElement);
        attributes.push({ key: attribute.key, value: attribute.value });
      }
    }

    return attributes;
  }, {
    response: { attributes: RetVal("array:accessibleAttribute") }
  })
});

exports.AccessibleFront = FrontClass(AccessibleActor, {
  initialize: function(client, form) {
    Front.prototype.initialize.call(this, client, form);
  },

  form: function(form) {
    this.actorID = form.actor;
    this.role = form.role;
    this.name = form.name;
    this.childCount = form.childCount;
    this.walker = types.getType("accessiblewalker").read(form.walker, this);
    this.domNodeType = form.domNodeType;
  },

  marshallPool: function() {
    return this.walker;
  },

  destroy: function() {
    debug("accessible front destroy", this.actorID);
    Front.prototype.destroy.call(this);
  },

  nameChanged: preEvent("name-change", function(name) {
    this.name = name;
  }),

  childReordered: preEvent("child-reorder", function(childCount) {
    this.childCount = childCount;
  }),

  getDOMNode: function() {
    let deferred = promise.defer();

    if (this._DOMNode) {
      deferred.resolve(this._DOMNode);
    } else {
      this.walker.domWalker.getNodeFromActor(
        this.actorID, ["rawAcc", "DOMNode"]).then(result => {
          deferred.resolve(result);
        });
    }

    return deferred.promise;
  },

  toString: function() {
    return "[AccessibleFront " + this.actorID + " for " + this.role + " | " + this.name + "]";
  },

  _DOMNode: null
});

let AccessibleWalkerActor = exports.AccessibleWalkerActor = ActorClass({
  typeName: "accessiblewalker",

  events: {
    "accessible-event" : {
      type: "accessibleEvent",
      eventType: Arg(0, "accessibleEventData")
    },

    "accessible-destroy" : {
      type: "accessibleDestroy",
      eventType: Arg(0, "accessible")
    }
  },

  initialize: function(conn, tabActor, domWalker) {
    Actor.prototype.initialize.call(this, conn);
    this.domWalker = domWalker;
    this.tabActor = tabActor;
    this.rootWin = tabActor.window;
    this.rootDoc = this.rootWin.document;
    this.refMap = new Map();
    events.on(tabActor, "will-navigate", () => {
      debug("will-navigate!!!");
    });
    Services.obs.addObserver(this, "accessible-event", false);
  },

  form: function() {
    return {
      actor: this.actorID,
      domWalker: (this.domWalker && this.domWalker.rootNode) ? this.domWalker.form() : null
    };
  },

  observe: function observe(aSubject, aTopic, aData) {
    if (aTopic !== "accessible-event") {
      return;
    }
    let event = aSubject.QueryInterface(Ci.nsIAccessibleEvent);
    let accessible = this.refMap.get(event.accessible);

    switch (event.eventType) {
      case Ci.nsIAccessibleEvent.EVENT_NAME_CHANGE:
        if (accessible) {
          events.emit(accessible, "name-change", event.accessible.name);
        }
        break;
      case Ci.nsIAccessibleEvent.EVENT_REORDER:
        if (accessible == this.rootAccessible) {
          events.emit(this.rootAccessible, "document-changed", this.currentDocument);
        } else if (accessible) {
          events.emit(accessible, "child-reorder", event.accessible.childCount);
        }
        break;
      case Ci.nsIAccessibleEvent.EVENT_HIDE:
      {
        try {
          this.purgeSubtree(event.accessible);
        } catch (x) {
          debug(x);
        }
        break;
      }
      default:
        break;
    }

    // TODO: Make event actor with lazy accessible getter.
    //events.emit(this, "accessible-event",
    //  { eventType: eventType, accessible: accessible });
  },

  ref: function(accnode) {
    let actor = this.refMap.get(accnode);
    if (!actor) {
      actor = AccessibleActor(this, accnode);
      this.manage(actor);
      this.refMap.set(accnode, actor);
    }

    return actor;
  },

  purgeSubtree(acc) {
    for (let child = acc.firstChild; child; child = child.nextSibling) {
      this.purgeSubtree(child);
    }

    let actor = this.refMap.get(acc);
    this.refMap.delete(acc);
    if (actor) {
      events.emit(this, "accessible-destroy", actor);
      actor.destroy();
    }
  },

  get currentDocument() {
    return this.ref(gAccRetrieval.getAccessibleFor(this.tabActor.window.document));
  },

  get rootAccessible() {
    if (!this._rootAccessible) {
      let docAcc = gAccRetrieval.getAccessibleFor(this.tabActor.window.document);
      let rootAcc = docAcc.parent;
      this._rootAccessible = AccessibleRootActor(this, rootAcc);
      this.refMap.set(rootAcc, this._rootAccessible);
    }
    return this._rootAccessible;
  },

  getRoot: method(function() {
    return this.rootAccessible;
  }, {
    request: { },
    response: { root: RetVal("accessibleRoot") }
  }),

  getAccessibleForDomNode: method(function(domnode) {
    let acc = gAccRetrieval.getAccessibleFor(domnode.rawNode);
    debug("getAccessibleForDomNode", acc);
    if (!acc) {
      return null;
    }

    let ret = {
      accessible: this.ref(acc),
      path: []
    };

    let root = this.rootAccessible.rawAcc;
    for (let parent = acc.parent;
         parent && parent != root;
         parent = parent.parent) {
      ret.path.unshift(this.ref(parent));
    }

    return ret;
  }, {
    request: { domnode: Arg(0, "domnode") },
    response: { accInfo: RetVal("nullable:disconnectedAccessible") }
  })
});

exports.AccessibleWalkerFront = FrontClass(AccessibleWalkerActor, {
  initialize: function(client, form) {
    Front.prototype.initialize.call(this, client, form);
  },

  accDestroy: preEvent("accessible-destroy", function(accessible) {
    debug("accDestroy", accessible);
    accessible.destroy();
  }),

  form: function(form) {
    this.actorID = form.actor;
    this.domWalker = form.domWalker ?
      types.getType("domwalker").read(form.domWalker, this) : null;
  }
});

let AccessibilityToolActor = exports.AccessibilityToolActor = ActorClass({
  typeName: "accessibilityTool",

  initialize: function(conn, parent) {
    gConsole = parent.window.console;
    Actor.prototype.initialize.call(this, conn);

    this.parent = parent;
    this.state = "detached";
  },

  getWalker: method(function(domWalker) {
    return AccessibleWalkerActor(this.conn, this.parent, domWalker);
  }, {
    request: { domWalker: Arg(0, "domwalker") },
    response: { walker: RetVal("accessiblewalker") }
  })
});

exports.AccessibilityToolFront = FrontClass(AccessibilityToolActor, {
  initialize: function(client, form) {
    Front.prototype.initialize.call(this, client, form);
    this.actorID = form[AccessibilityToolActor.prototype.typeName];
    this.manage(this);
  }
});
