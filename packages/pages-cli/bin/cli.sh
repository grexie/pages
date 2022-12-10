#!/bin/sh
SCRIPT_DIR=$(dirname $(realpath "$0"))
export NODE_OPTIONS="--no-warnings --experimental-import-meta-resolve --experimental-vm-modules ${NODE_OPTIONS}"

NODE_LOADER=$(node -e "try {console.info(require.resolve('@grexie/pages-builder/loader'))} catch(err) {}")

if [ -n "${NODE_LOADER}" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS} --loader ${NODE_LOADER}"
fi

export NODE_PATH=$(pwd)/node_modules
if [ -d "${SCRIPT_DIR}/../../../node_modules" ]; then
  export NODE_PATH="${NODE_PATH}:$(realpath ${SCRIPT_DIR}/../../../node_modules)"
fi

exec node "${SCRIPT_DIR}/index.js" $@