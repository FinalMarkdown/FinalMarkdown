var gui = require('nw.gui');
//for debugging...
// gui.Window.get().showDevTools();

var fs = require('fs');
var path = require('path');
var fdialogs = require('node-webkit-fdialogs');

var FinalMarkdown = function(){
    this.win = gui.Window.get();
    this.currentPath=false;
    this.modified=false;
    this.oldLength=0;
    this.livePreview=true;

    //FOR DEBUGGING
    // this.win.showDevTools();
    // console.dir(this.win);

    var self = this;

    //in non-mac land windows have their own menus
    if(!global.papa.isMac){
        this.win.menu = global.papa.createMenu();
    }

    var getThisPartyStarted = function(event){
        self.input = document.querySelector('.mdInput');
        self.output = document.querySelector('.mdOutput');
        self.findBox = document.querySelector('#find-popup');
        self.findText = document.querySelector('#find-text');
        self.findForm = document.querySelector('#find-form');

        self.editor = ace.edit(self.input);
        self.editor.setTheme("ace/theme/github");
        self.editor.getSession().setMode("ace/mode/markdown");
        self.editor.$blockScrolling = Infinity;
        self.editor.setOption("wrap", 'free');
        self.editor.renderer.setShowGutter(false);
        self.editor.commands.removeCommand('find');

        AceSpellChecker({
            dicPath: 'js/vendor/en_US.dic',
            affPath: 'js/vendor/en_US.aff'
        });

        window.ondragover = function(e) {
            e.preventDefault();
            return false
        };
        window.ondrop = function(e) {
            e.preventDefault();
            for (var i = 0; i < e.dataTransfer.files.length; ++i) {
                global.papa.addFileToQueue(e.dataTransfer.files[i].path);
            }
            global.papa.runFileQueue();
            return false
        };

        self.editor.getSession().on('change',function(e){
            var textLen = self.editor.getSession().getValue().length;
            if(textLen != self.oldLength){
                self.modified=true;
            }
            self.oldLength=textLen;
            self.processMd();
            self.updateTitle();
        });

        //used to block infinite event loop of doom
        var blockScrollEventIn=false;
        var blockScrollEventOut=false;

        //sync output scroll to editor position
        self.editor.getSession().on('changeScrollTop',function(scrollPos){
            if(blockScrollEventIn){
                blockScrollEventIn=false;
                return;
            }
            var scrollHeight = self.editor.renderer.layerConfig.maxHeight - self.editor.renderer.$size.scrollerHeight + self.editor.renderer.scrollMargin.bottom;
            var scrollPercent = (scrollPos/scrollHeight) * 100;
            //block infinte loop and set output scroll pos
            blockScrollEventOut=true;
            var scrollHeight = self.output.scrollHeight-self.output.clientHeight;
            if(scrollHeight < 5) return;
            self.output.scrollTop = (scrollHeight*scrollPercent)/100;
        });

        document.addEventListener('keypress',function(e){
            if(e.target.id !== 'find-text' && !e.target.classList.contains('ace_text-input')){
                self.editor.focus();
            }
        });

        document.addEventListener('keyup',function(e){
            switch(e.which){
                case 27:
                    self.toggleFind(true);
                break;
            }
        });

        //sync editor scroll to output position
        self.output.addEventListener('scroll',function(e){
            if(blockScrollEventOut){
                blockScrollEventOut=false;
                return;
            }
            var scrollPos = self.output.scrollTop;
            var scrollHeight = self.output.scrollHeight-self.output.clientHeight;
            var scrollPercent = (scrollPos/scrollHeight) * 100;
            //block infinte loop and set editor scroll pos
            blockScrollEventIn=true;
            var scrollHeight = self.editor.renderer.layerConfig.maxHeight - self.editor.renderer.$size.scrollerHeight + self.editor.renderer.scrollMargin.bottom;
            if(scrollHeight < 5) return;
            self.editor.getSession().setScrollTop((scrollHeight*scrollPercent)/100);
        });

        self.editor.getSession().on('change',function(){
            var outputScrollHeight = self.output.scrollHeight-self.output.clientHeight;
            var inputScrollHeight = self.editor.renderer.layerConfig.maxHeight - self.editor.renderer.$size.scrollerHeight + self.editor.renderer.scrollMargin.bottom;
            if(inputScrollHeight < 5 && outputScrollHeight > 5){
                var selection = self.editor.getSelectionRange();
                var totalRows = self.editor.getSession().getLength();
                if(totalRows - selection.start.row < 10){
                    self.output.scrollTop = outputScrollHeight;
                }
            }
        });

        self.input.addEventListener('keydown',function(e){
            var selection = self.editor.getSelectionRange();
            var selectText = self.editor.getSession().getTextRange(selection);
            if(selectText.length < 1) return;
            switch(e.which){
                // ( 57 ) 48
                case 57:
                case 48:
                    e.preventDefault();
                    self.wrapSelection('(',')','',false);
                    break;

                // { 219 } 221 (shift)
                // [ 219 ] 221
                case 219:
                case 221:
                    e.preventDefault();
                    if(e.shiftKey){
                        self.wrapSelection('{','}','',false);
                    }else{
                        self.wrapSelection('[',']','',false);
                    }
                    break;


                // " 222 " (shift)
                // ' 222 '
                case 222:
                    e.preventDefault();
                    if(e.shiftKey){
                        self.wrapSelection('"','"','',false);
                    }else{
                        self.wrapSelection("'","'",'',false);
                    }
                    break;

                // ` 192 `
                case 192:
                    e.preventDefault();
                    self.wrapSelection("`","`",'',false);
                    break;

                // * 56 *
                case 56:
                    e.preventDefault();
                    self.wrapSelection("*","*",'',false);
                    break;
                // default:
                //     console.log(e.which);
            }
        });

        self.input.addEventListener('keyup',function(e){
            switch(e.which){

                //for indenting lists
                case 9:
                    if(e.shiftKey) return;
                    var selection = self.editor.getSelectionRange();
                    //let ace handle it if multiline
                    if(!selection.isMultiLine()){
                        var lineText = self.editor.getSession().getLine(selection.start.row).trim();
                        if(lineText.length > 0 && lineText.charAt(0)=='*'){
                            e.preventDefault();
                            e.stopPropagation();
                            self.editor.getSession().indentRows(selection.start.row,selection.start.row,self.editor.getSession().getTabString());
                            selection.start.column += 1;
                            selection.end.column += self.editor.getSession().getTabSize();
                            self.editor.getSession().replace(selection,' ');
                        }
                    }
                    break;

                //for auto-ending indented lists
                case 13:
                    if(e.shiftKey){
                        //indent the next line by 4 spaces
                        //per bullet level
                    }else{
                        var selection = self.editor.getSelectionRange();
                        if(selection.start.row < 1) return;
                        var lineText1 = self.editor.getSession().getLine(selection.start.row).trim();
                        var lineText2 = self.editor.getSession().getLine(selection.start.row-1).trim();
                        if(lineText2.length > 0 && lineText2=='*' && (lineText1=='*' || lineText1=='')){
                            selection.start.column = 0;
                            selection.start.row -= 1;
                            self.editor.getSession().replace(selection,'\n');
                        }
                    }

                    break;

            }
        });

        self.findForm.addEventListener('submit',function(e){
            e.preventDefault();
            self.findNext();
        });

        self.processMd();
    }

    document.addEventListener("DOMContentLoaded",getThisPartyStarted);

    this.initWindow();
};

FinalMarkdown.prototype.initWindow = function(){
    var self = this;
    this.win.on('focus', function(){
        global.focused=self;
    });

    this.win.on('close',function(){
        if(!self.modified || confirm("This file contains unsaved changes. If you close the window the changes will be lost.")){
            global.papa.closeWindow(self);
        }
    });

    this.win.on('loaded', function(){
        self.updateTitle();
        if(global.openContent){
            self.doOpenFile(global.openContent,global.openPath);
            global.openPath=false;
            global.openContent=false;
            self.win.focus();
        }
        global.papa.windowLoaded(self);
    });
};

FinalMarkdown.prototype.processMd = function(){
    if(!this.livePreview) return;

    //parse markdown into html
    var converter = new Showdown.converter({ extensions: ['table','github'] });
    var editorText = this.editor.getSession().getValue();
    this.output.innerHTML = converter.makeHtml(editorText);

    //process code blocks
    var codeBlocks = this.output.querySelectorAll('pre');
    for(var i = 0; i < codeBlocks.length; i++){
        hljs.highlightBlock(codeBlocks[i]);
    }

    //make links open in external window
    var links = this.output.querySelectorAll('a');
    for(var i = 0; i < links.length; i++){
        links[i].addEventListener('click',function(e){
            e.preventDefault();
            if(this && this.href && this.href.length > 10 && this.href.indexOf('://') > -1 && this.href.indexOf('.') > -1){
                gui.Shell.openExternal(this.href);
            }
        });
    }

    //Final Countdown on Kazookeylele easter egg
    if(editorText==="We're heading for Venus"){
        gui.Shell.openExternal('https://www.youtube.com/watch?v=XAg5KjnAhuU');
    }
};


FinalMarkdown.prototype.openClick = function(){
    var self = this;
    var Dialog = new fdialogs.FDialog({
        window:window,
        type: 'open',
        accept: ['.md','text/markdown'],
        path: '~/Documents'
    });

    Dialog.readFile(function (err, content, path) {
        self.doOpenFile(content,path,true);
    });
};

FinalMarkdown.prototype.doOpenFile = function(content,path,newWindow){
    if(newWindow){
        global.papa.doOpenFile(content,path);
    }else{
        this.editor.getSession().setValue(content.toString());
        this.oldLength = this.editor.getSession().getValue().length;
        this.currentPath=path;
        this.modified=false;
        this.processMd();
        this.updateTitle();
    }
};

FinalMarkdown.prototype.saveClick = function(){
    var self = this;
    if(self.currentPath){
        var content = new Buffer(self.editor.getSession().getValue(), 'utf-8');
        fs.writeFile(self.currentPath,content,function(){
            self.modified=false;
            self.updateTitle();
        });

        if(!global.papa.isRegistered()){
            global.localStorage.saves++;
            if(global.localStorage.saves % 100 === 0){
                var saidOk = confirm("You have hit save "+global.localStorage.saves+" times. If you like this software please donate to help me continue to maintain it. Once you donate (any amount) you will get a code that will stop this notice from appearing in the future.\r\n\r\n Would you like to go to the donation page now?");
                if(saidOk){
                    gui.Shell.openExternal(global.papa.donateUrl);
                }
            }
        }


    }else{
        var Dialog = new fdialogs.FDialog({
            window:window,
            type: 'save',
            accept: ['.md','text/markdown'],
            path: '~/Documents'
        });
        var content = new Buffer(self.editor.getSession().getValue(), 'utf-8');
        Dialog.saveFile(content, function (err, path) {
            self.currentPath=path;
            self.modified=false;
            self.updateTitle();
        });
    }
};

FinalMarkdown.prototype.saveCopyClick = function(){
    global.openPath=false;
    global.openContent=this.editor.getSession().getValue();
    global.papa.newClick();
};

FinalMarkdown.prototype.formatTextClick = function(action){
    switch(action){
        case 'bold':
            this.wrapSelection('**','**');
            break;
        case 'italic':
            this.wrapSelection('*','*');
            break;
        case 'strike':
            this.wrapSelection('~~','~~');
            break;
        case 'code':
            this.wrapSelection('`','`');
            break;
        case 'link':
            this.wrapSelection('[','](http://)','link',-1);
            break;
        case 'image':
            this.wrapSelection('![','](http://)','image',-1);
            break;
    }
};

FinalMarkdown.prototype.wrapSelection = function(beforeText, afterText, defaultText, cursorOffset){
    var selection = this.editor.getSelectionRange();
    var selectText = this.editor.getSession().getTextRange(selection);

    if(cursorOffset === false){
        //leave text highlighted
        selection.end.column+=afterText.length;
        this.editor.getSession().insert(selection.start,beforeText)
        this.editor.getSession().insert(selection.end,afterText)
        selection.start.column+=1;
        this.editor.getSession().getSelection().setSelectionRange(selection);
    }else{
        if(selectText.length < 1){
            if(!defaultText) cursorOffset = -afterText.length;
            selectText = defaultText || '';
        }
        //move cursor to end + offset
        this.editor.getSession().replace(selection,beforeText+selectText+afterText);
        this.editor.getSession().getSelection().moveCursorBy(0,cursorOffset || 0);
    }

}

FinalMarkdown.prototype.viewClick = function(action){
    switch(action){
        case 'preview':
            var mdWrap = document.querySelector('.mdWrap');
            mdWrap.classList.toggle('hidePreview');
            mdWrap.classList.remove('hideEditor');
            this.livePreview = !this.livePreview;
            if(this.livePreview) this.processMd();
            break;
        case 'editor':
            var mdWrap = document.querySelector('.mdWrap');
            mdWrap.classList.toggle('hideEditor');
            mdWrap.classList.remove('hidePreview');
            this.processMd();
            break;
        case 'presentation':
            this.win.toggleFullscreen();
            break;
    }
};

FinalMarkdown.prototype.zoomClick = function(zoom){
    if(zoom == 0){
        this.win.zoomLevel = 0;
    }else{
        this.win.zoomLevel = this.win.zoomLevel+zoom;
    }
};

FinalMarkdown.prototype.headerClick = function(level){
    var selection = this.editor.getSelectionRange();
    var lineText = this.editor.getSession().getLine(selection.start.row).trim();
    var newPrefix = Array(level+1).join('#');
    var currentPrefix = lineText.match(/^#+/);
    var Range = ace.require('ace/range').Range;
    var range = new Range(selection.start.row,0,selection.start.row,lineText.length);
    var newText = lineText.replace(/^#+/,'');
    if(currentPrefix != newPrefix) newText = newPrefix + newText;
    this.editor.getSession().replace(range,newText);
};

FinalMarkdown.prototype.updateTitle = function(){
    var openFile = this.currentPath ? path.basename(this.currentPath) : 'Untitled';
    var modified = this.modified ? '*' : '';
    this.win.title="Final Markdown - "+openFile+' '+modified;
    //set base href for this document (allows loading local images)
    var baseTag = document.querySelector('base');
    baseTag.href = 'file:///' + path.dirname(this.currentPath) + '/';
};


FinalMarkdown.prototype.toggleFind = function(hide) {
    if(!hide && this.findBox.classList.contains('hidden')){
        this.findBox.classList.remove('hidden');
        this.findText.focus();
        this.findText.setSelectionRange(0, this.findText.value.length);
    }else{
        this.findBox.classList.add('hidden');
        this.editor.focus();
    }
}

FinalMarkdown.prototype.findNext = function() {
    var searchTerm = this.findText.value;
    this.editor.find(searchTerm,{
        backwards:false,
        wrap: true
    });
}

FinalMarkdown.prototype.execCommand = function(cmd) {
    return document.execCommand(cmd);
}

FinalMarkdown.prototype.findPrevious = function() {
    this.editor.findPrevious();
}

FinalMarkdown.prototype.reload = function(){
    this.win.reloadDev();
}

