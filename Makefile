RDF = install.rdf
CONTENT_SOURCES = $(shell find content/ -not -name \*~ -not -name \*.js)
JS_SOURCES = $(shell find \! -path ./node_modules\* \! -path ./additional-extensions\* -name \*.js -not -name \*~)
FIREFOX_BINARY?=$(shell which firefox)
URL?=about:home

SOURCES = \
	chrome.manifest \
	$(RDF) \
	$(CONTENT_SOURCES) \
	$(JS_SOURCES)

EXT_NAME := \
	${shell sed -n 's/.*<em:id>\([^<]*\)@mozilla.org<\/em:id>.*/\1/p' < $(RDF)}
EXT_VERSION := \
	${shell sed -n 's/.*<em:version>\([^<]*\)<\/em:version>.*/\1/p' < $(RDF)}

XPI_FILE := $(EXT_NAME)-$(EXT_VERSION).xpi

TIMESTAMP = ${shell date -u +"%Y%m%d%H%M"}
SNAPSHOT = $(EXT_NAME)-snapshot-$(TIMESTAMP).xpi

MOZRUNNER = mozrunner --pref=devtools.chrome.enabled:true --pref=devtools.debugger.remote-enabled:true \
	-b $(FIREFOX_BINARY) -a $(CURDIR)/additional-extensions -a $(CURDIR) --app-arg=$(URL)

$(XPI_FILE): $(SOURCES)
	zip $@ $^

all: $(XPI_FILE)

clean:
	rm -f *.xpi

snapshot: $(XPI_FILE)
	@echo Creating snapshot: $(SNAPSHOT)
	@cp $(XPI_FILE) $(SNAPSHOT)

run:
	$(MOZRUNNER)

run-webide:
	$(MOZRUNNER) --app-arg=-webide

run-no-e10s:
	$(MOZRUNNER) --pref=browser.tabs.remote.autostart.2:false

jshint: node_modules/.bin/jshint
	$(CURDIR)/node_modules/.bin/jshint -c $(CURDIR)/.jshintrc $(JS_SOURCES)

node_modules/.bin/jshint:
	npm install jshint
