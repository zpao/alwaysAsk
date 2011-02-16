# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is AlwaysAsk code.
#
# The Initial Developer of the Original Code is Paul O’Shannessy.
# Portions created by the Initial Developer are Copyright (C) 2011
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Paul O’Shannessy <paul@oshannessy.com> (original author)
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

#XXXzpao A couple things we should do but won't yet:
#        * turn off DEBUG in alwaysAsk.js
#        * read the version number from install.rdf

version := 1.1
xpi_dir = xpi
xpi_files = install.rdf chrome.manifest components chrome
xpi_name := alwaysAsk-$(version).xpi

# makes the xpi
default: setup clean_dsstore make_xpi

# Make sure the directories exist
setup:
	mkdir -p $(xpi_dir)

clean_dsstore:
	find . -name .DS_Store -exec rm {} \;

# Actually make the xpi
make_xpi:
	rm -f $(xpi_dir)/$(xpi_name)
	zip -9r $(xpi_dir)/$(xpi_name) $(xpi_files)

