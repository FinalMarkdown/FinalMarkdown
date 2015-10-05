// You also need to load in typo.js and jquery / zepto

// You should configure these classes.
function AceSpellChecker(options){
  options = options || {};

  var editor = options.editor || "editor"; // This should be the id of your editor element.
  var lang = options.lang || "en_US";
  var dicPath = options.dicPath || "/static/js/lib/typo/dictionaries/en_US/en_US.dic";
  var affPath = options.affPath || "/static/js/lib/typo/dictionaries/en_US/en_US.aff";

  // Load the dictionary.
  // We have to load the dictionary files sequentially to ensure
  var dictionary = null;
  $.get(dicPath, function(data) {
    var dicData = data;
    $.get(affPath, function(data) {
      var affData = data;
      dictionary = new Typo(lang, affData, dicData);
      enable_spellcheck();
      spell_check();
    });
  });

  // Check the spelling of a line, and return [start, end]-pairs for misspelled words.
  function misspelled(line) {
    var words = line.split(' ');
    var i = 0;
    var bads = [];
    for (word in words) {
      var x = words[word] + "";
      var checkWord = x.replace(/[^a-zA-Z']/g, '');
      if (!dictionary.check(checkWord)) {
        bads.push([i, i + words[word].length, words[word]]);
      }
      i += words[word].length + 1;
    }
    return bads;
  }

  var contents_modified = true;
  var currently_spellchecking = false;
  var markers_present = [];
  var current_errors = [];

  // Spell check the Ace editor contents.
  function spell_check() {
    // Wait for the dictionary to be loaded.
    if (dictionary == null) {
      return;
    }

    if (currently_spellchecking) {
      return;
    }

    if (!contents_modified) {
      return;
    }
    currently_spellchecking = true;
    var session = ace.edit(editor).getSession();

    // Clear the markers.
    for (var i in markers_present) {
      session.removeMarker(markers_present[i]);
    }
    markers_present = [];
    current_errors = [];

    try {
      var Range = ace.require('ace/range').Range
      var lines = session.getDocument().getAllLines();
      var codeBlock = false;
      for (var i in lines) {
        // Clear the gutter.
        session.removeGutterDecoration(i, "misspelled");
        //ignore codeblocks
        if(lines[i].trim() == '```'){
          codeBlock = !codeBlock;
          continue;
        }
        if(codeBlock) continue;
        // Check spelling of this line.
        var misspellings = misspelled(lines[i]);

        // Add markers and gutter markings.
        if (misspellings.length > 0) {
          session.addGutterDecoration(i, "misspelled");
        }
        for (var j in misspellings) {
          var range = new Range(i, misspellings[j][0], i, misspellings[j][1]);
          markers_present.push(session.addMarker(range, "misspelled", "typo", true));
          current_errors.push({word:misspellings[j][2],range:range});
        }
      }
    } finally {
      currently_spellchecking = false;
      contents_modified = false;
    }
  }

  function showSuggestions(target, words) {
    $('.suggestion-menu').remove();
    if(!target || !words) return;
    var myList = $('<ul class="suggestion-menu">');
    if(words.length > 0){
      words.forEach(function(word){
        myList.append('<li data-error="'+target.index()+'" class="suggestion-item">' + word + '</li>');
      });
    }else{
      myList.append('<li class="disabled">No&nbsp;suggestions</li>');
    }
    var targetLoc = target.position();
    myList.css({top:targetLoc.top+'px', left:targetLoc.left+'px'})
    $('#' + editor).append(myList);
  }

  function enable_spellcheck() {
    ace.edit(editor).getSession().on('change', function(e) {
      contents_modified = true;
    });

    $('body').on('mousedown',function(e){
      var obj = $(e.target);
      if(obj.hasClass('suggestion-item')){
        var newWord = obj.text();
        var oldWord = current_errors[obj.data('error')];
        ace.edit(editor).getSession().replace(oldWord.range, newWord);
      }
      showSuggestions();
    }).on('keyup',function(e){
      console.log('which', e.which);
      if(e.which == 27) showSuggestions();
    });

    $('#' + editor + ' .ace_layer.ace_marker-layer').on('mouseup','.misspelled',function(e){
      if(!e.ctrlKey && e.which !== 3) return;
      e.preventDefault();
      e.stopPropagation();
      var idx = $(this).index();
      if(idx >= current_errors.length) return;

      var word = current_errors[idx];
      var obj = $(this);
      setTimeout(function(){
        var suggestions = dictionary.suggest(word.word);
        showSuggestions(obj, suggestions);
      },0);
    });
    setInterval(spell_check, 1000);
  }
}