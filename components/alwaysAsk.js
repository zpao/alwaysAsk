// Too lazy to check who actually counts as contributers. Much of this code is
// taken verbatim from nsBrowserGlue.js

/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Browser Search Service.
 *
 * The Initial Developer of the Original Code is
 * Giorgio Maone
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Giorgio Maone <g.maone@informaction.com>
 *   Seth Spitzer <sspitzer@mozilla.com>
 *   Asaf Romano <mano@mozilla.com>
 *   Marco Bonardo <mak77@bonardo.net>
 *   Dietrich Ayala <dietrich@mozilla.com>
 *   Ehsan Akhgari <ehsan.akhgari@gmail.com>
 *   Nils Maier <maierman@web.de>
 *   Paul O’Shannessy <paul@oshannessy.com> (Made into add-on)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

try {
  Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
}
catch (ex) {
  this.PrivateBrowsingUtils = {
    isJustAStub: true,
    isWindowPrivate: function pbustub_isWindowPrivate() false
  };
}

// Other constants for us
const TOPICS = ["quit-application-requested",
                "quit-application-granted"];
const EXTRA_TOPICS = ["browser-lastwindow-close-requested",
                      "browser-lastwindow-close-granted"];

// ********************** DEBUGGING *******************************************
const DEBUG = true;
function log(aMsg) {
  aMsg = ("Asker: " + aMsg + "\n");
  if (!DEBUG) return;
  dump(aMsg);
  Services.console.logStringMessage(aMsg);
}
// ********************** DEBUGGING *******************************************

function getBoolPref(key) {
  try {
    return Services.prefs.getBoolPref(key);
  }
  catch (ex) {
    return false;
  }
}

function Asker() { }

Asker.prototype = {
  classDescription: "Always Ask",
  contractID: "@zpao.com/asker;1",
  classID: Components.ID("{2b34d88e-c8e5-11de-8979-e7ad77aa63c5}"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  __topics: null,
  get _topics() {
    if (!this.__topics) {
      // If we're not OSX then we need TOPICS + EXTRA_TOPICS
      this.__topics =
        (Services.appinfo.OS == "Darwin") ? TOPICS : TOPICS.concat(EXTRA_TOPICS);
    }
    return this.__topics;
  },


  observe: function(aSubject, aTopic, aData) {
    log(aTopic);
    let _this = this;
    switch (aTopic) {
      case "profile-after-change":
        this._startup();
        break;
      case "browser-lastwindow-close-requested":
      case "quit-application-requested":
        try {
          this._quitRequested(aSubject, aData);
        }
        catch (ex) {
          log("Exception: " + ex);
        }
        break;
      case "browser-lastwindow-close-granted":
      case "quit-application-granted":
        this._quitGranted();
        break;
    }
  },

  _startup: function() {
    // Add observers
    let _this = this;
    this._topics.forEach(function(aTopic) {
      Services.obs.addObserver(_this, aTopic, true);
    });
  },

  _quitRequested: function(aCancelQuit, aQuitType) {
    // THANKS nsBrowserGlue

    // If user has already dismissed quit request, then do nothing
    if ((aCancelQuit instanceof Ci.nsISupportsPRBool) && aCancelQuit.data)
      return;

    var windowcount = 0;
    var pagecount = 0;
    var browserEnum = Services.wm.getEnumerator("navigator:browser");
    var someWindowsPrivate = false;
    while (browserEnum.hasMoreElements()) {
      windowcount++;

      var browser = browserEnum.getNext();
      if (!someWindowsPrivate && PrivateBrowsingUtils.isWindowPrivate(browser))
        someWindowsPrivate = true;
      var tabbrowser = browser.document.getElementById("content");
      if (tabbrowser)
        pagecount += tabbrowser.browsers.length - tabbrowser._numPinnedTabs;
    }

    if (!aQuitType)
      aQuitType = "quit";

    this._saveSession = false;
    // nsBrowserGlue won't prompt if pagecount < 2...
    if (pagecount < 2) {
      this._showPrompt(aCancelQuit, aQuitType);
      return;
    }

    if (PrivateBrowsingUtils.isJustAStub &&
        ("nsIPrivateBrowsingService" in Ci)) {
      // In legacy private browsing mode, all windows are private, if the mode
      // is active, or else none is private.
      someWindowsPrivate = Cc["@mozilla.org/privatebrowsing;1"].
                           getService(Ci.nsIPrivateBrowsingService).
                           privateBrowsingEnabled;
    }

    // browser.warnOnQuit is a hidden global boolean to override all quit prompts
    // browser.showQuitWarning specifically covers quitting
    // browser.warnOnRestart specifically covers app-initiated restarts where we restart the app (legacy)
    // browser.tabs.warnOnClose is the global "warn when closing multiple tabs" pref

    var sessionWillBeRestored = Services.prefs.getIntPref("browser.startup.page") == 3 ||
                                getBoolPref("browser.sessionstore.resume_session_once");
    if (sessionWillBeRestored || !getBoolPref("browser.warnOnQuit")) {
      this._showPrompt(aCancelQuit, aQuitType);
      return;
    }

    if (aQuitType != "restart" && getBoolPref("browser.showQuitWarning")) {
      log("Frefox prompts");
      return;
    }
    else if (aQuitType == "restart" && getBoolPref("browser.warnOnRestart")) {
      // Legacy only.
      log("Frefox prompts");
      return;
    }
    else if (someWindowsPrivate) {
      // When some windows are private, always prompt.
      this._showPrompt(aCancelQuit, aQuitType);
      return;
    }
    else if (aQuitType == "lastwindow") {
      // FIREFOX MIGHT PROMPT
      // Firefox will call into window.gBrowser.warnAboutClosingTabs(true) so we should see what that does
      var mostRecentBrowserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (mostRecentBrowserWindow.gBrowser.tabs.length > 1 ||
          getBoolPref("browser.tabs.warnOnClose")) {
        log("Frefox prompts");
        return;
      }
    }

    // If we got here, then Firefox hasn't shown a prompt and we haven't already done so.
    this._showPrompt(aCancelQuit, aQuitType);
  },

  // The actual dialog showing
  _showPrompt: function(aCancelQuit, aQuitType) {
    var quitBundle =
      Services.strings.createBundle("chrome://alwaysAsk/locale/quitDialog.properties");
    var brandBundle =
      Services.strings.createBundle("chrome://branding/locale/brand.properties");

    // aQuitType can be "lastwindow" here, which essentially just means quit
    if (aQuitType == "lastwindow")
      aQuitType = "quit";

    var appName = brandBundle.GetStringFromName("brandShortName");
    var title = quitBundle.formatStringFromName(aQuitType + "DialogTitle",
                                                [appName], 1);

    var message = quitBundle.formatStringFromName(aQuitType + "Message",
                                                  [appName], 1);

    //XXXzpao Potential feature - include what's happening (is session going to
    //        be restored, etc)

    var promptService = Services.prompt;

    var mostRecentBrowserWindow = Services.wm.getMostRecentWindow("navigator:browser");
    var {BUTTON_TITLE_CANCEL, BUTTON_TITLE_IS_STRING, BUTTON_POS_0,
         BUTTON_POS_1, BUTTON_POS_1_DEFAULT} = promptService;
    var flags = (BUTTON_POS_0 * BUTTON_TITLE_IS_STRING) |
                (BUTTON_POS_1 * BUTTON_TITLE_CANCEL) |
                BUTTON_POS_1_DEFAULT;
    var reallyQuit = promptService.confirmEx(mostRecentBrowserWindow, title,
                                             message, flags, title, null, null,
                                             null, {value:false}) == 0;
    if (!reallyQuit) {
      aCancelQuit.QueryInterface(Ci.nsISupportsPRBool);
      aCancelQuit.data = true;
    }
  },

  _quitGranted: function() {
    // remove observers
    let _this = this;
    this._topics.forEach(function(aTopic) {
      Services.obs.removeObserver(_this, aTopic, true);
    });
  }
}

// This only supports Gecko 2 (Firefox 4).
const NSGetFactory = XPCOMUtils.generateNSGetFactory([Asker]);
