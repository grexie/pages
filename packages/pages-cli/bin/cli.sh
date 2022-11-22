#!/bin/sh
export NODE_OPTIONS="--no-warnings --loader=@grexie/pages-builder/loader --experimental-import-meta-resolve --experimental-vm-modules"
exec node "$(dirname $(realpath "$0"))/index.js" $@