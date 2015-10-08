# run_osx.sh
#
# bundles and runs the latest version of the app
# on OSX. This is used for testing purposes.


APP_PATH="./build/osx/Final Markdown.app"
SRC_PATH="./src"

rm -rf "${APP_PATH}/Contents/Resources/app.nw"
cp -r "${SRC_PATH}" "${APP_PATH}/Contents/Resources/app.nw"

open "${APP_PATH}"
