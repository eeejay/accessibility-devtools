/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global require */
"use strict";

const { Class } = require("sdk/core/heritage");

function debug() {
  dump("accessibility-sidebar.js: " + Array.prototype.join.call(arguments, " ") + "\n");
}

exports.AccessibleSidebar = Class({
  initialize: function(doc) {
    this.doc = doc;
    this.statesList = doc.querySelector("#states > ul");
    this.attributesList = doc.querySelector("#attributes > dl");
    this.doc.addEventListener("click", this);
    this.doc.addEventListener("keydown", this, false);

  },

  expandSection: function (target) {
    if (target.classList.contains("expander")) {
      let section = this.doc.getElementById(target.getAttribute("aria-controls"));
      if (section.classList.toggle("collapsed")) {
        target.removeAttribute("open");
        target.setAttribute("aria-label", "Show");
        section.setAttribute("aria-expanded", false);
      } else {
        target.setAttribute("open", "");
        target.setAttribute("aria-label", "Hide");
        section.setAttribute("aria-expanded", true);
      }
    }
  },

  handleEvent: function(evt) {
    switch (evt.type) {
      case "keydown":
        if (evt.key == " " || evt.key == "Enter") {
          this.expandSection(evt.target);
          evt.preventDefault();
        }
        break;
      case "click":
        this.expandSection(evt.target);
        break;
    }
  },

  displayAccessible: function(accessible) {
    if (!accessible) {
      this.statesList.innerHTML = "";
      this.attributesList.innerHTML = "";
      return;
    }

    accessible.getState().then((states) => {
      this.statesList.innerHTML = "";
      for (let state of states) {
        let li = this.doc.createElement("li");
        li.className = "theme-fg-color3";
        li.textContent = state;
        this.statesList.appendChild(li);
      }
    });

    accessible.getAttributes().then((attributes) => {
      this.attributesList.innerHTML = "";
      for (let attribute of attributes) {
        let dt = this.doc.createElement("dt");
        dt.className = "theme-fg-color5";
        dt.textContent = attribute.key;
        this.attributesList.appendChild(dt);
        let dd = this.doc.createElement("dd");
        dd.className = "theme-fg-color1";
        dd.textContent = attribute.value;
        this.attributesList.appendChild(dd);
      }
    });
  }
});
