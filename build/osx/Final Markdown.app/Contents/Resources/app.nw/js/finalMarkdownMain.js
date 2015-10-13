var gui = require('nw.gui');
//for debugging...
gui.Window.get().showDevTools();

var fs = require('fs');
var path = require('path');
var pack = require('./package.json');
var fdialogs = require('node-webkit-fdialogs');
var uuid = require('uuid-v4');
var jwt = require('jsonwebtoken');

var APP_VERSION = pack.version;

var MainApp = function(){

    //unregister on load for testing
    // window.localStorage.registrationCode=false;

    global.focused=this;
    global.openPath=false;
    global.openContent=false;
    global.papa = this;
    global.localStorage = window.localStorage || {};

    global.windows=[];
    if(!global.localStorage.saves) global.localStorage.saves=0;

    this.fileOpenQueue=[];
    this.windowsLoading = 0;
    this.blockQueue=false;

    if(!global.localStorage.uuid) global.localStorage.uuid = uuid();
    this.donateUrl = "http://finalmarkdown.github.io/register.html?r="+global.localStorage.uuid;

    var self = this;
    var win = gui.Window.get();
    this.win = win;
    var loadingDots;

    win.title="Final Markdown";
    win.setShowInTaskbar(true);

    gui.App.on('reopen', function(){
        if(global.windows.length < 1){
           self.newClick();
        }
    })

    //process platform specific operations
    switch(process.platform){
        case 'darwin': //OSX
            this.isMac = true;
            //build menu for mac
            this.win.menu = this.createMenu();
        break;

        case 'win32': //Windows
            this.isWin = true;
        break;

        default: //all other *nix
            this.isLinux = true;
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

//create standard window menu
//returns created menu
MainApp.prototype.createMenu = function(){
    var self = this;
    var modifierKey = this.isMac ? 'cmd' : 'ctrl';

    var fileSubMenu = new gui.Menu();
    fileSubMenu.append(new gui.MenuItem({ label: 'New',click:self.newClick,key:"n",modifiers:modifierKey }));
    fileSubMenu.append(new gui.MenuItem({ label: 'Open',click:self.openClick,key:"o",modifiers:modifierKey }));
    fileSubMenu.append(new gui.MenuItem({ label: 'Save',click:self.saveClick,key:"s",modifiers:modifierKey }));
    fileSubMenu.append(new gui.MenuItem({ label: 'Save a copy',key:"s",click:self.saveCopyClick,modifiers:modifierKey+'-shift' }));

    var findSubMenu = new gui.Menu();
    findSubMenu.append(new gui.MenuItem({ label: 'Find...',click:self.toggleFind,key:"f",modifiers:modifierKey }));
    findSubMenu.append(new gui.MenuItem({ label: 'Find Next',click:self.findNext,key:"g",modifiers:modifierKey }));
    findSubMenu.append(new gui.MenuItem({ label: 'Find Previous',click:self.findPrevious,key:"g",modifiers:modifierKey+'-shift' }));

    var formatSubMenu = new gui.Menu();
    formatSubMenu.append(new gui.MenuItem({ label: 'Bold',click:function(){ self.formatTextClick('bold'); },key:"b",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Italic',click:function(){ self.formatTextClick('italic'); },key:"i",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Strikethrough',click:function(){ self.formatTextClick('strike'); },key:"u",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Inline Code',click:function(){ self.formatTextClick('code'); },key:"k",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ type: 'separator' }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Link',click:function(){ self.formatTextClick('link'); },key:"l",modifiers:'shift-ctrl' }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Image',click:function(){ self.formatTextClick('image'); },key:"i",modifiers:'shift-ctrl' }));
    formatSubMenu.append(new gui.MenuItem({ type: 'separator' }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Header 1',click:function(){ self.headerClick(1); },key:"1",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Header 2',click:function(){ self.headerClick(2); },key:"2",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Header 3',click:function(){ self.headerClick(3); },key:"3",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Header 4',click:function(){ self.headerClick(4); },key:"4",modifiers:modifierKey }));
    formatSubMenu.append(new gui.MenuItem({ label: 'Header 5',click:function(){ self.headerClick(5); },key:"5",modifiers:modifierKey }));

    var viewSubMenu = new gui.Menu();
    viewSubMenu.append(new gui.MenuItem({ label: 'Toggle Preview',click:function(){ self.viewClick('preview'); },key:"p",modifiers:modifierKey }));
    viewSubMenu.append(new gui.MenuItem({ label: 'Toggle Editor',click:function(){ self.viewClick('editor'); },key:"p",modifiers:'shift-'+modifierKey }));
    viewSubMenu.append(new gui.MenuItem({ label: 'Presentation Mode',click:function(){ self.viewClick('presentation'); },key:String.fromCharCode(13),modifiers:modifierKey }));
    viewSubMenu.append(new gui.MenuItem({ type: 'separator' }));
    viewSubMenu.append(new gui.MenuItem({ label: 'Zoom In',click:function(){ self.zoomClick(1); },key:"+",modifiers:modifierKey }));
    viewSubMenu.append(new gui.MenuItem({ label: 'Zoom Out',click:function(){ self.zoomClick(-1); },key:"-",modifiers:modifierKey }));
    viewSubMenu.append(new gui.MenuItem({ label: 'Reset Zoom',click:function(){ self.zoomClick(0); },key:"0",modifiers:modifierKey }));
    // viewSubMenu.append(new gui.MenuItem({ type: 'separator' }));
    // viewSubMenu.append(new gui.MenuItem({ label: 'Reload View',click:function(){ self.reload(); },key:"r",modifiers:modifierKey }));

    //add preferences menu and divider
    // mb.items[0].submenu.insert(new gui.MenuItem({ label: 'Preferences',click:function(){ alert('ok'); }}),1);
    // mb.items[0].submenu.insert(new gui.MenuItem({ type: 'separator' }),1);


    var mb = new gui.Menu({type:"menubar",label:"Final Markdown"});
    if(this.isMac){
        mb.createMacBuiltin("Final Markdown");
    }else{
        var finalMarkdownSubMenu = new gui.Menu();
        finalMarkdownSubMenu.append(new gui.MenuItem({ label: 'About'}));
        mb.append(new gui.MenuItem({ label:'Final Markdown', submenu: finalMarkdownSubMenu}));
        var editSubMenu = new gui.Menu();
        editSubMenu.append(new gui.MenuItem({ label: 'Undo'}));
        editSubMenu.append(new gui.MenuItem({ label: 'Redo'}));
        mb.insert(new gui.MenuItem({ label:'Edit', submenu: editSubMenu}));
        var windowSubMenu = new gui.Menu();
        windowSubMenu.append(new gui.MenuItem({ label: 'Minimize'}));
        windowSubMenu.append(new gui.MenuItem({ label: 'Close All'}));
        mb.insert(new gui.MenuItem({ label:'Window', submenu: windowSubMenu}));
    }

    mb.insert(new gui.MenuItem({ label:'File', submenu: fileSubMenu}),1);
    mb.insert(new gui.MenuItem({ label:'Format', submenu: formatSubMenu}),3);
    mb.insert(new gui.MenuItem({ label:'Find', submenu: findSubMenu}),3);
    mb.insert(new gui.MenuItem({ label:'View', submenu: viewSubMenu}),3);

    if(!self.isRegistered()){
        var regSubMenu = new gui.Menu();
        regSubMenu.append(new gui.MenuItem({ label: 'UNREGISTERED COPY' }));
        regSubMenu.append(new gui.MenuItem({ type: 'separator' }));
        regSubMenu.append(new gui.MenuItem({ label: "Register",click:function(){ gui.Shell.openExternal(global.papa.donateUrl); } }));
        regSubMenu.append(new gui.MenuItem({ label: 'Enter Code',click: self.registerPrompt }));
        mb.insert(new gui.MenuItem({ label:'REGISTER', submenu: regSubMenu}),6);
    }

    this.updateRecentFileMenu(mb);
    return mb;
}

MainApp.prototype.windowLoaded = function(win){
    this.windowsLoading--;
    this.blockQueue=false;
    this.runFileQueue();
    global.windows.push(win);
    win.win.focus();
}

MainApp.prototype.closeWindow = function(win){
    global.windows = global.windows.filter(function(item){
        return item.win.id !== win.win.id;
    });
    if(win.currentPath){
        this.addRecentFile(win.currentPath);
    }
    win.modified = false;
    win.win.close(true);
    if(global.windows.length > 0){
        global.windows[0].win.focus();
    }else{
        global.focused = false;
    }
}

//returns array of recent files from localStorage
MainApp.prototype.loadRecentFiles = function(){
    var recentFiles;
    try {
        recentFiles = JSON.parse(global.localStorage.recentFiles || '[]');
    }catch(e){
        recentFiles = [];
    }
    return recentFiles;
}

//takes array of files and saves it in localStorage
MainApp.prototype.saveRecentFiles = function(files){
    global.localStorage.recentFiles = JSON.stringify(files);
}

MainApp.prototype.addRecentFile = function(file){
    var recentFiles = this.loadRecentFiles();
    var fileIdx = recentFiles.indexOf(file);
    if(fileIdx != -1){
        recentFiles.splice(fileIdx,1);
    }
    recentFiles.unshift(file);
    if(recentFiles.length > 10){
        recentFiles = recentFiles.splice(0,10);
    }
    this.saveRecentFiles(recentFiles);
    this.updateRecentFileMenu();
}

MainApp.prototype.clearRecentFiles = function(){
    this.saveRecentFiles([]);
    this.updateRecentFileMenu();
}

MainApp.prototype.updateRecentFileMenu = function(targetMenu){
    var self = this;
    var recentFiles = this.loadRecentFiles();

    var recentFilesMenu = new gui.Menu();
    if(recentFiles.length > 0){
        recentFiles.forEach(function(file,idx){
            recentFilesMenu.append(new gui.MenuItem({ label: (idx+1)+': '+file,click:function(){self.openFilePath(file);} }));
        });
    }else{
        recentFilesMenu.append(new gui.MenuItem({ label: 'Empty', enabled: false }));
    }
    recentFilesMenu.append(new gui.MenuItem({ type: 'separator' }));
    recentFilesMenu.append(new gui.MenuItem({ label: 'Clear History',click:function(){ self.clearRecentFiles(); } }));

    this.eachMenu(function(menu){
        //create new menu or update existing menu
        if(menu.items[1].submenu.items[2].label == 'Open Recent'){
            menu.items[1].submenu.items[2].submenu=recentFilesMenu;
        }else{
            menu.items[1].submenu.insert(new gui.MenuItem({ label: 'Open Recent',submenu:recentFilesMenu}),2);
        };
    }, targetMenu);
}

MainApp.prototype.eachMenu = function(iterator,targetMenu){
    var menus = [];
    if(targetMenu){
        menus = [targetMenu];
    } else {
        if(this.isMac){
            menus = [this.win.menu];
        }else{
            menus = this.windows.map(function(item){
                return item.win.menu;
            });
        }
    }
    console.log('menus',menus);
    menus.forEach(iterator);
};

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
    var self = this;
    fs.exists(path,function(exists){
        if(exists){
            global.openPath=path;
            global.openContent=content;
            self.newClick();
        }else{
            alert('Unable to open file. File does not exist.\r\n'+path);
        }

    })
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
    try{
        var decoded = jwt.verify(code, pack.shh);
        //good token -- check serial
        return decoded.serial == global.localStorage.uuid && decoded.author == 'http://www.itslennysfault.com';
    }catch(e){
        //invalid token
        return false;
    }
}

MainApp.prototype.register = function(code){
    if(this.checkRegistration(code)){
        global.localStorage.registrationCode=code;
        this.eachMenu(function(menu){
            if(menu.items[6].label=="REGISTER"){
                menu.removeAt(6);
            }
        });
        return true;
    }else{
        global.localStorage.registrationCode=false;
        return false;
    }
}

MainApp.prototype.registerPrompt = function(){
    var enteredCode = prompt("Enter registration code (get a code by donating using the donate menu item):")
    if(!enteredCode){
        //Do Nothing -- They hit cancel or left the text blank.
    }else if(this.register(enteredCode)){
        alert('Thank you for registering.')
    }else{
        alert('Invalid registration code.')
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

MainApp.prototype.reload = function() {
    if(global.focused && global.focused.reload) global.focused.reload();
}




