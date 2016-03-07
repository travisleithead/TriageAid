"use strict";
// Content Script for Visual Studio Online / "Triage-Aid"

var TriageAid = (function TriageAidCore() {

   // Where to get the nodes for a given field name
	var readmap = {
      "Area Path":      function () { return document.querySelector("input[aria-label='Area Path']"); },
      "Assigned To":    function () { return document.querySelector("input#witc_136_txt"); },
		"History":        function () { return document.querySelector("div.richeditor-editarea > iframe"); },
      "ID":             function () { return document.querySelector("input[aria-label='ID']"); }, // readonly, never written
      "Issue Subtype":  function () { return document.querySelector("input[aria-label='Issue Subtype']"); },
      "Iteration Path": function () { return document.querySelector("input[aria-label='Iteration Path']"); },
      "Priority":       function () { return document.querySelector("input[aria-label='Priority']"); },
		"Product":        function () { return document.querySelector("input[aria-label='Product']"); },
      "Rank":           function () { return document.querySelector("input[aria-label='Rank']"); },
		"Release":        function () { return document.querySelector("input[aria-label='Release']"); },
      "Resolved Reason":function () { return document.querySelector("input[aria-label='Resolved Reason']"); },
      "Severity":       function () { return document.querySelector("input[aria-label='Severity']"); },
		"State":          function () { return document.querySelector("input[aria-label='State']"); },
      "Triage":         function () { return document.querySelector("input[aria-label='Triage']"); }
	};

   // How to write a value into a given field name (with required node)
	function setFieldValue(node, fieldKey, val) {
		try {
			if (fieldKey == "History")
				node.contentWindow.document.body.innerHTML = val.replace(/\n/g,'<br>');
			else { // Assume <input>
				node.value = val;
            visualChangeIndicator(node);
         }
		}
		catch (ex) {
			console.error("Failed to write the field '" + fieldKey + "'");
		}				
	}
   
   function visualChangeIndicator(node) { // dependency on UI framework's styling
      node.addEventListener('animationend', function visualChangeIndicatorEnd(event) {
         node.classList.remove('triage-aid-changed');
         node.removeEventListener('animationend', visualChangeIndicatorEnd);
      });
      node.classList.add('triage-aid-changed');
   }
	
   var getValueDefault = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").get;
   var setValueDefault = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
   
   // How to add a change notification handler to a given field.
	function attachFieldChangeNotifier(node, fieldKey) {
		if (fieldKey == "History") {
			new MutationObserver(function (records) { historyChangedCallback(records[0].target); }).observe(node.contentWindow.document, { childList: true, characterData: true, subtree: true});
		}
      else if (fieldKey == "ID") {
         Object.defineProperty(node, "value", { enumerable: true, configurable: true,
            get: function get_value() { return getValueDefault.call(this); },
            set: function set_value(x) { 
               // Re-lock all [potentially] unlocked fields
               var deltaChangeKeys = Object.keys(deltaChanges);
               deltaChangeKeys.forEach(function (key) {
                  var node = readmap[key]();
                  if (node)
                     node._triageAidIgnoreChanges = true;
               });
               deltaChanges = {}; // reset all state.
               if (deltaChangeKeys.length > 0)
                  requestAnimationFrame(notifyDeltaChanges);
            }
         });
      }
		else { // assume generic read/write <input>
         // Handle user-input (value-changing-keystrokes)
			node.addEventListener('input', function (e) { e.target._triageAidIgnoreChanges = false; inputChangedCallback(e.target); });
         // Handle programmatic adjustments to the input's value property. :-)
         Object.defineProperty(node, "value", { enumerable: true, configurable: true,
            get: function get_value() { return getValueDefault.call(this); },
            set: function set_value(x) {
               setValueDefault.call(this, x);
               if (!this._triageAidIgnoreChanges)
                  inputChangedCallback(this);
            }
         });
      }
	}
	
	function historyChangedCallback(target) {
      deltaChanges["History"] = target.ownerDocument.body.textContent;
      requestAnimationFrame(notifyDeltaChanges); // Make it async.
	}
	
	function inputChangedCallback(target) {
		var key = target.getAttribute("aria-label");
		if (key) {
			deltaChanges[key] = target.value;
         requestAnimationFrame(notifyDeltaChanges);
      }
      else if (target.id == "witc_136_txt") {
         deltaChanges["Assigned To"] = target.value;
         requestAnimationFrame(notifyDeltaChanges);
      }
		else
			console.error("Could not identify which field was changed!");
	}
	
   function writeDataToVSOFields(template) {
		Object.keys(template).forEach(function (key) {
			var node = readmap[key]();
			if (node)
				setFieldValue(node, key, template[key]);
			else
				console.error("Failed to find the field: " + key);
		});
   }

	var deltaChanges = {};
   var notifyDeltaChanges = function() {};
   var storedTemplates = {};
   
   // Write the storedTemplates to persistent storage
   function persist() {
      if (localStorage)
         localStorage['templates'] = JSON.stringify(storedTemplates);
      else
         console.error("unable to persist");
   }
   
   function restorePersisted() {
      if (localStorage) {
         var stored = localStorage['templates'];
         if (stored)
            storedTemplates = JSON.parse(stored);
      }
      else
         console.error("unable to load from persistent store");
   }
   
   // Public API
   return Object.create({}, {
      init: {
         value: function init() {
            restorePersisted();
         }
      },
      // returns true if there is at least one connection made, false if nothing connected...
      reconnect: {
         value: function reconnect() {
            var oneConnection = false;
            Object.keys(readmap).forEach(function (field) {
               var node = readmap[field]();
               if (node) {
                  oneConnection = true;
                  if (typeof node._triageAidIgnoreChanges == "undefined") {
                     attachFieldChangeNotifier(node, field);
                     Object.defineProperty(node, "_triageAidIgnoreChanges", { value: true, writable: true, configurable: true }); // not-enum
                  }
               }
            });
            return oneConnection;
         }
      },
      store: {
         value: function store(identifier) {
            if (storedTemplates[identifier])
               console.error("Identifier already used; try another");
            else {
               storedTemplates[identifier] = Object.assign({}, deltaChanges);
               persist();
            }
         }
      },
      apply: {
         value: function apply(identifier) {
            var data = storedTemplates[identifier];
            if (data) {
               writeDataToVSOFields(data);
            }
            else
               console.error("Couldn't retrieve saved template data!");
         }
      },
      remove: {
         value: function remove(id) {
            delete storedTemplates[id];
            persist();
         }
      },
      current: {
         value: function current() {
            var formattedResult = [];
            Object.keys(deltaChanges).forEach(function (key) {
               formattedResult.push({name: key, value: deltaChanges[key]});
            });
            return formattedResult;
         }
      },
      oncurrentchanged: {
         set: function set_oncurrentchanged(callback) {
            if (typeof callback == "function")
               notifyDeltaChanges = callback;
            else
               console.error("Non-callable provided to oncurrentchanged event handler");
         }
      }
   });
})();

(function TriageAidUI() {
   // cached element refs (for perf)
   var container = null;
   var add = null;
   var remove = null;
   var confirm = null;
   var flyoutRoot = null;
   
   // Build the basic UI structure and add it to the page.
   function create() {
      // Add the styles
      var styleEl = document.createElement('style');
      styleEl.textContent = "\
/* Structural styles */\
   #triage-aid-root{display:block;position:absolute;top:0;left:0;right:0;text-align:center;pointer-events:none;/* allow clicks to pass-through */}\
   #triage-aid-console{display:inline-flex;justify-content:center;align-items: center;}\
   #triage-aid-grow{margin:0 5px;white-space:nowrap;overflow:auto;max-width:calc(95vw - 100px);}\
   #triage-aid-addpanel{display:block;/* ensure always so that browser's UA stylesheet for hidden attribute doesn't override */}\
   #triage-aid-addpanel>table{margin:0 auto;}\
/* colors and presentation */\
   #triage-aid-root input[type=button]{background-color:lightgray;color:black;border:2px solid gray;}\
   #triage-aid-root input[type=button]:disabled{background-color:white;color:lightgray;border:2px solid lightgray;}\
   #triage-aid-root input[type=button]:focus{border:2px solid blue;color:blue;}\
   #triage-aid-root input[type=button]:hover:not(:disabled){background-color:powderblue;color:black;border:2px solid dodgerblue;}\
   #triage-aid-console,#triage-aid-addpanel{background-color:white;border: 1px solid gray;border-top:0;box-shadow:0 0 20px lightgray;pointer-events:auto;}\
   #triage-aid-root{font-family:'Segoe UI';font-size:10pt;}\
   #triage-aid-console>img{margin:0 3px;}\
   #triage-aid-addpanel>table{border-collapse:collapse;margin-bottom:1em;border-bottom:2px solid gray;}\
   #triage-aid-addpanel>table th{border-bottom:2px solid gray;}\
   #triage-aid-addpanel>table>tbody>tr:nth-child(even){background-color:#eee;}\
   #triage-aid-addpanel>table td{padding:0 1em;text-align:left;color:gray;}\
   #triage-aid-addpanel>table>tbody>tr>td:nth-child(2){color:black;font-family:consolas;}\
/* animations and transitions */\
   #triage-aid-console,#triage-aid-addpanel{transition:margin-top 0.3s ease-out,visibility 1s linear,opacity 0.3s linear;visibility:visible;opacity:1;margin-top:0;}\
   #triage-aid-console[hidden]{margin-top:-30px;visibility:hidden;opacity:0;}\
   #triage-aid-addpanel[hidden]{margin-top:-100%;visibility:hidden;opacity:0;}\
   #triage-aid-add.haschanges{animation:grabattention 500ms ease 6 alternate;}\
   @keyframes grabattention{0{border-color:gray;background-color:lightgray;}100%{border-color:orange;background-color:yellow;}}\
   #triage-aid-grow.hasdeletes input{animation:deletecandidate 1s ease infinite alternate;}\
   @keyframes deletecandidate{0{background-color:salmon;border-color:gray;}100%{background-color:red;border-color:red;}}\
   #triage-aid-grow input.added{animation:justadded .7s ease 2 alternate;}\
   @keyframes justadded{0{background-color:lightgray;border-color:gray;}100%{background-color:dodgerblue;border-color:dodgerblue;}}\
   .triage-aid-changed{animation:justchanged 1s linear 2 alternate;}\
   @keyframes justchanged{0{background-color:white;}100%{background-color:dodgerblue;}}\
      ";
      document.head.appendChild(styleEl);
      // Add the structure
      var sectionEl = document.createElement('section');
      sectionEl.id = "triage-aid-root";
      sectionEl.innerHTML = "\
 <section id=triage-aid-console hidden>\
  <img title='Triage-Aid v0.9' src=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAAERSURBVDhPY/wPBAxAMM/dDkShgKSdh6As3ABsAEyzmYEBmIaBUxcuEDQE7gIQABmEbAgLGyvDsVOnoTxUADMYxQAQQDcEGcBcBHMxiI3VAJfZS6A8BPg0tQfFSzBDmMAkFMAEQeCEgzwcwwDIZci2gwALmAQCXDbDAF92CYSRGgOhoQDFBSBw0BrVVhBAdwkIYPUCCLCzQhl4ALI3MAwgFsDCAMMAiwMPwfg7GzNUBCEGAzDNIIBiACiq/s3oB7M5f/0F0zAAkgNhdAA3AGQqKJ7/sLGB+TBbkW3GBrAmZS4ubobff/8w/P75Eyz+i5GJge3/PzAbPX+QlZSRAYYBv379Ylji6wLloQJ0zQwMDAwAYiuTtXfZ+zgAAAAASUVORK5CYII=>\
  <input title='Add... (Alt+Shift+A)' id=triage-aid-add type=button value=+ accesskey=a disabled><!-- .haschanges -->\
  <input title='Remove... (Alt+Shift+R)' id=triage-aid-remove type=button value=- accesskey=r disabled>\
  <span id=triage-aid-grow><!-- .hasdeletes --></span>\
 </section>\
 <section id=triage-aid-addpanel hidden>\
  <table>\
   <thead>\
    <tr>\
     <th>Field</th><th>Value</th>\
    </tr>\
   </thead>\
   <tbody></tbody>\
  </table>\
  <span>\
   <label>Provide a label <input id=triage-aid-addname></label>\
   <input type=button id=triage-aid-addnow value=Add disabled>\
  </span>\
 </section>\
      ";
      document.body.appendChild(sectionEl);
      add = document.querySelector("#triage-aid-console #triage-aid-add");
      remove = document.querySelector("#triage-aid-console #triage-aid-remove");
      container = document.querySelector("#triage-aid-console #triage-aid-grow");
      flyoutRoot = document.querySelector("#triage-aid-addpanel");
      confirm = document.querySelector("#triage-aid-addpanel #triage-aid-addnow");
      
      add.onclick = addHandler;
      add.addEventListener('animationend', resetCSSAnimation);
      remove.onclick = removeHandler;
      confirm.onclick = confirmAddHandler;
      confirm.inputElement = document.querySelector("#triage-aid-addpanel #triage-aid-addname");
      confirm.inputElement.oninput = checkLabelConditionsHandler;
      confirm.inputElement.onkeydown = implicitConfirmHandler;
   }
   
   function addHandler(event) { // When the "+" button is clicked
      var items = TriageAid.current();
      prepareFlyoutInfo(items);
      toggleFlyout(true);
   }
   
   // items = [] of {name:, value: }
   function prepareFlyoutInfo(items) {
      var tbody = document.querySelector("#triage-aid-addpanel table tbody");
      // clear existing content...
      tbody.textContent = "";
      items.forEach(function (item) {
         var row = tbody.insertRow();
         row.insertCell().textContent = item.name; // avoids parsing xss-issues.
         row.insertCell().textContent = item.value;
      });
      confirm.inputElement.value = "";
      confirm.disabled = true;
   }
   
   function toggleFlyout(show) {
      if (show) {
         document.addEventListener('keydown', flyoutCancellationHandler);
         document.addEventListener('mousedown', flyoutCancellationHandler);
         flyoutRoot.addEventListener('transitionend', function transitionFocusToFlyout(event) {
            flyoutRoot.removeEventListener('transitionend', transitionFocusToFlyout);
            confirm.inputElement.focus();
         });
      }
      else {
         document.removeEventListener('keydown', flyoutCancellationHandler);
         document.removeEventListener('mousedown', flyoutCancellationHandler);
         confirm.disabled = true;
         flyoutRoot.addEventListener('transitionend', function transitionFocusToAdd(event) {
            flyoutRoot.removeEventListener('transitionend', transitionFocusToAdd);
            add.focus(); // Try (may not succeed if Limit 10 is reached resulting in a disabled add button.)
         });
      }
      flyoutRoot.hidden = !show;
   }
   
   function flyoutCancellationHandler (event) {
      if ((event.type == "keydown") && (event.keyCode == 27)) // ESC
         toggleFlyout(false);
      else if (!flyoutRoot.contains(event.target))
         toggleFlyout(false);
   }
   
   function removeHandler(event) { // When the "-" button is clicked
      toggleDeleteMode(true);
   }
   
   // Swaps the behavior of clicking on a template item
   var isDeleteMode = false;
   
   function toggleDeleteMode(mode) {
      isDeleteMode = mode;
      container.className = (mode ? "hasdeletes" : "");
      for (var i = 0; !!container.children[i]; i++)
         updateTemplateTitleState(container.children[i], i);
      if (mode) {
         document.addEventListener('keydown', deleteModeCancellationHandler);
         document.addEventListener('mousedown', deleteModeCancellationHandler);
      }
      else {
         document.removeEventListener('keydown', deleteModeCancellationHandler);
         document.removeEventListener('mousedown', deleteModeCancellationHandler);
      }
   }
   
   function deleteModeCancellationHandler (event) {
      if ((event.type == "keydown") && (event.keyCode == 27)) // ESC
         toggleDeleteMode(false);
      else if (!remove.parentNode.contains(event.target))
         toggleDeleteMode(false);
   }
   
   function checkLabelConditionsHandler(event) { // When the value in the flyout edit box changes
      var val = confirm.inputElement.value;
      if (val.length > 0) {
         var match = false;
         for (var i = 0; !!container.children[i] && !match; i++) {
            if (container.children[i].templateLabel == val)
               match = true;
         }
         if (confirm.disabled && !match) // if the control is disabled and there's no match, then enable it.
            confirm.disabled = false;
         else if (!confirm.disabled && match) // if the control is enabled and there's a match, then disable it.
            confirm.disabled = true;
         // otherwise (disabled and match OR enabled but no match) do nothing.
      }
      else
         confirm.disabled = true;
   }
   
   function implicitConfirmHandler(event) { // When a key goes down in the edit box...
      if (event.keyCode == 13) { // ENTER
         if (!confirm.disabled)
            confirm.click();
      }
   }
   
   function confirmAddHandler(event) { // When the flyout's "Add" button is clicked
      var label = confirm.inputElement.value;
      newTemplate(label, container.children.length, false);
      persistTemplateList();
      TriageAid.store(label);
      // Limit 10
      if (container.children.length >= 10)
         add.disabled = true;
      if (remove.disabled)
         remove.disabled = false;
      toggleFlyout(false);
   }
   
   function persistTemplateList() {
      if (localStorage) {
         var templateList = [];
         for (var i = 0; !!container.children[i]; i++)
            templateList.push(container.children[i].templateLabel);
         localStorage["triageAidTemplateList"] = JSON.stringify(templateList);
      }
   }
   function restorePersistedTemplateList() {
      if (localStorage) {
         if (localStorage["triageAidTemplateList"]) {
            var list = JSON.parse(localStorage["triageAidTemplateList"]);
            list.forEach(function (label, index) {
               newTemplate(label, index, true);
            });
         }
      }
   }
   
   function newTemplate(label, index, isRestoring) {
      // Add a new button to the end of the template list
      var input = document.createElement('input');
      input.type = "button";
      updateIndexedBasedTemplateState(input, index, label);
      input.templateLabel = label;
      input.onclick = invokeHandler;
      input.addEventListener('animationend', resetCSSAnimation);
      container.appendChild(input);
      if (!isRestoring)
         input.className = "added";
   }
   
   function updateIndexedBasedTemplateState(templateEl, index, label) {
      templateEl.title = "Apply template (Alt+Shift+" + index + ")";
      templateEl.accessKey = accesskeyInteropNumericMapEnUs[index];
      templateEl.value = index + ":" + label;
   }
   
   function updateTemplateTitleState(templateEl, index) {
      templateEl.title = (isDeleteMode ? "Remove this" : "Apply") + " template (Alt+Shift+" + index + ")";
   }
   
   //                                     0   1   2   3   4   5   6   7   8   9
   var accesskeyInteropNumericMapEnUs = [")","!","@","#","$","%","^","&","*","("];
   
   function invokeHandler(event) { // When a template is clicked
      // Action depends on delete mode or not
      if (isDeleteMode) { 
         var label = event.target.templateLabel;
         TriageAid.remove(label);
         event.target.remove();
         for (var i = 0; !!container.children[i]; i++)
            updateIndexedBasedTemplateState(container.children[i], i, container.children[i].templateLabel);
         persistTemplateList();
         if (!container.children[0])
            remove.disabled = true;
         // Limit 10
         if (container.children.length < 10)
            add.disabled = false;
         toggleDeleteMode(false);
      }
      else {
         TriageAid.apply(event.target.templateLabel);
      }
   }
   
   function potentialNewTemplateAvailable() {
      if (TriageAid.current().length == 0) // Nothing! (current was cleared)
         add.disabled = true;
      // Limit 10
      else if (container.children.length < 10) {
         add.disabled = false;
         add.className = "haschanges";
      }
   }
   
   function resetCSSAnimation (event) {
      event.target.className = "";
   }
   
   function ensureActive(isFeatureAvailable) {
      add.disabled = !(isFeatureAvailable && (TriageAid.current().length > 0) && (container.children.length < 10)) // Limit 10
      remove.disabled = !(isFeatureAvailable && (container.children.length > 0))
      for (var i = 0; !!container.children[i]; i++)
         container.children[i].disabled = !isFeatureAvailable;
   }
   
   function start() {
      create();
      restorePersistedTemplateList();
      TriageAid.init();
      TriageAid.oncurrentchanged = potentialNewTemplateAvailable;
      requestAnimationFrame(function () {
         document.querySelector("#triage-aid-console").hidden = false; // makes the console visible.
      });
      setInterval(function () {
      //setTimeout(function () {
         ensureActive(TriageAid.reconnect());
      }, 1500); // Polls at 1.5-second intervals (TODO: find a smarter way of handling VSO state transitions)
   }
   
   start();
})();