var fs = require('fs');
var path = require('path');
var gui = require('nw.gui');
var pack = require('./package.json');
var fdialogs = require('node-webkit-fdialogs');

var APP_VERSION = pack.version;

var MainApp = function(){

    global.focused=this;
    global.openPath=false;
    global.openContent=false;
    global.papa = this;
    global.localStorage = window.localStorage || {};
    // global.windows=[];
    if(!global.localStorage.saves) global.localStorage.saves=0;

    this.fileOpenQueue=[];
    this.windowsLoading = 0;
    this.blockQueue=false;
    this.donateUrl = "http://finalmarkdown.github.io/"

    var self = this;
    var win = gui.Window.get();
    var loadingDots;

    //FOR DEBUGGING
    // win.showDevTools();
    // console.dir(win)

    win.title="Final Markdown";
    win.setShowInTaskbar(true);

    //build menu for mac
    switch(process.platform){

        case 'darwin': //OSX
            var mb = new gui.Menu({type:"menubar",label:"Final Markdown"});

            mb.createMacBuiltin("Final Markdown");

            var fileSubMenu = new gui.Menu();
            fileSubMenu.append(new gui.MenuItem({ label: 'New',click:self.newClick,key:"n",modifiers:'cmd' }));
            fileSubMenu.append(new gui.MenuItem({ label: 'Open',click:self.openClick,key:"o",modifiers:'cmd' }));
            fileSubMenu.append(new gui.MenuItem({ label: 'Save',click:self.saveClick,key:"s",modifiers:'cmd' }));
            fileSubMenu.append(new gui.MenuItem({ label: 'Save a copy',key:"s",click:self.saveCopyClick,modifiers:'cmd-shift' }));

            var findSubMenu = new gui.Menu();
            findSubMenu.append(new gui.MenuItem({ label: 'Find...',click:self.toggleFind,key:"f",modifiers:'cmd' }));
            findSubMenu.append(new gui.MenuItem({ label: 'Find Next',click:self.findNext,key:"g",modifiers:'cmd' }));
            findSubMenu.append(new gui.MenuItem({ label: 'Find Previous',click:self.findPrevious,key:"g",modifiers:'cmd-shift' }));

            var formatSubMenu = new gui.Menu();
            formatSubMenu.append(new gui.MenuItem({ label: 'Bold',click:function(){ self.formatTextClick('bold'); },key:"b",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Italic',click:function(){ self.formatTextClick('italic'); },key:"i",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Strikethrough',click:function(){ self.formatTextClick('strike'); },key:"u",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Inline Code',click:function(){ self.formatTextClick('code'); },key:"k",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ type: 'separator' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Link',click:function(){ self.formatTextClick('link'); },key:"l",modifiers:'shift-ctrl' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Image',click:function(){ self.formatTextClick('image'); },key:"i",modifiers:'shift-ctrl' }));
            formatSubMenu.append(new gui.MenuItem({ type: 'separator' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Header 1',click:function(){ self.headerClick(1); },key:"1",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Header 2',click:function(){ self.headerClick(2); },key:"2",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Header 3',click:function(){ self.headerClick(3); },key:"3",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Header 4',click:function(){ self.headerClick(4); },key:"4",modifiers:'cmd' }));
            formatSubMenu.append(new gui.MenuItem({ label: 'Header 5',click:function(){ self.headerClick(5); },key:"5",modifiers:'cmd' }));


            var viewSubMenu = new gui.Menu();
            viewSubMenu.append(new gui.MenuItem({ label: 'Toggle Preview',click:function(){ self.viewClick('preview'); },key:"p",modifiers:'cmd' }));
            viewSubMenu.append(new gui.MenuItem({ label: 'Toggle Editor',click:function(){ self.viewClick('editor'); },key:"p",modifiers:'shift-cmd' }));
            viewSubMenu.append(new gui.MenuItem({ label: 'Presentation Mode',click:function(){ self.viewClick('presentation'); },key:"f",modifiers:'shift-cmd' }));
            viewSubMenu.append(new gui.MenuItem({ type: 'separator' }));
            viewSubMenu.append(new gui.MenuItem({ label: 'Zoom In',click:function(){ self.zoomClick(1); },key:"+",modifiers:'cmd' }));
            viewSubMenu.append(new gui.MenuItem({ label: 'Zoom Out',click:function(){ self.zoomClick(-1); },key:"-",modifiers:'cmd' }));
            viewSubMenu.append(new gui.MenuItem({ label: 'Reset Zoom',click:function(){ self.zoomClick(0); },key:"0",modifiers:'cmd' }));

            //add preferences menu and divider
            // mb.items[0].submenu.insert(new gui.MenuItem({ label: 'Preferences',click:function(){ alert('ok'); }}),1);
            // mb.items[0].submenu.insert(new gui.MenuItem({ type: 'separator' }),1);

            mb.insert(new gui.MenuItem({ label:'File', submenu: fileSubMenu}),1);
            mb.insert(new gui.MenuItem({ label:'Format', submenu: formatSubMenu}),3);
            mb.insert(new gui.MenuItem({ label:'Find', submenu: findSubMenu}),3);
            mb.insert(new gui.MenuItem({ label:'View', submenu: viewSubMenu}),3);

            if(!self.isRegistered()){
                var regSubMenu = new gui.Menu();
                regSubMenu.append(new gui.MenuItem({ label: 'UNREGISTERED COPY' }));
                regSubMenu.append(new gui.MenuItem({ type: 'separator' }));
                regSubMenu.append(new gui.MenuItem({ label: 'Donate (get code)',click:function(){ gui.Shell.openExternal(global.papa.donateUrl); } }));
                regSubMenu.append(new gui.MenuItem({ label: 'Enter Code',click:function(){
                    var enteredCode = prompt("Enter registration code (get a code by donating using the donate menu item):")
                    if(self.register(enteredCode)){
                        alert('Thank you for your donation.')
                    }else{
                        alert('Invalid registration code.')
                    }
                } }));
                mb.insert(new gui.MenuItem({ label:'REGISTER', submenu: regSubMenu}),6);
            }

            win.menu = mb;
        break;

        case 'win32': //Windows
        break;

        default: //all other *nix
        break;
    }

    function startLoading(){
        //TODO: maybe do some actual loading here?
        loadingDots = document.querySelector('#loadingDots');

        var loadingVersion = document.querySelector('#loadingVersion');
        var regText = self.isRegistered() ? "(Registered &mdash; You're awesome!)" : "(UNREGISTERED)";
        loadingVersion.innerHTML= "v" + APP_VERSION + "<i>" + regText + "</i>";

        setTimeout(checkLoading,200);
    }

    function checkLoading(){
        if(loadingDots.innerText.length < 3){
            loadingDots.innerText=loadingDots.innerText+'.';
            setTimeout(checkLoading,150);
        }else{
            finishLoading();
        }

    }

    function finishLoading(){

        win.hide();
        //hack because dialogs open from splash
        //TODO: figure out why and fix it
        win.width=0;
        win.height=0;

        //open files from the command line
        if(gui.App.argv && gui.App.argv.length > 0){
            gui.App.argv.forEach(function(filePath){
                self.addFileToQueue(filePath);
            });
        }
        //open files dropped on dock icon
        gui.App.on('open', function(filePath){
            self.addFileToQueue(filePath);
            self.runFileQueue();
            this.blockQueue=true;
        });

        //open a window... empty if there is no file to open
        if(self.fileOpenQueue.length > 0){
            self.runFileQueue();
        }else{
            self.newClick();
        }
    }

    document.addEventListener("DOMContentLoaded",startLoading);

};


MainApp.prototype.windowLoaded = function(){
    this.windowsLoading--;
    this.blockQueue=false;
    this.runFileQueue();
}

MainApp.prototype.addFileToQueue = function(file){
    this.fileOpenQueue.push(file);
};

MainApp.prototype.runFileQueue = function(){
    if(this.blockQueue || this.windowsLoading > 0 || this.fileOpenQueue.length < 1) return;
    this.openFilePath(this.fileOpenQueue.shift());
};

//open files by path
MainApp.prototype.openFilePath = function(path){
    var self = this;
    this.blockQueue=true;
    fs.readFile(path,function(err,data){
        self.doOpenFile(data,path);
    });
}

MainApp.prototype.openClick = function(){
    var self = this;
    if(global.focused && global.focused.openClick) return global.focused.openClick();
    var Dialog = new fdialogs.FDialog({
        window:window,
        type: 'open',
        accept: ['.md','text/markdown'],
        path: '~/Documents'
    });

    Dialog.readFile(function (err, content, path) {
        self.doOpenFile(content,path);
    });
};

MainApp.prototype.doOpenFile = function(content,path){
    global.openPath=path;
    global.openContent=content;
    this.newClick();
}

MainApp.prototype.newClick = function(){
    this.windowsLoading++;
    var options = {
        "toolbar": false,
        "frame":true,
        "width": 800,
        "height": 600
      };

    if(global.focused && global.focused.win){
        options.x = global.focused.win.x+20;
        options.y = global.focused.win.y+20;
    }
    var win2 = gui.Window.get(gui.Window.open('FinalMarkdown.html',options));
    // global.windows.push(win2);
};

MainApp.prototype.saveClick = function(){
    if(global.focused && global.focused.saveClick) return global.focused.saveClick();
    alert('Select a window to save');
};

MainApp.prototype.saveCopyClick = function(){
    if(global.focused && global.focused.saveCopyClick) return global.focused.saveCopyClick();
}

MainApp.prototype.formatTextClick = function(action){
    if(global.focused && global.focused.formatTextClick) return global.focused.formatTextClick(action);
}

MainApp.prototype.headerClick = function(level){
    if(global.focused && global.focused.headerClick) return global.focused.headerClick(level);
}

MainApp.prototype.viewClick = function(action){
    if(global.focused && global.focused.viewClick) return global.focused.viewClick(action);
}

MainApp.prototype.zoomClick = function(zoom){
    if(global.focused && global.focused.zoomClick) return global.focused.zoomClick(zoom);
}

MainApp.prototype.isRegistered = function(){
    return global.localStorage.registrationCode ? this.checkRegistration(global.localStorage.registrationCode) : false;
}

MainApp.prototype.checkRegistration = function(code){
    //TODO: call to server to check code
    return code == 'taco party';
}

MainApp.prototype.register = function(code){
    if(this.checkRegistration(code)){
        global.localStorage.registrationCode=code;
        //TODO: remove registration menu on registration
        //maybe just restart the app
        // win.menu.remove(regSubMenu);
        return true;
    }else{
        global.localStorage.registrationCode=false;
        return false;
    }
}

MainApp.prototype.toggleFind = function() {
    if(global.focused && global.focused.toggleFind) return global.focused.toggleFind();
}

MainApp.prototype.findNext = function() {
    if(global.focused && global.focused.findNext) return global.focused.findNext();
}

MainApp.prototype.findPrevious = function() {
    if(global.focused && global.focused.findPrevious) return global.focused.findPrevious();
}


