APP_PATH="../build/Final Markdown.app"

rm -rf "${APP_PATH}Contents/Resources/app.nw"
cp -r "./" "${APP_PATH}/Contents/Resources/app.nw"
rm "${APP_PATH}/Contents/Resources/app.nw/run.sh"

#compile javascript
#cd js
#rm -f FinalMarkdown.bin
#touch ./FinalMarkdown.bin
#cat ./finalMarkdownMainFake.js >> ./FinalMarkdown.bin
#cat ./finalMarkdownWindow.js >> ./FinalMarkdown.bin
#nwsnapshot ./FinalMarkdown.bin
#rm *.log
#cd ..
#rm ../build/FinalMarkdown.app/Contents/Resources/app.nw/js/finalMarkdownMain.js
#rm ../build/FinalMarkdown.app/Contents/Resources/app.nw/js/finalMarkdownWindow.js
#############

open "${APP_PATH}"
