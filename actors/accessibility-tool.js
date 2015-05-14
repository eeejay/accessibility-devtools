/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let protocol = require("devtools/server/protocol");
let { Arg, method, RetVal, ActorClass, FrontClass, Front, Actor } = protocol;
let { AccessibleWalkerActor } =
  require("resource://accessibility-devtools/actors/accessibility-tree.js");

let AccessibilityToolActor = exports.AccessibilityToolActor = ActorClass({
  typeName: "accessibilityTool",

  initialize: function(conn, parent) {
    Actor.prototype.initialize.call(this, conn);

    this.parent = parent;
    this.state = "detached";
  },

  getWalker: method(function(domWalker) {
    return AccessibleWalkerActor(this.conn, this.parent, domWalker);
  }, {
    request: { domWalker: Arg(0, "domwalker") },
    response: RetVal("accessiblewalker")
  })

});

exports.AccessibilityToolFront = FrontClass(AccessibilityToolActor, {
  initialize: function(client, form) {
    Front.prototype.initialize.call(this, client, form);
    this.actorID = form[AccessibilityToolActor.prototype.typeName];
    this.manage(this);
  }
});
