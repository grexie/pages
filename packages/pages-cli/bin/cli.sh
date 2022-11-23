#!/bin/sh
export NODE_OPTIONS="--no-warnings --loader=@grexie/pages-builder/loader --experimental-import-meta-resolve --experimental-vm-modules"
export NODE_PATH=$(pwd)/node_modules:$(realpath $(dirname $(realpath "$0"))/../node_modules):$(realpath $(dirname $(realpath "$0"))/../../../node_modules)
exec node "$(dirname $(realpath "$0"))/index.js" $@