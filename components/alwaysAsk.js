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
  Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService)
                                     .logStringMessage(aMsg);
}
// ********************** DEBUGGING *******************************************


function Asker() {
  XPCOMUtils.defineLazyServiceGetter(this, "_bundleService",
                                     "@mozilla.org/intl/stringbundle;1",
                                     "nsIStringBundleService");
  XPCOMUtils.defineLazyServiceGetter(this, "_observerService",
                                     "@mozilla.org/observer-service;1",
                                     "nsIObserverService");
  XPCOMUtils.defineLazyServiceGetter(this, "_prefs",
                                     "@mozilla.org/preferences-service;1",
                                     "nsIPrefBranch");
}

Asker.prototype = {
  classDescription: "Always Ask",
  contractID: "@zpao.com/asker;1",
  classID: Components.ID("{2b34d88e-c8e5-11de-8979-e7ad77aa63c5}"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  _xpcom_categories: [{category: "app-startup", service: true}],

  __topics: null,
  get _topics() {
    if (!this.__topics) {
      // If we're not OSX then we need TOPICS + EXTRA_TOPICS
      let os = Cc["@mozilla.org/xre/app-info;1"].
               getService(Ci.nsIXULRuntime).OS;
      this.__topics = (os == "Darwin") ? TOPICS : TOPICS.concat(EXTRA_TOPICS);
    }
    return this.__topics;
  },


  observe: function(aSubject, aTopic, aData) {
    log(aTopic);
    let _this = this;
    switch (aTopic) {
      case "app-startup":
        this._startup();
        break;
      case "browser-lastwindow-close-requested":
      case "quit-application-requested":
        this._quitRequested(aSubject, aData);
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
      _this._observerService.addObserver(_this, aTopic, true);
    });
  },

  _quitRequested: function(aCancelQuit, aQuitType) {
    // THANKS nsBrowserGlue

    // If user has already dismissed quit request, then do nothing
    if ((aCancelQuit instanceof Ci.nsISupportsPRBool) && aCancelQuit.data)
      return;

    var wm = Cc["@mozilla.org/appshell/window-mediator;1"].
             getService(Ci.nsIWindowMediator);

    var windowcount = 0;
    var pagecount = 0;
    var browserEnum = wm.getEnumerator("navigator:browser");
    while (browserEnum.hasMoreElements()) {
      windowcount++;

      var browser = browserEnum.getNext();
      var tabbrowser = browser.document.getElementById("content");
      if (tabbrowser)
        pagecount += tabbrowser.browsers.length;
    }

    this._saveSession = false;
    if (pagecount < 2)
      return;

    if (aQuitType != "restart")
      aQuitType = "quit";

    var showPrompt = true;
    try {
      // browser.warnOnQuit is a hidden global boolean to override all quit prompts
      // browser.warnOnRestart specifically covers app-initiated restarts where we restart the app
      // browser.tabs.warnOnClose is the global "warn when closing multiple tabs" pref

      var sessionWillBeSaved = this._prefs.getIntPref("browser.startup.page") == 3 ||
                               this._prefs.getBoolPref("browser.sessionstore.resume_session_once");
      if (sessionWillBeSaved || !this._prefs.getBoolPref("browser.warnOnQuit"))
        showPrompt = false;
      else if (aQuitType == "restart")
        showPrompt = this._prefs.getBoolPref("browser.warnOnRestart");
      else
        showPrompt = this._prefs.getBoolPref("browser.tabs.warnOnClose");
    } catch (ex) {}

    // Never show a prompt inside the private browsing mode
    var inPrivateBrowsing = Cc["@mozilla.org/privatebrowsing;1"].
                            getService(Ci.nsIPrivateBrowsingService).
                            privateBrowsingEnabled;

    if (showPrompt && !inPrivateBrowsing) {
      log("Firefox SHOULD have prompted\n\n");
      return;
    }

    var quitBundle =
      this._bundleService.createBundle("chrome://alwaysAsk/locale/quitDialog.properties");
    var brandBundle =
      this._bundleService.createBundle("chrome://branding/locale/brand.properties");

    var appName = brandBundle.GetStringFromName("brandShortName");
    var title = quitBundle.formatStringFromName(aQuitType + "DialogTitle",
                                                [appName], 1);

    var message = quitBundle.formatStringFromName(aQuitType + "Message",
                                                  [appName], 1);

    //XXXzpao Potential feature - include what's happening (is session going to
    //        be restored, etc)

    var promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].
                        getService(Ci.nsIPromptService);

    var mostRecentBrowserWindow = wm.getMostRecentWindow("navigator:browser");
    var reallyQuit = promptService.confirm(mostRecentBrowserWindow, title, message);

    if (!reallyQuit) {
      aCancelQuit.QueryInterface(Ci.nsISupportsPRBool);
      aCancelQuit.data = true;
    }

  },

  _quitGranted: function() {
    // remove observers
    let _this = this;
    this._topics.forEach(function(aTopic) {
      _this._observerService.removeObserver(_this, aTopic, true);
    });
  }
}


function NSGetModule(aComMgr, aFileSpec) {
  return XPCOMUtils.generateModule([Asker]);
}


